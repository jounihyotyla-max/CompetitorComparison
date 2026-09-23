"use client";
import type { ReactNode } from "react";
import { cellId, freshness, type Cell, type Competitor, type FieldDefinition, type FieldGroup, type MarketId, type Verdict } from "@cc/shared";
import Corners from "./Corners";
import { ConflictTag, FreshTag, StatusBadge, VerdictBadge } from "./Badges";

export interface Sel { competitorId: string; fieldId: string; marketId: MarketId }

const GROUPS: { id: FieldGroup; title: string; sub: string }[] = [
  { id: "overview", title: "Company overview", sub: "The basics, side by side" },
  { id: "features", title: "Key competitive features", sub: "Green is a real advantage, amber is partial or coming, dash is not in the sources" },
  { id: "pricing", title: "Pricing", sub: "List prices as found, local currency; verdicts are from Nofence's point of view" },
  { id: "context", title: "Context", sub: "Positioning and proof points" },
];

const PARTIAL = new Set(["partial", "in development"]);
const trimText = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export default function Overview({ fields, competitors, cells, verdicts, market, selected, onSelect }: {
  fields: FieldDefinition[]; competitors: Competitor[]; cells: Cell[]; verdicts: Verdict[];
  market: MarketId; selected: Sel | null; onSelect: (s: Sel) => void;
}) {
  const self = competitors.find((c) => c.isSelf);
  const cols = [...(self ? [self] : []), ...competitors.filter((c) => !c.isSelf && c.status === "active")];
  const cellMap = new Map(cells.map((c) => [c.id, c]));
  const verdictMap = new Map(verdicts.map((v) => [v.id, v]));
  const fieldMap = new Map(fields.map((f) => [f.id, f]));

  /** A market-specific cell when one exists, else the GLOBAL one. Returns the market actually used. */
  const cellFor = (competitorId: string, fieldId: string): { cell?: Cell; marketId: MarketId } => {
    const m = cellMap.get(cellId(competitorId, fieldId, market));
    if (m) return { cell: m, marketId: market };
    return { cell: cellMap.get(cellId(competitorId, fieldId, "GLOBAL")), marketId: "GLOBAL" };
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

  const renderText = (f: FieldDefinition, c?: Cell): ReactNode => {
    if (!c || c.status === "missing") return <span className="muted">–</span>;
    return <><span className={c.status === "inferred" ? "in" : undefined}>{c.displayValue}</span>{tags(f, c)}</>;
  };

  const renderFeature = (f: FieldDefinition, c?: Cell): ReactNode => {
    if (!c || c.status === "missing") return <span className="icon icon-none" aria-label="not in the sources">–</span>;
    if (f.type === "boolean") {
      const yes = c.value === true;
      const cls = c.status === "inferred" ? "icon-warn" : yes ? "icon-ok" : "icon-bad";
      const glyph = c.status === "inferred" ? "~" : yes ? "✓" : "✗";
      return <><span className={`icon ${cls}`} aria-label={yes ? "yes" : "no"}>{glyph}</span>{c.note && <span className="muted" style={{ fontSize: 12 }}>{trimText(c.note, 60)}</span>}{tags(f, c)}</>;
    }
    if (f.type === "categorical" && f.allowedValues?.length) {
      const v = String(c.value ?? "").toLowerCase();
      const cls = v === "live" ? "icon-ok" : PARTIAL.has(v) ? "icon-warn" : v === "none" ? "icon-bad" : "icon-none";
      const glyph = v === "live" ? "✓" : PARTIAL.has(v) ? "~" : v === "none" ? "✗" : "·";
      return <><span className={`icon ${cls}`}>{glyph}</span><span style={{ fontSize: 12 }}>{c.displayValue}</span>{tags(f, c)}</>;
    }
    if (f.type === "number") {
      return <><span>{c.displayValue}</span>{tags(f, c)}</>;
    }
    return <><span className={c.status === "inferred" ? "in" : undefined}>{c.displayValue}</span>{tags(f, c)}</>;
  };

  const renderPrice = (f: FieldDefinition, c: Cell | undefined, comp: Competitor, usedMarket: MarketId): ReactNode => {
    if (!c || c.status === "missing") return <span className="muted">–</span>;
    const v = !comp.isSelf && f.comparisonRule !== "not_compared" ? verdictMap.get(cellId(comp.id, f.id, usedMarket)) ?? verdictMap.get(cellId(comp.id, f.id, "GLOBAL")) : undefined;
    return <><span className={c.status === "inferred" ? "in" : undefined}>{c.displayValue}</span>{v && v.verdict !== "n/a" && <> <VerdictBadge verdict={v.verdict} title={v.rationale} /></>}{tags(f, c)}</>;
  };

  const render = (g: FieldGroup, f: FieldDefinition, comp: Competitor) => {
    const { cell, marketId } = cellFor(comp.id, f.id);
    if (g === "features") return renderFeature(f, cell);
    if (g === "pricing" || f.type === "price" || f.type === "number") return renderPrice(f, cell, comp, marketId);
    return renderText(f, cell);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {GROUPS.map((g) => {
        const rows = fields.filter((f) => f.group === g.id && f.enabled).sort((a, b) => a.order - b.order);
        if (rows.length === 0) return null;
        return (
          <div key={g.id} className="blueprint" style={{ padding: 0, overflowX: "auto" }}>
            <Corners />
            <div className="section-head"><h5>{g.title}</h5><span className="muted" style={{ fontSize: 12 }}>{g.sub}</span></div>
            <table className="table ov-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ width: 190 }} />
                  {cols.map((c) => <th key={c.id} className={c.isSelf ? "col-you" : undefined}>{c.name}{c.isSelf ? " — you" : ""}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <th scope="row" className="rowhead">{f.label}{f.perMarket && market === "GLOBAL" && <span className="kicker" style={{ marginLeft: 6 }}>per market</span>}</th>
                    {cols.map((c) => {
                      const { marketId } = cellFor(c.id, f.id);
                      const isSel = selected?.competitorId === c.id && selected?.fieldId === f.id;
                      return (
                        <td key={c.id} className={`${c.isSelf ? "you" : ""} ${isSel ? "cell-selected" : ""}`} onClick={() => onSelect({ competitorId: c.id, fieldId: f.id, marketId })}>
                          {render(g.id, f, c)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="leg muted" style={{ fontSize: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span><span className="icon icon-ok">✓</span>Has it</span>
        <span><span className="icon icon-warn">~</span>Partial, coming, or inferred</span>
        <span><span className="icon icon-bad">✗</span>Doesn&apos;t have it</span>
        <span>– Not in the sources</span>
        <span><em>Italic</em> = inferred</span>
        <span>Click any cell to see where it comes from</span>
      </div>
      {fieldMap.size === 0 && <p className="muted">No fields yet. An admin can load the registry from Settings.</p>}
    </div>
  );
}
