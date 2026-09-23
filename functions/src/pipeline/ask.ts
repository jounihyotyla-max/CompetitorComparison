/**
 * Ask: a free question answered only from what the tool holds. Retrieval is deliberately simple and transparent:
 * every cell and every event (they are small), plus passages from documents that mention the question's competitors
 * or share its keywords. The model gets ids and must cite them; the UI turns citations into links.
 */
import { COLLECTIONS, Cell, Competitor, CompetitorEvent, FieldDefinition, Question, SourceDocument, norm } from "@cc/shared";
import { clean, db, nowIso } from "../lib/admin.ts";
import type { ModelClient } from "./extract.ts";
import { matchCompetitors } from "./match.ts";

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "is", "are", "any", "there", "mention", "mentions", "about", "with", "and", "or", "do", "does", "have", "has", "what", "which", "who", "how", "when", "where", "we", "our", "their", "they", "it", "up", "coming", "new", "be", "will", "that", "this", "from", "at", "by", "as", "vs"]);

export interface AskMaterial { cells: string[]; events: string[]; passages: string[]; cites: Map<string, { kind: "cell" | "event" | "document"; id: string; label: string }> }

export async function gather(question: string): Promise<AskMaterial> {
  const [cells, events, docs, comps, fields] = await Promise.all([
    db.collection(COLLECTIONS.cells).get(), db.collection(COLLECTIONS.events).get(),
    db.collection(COLLECTIONS.documents).where("status", "==", "processed").get(),
    db.collection(COLLECTIONS.competitors).get(), db.collection(COLLECTIONS.fields).get(),
  ]);
  const competitors = comps.docs.flatMap((d) => { const r = Competitor.safeParse(d.data()); return r.success ? [r.data] : []; });
  const nameOf = new Map(competitors.map((c) => [c.id, c.name]));
  const labelOf = new Map(fields.docs.map((d) => [d.id, String(d.data().label ?? d.id)]));
  const cites: AskMaterial["cites"] = new Map();
  const asked = matchCompetitors(question, competitors).map((m) => m.id);
  const terms = norm(question).split(" ").filter((t) => t.length > 2 && !STOP.has(t));

  let i = 0;
  const cellLines = cells.docs.flatMap((d) => {
    const r = Cell.safeParse(d.data()); if (!r.success || r.data.status === "missing") return [];
    const c = r.data;
    if (asked.length && !asked.includes(c.competitorId) && !competitors.find((x) => x.id === c.competitorId)?.isSelf) return [];
    const id = `c${++i}`; cites.set(id, { kind: "cell", id: c.id, label: `${nameOf.get(c.competitorId) ?? c.competitorId} · ${labelOf.get(c.fieldId) ?? c.fieldId}${c.marketId !== "GLOBAL" ? ` · ${c.marketId}` : ""}` });
    return [`[${id}] ${nameOf.get(c.competitorId)} · ${labelOf.get(c.fieldId)}${c.marketId !== "GLOBAL" ? ` (${c.marketId})` : ""}: ${c.displayValue}${c.status === "inferred" ? " (inferred)" : ""} · tier ${c.tier} · checked ${c.lastCheckedAt?.slice(0, 10)}${c.conflict ? " · disputed" : ""}`];
  });
  let j = 0;
  const eventLines = events.docs.flatMap((d) => {
    const r = CompetitorEvent.safeParse(d.data()); if (!r.success) return [];
    const e = r.data;
    if (asked.length && !asked.includes(e.competitorId)) return [];
    const id = `e${++j}`; cites.set(id, { kind: "event", id: e.id, label: `${nameOf.get(e.competitorId) ?? e.competitorId} · ${e.headline}` });
    return [`[${id}] ${e.occurredAt}${e.dateIsApproximate ? "~" : ""} ${nameOf.get(e.competitorId)} · ${e.kind}: ${e.headline}. ${e.summary} · tier ${e.tier}`];
  });
  // Passages: windows around keyword hits in documents about the asked competitors (or all, when none named).
  let k = 0;
  const passages: string[] = [];
  const scored = docs.docs.flatMap((d) => { const r = SourceDocument.safeParse({ id: d.id, ...d.data() }); return r.success ? [r.data] : []; })
    .filter((doc) => !asked.length || doc.competitorIds.some((c) => asked.includes(c)))
    .map((doc) => {
      const low = doc.text.toLowerCase();
      const hits = terms.map((t) => low.indexOf(t)).filter((x) => x >= 0);
      return { doc, score: hits.length, first: hits.length ? Math.min(...hits) : -1 };
    })
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  for (const { doc, first } of scored) {
    const start = Math.max(0, first - 300), end = Math.min(doc.text.length, first + 500);
    const id = `d${++k}`; cites.set(id, { kind: "document", id: doc.id, label: doc.title || doc.id });
    passages.push(`[${id}] ${doc.title} (${doc.connector}, tier ${doc.tier}, ${doc.capturedAt.slice(0, 10)}):\n…${doc.text.slice(start, end).replace(/\s+/g, " ")}…`);
  }
  return { cells: cellLines, events: eventLines, passages, cites };
}

export async function answer(userId: string, question: string, model: ModelClient): Promise<Question> {
  const ref = db.collection(COLLECTIONS.questions).doc();
  const q: Question = { id: ref.id, userId, question, status: "pending", citations: [], askedAt: nowIso() };
  await ref.set(clean(q));
  try {
    const m = await gather(question);
    const text = await model.ask(question, m);
    const used = [...text.matchAll(/\[([ced]\d+)\]/g)].map((x) => x[1]);
    const seen = new Set<string>();
    q.citations = used.filter((id) => (seen.has(id) ? false : (seen.add(id), true))).flatMap((id) => { const c = m.cites.get(id); return c ? [{ ...c, label: `${id} · ${c.label}` }] : []; });
    q.answer = text; q.status = "answered"; q.answeredAt = nowIso();
  } catch (e) {
    q.status = "failed"; q.answer = (e as Error).message;
  }
  await ref.set(clean(Question.parse(q)));
  return q;
}
