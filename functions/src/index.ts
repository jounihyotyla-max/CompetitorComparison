import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { COLLECTIONS, Review, Role } from "@cc/shared";
import { db, nowIso } from "./lib/admin.ts";
import { anthropicClient, DEFAULT_MODEL } from "./pipeline/extract.ts";
import { processDocument } from "./pipeline/run.ts";
import { applyReview } from "./pipeline/review.ts";
import { seedAll } from "./seed/seed.ts";

setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const CLAUDE_MODEL = defineString("CLAUDE_MODEL", { default: DEFAULT_MODEL });
/** Comma-separated emails that become admins on first sign-in; everyone else starts as viewer. */
const ADMIN_EMAILS = defineString("ADMIN_EMAILS", { default: "jouni.hyotyla@nofence.com" });

const model = () => anthropicClient(ANTHROPIC_API_KEY.value(), CLAUDE_MODEL.value());

async function requireRole(uid: string | undefined, roles: Role[]) {
  if (!uid) throw new HttpsError("unauthenticated", "sign in first");
  const u = await db.collection(COLLECTIONS.users).doc(uid).get();
  const role = u.data()?.role as Role | undefined;
  if (!role || !roles.includes(role)) throw new HttpsError("permission-denied", `needs one of: ${roles.join(", ")}`);
}

/** Every new source document (connector or manual note) runs the pipeline once. */
export const onDocumentNew = onDocumentCreated(
  { document: `${COLLECTIONS.documents}/{id}`, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "1GiB" },
  async (event) => {
    await processDocument(event.params.id, model());
  },
);

/** Admin: run a document again (e.g. after a field or prompt change). Old claims from it are replaced. */
export const reprocessDocument = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "1GiB" },
  async (req) => {
    await requireRole(req.auth?.uid, ["admin"]);
    const id = String(req.data?.id ?? "");
    if (!id) throw new HttpsError("invalid-argument", "id required");
    const rep = await processDocument(id, model(), { force: true });
    return { ok: true, report: rep ?? null };
  },
);

/** Admin: load the registry (markets, fields, competitors, settings) and the phase-1 sample notes. */
export const seed = onCall({ timeoutSeconds: 300 }, async (req) => {
  await requireRole(req.auth?.uid, ["admin"]);
  const withNotes = req.data?.withNotes !== false;
  const result = await seedAll(db, { withNotes, author: req.auth?.token.email ?? "seed" });
  return result;
});

/** An editor decided a review in the browser (open -> accepted / rejected / merged); apply it to the cell. */
export const onReviewDecided = onDocumentUpdated(
  { document: `${COLLECTIONS.reviews}/{id}`, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300 },
  async (event) => {
    const before = event.data?.before.data()?.status;
    const after = Review.safeParse({ id: event.params.id, ...event.data?.after.data() });
    if (!after.success || before !== "open" || after.data.status === "open") return;
    await applyReview(after.data, model());
  },
);

/** First sign-in creates users/{uid} as viewer from the browser; admins listed in ADMIN_EMAILS are promoted here. */
export const onUserNew = onDocumentCreated(`${COLLECTIONS.users}/{uid}`, async (event) => {
  const email = String(event.data?.data()?.email ?? "").toLowerCase();
  const admins = ADMIN_EMAILS.value().split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (admins.includes(email)) {
    await event.data!.ref.update({ role: "admin", promotedAt: nowIso() });
  }
});
