import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS, Competitor, FieldDefinition, Market, Settings, SourceDocument } from "@cc/shared";
import { COMPETITORS, FIELDS, MARKETS, SETTINGS } from "./registry.ts";
import { SEED_NOTES } from "./notes.ts";

/**
 * Idempotent: registry documents are merged (an admin's later edits to description / decay survive a re-seed
 * because we only set keys that are missing or are structural). Sample notes are created only when absent,
 * so re-running seed never re-triggers the pipeline for them.
 */
export async function seedAll(db: Firestore, opts: { withNotes: boolean; author: string }) {
  const batch = db.batch();
  const wanted = new Set(MARKETS.map((m) => m.id as string));
  for (const d of (await db.collection(COLLECTIONS.markets).get()).docs) if (!wanted.has(d.id)) batch.delete(d.ref);
  for (const m of MARKETS) batch.set(db.collection(COLLECTIONS.markets).doc(m.id), Market.parse(m), { merge: true });
  for (const c of COMPETITORS) batch.set(db.collection(COLLECTIONS.competitors).doc(c.id), Competitor.parse(c), { merge: true });
  const existingFields = new Set((await db.collection(COLLECTIONS.fields).get()).docs.map((d) => d.id));
  let newFields = 0;
  for (const f of FIELDS) {
    if (existingFields.has(f.id)) continue; // never overwrite an admin's edits
    batch.set(db.collection(COLLECTIONS.fields).doc(f.id), FieldDefinition.parse(f));
    newFields++;
  }
  const settingsRef = db.collection(COLLECTIONS.settings).doc("global");
  if (!(await settingsRef.get()).exists) batch.set(settingsRef, Settings.parse(SETTINGS));
  await batch.commit();

  let newNotes = 0;
  if (opts.withNotes) {
    for (const n of SEED_NOTES) {
      const ref = db.collection(COLLECTIONS.documents).doc(n.id);
      if ((await ref.get()).exists) continue;
      await ref.set(SourceDocument.parse(n));
      newNotes++;
    }
  }
  return { markets: MARKETS.length, competitors: COMPETITORS.length, fields: FIELDS.length, newFields, newNotes };
}
