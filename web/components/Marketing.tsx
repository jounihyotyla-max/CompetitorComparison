"use client";
import { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { COLLECTIONS, MarketingPack, isPublishable, parseCellId, type Cell, type Competitor, type FieldDefinition, type Market, type MarketId } from "@cc/shared";
import type { Sel } from "./Overview";
import { can, useAuth } from "@/lib/auth";
import { functions } from "@/lib/firebase";
import { ago, fmtDate, useCollection } from "@/lib/data";

/** Differentiators Nofence can say out loud, ready-to-copy snippets, and what must stay internal. Per market. */
export default function Marketing({ cells, fields, competitors, markets, group, onSelect }: {
  cells: Cell[]; fields: FieldDefinition[]; competitors: Competitor[]; markets: Market[]; group: string; onSelect: (s: Sel) => void;
}) {
  const { role } = useAuth();
  const packs = useCollection(COLLECTIONS.snippets, MarketingPack);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const inGroup = markets.filter((m) => m.id !== "GLOBAL" && m.group === group).map((m) => m.id);
  const marketId: MarketId = group !== "All" && inGroup.length === 1 ? inGroup[0] : "GLOBAL";
  const pack = packs.docs.find((p) => p.id === marketId);
  const cellMap = useMemo(() => new Map(cells.map((c) => [c.id, c])), [cells]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const nameOf = useMemo(() => new Map(competitors.map((c) => [c.id, c.name])), [competitors]);
  const self = competitors.find((c) => c.isSelf);
  const ourPublishable = self ? cells.filter((c) => c.competitorId === self.id && c.status !== "missing" && fieldMap.get(c.fieldId) && isPublishable(c, fieldMap.get(c.fieldId)!)).length : 0;
  const latestInput = pack ? Math.max(0, ...pack.generatedFromCellIds.map((id) => new Date(cellMap.get(id)?.updatedAt ?? 0).getTime())) : 0;
  const stale = !!pack && latestInput > new Date(pack.generatedAt).getTime();

  const generate = async () => {
    setBusy(true); setErr("");
    try { await httpsCallable(functions, "marketing")({ marketId }); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch {}
  };
  const open = (cellId: string) => { const p = parseCellId(cellId); onSelect({ competitorId: p.competitorId, fieldId: p.fieldId, marketId: p.marketId }); };
  const sources = (ids: string[]) => ids.length > 0 && (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {ids.map((id) => { const c = cellMap.get(id); return <a key={id} href="#" onClick={(e) => { e.preventDefault(); open(id); }} style={{ fontSize: 11 }}>{c ? `${nameOf.get(c.competitorId) ?? c.competitorId} ↗` : "source ↗"}</a>; })}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>Market: <b>{marketId === "GLOBAL" ? "all (no market prices)" : marketId}</b>{group !== "All" && inGroup.length > 1 ? ` · pick ${inGroup.join(" or ")} for prices` : ""}</span>
        <span className="muted" style={{ fontSize: 12 }}>· {ourPublishable} Nofence value{ourPublishable === 1 ? "" : "s"} publishable{ourPublishable === 0 ? " (crawl nofence.com first: only official or press sources may be quoted in marketing)" : ""}</span>
        <span style={{ flex: 1 }} />
        {pack && <span className="muted" style={{ fontSize: 12 }}>Generated {fmtDate(pack.generatedAt)} · {ago(pack.generatedAt)}{stale && <> · <span className="tag-conflict">inputs changed</span></>}</span>}
        {can(role, "editor") && <button className="btn btn-primary" type="button" disabled={busy} onClick={generate}>{busy ? "Generating…" : pack ? "Regenerate" : "Generate marketing pack"}</button>}
      </div>
      {err && <p className="bad" style={{ margin: 0, fontSize: 13 }}>{err}</p>}

      {!pack ? (
        <div className="blueprint" style={{ padding: 24 }}>
          <p className="muted" style={{ margin: 0 }}>No marketing pack for this market yet. It is written from publishable cells only: official or reputable public sources, current, and undisputed. Internal notes and hearsay never make it in; they are listed under &ldquo;Don&rsquo;t use&rdquo; instead.</p>
        </div>
      ) : (
        <>
          <div className="blueprint tablebox" data-group="overview">
            <div className="section-head"><h5>Differentiators we can say out loud</h5><span className="muted">Positive framing only; every claim is backed by a public source</span></div>
            <div>
              {pack.differentiators.map((d, i) => (
                <div key={i} style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={d.status === "safe" ? "tag-pub" : "badge badge-inferred"}>{d.status === "safe" ? "Safe to publish" : "Check first"}</span>
                    <span className="muted" style={{ fontSize: 12 }}>vs {d.competitorIds.map((id) => nameOf.get(id) ?? id).join(" and ")} · {fieldMap.get(d.fieldId)?.label ?? d.fieldId}</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{d.headline}</div>
                  <div className="muted">{d.support}</div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <button className="btn" type="button" style={{ fontSize: 12, padding: "3px 9px" }} onClick={() => copy(`${d.headline}\n${d.support}`, `d${i}`)}>{copied === `d${i}` ? "Copied" : "Copy"}</button>
                    {sources(d.cellIds)}
                  </div>
                </div>
              ))}
              {pack.differentiators.length === 0 && <p className="muted" style={{ margin: 0, padding: 20 }}>Nothing publishable yet for this market.</p>}
            </div>
          </div>

          <div className="two-col">
            <div className="blueprint tablebox" data-group="features">
              <div className="section-head" style={{ justifyContent: "space-between" }}>
                <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}><h5>Ready-to-use snippets</h5><span className="muted">Generated from the table, edit freely</span></span>
                <button className="btn" type="button" style={{ background: "rgba(255,255,255,.15)", color: "inherit", borderColor: "rgba(255,255,255,.4)", fontSize: 12 }} onClick={() => copy(pack.snippets.map((s) => `${s.kind}: ${s.text}`).join("\n\n"), "all")}>{copied === "all" ? "Copied" : "Copy all"}</button>
              </div>
              <div>
                {pack.snippets.map((s, i) => (
                  <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid var(--line)", display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 12, alignItems: "start" }}>
                    <span className="rule" style={{ justifySelf: "start" }}>{s.kind}</span>
                    <span>{s.text}</span>
                    <button className="btn" type="button" style={{ fontSize: 12, padding: "3px 9px" }} onClick={() => copy(s.text, `s${i}`)}>{copied === `s${i}` ? "Copied" : "Copy"}</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="blueprint tablebox" data-group="pricing">
              <div className="section-head"><h5>Don&rsquo;t use in marketing</h5><span className="muted">Fine for sales conversations, not for public material</span></div>
              <div>
                {pack.dontUse.map((x, i) => (
                  <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span className="tag-conflict">{x.reason}</span>{sources(x.cellIds)}</div>
                    <div style={{ fontSize: 13 }}>{x.text}</div>
                  </div>
                ))}
                {pack.dontUse.length === 0 && <p className="muted" style={{ margin: 0, padding: 20 }}>Nothing flagged.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
