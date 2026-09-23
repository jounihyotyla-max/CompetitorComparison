"use client";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { COLLECTIONS, Claim, type Competitor, type FieldDefinition, type Review as ReviewT, type SourceDocument } from "@cc/shared";
import { StatusBadge, TierTag } from "./Badges";
import { can, useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { ago, fmtDate } from "@/lib/data";

/** The inbox: conflicts the tier rules could not settle. Editors accept the new claim, keep the current one, or type a merged value. */
export default function Review({ reviews, competitors, fields, documents }: {
  reviews: ReviewT[]; competitors: Competitor[]; fields: FieldDefinition[]; documents: Map<string, SourceDocument>;
}) {
  const { role, user } = useAuth();
  const [showDecided, setShowDecided] = useState(false);
  const compMap = new Map(competitors.map((c) => [c.id, c]));
  const fieldMap = new Map(fields.map((f) => [f.id, f]));
  const open = reviews.filter((r) => r.status === "open").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const decided = reviews.filter((r) => r.status !== "open").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="blueprint tablebox" data-group="features">
        <div className="section-head"><h5>Review inbox</h5><span className="muted">{open.length} open · a new source disagreed with a current value and does not outrank it</span></div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {open.length === 0 && <p className="muted" style={{ margin: 0, padding: 20 }}>Nothing to review. Conflicts appear here when a source of the same or lower trust tier disagrees with a current value.</p>}
          {open.map((r) => <ReviewRow key={r.id} review={r} competitor={compMap.get(r.competitorId ?? "")} field={fieldMap.get(r.fieldId ?? "")} documents={documents} editable={can(role, "editor")} who={user?.email ?? ""} />)}
        </div>
      </div>
      {decided.length > 0 && (
        <div className="blueprint tablebox" data-group="context">
          <div className="section-head" style={{ cursor: "pointer" }} onClick={() => setShowDecided((v) => !v)}><h5>Decided</h5><span className="muted">{decided.length} · {showDecided ? "hide" : "show"}</span></div>
          {showDecided && (
            <div className="scrollx"><table className="table register">
              <thead><tr><th>What</th><th>Decision</th><th>By</th><th>When</th></tr></thead>
              <tbody>
                {decided.map((r) => (
                  <tr key={r.id}>
                    <td>{compMap.get(r.competitorId ?? "")?.name} · {fieldMap.get(r.fieldId ?? "")?.label}{r.marketId && r.marketId !== "GLOBAL" ? ` · ${r.marketId}` : ""}<div className="muted" style={{ fontSize: 11 }}>{r.summary}</div></td>
                    <td><span className={`badge ${r.status === "accepted" ? "verdict-win" : r.status === "rejected" ? "verdict-tie" : "tag-pub"}`}>{r.status}</span>{r.mergedValue && <div style={{ fontSize: 12 }}>{r.mergedValue}</div>}{r.decision && <div className="muted" style={{ fontSize: 11 }}>{r.decision}</div>}</td>
                    <td>{r.decidedBy}</td>
                    <td>{fmtDate(r.decidedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewRow({ review, competitor, field, documents, editable, who }: {
  review: ReviewT; competitor?: Competitor; field?: FieldDefinition; documents: Map<string, SourceDocument>; editable: boolean; who: string;
}) {
  const [claims, setClaims] = useState<Map<string, Claim>>(new Map());
  const [merged, setMerged] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ids = [review.currentClaimId, ...review.claimIds].filter(Boolean) as string[];

  useEffect(() => {
    if (!review.competitorId || !review.fieldId || !review.marketId) return;
    const q = query(collection(db, COLLECTIONS.claims),
      where("competitorId", "==", review.competitorId), where("fieldId", "==", review.fieldId), where("marketId", "==", review.marketId));
    return onSnapshot(q, (s) => {
      const m = new Map<string, Claim>();
      for (const d of s.docs) { const r = Claim.safeParse({ id: d.id, ...d.data() }); if (r.success) m.set(r.data.id, r.data); }
      setClaims(m);
    }, (e) => setErr(e.message));
  }, [review.competitorId, review.fieldId, review.marketId]);

  const decide = async (status: "accepted" | "rejected" | "merged") => {
    setBusy(true); setErr("");
    try {
      await updateDoc(doc(db, COLLECTIONS.reviews, review.id), {
        status, decidedBy: who, decidedAt: new Date().toISOString(),
        decision: status === "accepted" ? "new source accepted" : status === "rejected" ? "current value kept" : "merged by hand",
        ...(status === "merged" ? { mergedValue: merged.trim() } : {}),
      });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const side = (label: string, id: string | undefined, accent: boolean) => {
    const c = id ? claims.get(id) : undefined;
    const d = c ? documents.get(c.documentId) : undefined;
    return (
      <div className="quote-card" style={{ marginTop: 0, flex: 1, minWidth: 260, borderColor: accent ? "var(--green)" : undefined }}>
        <div className="kicker" style={{ fontSize: 11 }}>{label}</div>
        {c ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{c.displayValue}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><TierTag tier={c.tier} /><StatusBadge status={c.status} /><span className="muted" style={{ fontSize: 11 }}>{fmtDate(c.lastCheckedAt)} · {ago(c.lastCheckedAt)}</span></div>
            <b>{d?.title || c.documentId}{d?.author ? <span className="muted"> · {d.author}</span> : null}</b>
            <div className="quote-box">“{c.quote}”</div>
            {c.note && <div className="muted" style={{ fontSize: 12 }}>{c.note}</div>}
          </>
        ) : <div className="muted">Claim not found</div>}
      </div>
    );
  };

  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div><b>{competitor?.name ?? review.competitorId}</b> · {field?.label ?? review.fieldId}{review.marketId && review.marketId !== "GLOBAL" ? <span className="muted"> · {review.marketId}</span> : null}</div>
        <span className="muted" style={{ fontSize: 12 }}>opened {fmtDate(review.createdAt)} · {ago(review.createdAt)}</span>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {side("Current value", review.currentClaimId, false)}
        {side("New source says", ids[1], true)}
      </div>
      {editable ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => decide("accepted")}>Accept new value</button>
          <button className="btn" type="button" disabled={busy} onClick={() => decide("rejected")}>Keep current</button>
          <span className="muted" style={{ fontSize: 12 }}>or</span>
          <input className="inp" style={{ width: 260 }} placeholder="Type the value both sources support…" value={merged} onChange={(e) => setMerged(e.target.value)} />
          <button className="btn" type="button" disabled={busy || !merged.trim()} onClick={() => decide("merged")}>Merge</button>
        </div>
      ) : <p className="muted" style={{ margin: 0, fontSize: 12 }}>Editors and admins decide reviews.</p>}
      {err && <p className="bad" style={{ margin: 0, fontSize: 12 }}>{err}</p>}
    </div>
  );
}
