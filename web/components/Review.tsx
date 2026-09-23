"use client";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { COLLECTIONS, Claim, type Competitor, type FieldDefinition, type Review as ReviewT, type SourceDocument } from "@cc/shared";
import { StatusBadge, TierTag } from "./Badges";
import { can, useAuth } from "@/lib/auth";
import { db, functions } from "@/lib/firebase";
import { ago, fmtDate } from "@/lib/data";

/**
 * The inbox: conflicts the tier rules could not settle. An open review is the "unconfirmed" state: the cell keeps
 * its value, shows a conflict tag and is blocked from Marketing. Editors accept the new claim, keep the current one,
 * type a merged value, or park it with a note when they have looked but cannot decide yet.
 */
export default function Review({ reviews, competitors, fields, documents }: {
  reviews: ReviewT[]; competitors: Competitor[]; fields: FieldDefinition[]; documents: Map<string, SourceDocument>;
}) {
  const { role, user } = useAuth();
  const [showDecided, setShowDecided] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const compMap = new Map(competitors.map((c) => [c.id, c]));
  const fieldMap = new Map(fields.map((f) => [f.id, f]));
  const byDate = (a: ReviewT, b: ReviewT) => b.createdAt.localeCompare(a.createdAt);
  const open = reviews.filter((r) => r.status === "open").sort(byDate);
  const parked = reviews.filter((r) => r.status === "parked").sort(byDate);
  const decided = reviews.filter((r) => r.status !== "open" && r.status !== "parked").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const descriptive = open.filter((r) => fieldMap.get(r.fieldId ?? "")?.type === "free_text").length;

  const autoResolve = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await httpsCallable<unknown, { folded: number; resolved: number; remaining: number }>(functions, "autoResolveReviews")({});
      setMsg(`Folded ${r.data.folded} duplicate${r.data.folded === 1 ? "" : "s"}, settled ${r.data.resolved} descriptive-field review${r.data.resolved === 1 ? "" : "s"} (newest source kept); ${r.data.remaining} left to decide.`);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const row = (r: ReviewT) => (
    <ReviewRow key={r.id} review={r} competitor={compMap.get(r.competitorId ?? "")} field={fieldMap.get(r.fieldId ?? "")} documents={documents} editable={can(role, "editor")} who={user?.email ?? ""} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="blueprint tablebox" data-group="features">
        <div className="section-head" style={{ justifyContent: "space-between" }}>
          <span style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}><h5>Review inbox</h5><span className="muted">{open.length} open · a source of equal or lower trust disagreed with a current value. Open means unconfirmed: the cell shows a conflict tag and stays out of Marketing.</span></span>
          {can(role, "admin") && open.length > 0 && (
            <button className="btn" type="button" disabled={busy} onClick={autoResolve} title="Descriptive fields (free text) are worded differently on every page. Keep the newest official wording and close these." style={{ background: "rgba(255,255,255,.15)", color: "inherit", borderColor: "rgba(255,255,255,.4)" }}>
              Tidy up{descriptive > 0 ? `: settle ${descriptive} descriptive` : ""}
            </button>
          )}
        </div>
        {msg && <p style={{ margin: 0, padding: "10px 20px", fontSize: 12, borderBottom: "1px solid var(--line)" }}>{msg}</p>}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {open.length === 0 && <p className="muted" style={{ margin: 0, padding: 20 }}>Nothing to review. Conflicts appear here when a source of the same or lower trust tier disagrees with a current value.</p>}
          {open.map(row)}
        </div>
      </div>

      {parked.length > 0 && (
        <div className="blueprint tablebox" data-group="pricing">
          <div className="section-head"><h5>Waiting for confirmation</h5><span className="muted">{parked.length} parked · someone looked and needs more information; the cells keep their conflict tag</span></div>
          <div style={{ display: "flex", flexDirection: "column" }}>{parked.map(row)}</div>
        </div>
      )}

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
  const [note, setNote] = useState(review.note ?? "");
  const [parking, setParking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const currentId = review.currentClaimId;
  const newId = review.claimIds[0];
  const cur = currentId ? claims.get(currentId) : undefined;
  const nu = newId ? claims.get(newId) : undefined;

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

  const update = async (patch: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try { await updateDoc(doc(db, COLLECTIONS.reviews, review.id), patch); setParking(false); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const decide = (status: "accepted" | "rejected" | "merged") => update({
    status, decidedBy: who, decidedAt: new Date().toISOString(),
    decision: status === "accepted" ? "new source accepted" : status === "rejected" ? "current value kept" : "merged by hand",
    ...(status === "merged" ? { mergedValue: merged.trim() } : {}),
  });
  const park = () => update({ status: "parked", parkedBy: who, note: note.trim() });
  const reopen = () => update({ status: "open" });
  /** Both official, both probably true (e.g. one warranty per product): prefill the merge with the two values. */
  const suggest = () => { if (cur && nu) setMerged(`${cur.displayValue} (${documents.get(cur.documentId)?.title?.split(":").pop()?.trim() ?? "source 1"}) · ${nu.displayValue} (${documents.get(nu.documentId)?.title?.split(":").pop()?.trim() ?? "source 2"})`); };

  const side = (label: string, c: Claim | undefined, accent: boolean) => {
    const d = c ? documents.get(c.documentId) : undefined;
    return (
      <div className="quote-card" style={{ marginTop: 0, flex: 1, minWidth: 260, borderColor: accent ? "var(--green)" : undefined }}>
        <div className="kicker" style={{ fontSize: 11 }}>{label}</div>
        {c ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{c.displayValue}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><TierTag tier={c.tier} /><StatusBadge status={c.status} /><span className="muted" style={{ fontSize: 11 }}>{fmtDate(c.lastCheckedAt)} · {ago(c.lastCheckedAt)}</span></div>
            <b>{d?.externalUrl ? <a href={d.externalUrl} target="_blank" rel="noreferrer">{d.title || c.documentId} ↗</a> : d?.title || c.documentId}{d?.author ? <span className="muted"> · {d.author}</span> : null}</b>
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
        <span className="muted" style={{ fontSize: 12 }}>opened {fmtDate(review.createdAt)} · {ago(review.createdAt)}{review.status === "parked" && review.parkedBy ? ` · parked by ${review.parkedBy}` : ""}</span>
      </div>
      {review.status === "parked" && review.note && <div className="quote-box" style={{ borderLeft: "3px solid var(--warn)" }}>{review.note}</div>}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {side("Current value", cur, false)}
        {side(review.claimIds.length > 1 ? `New sources say (${review.claimIds.length})` : "New source says", nu, true)}
      </div>
      {review.claimIds.length > 1 && (
        <div className="muted" style={{ fontSize: 12 }}>
          Also from: {review.claimIds.slice(1).map((id) => { const c = claims.get(id); const d = c ? documents.get(c.documentId) : undefined; return c ? `${d?.title ?? c.documentId} (“${c.displayValue}”)` : id; }).join(" · ")}
        </div>
      )}
      {editable ? (
        parking ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input className="inp" style={{ flex: 1, minWidth: 280 }} autoFocus placeholder="What needs checking, and with whom? e.g. ask product whether 10 years applies to the cattle collar" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-primary" type="button" disabled={busy} onClick={park}>Park</button>
            <button className="btn" type="button" disabled={busy} onClick={() => setParking(false)}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => decide("accepted")}>Accept new value</button>
            <button className="btn" type="button" disabled={busy} onClick={() => decide("rejected")}>Keep current</button>
            <button className="btn" type="button" disabled={busy} onClick={() => (review.status === "parked" ? reopen() : setParking(true))} title="Looked, can't decide yet. Keeps the conflict tag, moves it out of the open list.">{review.status === "parked" ? "Un-park" : "Park · needs confirmation"}</button>
            <span className="muted" style={{ fontSize: 12 }}>or</span>
            <input className="inp" style={{ width: 300 }} placeholder="Type the value that is actually true…" value={merged} onChange={(e) => setMerged(e.target.value)} />
            <button className="btn" type="button" disabled={busy || !cur || !nu} onClick={suggest} title="Prefill with both values, one per source">Both</button>
            <button className="btn" type="button" disabled={busy || !merged.trim()} onClick={() => decide("merged")}>Merge</button>
          </div>
        )
      ) : <p className="muted" style={{ margin: 0, fontSize: 12 }}>Editors and admins decide reviews.</p>}
      {err && <p className="bad" style={{ margin: 0, fontSize: 12 }}>{err}</p>}
    </div>
  );
}
