"use client";
import { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  Battlecard as BattlecardT, COLLECTIONS, CompetitorEvent, battlecardId, cellId, parseCellId,
  type Cell, type Competitor, type FieldDefinition, type Market, type MarketId,
} from "@cc/shared";
import type { Sel } from "./Overview";
import { TierTag } from "./Badges";
import { can, useAuth } from "@/lib/auth";
import { functions } from "@/lib/firebase";
import { ago, fmtDate, useCollection } from "@/lib/data";

const TILE_FIELDS = ["livestock_species", "no_base_station", "minimum_order", "scale_and_momentum"];

export default function Battlecards({ competitors, fields, cells, markets, group, onSelect }: {
  competitors: Competitor[]; fields: FieldDefinition[]; cells: Cell[]; markets: Market[]; group: string; onSelect: (s: Sel) => void;
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

  const tile = (fieldId: string) => {
    const f = fieldMap.get(fieldId);
    const theirs = cellMap.get(cellId(rival!.id, fieldId, marketId)) ?? cellMap.get(cellId(rival!.id, fieldId, "GLOBAL"));
    const ours = self ? cellMap.get(cellId(self.id, fieldId, marketId)) ?? cellMap.get(cellId(self.id, fieldId, "GLOBAL")) : undefined;
    if (!f || (!theirs && !ours)) return null;
    const show = (c?: Cell) => (!c || c.status === "missing" ? "–" : c.value === true ? "Yes" : c.value === false ? "No" : c.displayValue);
    return (
      <div key={fieldId} className="blueprint" style={{ padding: 14, cursor: "pointer" }} onClick={() => onSelect({ competitorId: rival!.id, fieldId, marketId: theirs?.marketId ?? "GLOBAL" })}>
        <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.15 }}>{show(theirs)}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{rival!.name} · {f.label}. Nofence: {show(ours)}</div>
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
        {can(role, "editor") && <button className="btn btn-primary" type="button" disabled={busy} onClick={generate}>{busy ? "Generating…" : card ? "Regenerate" : "Generate battlecard"}</button>}
      </div>
      {err && <p className="bad" style={{ margin: 0, fontSize: 13 }}>{err}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>{TILE_FIELDS.map(tile)}</div>

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
