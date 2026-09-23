"use client";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import {
  COLLECTIONS, Claim, TIER_LABEL, cellId, freshness,
  type Cell, type Competitor, type FieldDefinition, type MarketId, type SourceDocument, type Verdict,
} from "@cc/shared";
import Corners from "./Corners";
import { ConflictTag, FreshTag, StatusBadge, TierTag, VerdictBadge } from "./Badges";
import { can, useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { ago, fmtDate } from "@/lib/data";

/** "Where does this come from?" — the cell, its verdict, and every live claim behind it with its quote in context. */
export default function CellPopover({ competitor, field, marketId, cell, verdict, documents, onClose }: {
  competitor: Competitor; field: FieldDefinition; marketId: MarketId; cell?: Cell; verdict?: Verdict;
  documents: Map<string, SourceDocument>; onClose: () => void;
}) {
  const { role, user } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.claims),
      where("competitorId", "==", competitor.id), where("fieldId", "==", field.id), where("marketId", "==", marketId));
    return onSnapshot(q, (s) => {
      const out: Claim[] = [];
      for (const d of s.docs) { const r = Claim.safeParse({ id: d.id, ...d.data() }); if (r.success) out.push(r.data); }
      out.sort((a, b) => (a.supersededBy ? 1 : 0) - (b.supersededBy ? 1 : 0) || a.tier - b.tier || b.lastCheckedAt.localeCompare(a.lastCheckedAt));
      setClaims(out);
    }, (e) => setErr(e.message));
  }, [competitor.id, field.id, marketId]);

  const fr = cell ? freshness(cell, field.decayDays) : null;
  const id = cellId(competitor.id, field.id, marketId);
  const act = async (patch: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try { await updateDoc(doc(db, COLLECTIONS.cells, id), patch); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const now = () => new Date().toISOString();

  const context = (c: Claim) => {
    const d = documents.get(c.documentId);
    if (!d?.text) return null;
    const pre = d.text.slice(Math.max(0, c.startChar - 90), c.startChar);
    const post = d.text.slice(c.endChar, c.endChar + 90);
    return <div className="quote-box">…{pre}<mark className="quote-mark">{d.text.slice(c.startChar, c.endChar)}</mark>{post}…</div>;
  };

  return (
    <aside className="popover blueprint" role="dialog" aria-label="Where does this come from?">
      <Corners />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div className="kicker">Where does this come from?</div>
          <div style={{ fontSize: 14, marginTop: 4 }}><b>{competitor.name}</b> · {field.label}{marketId !== "GLOBAL" && <span className="muted"> · {marketId.replace("_", "/")}</span>}</div>
        </div>
        <button className="btn btn-secondary" type="button" onClick={onClose} aria-label="Close" style={{ padding: "2px 8px" }}>×</button>
      </div>

      <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>
        {cell && cell.status !== "missing" ? (
          <>
            <div className={cell.status === "inferred" ? "in" : undefined} style={{ fontSize: 16 }}>{cell.displayValue}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              <StatusBadge status={cell.status} /><TierTag tier={cell.tier} />
              {fr && <FreshTag level={fr.level} label={fr.label} />}
              {cell.conflict && <ConflictTag />}
              {cell.publishable && <span className="tag-pub">safe to publish</span>}
            </div>
            <dl className="dates">
              <dt>First seen</dt><dd>{fmtDate(cell.firstSeenAt)}</dd>
              <dt>Last changed</dt><dd>{fmtDate(cell.lastChangedAt)}</dd>
              <dt>Last checked</dt><dd>{fmtDate(cell.lastCheckedAt)} <span className="muted">({ago(cell.lastCheckedAt)})</span></dd>
              <dt>Corroboration</dt>
              <dd>{cell.corroboration.count} source{cell.corroboration.count === 1 ? "" : "s"}{cell.corroboration.conflicting ? `, ${cell.corroboration.conflicting} disagree${cell.corroboration.conflicting === 1 ? "s" : ""}` : ""}</dd>
              {cell.confirmedBy && <><dt>Confirmed</dt><dd>{cell.confirmedBy} · {fmtDate(cell.confirmedAt)}</dd></>}
              {cell.outdated && <><dt>Marked outdated</dt><dd>{cell.outdatedBy} · {fmtDate(cell.outdatedAt)}</dd></>}
            </dl>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>No source covers this yet. Paste a note under Sources &amp; inputs, or wait for a connector to find it.</p>
        )}
      </div>

      {!competitor.isSelf && field.comparisonRule !== "not_compared" && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          {verdict ? <><VerdictBadge verdict={verdict.verdict} /> <span>{verdict.rationale}</span> <span className="muted">({verdict.method})</span></> : <span className="muted">Verdict not computed yet.</span>}
        </div>
      )}

      {claims.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="kicker">Evidence · {claims.length} claim{claims.length === 1 ? "" : "s"}</div>
          {claims.map((c) => {
            const d = documents.get(c.documentId);
            const dead = !!c.supersededBy || c.rejected;
            return (
              <div key={c.id} className="quote-card" style={dead ? { opacity: 0.55 } : undefined}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <TierTag tier={c.tier} /><StatusBadge status={c.status} />
                    {c.supersededBy && <span className="badge badge-missing">superseded</span>}
                    {c.rejected && <span className="badge badge-missing">rejected</span>}
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>{fmtDate(c.lastCheckedAt)} · {ago(c.lastCheckedAt)}</span>
                </div>
                <b style={{ marginTop: 6 }}>{d?.title || c.documentId}{d?.author ? <span className="muted"> · {d.author}</span> : null}</b>
                <div style={{ fontSize: 13 }}>{c.displayValue}{c.note && <span className="muted"> — {c.note}</span>}</div>
                {context(c) ?? <div className="quote-box">“{c.quote}”</div>}
                {d?.externalUrl && <a href={d.externalUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Open source ↗</a>}
              </div>
            );
          })}
          <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>Tiers: {Object.entries(TIER_LABEL).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
        </div>
      )}

      {cell && cell.status !== "missing" && can(role, "editor") && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn-secondary" type="button" disabled={busy || cell.outdated} onClick={() => act({ outdated: true, outdatedBy: user?.email, outdatedAt: now() })}>Mark as outdated</button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => act({ outdated: false, confirmedBy: user?.email, confirmedAt: now() })}>Confirm still valid</button>
        </div>
      )}
      {err && <p className="bad" style={{ fontSize: 12, marginTop: 8 }}>{err}</p>}
    </aside>
  );
}
