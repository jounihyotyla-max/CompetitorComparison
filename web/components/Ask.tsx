"use client";
import { useState, type ReactNode } from "react";
import { addDoc, collection, orderBy, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { COLLECTIONS, FEEDBACK_KIND_LABEL, Feedback, FeedbackKind, Question, parseCellId, type SourceDocument } from "@cc/shared";
import type { Sel } from "./Overview";
import { useAuth } from "@/lib/auth";
import { db, functions } from "@/lib/firebase";
import { ago, useCollection } from "@/lib/data";

export interface AskContext { tab: string; market: string; competitorId?: string; cellId?: string }

const KIND_HINT: Record<FeedbackKind, string> = {
  angle: "e.g. compare total cost over 5 years, not just list price · add a row for support hours",
  format: "e.g. show prices in one currency · put the verdict before the value · hide rows I don't use",
  data: "e.g. Monil's US price is out of date · Halter now sells in Ireland",
  bug: "e.g. the popover doesn't close · nothing happens when I click Generate",
  idea: "anything else that would make this more useful for you",
};

/** Talk to me: ask the data (cited answers), or tell the builder what to change. Context is attached automatically. */
export default function Ask({ open, onClose, onSelect, documents, context }: {
  open: boolean; onClose: () => void; onSelect: (s: Sel) => void; documents: Map<string, SourceDocument>; context: AskContext;
}) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"ask" | "idea">("ask");
  const [kind, setKind] = useState<FeedbackKind>("angle");
  const [sent, setSent] = useState("");
  const history = useCollection(COLLECTIONS.questions, Question, user ? [where("userId", "==", user.uid), orderBy("askedAt", "desc")] : [], !!user && open && mode === "ask");
  const mine = useCollection(COLLECTIONS.feedback, Feedback, user ? [where("userId", "==", user.uid), orderBy("createdAt", "desc")] : [], !!user && open && mode === "idea");

  const file = async (k: FeedbackKind, text: string, extra: Partial<AskContext & { question: string }> = {}) => {
    if (!user) return;
    await addDoc(collection(db, COLLECTIONS.feedback), {
      userId: user.uid, email: user.email ?? "", kind: k, text, status: "open", createdAt: new Date().toISOString(),
      context: JSON.parse(JSON.stringify({ tab: context.tab, market: context.market, competitorId: context.competitorId, cellId: context.cellId, ...extra })),
    });
  };

  const submit = async () => {
    const text = q.trim();
    if (text.length < 3 || !user) return;
    setBusy(true); setErr(""); setSent("");
    try {
      if (mode === "idea") { await file(kind, text); setSent("Filed. You'll see it below with its status; it goes to the people building the tool."); }
      else await httpsCallable(functions, "ask")({ question: text });
      setQ("");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const didntHelp = async (item: Question) => {
    setBusy(true); setErr("");
    try { await file("data", `Ask couldn't answer well: “${item.question}”`, { question: item.question }); setSent("Noted as a data gap. Thanks."); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  /** Turn [c3]-style markers into links to the cell popover or the source. */
  const render = (item: Question): ReactNode => {
    const byMarker = new Map(item.citations.map((c) => [c.label.split(" · ")[0], c]));
    return (item.answer ?? "").split(/(\[[ced]\d+\])/g).map((p, i) => {
      const m = /^\[([ced]\d+)\]$/.exec(p);
      if (!m) return <span key={i}>{p}</span>;
      const c = byMarker.get(m[1]);
      if (!c) return <span key={i} className="muted">{p}</span>;
      if (c.kind === "cell") { const s = parseCellId(c.id); return <a key={i} href="#" title={c.label} onClick={(e) => { e.preventDefault(); onSelect({ competitorId: s.competitorId, fieldId: s.fieldId, marketId: s.marketId }); }} className="cite">{m[1]}</a>; }
      if (c.kind === "document") { const d = documents.get(c.id); return d?.externalUrl ? <a key={i} href={d.externalUrl} target="_blank" rel="noreferrer" title={c.label} className="cite">{m[1]}</a> : <span key={i} className="cite" title={c.label}>{m[1]}</span>; }
      return <span key={i} className="cite" title={c.label}>{m[1]}</span>;
    });
  };

  const where_ = [context.tab, context.market !== "All" ? context.market : "", context.competitorId, context.cellId ? "a cell open" : ""].filter(Boolean).join(" · ");

  if (!open) return null;
  return (
    <aside className="popover askpane" role="dialog" aria-label="Talk to me">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div className="seg" role="radiogroup" aria-label="Mode">
            <label className="seg-opt"><input type="radio" name="askmode" checked={mode === "ask"} onChange={() => setMode("ask")} /><span>Ask the data</span></label>
            <label className="seg-opt"><input type="radio" name="askmode" checked={mode === "idea"} onChange={() => setMode("idea")} /><span>Change something</span></label>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {mode === "ask" ? "Answers use only our sources and cite them. If we have nothing, it says so." : "Tell the builders what would make this more useful for you. Short is fine."}
          </div>
        </div>
        <button className="btn" type="button" onClick={onClose} aria-label="Close" style={{ padding: "2px 8px" }}>×</button>
      </div>

      {mode === "idea" && (
        <div className="chips" style={{ marginTop: 12 }} role="radiogroup" aria-label="What kind of change">
          {(Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[]).map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{FEEDBACK_KIND_LABEL[k]}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-start" }}>
        {mode === "ask"
          ? <input className="inp" placeholder="e.g. Is there any mention of Halter coming up with new models?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} disabled={busy} autoFocus />
          : <textarea className="inp" rows={3} placeholder={KIND_HINT[kind]} value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} autoFocus />}
        <button className="btn btn-primary" type="button" disabled={busy || q.trim().length < 3} onClick={submit}>{busy ? "…" : mode === "ask" ? "Ask" : "Send"}</button>
      </div>
      {mode === "idea" && <div className="ctx" style={{ marginTop: 6 }}>Attached automatically: {where_ || "nothing in particular"}.</div>}
      {err && <p className="bad" style={{ fontSize: 12, marginTop: 8 }}>{err}</p>}
      {sent && <p className="ok" style={{ fontSize: 12, marginTop: 8 }}>{sent}</p>}

      {mode === "ask" && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {history.docs.map((item) => (
            <div key={item.id} className="quote-card" style={{ marginTop: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{item.question}</b><span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{ago(item.askedAt)}</span></div>
              {item.status === "pending" && <div className="muted">Thinking…</div>}
              {item.status === "failed" && <div className="bad" style={{ fontSize: 12 }}>{item.answer}</div>}
              {item.status === "answered" && <div style={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{render(item)}</div>}
              {item.citations.length > 0 && <div className="muted" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 2 }}>{item.citations.map((c) => <span key={c.label}>{c.label}</span>)}</div>}
              {item.status === "answered" && <div><button className="btn" type="button" style={{ fontSize: 11, padding: "2px 8px" }} disabled={busy} onClick={() => didntHelp(item)} title="Files this question as a data gap for the builders">Didn&rsquo;t help</button></div>}
            </div>
          ))}
          {history.docs.length === 0 && !busy && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Your questions and answers stay here for you to come back to.</p>}
        </div>
      )}

      {mode === "idea" && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {mine.docs.map((f) => (
            <div key={f.id} className="quote-card" style={{ marginTop: 0, opacity: f.status === "done" ? 0.6 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="rule">{FEEDBACK_KIND_LABEL[f.kind]}</span><span className={f.status === "done" ? "tag-pub" : "badge badge-stated"}>{f.status === "done" ? "done" : "open"}</span></span>
                <span className="muted" style={{ fontSize: 11 }}>{ago(f.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13 }}>{f.text}</div>
              {(f.context.tab || f.context.competitorId) && <div className="ctx">{[f.context.tab, f.context.market, f.context.competitorId].filter(Boolean).join(" · ")}</div>}
            </div>
          ))}
          {mine.docs.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Nothing filed yet. Everything you send shows up here with its status.</p>}
        </div>
      )}
    </aside>
  );
}
