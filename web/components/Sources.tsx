"use client";
import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { COLLECTIONS, DEFAULT_TIER, TIER_LABEL, type Competitor, type Market, type MarketId, type SourceDocument, type Tier } from "@cc/shared";
import { TierTag } from "./Badges";
import { can, useAuth } from "@/lib/auth";
import { db, functions } from "@/lib/firebase";
import { fmtDate } from "@/lib/data";

const STATUS_CLASS: Record<SourceDocument["status"], string> = { new: "warn", processing: "warn", processed: "ok", ignored: "muted", failed: "bad" };

export default function Sources({ documents, competitors, markets }: { documents: SourceDocument[]; competitors: Competitor[]; markets: Market[] }) {
  const { role, user } = useAuth();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [competitorId, setCompetitorId] = useState("");
  const [tier, setTier] = useState<Tier>(DEFAULT_TIER.manual);
  const [marketId, setMarketId] = useState<MarketId>("GLOBAL");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const byId = new Map(competitors.map((c) => [c.id, c]));
  const sorted = [...documents].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));

  const submit = async () => {
    if (!text.trim() || !user?.email) return;
    setBusy(true); setMsg("");
    try {
      await addDoc(collection(db, COLLECTIONS.documents), {
        connector: "manual", externalId: "", externalUrl: "", title: title.trim() || `Notes by ${user.displayName ?? user.email}`,
        author: user.email, capturedAt: new Date().toISOString(), competitorIds: competitorId ? [competitorId] : [], marketId,
        tier, relevance: 1, status: "new", snapshotPath: "", text: text.trim(), contentHash: "", charCount: text.trim().length, claimCount: 0, eventCount: 0,
      });
      setText(""); setTitle(""); setMsg("Saved. The pipeline is extracting claims; the tables update as they land.");
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const reprocess = async (id: string) => {
    setBusy(true); setMsg("");
    try { await httpsCallable(functions, "reprocessDocument")({ id }); setMsg(`Reprocessed ${id}.`); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="two-col">
      <div className="blueprint tablebox">
        <div className="section-head"><h5>Source register</h5><span className="muted" style={{ fontSize: 12 }}>{documents.length} source{documents.length === 1 ? "" : "s"} · everything in the tables traces back to one of these</span></div>
        <div className="scrollx"><table className="table register">
          <thead><tr><th>Source</th><th>Company</th><th>Tier</th><th>Captured</th><th>Status</th><th>Claims</th>{can(role, "admin") && <th />}</tr></thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.id}>
                <td><div style={{ fontWeight: 500 }}>{d.title || d.id}</div><div className="muted" style={{ fontSize: 11 }}>{d.connector}{d.author ? ` · ${d.author}` : ""}</div></td>
                <td>{d.competitorIds.map((c) => byId.get(c)?.name ?? c).join(", ") || <span className="muted">–</span>}</td>
                <td><TierTag tier={d.tier} /></td>
                <td>{fmtDate(d.capturedAt)}</td>
                <td><span className={STATUS_CLASS[d.status]}>{d.status}</span>{d.error && <div className="bad" style={{ fontSize: 11, maxWidth: 260, whiteSpace: "pre-wrap" }}>{d.error.split("\n")[0]}</div>}</td>
                <td>{d.status === "processed" ? `${d.claimCount} / ${d.eventCount} ev.` : "–"}</td>
                {can(role, "admin") && <td><button className="btn btn-secondary" type="button" style={{ fontSize: 11 }} disabled={busy} onClick={() => reprocess(d.id)}>Re-run</button></td>}
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={7} className="muted">No sources yet.</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="blueprint" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <h5 style={{ margin: 0 }}>Add notes by hand</h5>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Tagged with your name and today&apos;s date. Customer names, emails and phone numbers are masked before anything is stored.</p>
          {can(role, "editor") ? (
            <>
              <input className="inp" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea className="inp" rows={7} placeholder="Paste what you know. One company per note works best." value={text} onChange={(e) => setText(e.target.value)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label className="lbl">Company<select className="inp" value={competitorId} onChange={(e) => setCompetitorId(e.target.value)}>
                  <option value="">Detect from text</option>
                  {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
                <label className="lbl">Market<select className="inp" value={marketId} onChange={(e) => setMarketId(e.target.value as MarketId)}>
                  {[...markets].sort((a, b) => a.order - b.order).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select></label>
              </div>
              <label className="lbl">How do you know this?<select className="inp" value={tier} onChange={(e) => setTier(Number(e.target.value) as Tier)}>
                <option value={1}>1 · Official: their website, press release, price list</option>
                <option value={2}>2 · Third-party public: press, report, conference</option>
                <option value={3}>3 · Firsthand internal: a customer told us directly, a ticket</option>
                <option value={4}>4 · Hearsay: a rep recalls what a farmer said</option>
                <option value={5}>5 · Opinion: our own assessment</option>
              </select></label>
              <button className="btn btn-primary" type="button" disabled={busy || !text.trim()} onClick={submit} style={{ alignSelf: "flex-start" }}>Add source</button>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>Viewers can read everything; ask an admin for the editor role to add notes.</p>
          )}
          {msg && <p style={{ fontSize: 12, margin: 0 }}>{msg}</p>}
        </div>

        <div className="blueprint" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            <h5 style={{ margin: 0 }}>Connected data sources</h5>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Arriving in later phases. Each sync creates dated source blocks; nothing enters the tables without a quote.</p>
          {[["Competitor websites", "Weekly crawl of product and pricing pages per market", "Phase 3"], ["News and RSS", "Newsrooms and trade media", "Phase 3"], ["Slack", "Dedicated competitor channel(s)", "Phase 4"], ["HubSpot", "Logged notes, emails, tickets mentioning a competitor", "Phase 4"], ["Aircall", "Call transcripts, competitor mentions only", "Phase 4"]].map(([n, d, p]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 13 }}>
              <div><div style={{ fontWeight: 500 }}>{n}</div><div className="muted" style={{ fontSize: 11 }}>{d}</div></div>
              <span className="tag-idea">{p}</span>
            </div>
          ))}
          <p className="muted" style={{ margin: 0, fontSize: 11 }}>Trust tiers: {Object.entries(TIER_LABEL).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
        </div>
      </div>
    </div>
  );
}
