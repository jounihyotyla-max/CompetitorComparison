"use client";
import { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  Battlecard as BattlecardT, COLLECTIONS, CompetitorEvent, battlecardId, cellId, parseCellId,
  type Cell, type Competitor, type FieldDefinition, type Market, type MarketId, type Verdict, type VerdictKind,
} from "@cc/shared";
import type { Sel } from "./Overview";
import { TierTag, VerdictBadge } from "./Badges";
import { can, useAuth } from "@/lib/auth";
import { functions } from "@/lib/firebase";
import { ago, fmtDate, useCollection } from "@/lib/data";

/** Rows to fall back on when a rival has too few decisive verdicts yet. */
const FALLBACK_FIELDS = ["livestock_species", "no_base_station", "warranty_years", "scale_and_momentum", "minimum_order"];
const GROUP_PRIORITY: Record<string, number> = { pricing: 0, features: 1, overview: 2, hardware: 3, context: 4 };
const short = (s: string, n = 56) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export default function Battlecards({ competitors, fields, cells, verdicts, markets, group, onSelect }: {
  competitors: Competitor[]; fields: FieldDefinition[]; cells: Cell[]; verdicts: Verdict[]; markets: Market[]; group: string; onSelect: (s: Sel) => void;
}) {
  const { role } = useAuth();
  const inGroupIds = markets.filter((m) => m.id !== "GLOBAL" && m.group === group).map((m) => m.id as string);
  const rivals = competitors.filter((c) => !c.isSelf && c.status === "active" && (group === "All" || c.markets.length === 0 || c.markets.some((m) => inGroupIds.includes(m))));
  const [rivalId, setRivalId] = useState(rivals[0]?.id ?? "");
  const rival = rivals.find((c) => c.id === rivalId) ?? rivals[0];
  const cards = useCollection(COLLECTIONS.battlecards, BattlecardT);
  const events = useCollection(COLLECTIONS.events, CompetitorEvent);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // A group with one country maps to that country's card; "All" and two-country groups use the GLOBAL card.
  const countries = markets.filter((m) => m.id !== "GLOBAL");
  const inGroup = group === "All" ? [] : countries.filter((m) => m.group === group).map((m) => m.id);
  const marketId: MarketId = inGroup.length === 1 ? inGroup[0] : "GLOBAL";
  const card = rival ? cards.docs.find((c) => c.id === battlecardId(rival.id, marketId)) : undefined;
  const cellMap = useMemo(() => new Map(cells.map((c) => [c.id, c])), [cells]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const self = competitors.find((c) => c.isSelf);

  const latestInput = card ? Math.max(0, ...card.generatedFromCellIds.map((id) => new Date(cellMap.get(id)?.updatedAt ?? 0).getTime())) : 0;
  const stale = !!card && latestInput > new Date(card.generatedAt).getTime();
  const oldest = card ? card.generatedFromCellIds.map((id) => cellMap.get(id)?.lastCheckedAt).filter(Boolean).sort()[0] : undefined;

  const generate = async () => {
    if (!rival) return;
    setBusy(true); setErr("");
    try { await httpsCallable(functions, "battlecard")({ competitorId: rival.id, marketId }); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  // "At a glance": up to four rows where the verdict against this rival is clear (win or lose), both sides have a
  // value, and the value is short enough to read at a glance. Pricing first, then features, then company basics.
  const cellFor = (compId: string, fieldId: string) => cellMap.get(cellId(compId, fieldId, marketId)) ?? cellMap.get(cellId(compId, fieldId, "GLOBAL"));
  const show = (c?: Cell) => (!c || c.status === "missing" ? null : c.value === true ? "Yes" : c.value === false ? "No" : short(c.displayValue));
  const verdictFor = (fieldId: string, theirs?: Cell) => verdicts.find((v) => v.competitorId === rival?.id && v.fieldId === fieldId && v.marketId === (theirs?.marketId ?? marketId));
  const glance = useMemo(() => {
    if (!rival || !self) return [];
    type Row = { f: FieldDefinition; ours: string | null; theirs: string | null; theirCell?: Cell; v?: Verdict; score: number };
    const rows: Row[] = fields
      .filter((f) => f.enabled && f.comparisonRule !== "not_compared" && f.type !== "free_text")
      .map((f) => {
        const theirCell = cellFor(rival.id, f.id);
        const ours = show(cellFor(self.id, f.id)), theirs = show(theirCell);
        const v = verdictFor(f.id, theirCell);
        const decisive = v?.verdict === "win" || v?.verdict === "lose";
        const score = (decisive ? 0 : v?.verdict === "tie" ? 20 : 40) + (ours && theirs ? 0 : 10) + (GROUP_PRIORITY[f.group] ?? 5);
        return { f, ours, theirs, theirCell, v, score };
      })
      .filter((r) => r.ours || r.theirs);
    const decisive = rows.filter((r) => (r.v?.verdict === "win" || r.v?.verdict === "lose") && r.ours && r.theirs).sort((a, b) => a.score - b.score);
    const picked = decisive.slice(0, 4);
    for (const id of FALLBACK_FIELDS) { if (picked.length >= 4) break; const r = rows.find((x) => x.f.id === id && x.ours && x.theirs); if (r && !picked.includes(r)) picked.push(r); }
    return picked;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rival?.id, self?.id, marketId, fields, cells, verdicts]);

  const tile = ({ f, ours, theirs, theirCell, v }: (typeof glance)[number]) => {
    const kind: VerdictKind = v?.verdict ?? "n/a";
    return (
      <div key={f.id} className="blueprint glance" data-verdict={kind} role="button" tabIndex={0}
        onClick={() => onSelect({ competitorId: rival!.id, fieldId: f.id, marketId: theirCell?.marketId ?? "GLOBAL" })}
        onKeyDown={(e) => { if (e.key === "Enter") onSelect({ competitorId: rival!.id, fieldId: f.id, marketId: theirCell?.marketId ?? "GLOBAL" }); }}>
        <div className="glance-head"><span>{f.label}</span>{kind !== "n/a" && <VerdictBadge verdict={kind} title={v?.rationale} />}</div>
        <div className="glance-row"><span className="glance-who">Nofence</span><span className="glance-val">{ours ?? <span className="muted">no source</span>}</span></div>
        <div className="glance-row"><span className="glance-who">{rival!.name}</span><span className="glance-val">{theirs ?? <span className="muted">no source</span>}</span></div>
        {v?.rationale && <div className="glance-why muted">{short(v.rationale, 110)}</div>}
      </div>
    );
  };

  const recent = events.docs.filter((e) => e.competitorId === rival?.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8);
  const sel = (id: string): Sel => { const p = parseCellId(id); return { competitorId: p.competitorId, fieldId: p.fieldId, marketId: p.marketId }; };

  if (!rival) return <p className="muted">No active competitors yet.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>Nofence vs</span>
        <div className="seg" role="radiogroup" aria-label="Competitor">
          {rivals.map((c) => <label key={c.id} className="seg-opt"><input type="radio" name="rival" value={c.id} checked={rival.id === c.id} onChange={() => setRivalId(c.id)} /><span>{c.name}</span></label>)}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{marketId === "GLOBAL" ? "all markets" : marketId}{group !== "All" && inGroup.length > 1 ? ` (${group} uses the all-markets card)` : ""}</span>
        <span style={{ flex: 1 }} />
        {card && <span className="muted" style={{ fontSize: 12 }}>Generated {fmtDate(card.generatedAt)} · {ago(card.generatedAt)}{stale && <> · <span className="tag-conflict">inputs changed</span></>}</span>}
        {can(role, "editor") && <button className="btn btn-primary" type="button" disabled={busy} onClick={generate}>{busy ? "Generating…" : `${card ? "Regenerate" : "Generate"} card for ${marketId === "GLOBAL" ? "all markets" : marketId}`}</button>}
      </div>
      {err && <p className="bad" style={{ margin: 0, fontSize: 13 }}>{err}</p>}

      {glance.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>At a glance: the rows where the difference is clearest{marketId !== "GLOBAL" ? ` in ${marketId}` : ""}. Click a tile for the quote and source.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>{glance.map(tile)}</div>
        </div>
      )}

      {!card ? (
        <div className="blueprint" style={{ padding: 24 }}>
          <p className="muted" style={{ margin: 0 }}>No battlecard for {rival.name} in {marketId === "GLOBAL" ? "all markets" : marketId} yet. Generate one from the current cells; it takes about half a minute. Every line cites the cell it is based on, and the card is flagged when any of those cells changes.</p>
        </div>
      ) : (
        <>
          <div className="two-col">
            <List title="Where Nofence wins" sub="Lead with these" items={card.wins} tone="win" cellMap={cellMap} onSelect={(id) => onSelect(sel(id))} group="features" />
            <List title={`Where ${rival.name} genuinely wins`} sub="Don't argue these, reframe" items={card.theirWins} tone="lose" cellMap={cellMap} onSelect={(id) => onSelect(sel(id))} group="pricing" />
          </div>
          <div className="blueprint tablebox" data-group="overview">
            <div className="section-head"><h5>Objection handling</h5><span className="muted">What the farmer says, what we say</span></div>
            <div>
              {card.objections.map((o, i) => (
                <div key={i} style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "grid", gridTemplateColumns: "minmax(200px, 1fr) minmax(280px, 2fr)", gap: 16 }}>
                  <div style={{ fontStyle: "italic", color: "var(--text-2)" }}>“{o.objection}”</div>
                  <div>{o.response}{o.cellIds[0] && <> <a href="#" onClick={(e) => { e.preventDefault(); onSelect(sel(o.cellIds[0])); }} style={{ fontSize: 12 }}>source</a></>}</div>
                </div>
              ))}
              {card.objections.length === 0 && <p className="muted" style={{ margin: 0, padding: 20 }}>No objections worth preparing from the current rows.</p>}
            </div>
          </div>
        </>
      )}

      <div className="blueprint tablebox" data-group="context">
        <div className="section-head"><h5>Recent moves to watch</h5><span className="muted">Dated events from the sources, newest first</span></div>
        <div>
          {recent.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 12, padding: "10px 20px", borderBottom: "1px solid var(--line)", alignItems: "baseline" }}>
              <span className="muted" style={{ fontSize: 12, minWidth: 90 }}>{e.dateIsApproximate ? "~" : ""}{fmtDate(e.occurredAt)}</span>
              <span className="rule">{e.kind.replace("_", " ")}</span>
              <span style={{ flex: 1 }}><b>{e.headline}</b>{e.summary && <span className="muted"> — {e.summary}</span>}</span>
              <TierTag tier={e.tier} />
            </div>
          ))}
          {recent.length === 0 && <p className="muted" style={{ margin: 0, padding: 20 }}>No dated events for {rival.name} yet.</p>}
        </div>
      </div>

      {oldest && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Oldest source on this card: {fmtDate(oldest)} ({ago(oldest)}). Sources and inputs → check what needs a refresh.</p>}
    </div>
  );
}

