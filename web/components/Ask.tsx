"use client";
import { useState, type ReactNode } from "react";
import { addDoc, collection, orderBy, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { COLLECTIONS, Question, parseCellId, type SourceDocument } from "@cc/shared";
import { db } from "@/lib/firebase";
import type { Sel } from "./Overview";
import { useAuth } from "@/lib/auth";
import { functions } from "@/lib/firebase";
import { ago, useCollection } from "@/lib/data";

/** Ask the data: answers come only from cells, events and source passages, each sentence cited. */
export default function Ask({ open, onClose, onSelect, documents, tab }: { open: boolean; onClose: () => void; onSelect: (s: Sel) => void; documents: Map<string, SourceDocument>; tab: string }) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"ask" | "idea">("ask");
  const [sent, setSent] = useState("");
  const history = useCollection(COLLECTIONS.questions, Question, user ? [where("userId", "==", user.uid), orderBy("askedAt", "desc")] : [], !!user && open);

  const submit = async () => {
    const text = q.trim();
    if (text.length < 3 || !user) return;
    setBusy(true); setErr(""); setSent("");
    try {
      if (mode === "idea") {
        await addDoc(collection(db, COLLECTIONS.feedback), { userId: user.uid, email: user.email ?? "", text, tab, status: "open", createdAt: new Date().toISOString() });
        setSent("Thanks, filed. Jouni sees these in Settings and passes them on to the builder.");
      } else {
        await httpsCallable(functions, "ask")({ question: text });
      }
      setQ("");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  /** Turn [c3]-style markers into links to the cell popover or the source. */
  const render = (item: Question): ReactNode => {
    const byMarker = new Map(item.citations.map((c) => [c.label.split(" · ")[0], c]));
    const parts = (item.answer ?? "").split(/(\[[ced]\d+\])/g);
    return parts.map((p, i) => {
      const m = /^\[([ced]\d+)\]$/.exec(p);
      if (!m) return <span key={i}>{p}</span>;
      const c = byMarker.get(m[1]);
      if (!c) return <span key={i} className="muted">{p}</span>;
      if (c.kind === "cell") { const s = parseCellId(c.id); return <a key={i} href="#" title={c.label} onClick={(e) => { e.preventDefault(); onSelect({ competitorId: s.competitorId, fieldId: s.fieldId, marketId: s.marketId }); }} className="cite">{m[1]}</a>; }
      if (c.kind === "document") { const d = documents.get(c.id); return d?.externalUrl ? <a key={i} href={d.externalUrl} target="_blank" rel="noreferrer" title={c.label} className="cite">{m[1]}</a> : <span key={i} className="cite" title={c.label}>{m[1]}</span>; }
      return <span key={i} className="cite" title={c.label}>{m[1]}</span>;
    });
  };

  if (!open) return null;
  return (
    <aside className="popover blueprint askpane" role="dialog" aria-label="Ask the data">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div className="seg" role="radiogroup" aria-label="Mode">
            <label className="seg-opt"><input type="radio" name="askmode" checked={mode === "ask"} onChange={() => setMode("ask")} /><span>Ask the data</span></label>
            <label className="seg-opt"><input type="radio" name="askmode" checked={mode === "idea"} onChange={() => setMode("idea")} /><span>Idea or problem</span></label>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{mode === "ask" ? "Answers use only our sources and cite them. If we have nothing, it says so." : "Something missing, wrong or annoying in the tool? Say it here; it goes to whoever builds the tool."}</div>
        </div>
        <button className="btn" type="button" onClick={onClose} aria-label="Close" style={{ padding: "2px 8px" }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input className="inp" placeholder={mode === "ask" ? "e.g. Is there any mention of Halter coming up with new models?" : "e.g. The Overview should let me hide rows I don't care about"} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} disabled={busy} autoFocus />
        <button className="btn btn-primary" type="button" disabled={busy || q.trim().length < 3} onClick={submit}>{busy ? "…" : mode === "ask" ? "Ask" : "Send"}</button>
      </div>
      {err && <p className="bad" style={{ fontSize: 12, marginTop: 8 }}>{err}</p>}
      {sent && <p className="ok" style={{ fontSize: 12, marginTop: 8 }}>{sent}</p>}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {history.docs.map((item) => (
          <div key={item.id} className="quote-card" style={{ marginTop: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{item.question}</b><span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{ago(item.askedAt)}</span></div>
            {item.status === "pending" && <div className="muted">Thinking…</div>}
            {item.status === "failed" && <div className="bad" style={{ fontSize: 12 }}>{item.answer}</div>}
            {item.status === "answered" && <div style={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{render(item)}</div>}
            {item.citations.length > 0 && (
              <div className="muted" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 2 }}>
                {item.citations.map((c) => <span key={c.label}>{c.label}</span>)}
              </div>
            )}
          </div>
        ))}
        {history.docs.length === 0 && !busy && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Your questions and answers stay here for you to come back to. Admins can see what people ask, to find gaps in the data.</p>}
      </div>
    </aside>
  );
}
