"use client";
import { useMemo } from "react";
import { isPublishable, type Cell, type Competitor, type FieldDefinition, type Review as ReviewT, type SourceDocument } from "@cc/shared";
import { ago, fmtDate } from "@/lib/data";

/** Is the data in shape to show people? Computed in the browser from what the page already has. */
export default function DataHealth({ cells, fields, competitors, documents, reviews }: {
  cells: Cell[]; fields: FieldDefinition[]; competitors: Competitor[]; documents: SourceDocument[]; reviews: ReviewT[];
}) {
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const enabled = fields.filter((f) => f.enabled);
  const active = competitors.filter((c) => c.status === "active").sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.name.localeCompare(b.name)));
  const perComp = active.map((c) => {
    const mine = cells.filter((x) => x.competitorId === c.id && x.status !== "missing");
    const filledFields = new Set(mine.map((x) => x.fieldId)).size;
    const pub = mine.filter((x) => { const f = fieldMap.get(x.fieldId); return f && isPublishable(x, f); }).length;
    const conflicts = mine.filter((x) => x.conflict).length;
    const tiers = mine.reduce<Record<string, number>>((a, x) => ((a[String(x.tier ?? "?")] = (a[String(x.tier ?? "?")] ?? 0) + 1), a), {});
    const docs = documents.filter((d) => d.competitorIds.includes(c.id));
    return { c, filledFields, pub, conflicts, tiers, docs: docs.length, lastDoc: docs.map((d) => d.capturedAt).sort().at(-1) };
  });
  const byConn = documents.reduce<Record<string, { n: number; failed: number; last?: string }>>((a, d) => {
    const e = (a[d.connector] ??= { n: 0, failed: 0 }); e.n++; if (d.status === "failed") e.failed++; if (!e.last || d.capturedAt > e.last) e.last = d.capturedAt; return a;
  }, {});
  const open = reviews.filter((r) => r.status === "open").length, parked = reviews.filter((r) => r.status === "parked").length;
  const failed = documents.filter((d) => d.status === "failed");
  const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

  return (
    <div className="blueprint tablebox" data-group="context">
      <div className="section-head"><h5>Data health</h5><span className="muted">Is it ready to show people? Coverage per competitor, sources per connector, what waits for a decision</span></div>
      <div className="scrollx"><table className="table register">
        <thead><tr><th>Competitor</th><th>Rows filled</th><th>Publishable</th><th>Conflicts</th><th>By tier</th><th>Sources</th><th>Newest source</th></tr></thead>
        <tbody>
          {perComp.map(({ c, filledFields, pub, conflicts, tiers, docs, lastDoc }) => (
            <tr key={c.id}>
              <td><b>{c.name}</b>{c.isSelf && <span className="muted"> (us)</span>}</td>
              <td>{filledFields} / {enabled.length} <span className="muted">({pct(filledFields, enabled.length)}%)</span></td>
              <td>{pub}</td>
              <td>{conflicts ? <span className="bad">{conflicts}</span> : <span className="ok">0</span>}</td>
              <td className="muted" style={{ fontSize: 12 }}>{Object.entries(tiers).sort().map(([t, n]) => `T${t}: ${n}`).join(" · ") || "–"}</td>
              <td>{docs}</td>
              <td className="muted" style={{ fontSize: 12 }}>{lastDoc ? `${fmtDate(lastDoc)} · ${ago(lastDoc)}` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div style={{ padding: "12px 20px", display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, borderTop: "1px solid var(--line)" }}>
        <span><b>Sources:</b> {Object.entries(byConn).map(([k, v]) => `${v.n} ${k}${v.failed ? ` (${v.failed} failed)` : ""}${v.last ? `, newest ${ago(v.last)}` : ""}`).join(" · ") || "none"}</span>
        <span><b>Reviews:</b> {open} open{parked ? `, ${parked} parked` : ""}</span>
        {failed.length > 0 && <span className="bad"><b>Failed sources:</b> {failed.slice(0, 3).map((d) => d.title || d.id).join("; ")}{failed.length > 3 ? ` +${failed.length - 3}` : ""} (see Sources &amp; inputs → Re-run)</span>}
      </div>
    </div>
  );
}
