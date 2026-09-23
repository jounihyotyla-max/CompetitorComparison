"use client";
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { COLLECTIONS, FEEDBACK_KIND_LABEL, Feedback, Settings, User, type Competitor, type DecayDays, type FieldDefinition, type Market, type Role, type SourceDocument } from "@cc/shared";
import CompetitorsPanel from "./CompetitorsPanel";
import { resetIntros } from "./Intro";
import { can, useAuth } from "@/lib/auth";
import { db, functions } from "@/lib/firebase";
import { useCollection } from "@/lib/data";

const DECAYS: { v: DecayDays; label: string }[] = [
  { v: 30, label: "30 days" }, { v: 90, label: "90 days" }, { v: 180, label: "180 days" }, { v: 365, label: "1 year" }, { v: null, label: "Never" },
];

export default function SettingsPanel({ fields, competitors, documents, markets }: { fields: FieldDefinition[]; competitors: Competitor[]; documents: SourceDocument[]; markets: Market[] }) {
  const { role } = useAuth();
  const admin = can(role, "admin");
  const users = useCollection(COLLECTIONS.users, User, [], admin);
  const feedback = useCollection(COLLECTIONS.feedback, Feedback, [], admin);
  const settings = useCollection(COLLECTIONS.settings, Settings, [], admin).docs[0];
  const [channels, setChannels] = useState<string | null>(null);
  const [digestPreview, setDigestPreview] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg("");
    try { await fn(); setMsg(ok); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  if (!admin) return <p className="muted">Settings are for admins. You are signed in as {role ?? "…"}.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="blueprint" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <h5 style={{ margin: 0 }}>Registry</h5>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {competitors.length} competitors · {fields.length} fields. Loading the registry adds anything missing and never overwrites your edits. Sample notes (Sep 2026) are created once and run through the pipeline.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(() => httpsCallable(functions, "seed")({ withNotes: true }), "Registry and sample notes loaded.")}>Load registry + sample notes</button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => run(() => httpsCallable(functions, "seed")({ withNotes: false }), "Registry loaded.")}>Registry only</button>
          <button className="btn btn-secondary" type="button" disabled={busy} title="Puts the default watched pages, feeds and aliases back on Nofence, Monil and Halter" onClick={() => run(() => httpsCallable(functions, "seed")({ withNotes: false, resetCompetitors: true }), "Watched pages reset to defaults.")}>Reset watched pages</button>
          <button className="btn btn-secondary" type="button" disabled={busy || documents.length === 0} title="Runs every source through the pipeline again, e.g. after a field or market change"
            onClick={() => run(async () => {
              const failed: string[] = [];
              for (const d of documents) { try { await httpsCallable(functions, "reprocessDocument")({ id: d.id }); } catch (e) { failed.push(`${d.title || d.id}: ${(e as Error).message}`); } }
              if (failed.length) throw new Error(`${documents.length - failed.length} re-ran, ${failed.length} failed — ${failed.join("; ")}`);
            }, `Re-ran ${documents.length} source${documents.length === 1 ? "" : "s"}.`)}>Re-run all sources</button>
        </div>
        {msg && <p style={{ fontSize: 12, margin: 0 }}>{msg}</p>}
      </div>

      <CompetitorsPanel competitors={competitors} markets={markets} />

      <div className="blueprint tablebox" data-group="pricing">
        <div className="section-head"><h5>Sources: Slack and crawl schedule</h5><span className="muted">Slack is read daily at 06:30 Oslo; pages on the interval per kind; the digest posts Monday 07:00</span></div>
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
          <label className="lbl">Slack channels to read (comma separated; invite the bot to each)
            <input className="inp" value={channels ?? (settings?.slackChannels ?? []).join(", ")} onChange={(e) => setChannels(e.target.value)}
              onBlur={() => { if (channels !== null) run(() => updateDoc(doc(db, COLLECTIONS.settings, "global"), { slackChannels: channels.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean), updatedAt: new Date().toISOString() }), "Channels saved."); }} />
          </label>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="lbl" style={{ width: 240 }}>Digest channel
              <input className="inp" defaultValue={settings?.digestSlackChannel ?? ""} onBlur={(e) => { const v = e.target.value.trim().replace(/^#/, ""); if (v !== (settings?.digestSlackChannel ?? "")) run(() => updateDoc(doc(db, COLLECTIONS.settings, "global"), { digestSlackChannel: v, updatedAt: new Date().toISOString() }), "Digest channel saved."); }} />
            </label>
            {(["pricing", "product", "news", "about", "other"] as const).map((k) => (
              <label key={k} className="lbl" style={{ width: 90 }}>{k} pages, days
                <input className="inp" type="number" min={1} defaultValue={settings?.crawlDaysByKind?.[k] ?? 7}
                  onBlur={(e) => { const n = Math.max(1, Number(e.target.value) || 1); if (n !== settings?.crawlDaysByKind?.[k]) run(() => updateDoc(doc(db, COLLECTIONS.settings, "global"), { [`crawlDaysByKind.${k}`]: n, updatedAt: new Date().toISOString() }), `${k} pages: every ${n} days.`); }} />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="button" disabled={busy} onClick={() => run(async () => { const r = await httpsCallable<unknown, { channelsRead: number; messagesSeen: number; documentsCreated: number; notes: string[] }>(functions, "slackSyncNow")({}); setMsg(`Slack: read ${r.data.channelsRead} channel${r.data.channelsRead === 1 ? "" : "s"}, ${r.data.messagesSeen} messages, ${r.data.documentsCreated} new source${r.data.documentsCreated === 1 ? "" : "s"}.${r.data.notes.length ? " " + r.data.notes.join(" · ") : ""}`); }, "")}>Sync Slack now</button>
            <button className="btn" type="button" disabled={busy} onClick={() => run(async () => { const r = await httpsCallable<unknown, { text: string }>(functions, "digestNow")({}); setDigestPreview(r.data.text); }, "Digest preview below.")}>Preview digest</button>
            <button className="btn" type="button" disabled={busy} onClick={() => run(async () => { const r = await httpsCallable<unknown, { channel: string }>(functions, "digestNow")({ post: true }); setMsg(`Digest posted to #${r.data.channel}.`); }, "")}>Post digest now</button>
          </div>
          {digestPreview && <pre className="quote-box" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{digestPreview}</pre>}
        </div>
      </div>

      <div className="blueprint tablebox" data-group="features">
        <div className="section-head"><h5>Fields and freshness</h5><span className="muted" style={{ fontSize: 12 }}>How long a value stays trusted before it is flagged stale</span></div>
        <div className="scrollx"><table className="table register">
          <thead><tr><th>Field</th><th>Group</th><th>Type</th><th>Rule</th><th>Per market</th><th>Stale after</th><th>On</th></tr></thead>
          <tbody>
            {[...fields].sort((a, b) => a.order - b.order).map((f) => (
              <tr key={f.id}>
                <td><b>{f.label}</b><div className="muted" style={{ fontSize: 11 }}>{f.id}</div></td>
                <td>{f.group}</td><td>{f.type}</td><td><span className="rule">{f.comparisonRule}</span></td><td>{f.perMarket ? "yes" : "–"}</td>
                <td>
                  <select className="inp" style={{ fontSize: 12, padding: "4px 6px" }} value={String(f.decayDays)} disabled={busy}
                    onChange={(e) => run(() => updateDoc(doc(db, COLLECTIONS.fields, f.id), { decayDays: e.target.value === "null" ? null : Number(e.target.value) }), `${f.label}: decay updated.`)}>
                    {DECAYS.map((d) => <option key={String(d.v)} value={String(d.v)}>{d.label}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" checked={f.enabled} disabled={busy} onChange={(e) => run(() => updateDoc(doc(db, COLLECTIONS.fields, f.id), { enabled: e.target.checked }), `${f.label}: ${e.target.checked ? "on" : "off"}.`)} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="blueprint tablebox" data-group="context">
        <div className="section-head"><h5>People</h5><span className="muted" style={{ fontSize: 12 }}>Viewer reads · Editor adds notes and reviews · Admin manages everything. Keep at least two admins.</span></div>
        <div className="scrollx"><table className="table register">
          <thead><tr><th>Person</th><th>Since</th><th>Role</th></tr></thead>
          <tbody>
            {users.docs.map((u) => (
              <tr key={u.id}>
                <td>{u.displayName || u.email}<div className="muted" style={{ fontSize: 11 }}>{u.email}</div></td>
                <td>{new Date(u.createdAt).toLocaleDateString("en-GB")}</td>
                <td>
                  <select className="inp" style={{ fontSize: 12, padding: "4px 6px" }} value={u.role} disabled={busy}
                    onChange={(e) => run(() => updateDoc(doc(db, COLLECTIONS.users, u.id), { role: e.target.value as Role }), `${u.email} is now ${e.target.value}.`)}>
                    <option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option>
                  </select>
                </td>
              </tr>
            ))}
            {users.docs.length === 0 && <tr><td colSpan={3} className="muted">{users.error || "No one has signed in yet."}</td></tr>}
          </tbody>
        </table></div>
      </div>
      <div className="blueprint tablebox" data-group="pricing">
        <div className="section-head" style={{ justifyContent: "space-between" }}>
          <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}><h5>Ideas and problems</h5><span className="muted">Filed from the Ask pane · {feedback.docs.filter((f) => f.status === "open").length} open</span></span>
          <button className="btn" type="button" style={{ background: "rgba(255,255,255,.15)", color: "inherit", borderColor: "rgba(255,255,255,.4)", fontSize: 12 }} disabled={!feedback.docs.some((f) => f.status === "open")}
            onClick={async () => {
              const open = feedback.docs.filter((f) => f.status === "open").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              const md = `Feedback from the competitor analytics tool (${open.length} open):\n\n` + open.map((f) => `- [${FEEDBACK_KIND_LABEL[f.kind]}] ${f.createdAt.slice(0, 10)} · ${f.email || "someone"} · ${[f.context.tab && `${f.context.tab} tab`, f.context.market && f.context.market !== "All" && `market ${f.context.market}`, f.context.competitorId && `competitor ${f.context.competitorId}`, f.context.cellId && `cell ${f.context.cellId}`].filter(Boolean).join(", ") || "no context"}: ${f.text}`).join("\n");
              try { await navigator.clipboard.writeText(md); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
            }}>{copied ? "Copied" : "Copy for Claude"}</button>
        </div>
        <div>
          {[...feedback.docs].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "open" ? -1 : 1)).map((f) => (
            <div key={f.id} style={{ display: "flex", gap: 12, padding: "10px 20px", borderBottom: "1px solid var(--line)", alignItems: "baseline", opacity: f.status === "done" ? 0.55 : 1 }}>
              <span className="muted" style={{ fontSize: 12, minWidth: 90 }}>{f.createdAt.slice(0, 10)}</span>
              <span style={{ flex: 1 }}><span className="rule" style={{ marginRight: 8 }}>{FEEDBACK_KIND_LABEL[f.kind]}</span>{f.text}<div className="muted" style={{ fontSize: 11 }}>{f.email}{[f.context.tab && `${f.context.tab} tab`, f.context.market && f.context.market !== "All" && f.context.market, f.context.competitorId, f.context.cellId && "cell attached"].filter(Boolean).map((x) => ` · ${x}`).join("")}</div></span>
              <button className="btn" type="button" style={{ fontSize: 12, padding: "3px 9px" }} disabled={busy} onClick={() => run(() => updateDoc(doc(db, COLLECTIONS.feedback, f.id), f.status === "open" ? { status: "done", doneAt: new Date().toISOString() } : { status: "open" }), f.status === "open" ? "Marked done." : "Reopened.")}>{f.status === "open" ? "Done" : "Reopen"}</button>
            </div>
          ))}
          {feedback.docs.length === 0 && <p className="muted" style={{ margin: 0, padding: 20 }}>Nothing filed yet. Anyone signed in can send one from Talk to me, bottom right.</p>}
        </div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); resetIntros(); setMsg("The tips will show again on each tab."); }}>Show the tips again</a>
      </p>
    </div>
  );
}