function List({ title, sub, items, tone, cellMap, onSelect, group }: {
  title: string; sub: string; items: { text: string; cellId: string; tier: number }[]; tone: "win" | "lose";
  cellMap: Map<string, Cell>; onSelect: (cellId: string) => void; group: string;
}) {
  return (
    <div className="blueprint tablebox" data-group={group}>
      <div className="section-head"><h5>{title}</h5><span className="muted">{sub}</span></div>
      <div>
        {items.map((it, i) => {
          const c = cellMap.get(it.cellId);
          return (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 20px", borderBottom: "1px solid var(--line)", alignItems: "baseline", cursor: it.cellId ? "pointer" : undefined }} onClick={() => it.cellId && onSelect(it.cellId)}>
              <span className={`icon ${tone === "win" ? "icon-ok" : "icon-bad"}`} style={{ width: 10, height: 10, margin: "0 4px 0 0", flexShrink: 0, alignSelf: "center" }} />
              <span style={{ flex: 1 }}>{it.text}</span>
              <TierTag tier={it.tier as 1 | 2 | 3 | 4 | 5} />
              {c?.conflict && <span className="tag-conflict">conflict</span>}
            </div>
          );
        })}
        {items.length === 0 && <p className="muted" style={{ margin: 0, padding: 20 }}>Nothing here from the current rows.</p>}
      </div>
    </div>
  );
}
