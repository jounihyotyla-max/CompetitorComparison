"use client";
import type { ReactNode } from "react";
import { cellId, freshness, type Cell, type Competitor, type FieldDefinition, type FieldGroup, type Market, type MarketId, type Verdict } from "@cc/shared";
import { ConflictTag, FreshTag, StatusBadge, VerdictBadge } from "./Badges";

export interface Sel { competitorId: string; fieldId: string; marketId: MarketId }

const GROUPS: { id: FieldGroup; title: string; sub: string }[] = [
  { id: "overview", title: "Company overview", sub: "The basics, side by side" },
  { id: "features", title: "Key competitive features", sub: "Green is a real advantage, amber is partial or coming" },
  { id: "pricing", title: "Pricing", sub: "List prices as found, local currency; verdicts are from Nofence's point of view" },
  { id: "hardware", title: "Hardware", sub: "Collar construction, connectivity, power and safety, from product team research and spec pages" },
  { id: "context", title: "Context", sub: "Positioning and proof points" },
];

const PARTIAL = new Set(["partial", "in development"]);
const trimText = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export default function Overview({ fields, competitors, markets, cells, verdicts, group, selected, onSelect }: {
  fields: FieldDefinition[]; competitors: Competitor[]; markets: Market[]; cells: Cell[]; verdicts: Verdict[];
  /** switcher group: "All" or a Market.group such as "UK/IE" */
  group: string; selected: Sel | null; onSelect: (s: Sel) => void;
}) {
  const self = competitors.find((c) => c.isSelf);
  const cols = [...(self ? [self] : []), ...competitors.filter((c) => !c.isSelf && c.status === "active")];
  const cellMap = new Map(cells.map((c) => [c.id, c]));
  const verdictMap = new Map(verdicts.map((v) => [v.id, v]));
  const countries = markets.filter((m) => m.id !== "GLOBAL").sort((a, b) => a.order - b.order);
  const groupMarkets = (group === "All" ? countries : countries.filter((m) => m.group === group)).map((m) => m.id);

  /** Per-market fields yield one hit per country in the selected group (falling back to GLOBAL); others yield the GLOBAL cell. */
  const hitsFor = (competitorId: string, f: FieldDefinition): { marketId: MarketId; cell: Cell }[] => {
    if (f.perMarket) {
      const hits = groupMarkets.flatMap((m) => { const c = cellMap.get(cellId(competitorId, f.id, m)); return c ? [{ marketId: m, cell: c }] : []; });
      if (hits.length) return hits;
    }
    const g = cellMap.get(cellId(competitorId, f.id, "GLOBAL"));
    return g ? [{ marketId: "GLOBAL" as MarketId, cell: g }] : [];
  };

  const tags = (f: FieldDefinition, c: Cell) => {
    const fr = freshness(c, f.decayDays);
    return (
      <>
        {c.status === "inferred" && <> <StatusBadge status="inferred" /></>}
        {fr.level === "stale" && <> <FreshTag level="stale" label="stale" /></>}
        {c.conflict && <> <ConflictTag /></>}
      </>
    );
  };

  const feature = (f: FieldDefinition, c: Cell): ReactNode => {
    if (f.type === "boolean") {
      const yes = c.value === true;
      const cls = c.status === "inferred" ? "icon-warn" : yes ? "icon-ok" : "icon-bad";
      const glyph = c.status === "inferred" ? "~" : yes ? "✓" : "✗";
      return <><span className={`icon ${cls}`} aria-label={yes ? "yes" : "no"}>{glyph}</span>{c.note && <span className="muted" style={{ fontSize: 12 }}>{trimText(c.note, 70)}</span>}</>;
    }
    if (f.type === "categorical" && f.allowedValues?.length) {
      const v = String(c.value ?? "").toLowerCase();
      const cls = v === "live" ? "icon-ok" : PARTIAL.has(v) ? "icon-warn" : v === "none" ? "icon-bad" : "icon-none";
      const glyph = v === "live" ? "✓" : PARTIAL.has(v) ? "~" : v === "none" ? "✗" : "·";
      return <><span className={`icon ${cls}`}>{glyph}</span><span style={{ fontSize: 13 }}>{c.displayValue}{c.note ? <span className="muted"> · {trimText(c.note, 60)}</span> : null}</span></>;
    }
    return <span className={c.status === "inferred" ? "in" : undefined}>{c.displayValue}</span>;
  };

  const value = (g: FieldGroup, f: FieldDefinition, comp: Competitor, hit: { marketId: MarketId; cell: Cell }, multi: boolean): ReactNode => {
    const { cell: c, marketId } = hit;
    const v = !comp.isSelf && f.comparisonRule !== "not_compared" ? verdictMap.get(cellId(comp.id, f.id, marketId)) : undefined;
    const body = g === "features" ? feature(f, c) : <span className={c.status === "inferred" ? "in" : undefined}>{c.displayValue}</span>;
    return (
      <span className="mv" key={marketId} onClick={(e) => { e.stopPropagation(); onSelect({ competitorId: comp.id, fieldId: f.id, marketId }); }}>
        {multi && marketId !== "GLOBAL" && <b>{marketId}</b>}
        <span>{body}{v && v.verdict !== "n/a" && <> <VerdictBadge verdict={v.verdict} title={v.rationale} /></>}{tags(f, c)}</span>
      </span>
    );
  };

  const render = (g: FieldGroup, f: FieldDefinition, comp: Competitor): ReactNode => {
    const hits = hitsFor(comp.id, f).filter((h) => h.cell.status !== "missing");
    if (hits.length === 0) return g === "features" ? <span className="icon icon-none" aria-label="not in the sources">–</span> : <span className="muted">–</span>;
    return <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px 6px" }}>{hits.map((h) => value(g, f, comp, h, hits.length > 1))}</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {GROUPS.map((g) => {
        const rows = fields.filter((f) => f.group === g.id && f.enabled).sort((a, b) => a.order - b.order);
        if (rows.length === 0) return null;
        return (
          <div key={g.id} className="blueprint tablebox" data-group={g.id}>
            <div className="section-head"><h5>{g.title}</h5><span className="muted">{g.sub}</span></div>
            <div className="scrollx"><table className="table ov-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ width: 200 }} />
                  {cols.map((c) => <th key={c.id} className={c.isSelf ? "col-you" : undefined}>{c.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <th scope="row" className="rowhead">{f.label}</th>
                    {cols.map((c) => {
                      const first = hitsFor(c.id, f)[0];
                      const isSel = selected?.competitorId === c.id && selected?.fieldId === f.id;
                      return (
                        <td key={c.id} className={`${c.isSelf ? "you" : ""} ${isSel ? "cell-selected" : ""}`}
                          onClick={() => onSelect({ competitorId: c.id, fieldId: f.id, marketId: first?.marketId ?? (f.perMarket && groupMarkets.length === 1 ? groupMarkets[0] : "GLOBAL") })}>
                          {render(g.id, f, c)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        );
      })}
      <div className="leg" style={{ fontSize: 12, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        <span><span className="icon icon-ok" /> Has it</span>
        <span><span className="icon icon-warn" /> Partial, coming, or inferred</span>
        <span><span className="icon icon-bad" /> Doesn&apos;t have it</span>
        <span>– Not in the sources</span>
        <span><em>Italic</em> = inferred</span>
        <span>Click any value to see where it comes from</span>
      </div>
      {fields.length === 0 && <p className="muted">No fields yet. An admin can load the registry from Settings.</p>}
    </div>
  );
}
