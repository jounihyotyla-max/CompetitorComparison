import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS, Competitor, FieldDefinition, Market, Settings, SourceDocument } from "@cc/shared";
import { COMPETITORS, FIELDS, MARKETS, MATRIX_PAGES, SETTINGS } from "./registry.ts";
import { SEED_NOTES } from "./notes.ts";
import { MATRIX_MODIFIED_AT, matrixNotes } from "./matrix.ts";

/**
 * Idempotent: registry documents are merged (an admin's later edits to description / decay survive a re-seed
 * because we only set keys that are missing or are structural). Sample notes are created only when absent,
 * so re-running seed never re-triggers the pipeline for them.
 */
export async function seedAll(db: Firestore, opts: { withNotes: boolean; author: string; resetCompetitors?: boolean }) {
  const batch = db.batch();
  const wanted = new Set(MARKETS.map((m) => m.id as string));
  for (const d of (await db.collection(COLLECTIONS.markets).get()).docs) if (!wanted.has(d.id)) batch.delete(d.ref);
  for (const m of MARKETS) batch.set(db.collection(COLLECTIONS.markets).doc(m.id), Market.parse(m), { merge: true });
  // Competitors are created only when missing: admins edit pages, feeds and aliases in the tool.
  const existingCompetitors = new Set((await db.collection(COLLECTIONS.competitors).get()).docs.map((d) => d.id));
  const existingDocs = new Map((await db.collection(COLLECTIONS.competitors).get()).docs.map((d) => [d.id, d.data() as Partial<Competitor>]));
  for (const c of COMPETITORS) {
    const withMatrix = { ...c, crawlPages: [...c.crawlPages, ...(MATRIX_PAGES[c.id] ?? [])] };
    if (!existingCompetitors.has(c.id)) { batch.set(db.collection(COLLECTIONS.competitors).doc(c.id), Competitor.parse(withMatrix)); continue; }
    const cur = existingDocs.get(c.id) ?? {};
    if (opts.resetCompetitors) {
      // Explicit reset: put the registry's watched pages, feeds and aliases back (status and other edits are kept).
      batch.update(db.collection(COLLECTIONS.competitors).doc(c.id), { crawlPages: withMatrix.crawlPages, feeds: c.feeds, aliases: c.aliases, website: c.website ?? null, updatedAt: new Date().toISOString() });
    } else {
      // Otherwise only add: registry pages and aliases the admin does not have yet are unioned in, nothing removed.
      const have = new Set((cur.crawlPages ?? []).map((p) => p.url));
      const addPages = withMatrix.crawlPages.filter((p) => !have.has(p.url));
      const haveAlias = new Set((cur.aliases ?? []).map((a) => a.toLowerCase()));
      const addAliases = c.aliases.filter((a) => !haveAlias.has(a.toLowerCase()));
      if (addPages.length || addAliases.length || (!cur.website && c.website)) {
        batch.update(db.collection(COLLECTIONS.competitors).doc(c.id), {
          crawlPages: [...(cur.crawlPages ?? []), ...addPages], aliases: [...(cur.aliases ?? []), ...addAliases],
          ...(!cur.website && c.website ? { website: c.website } : {}), updatedAt: new Date().toISOString(),
        });
      }
    }
  }
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
    for (const n of [...SEED_NOTES, ...matrixNotes(MATRIX_MODIFIED_AT)]) {
      const ref = db.collection(COLLECTIONS.documents).doc(n.id);
      if ((await ref.get()).exists) continue;
      await ref.set(SourceDocument.parse(n));
      newNotes++;
    }
  }
  return { markets: MARKETS.length, competitors: COMPETITORS.length, fields: FIELDS.length, newFields, newNotes };
}
