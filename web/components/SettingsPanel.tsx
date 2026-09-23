"use client";
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { COLLECTIONS, User, type Competitor, type DecayDays, type FieldDefinition, type Role } from "@cc/shared";
import Corners from "./Corners";
import { can, useAuth } from "@/lib/auth";
import { db, functions } from "@/lib/firebase";
import { useCollection } from "@/lib/data";

const DECAYS: { v: DecayDays; label: string }[] = [
  { v: 30, label: "30 days" }, { v: 90, label: "90 days" }, { v: 180, label: "180 days" }, { v: 365, label: "1 year" }, { v: null, label: "Never" },
];

export default function SettingsPanel({ fields, competitors }: { fields: FieldDefinition[]; competitors: Competitor[] }) {
  const { role } = useAuth();
  const admin = can(role, "admin");
  const users = useCollection(COLLECTIONS.users, User, [], admin);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg("");
    try { await fn(); setMsg(ok); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  if (!admin) return <p className="muted">Settings are for admins. You are signed in as {role ?? "…"}.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="blueprint" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <Corners />
        <h5 style={{ margin: 0 }}>Registry</h5>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {competitors.length} competitors · {fields.length} fields. Loading the registry adds anything missing and never overwrites your edits. Sample notes (Sep 2026) are created once and run through the pipeline.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(() => httpsCallable(functions, "seed")({ withNotes: true }), "Registry and sample notes loaded.")}>Load registry + sample notes</button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => run(() => httpsCallable(functions, "seed")({ withNotes: false }), "Registry loaded.")}>Registry only</button>
        </div>
        {msg && <p style={{ fontSize: 12, margin: 0 }}>{msg}</p>}
      </div>

      <div className="blueprint tablebox">
        <Corners />
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

      <div className="blueprint tablebox">
        <Corners />
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
    </div>
  );
}
