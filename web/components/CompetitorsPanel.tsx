"use client";
import { useState } from "react";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { COLLECTIONS, Competitor, MarketId, slugify, type CrawlPage, type Market } from "@cc/shared";
import { db, functions } from "@/lib/firebase";

/** Admin editor for the competitor registry: names and aliases, the pages the crawler watches, feeds, status. */
export default function CompetitorsPanel({ competitors, markets }: { competitors: Competitor[]; markets: Market[] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [newSite, setNewSite] = useState("");
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg("");
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const save = (c: Competitor, patch: Partial<Competitor>, ok: string) =>
    run(() => updateDoc(doc(db, COLLECTIONS.competitors, c.id), { ...patch, updatedAt: new Date().toISOString() }), ok);

  const add = () => {
    const id = slugify(newName);
    if (!newName.trim() || competitors.some((c) => c.id === id)) { setMsg("Name missing or already exists."); return; }
    const now = new Date().toISOString();
    const site = newSite.trim();
    const c = Competitor.parse({ id, name: newName.trim(), aliases: [], website: site || undefined, crawlPages: site ? [{ url: site, label: "Home", marketId: "GLOBAL", kind: "product" }] : [], feeds: [], markets: [], isSelf: false, status: "active", createdAt: now, updatedAt: now });
    run(() => setDoc(doc(db, COLLECTIONS.competitors, id), c), `${c.name} added. Add its pricing and product pages below, then Crawl now.`).then(() => { setNewName(""); setNewSite(""); });
  };

  const crawl = (competitorId?: string) =>
    run(async () => {
      const r = await httpsCallable<{ competitorId?: string }, { pagesChecked: number; pagesChanged: number; pagesFailed: number; feedsChecked: number; newItems: number; notes: string[] }>(functions, "crawlNow")({ competitorId });
      const d = r.data;
      setMsg(`Checked ${d.pagesChecked} page${d.pagesChecked === 1 ? "" : "s"} (${d.pagesChanged} new or changed, ${d.pagesFailed} failed), ${d.feedsChecked} feed${d.feedsChecked === 1 ? "" : "s"} (${d.newItems} new items).${d.notes.length ? " " + d.notes.join(" · ") : ""}`);
    }, "");

  const sorted = [...competitors].sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.name.localeCompare(b.name)));

  return (
    <div className="blueprint tablebox" data-group="overview">
      <div className="section-head" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}><h5>Competitors and what we watch</h5><span className="muted">Pages are fetched on the crawl schedule; a changed page becomes a new tier-1 source</span></span>
        <button className="btn" type="button" disabled={busy} onClick={() => crawl()} style={{ background: "rgba(255,255,255,.15)", color: "inherit", borderColor: "rgba(255,255,255,.4)" }}>Crawl all now</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {sorted.map((c) => <CompetitorRow key={c.id} c={c} markets={markets} busy={busy} save={save} crawl={crawl} />)}
        <div style={{ padding: "14px 20px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "color-mix(in srgb, var(--card) 70%, var(--content))" }}>
          <span className="muted" style={{ fontSize: 13 }}>Add a competitor</span>
          <input className="inp" style={{ width: 180 }} placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className="inp" style={{ width: 260 }} placeholder="https://their-website.com (optional)" value={newSite} onChange={(e) => setNewSite(e.target.value)} />
          <button className="btn btn-primary" type="button" disabled={busy || !newName.trim()} onClick={add}>Add</button>
        </div>
        {msg && <p style={{ margin: 0, padding: "10px 20px", fontSize: 12 }}>{msg}</p>}
      </div>
    </div>
  );
}

function CompetitorRow({ c, markets, busy, save, crawl }: {
  c: Competitor; markets: Market[]; busy: boolean;
  save: (c: Competitor, patch: Partial<Competitor>, ok: string) => Promise<void>; crawl: (id?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [market, setMarket] = useState<MarketId>("GLOBAL");
  const [kind, setKind] = useState<CrawlPage["kind"]>("pricing");
  const [feed, setFeed] = useState("");
  const [aliases, setAliases] = useState(c.aliases.join(", "));
  const [sugg, setSugg] = useState<{ pages: (CrawlPage & { text: string })[]; feeds: string[]; notes: string[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [finding, setFinding] = useState(false);
  const [findErr, setFindErr] = useState("");
  const countries = markets.filter((m) => m.id !== "GLOBAL").sort((a, b) => a.order - b.order);

  const suggest = async () => {
    setFinding(true); setFindErr(""); setSugg(null);
    try {
      const r = await httpsCallable<{ competitorId: string }, { pages: (CrawlPage & { text: string })[]; feeds: string[]; notes: string[] }>(functions, "suggestPages")({ competitorId: c.id });
      setSugg(r.data);
      setPicked(new Set([...r.data.pages.filter((p) => p.kind === "pricing" || p.kind === "product").map((p) => p.url), ...r.data.feeds]));
    } catch (e) { setFindErr((e as Error).message); } finally { setFinding(false); }
  };
  const addPicked = () => {
    if (!sugg) return;
    const pages = sugg.pages.filter((p) => picked.has(p.url)).map(({ url, label, marketId, kind }) => ({ url, label: label.slice(0, 60), marketId, kind }));
    const feeds = sugg.feeds.filter((f) => picked.has(f));
    save(c, { crawlPages: [...c.crawlPages, ...pages], feeds: [...c.feeds, ...feeds] }, `${pages.length} page${pages.length === 1 ? "" : "s"} and ${feeds.length} feed${feeds.length === 1 ? "" : "s"} added to ${c.name}. Crawl it when ready.`).then(() => setSugg(null));
  };
  const setKindFor = (url: string, kind: CrawlPage["kind"]) => sugg && setSugg({ ...sugg, pages: sugg.pages.map((p) => (p.url === url ? { ...p, kind } : p)) });
  const setMarketFor = (url: string, marketId: MarketId) => sugg && setSugg({ ...sugg, pages: sugg.pages.map((p) => (p.url === url ? { ...p, marketId } : p)) });
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const addPage = () => {
    const u = url.trim();
    if (!/^https?:\/\//.test(u) || c.crawlPages.some((p) => p.url === u)) return;
    save(c, { crawlPages: [...c.crawlPages, { url: u, label: "", marketId: market, kind }] }, `Page added to ${c.name}.`).then(() => setUrl(""));
  };
  const addFeed = () => {
    const u = feed.trim();
    if (!/^https?:\/\//.test(u) || c.feeds.includes(u)) return;
    save(c, { feeds: [...c.feeds, u] }, `Feed added to ${c.name}.`).then(() => setFeed(""));
  };

  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <b style={{ minWidth: 120 }}>{c.name}{c.isSelf && <span className="muted" style={{ fontWeight: 400 }}> (us)</span>}</b>
        <span className="muted" style={{ fontSize: 12, flex: 1 }}>{c.crawlPages.length} page{c.crawlPages.length === 1 ? "" : "s"} · {c.feeds.length} feed{c.feeds.length === 1 ? "" : "s"}{c.aliases.length ? ` · also: ${c.aliases.join(", ")}` : ""}</span>
        <span className={`badge ${c.status === "active" ? "verdict-win" : c.status === "draft" ? "badge-inferred" : "badge-missing"}`}>{c.status}</span>
        <span className="muted">{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 20px 16px 20px", display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label className="lbl" style={{ flex: 1, minWidth: 240 }}>Aliases (comma separated; used to spot mentions)
              <input className="inp" value={aliases} onChange={(e) => setAliases(e.target.value)} onBlur={() => { const a = aliases.split(",").map((s) => s.trim()).filter(Boolean); if (a.join("|") !== c.aliases.join("|")) save(c, { aliases: a }, "Aliases saved."); }} />
            </label>
            <div className="lbl">Sold in
              <div className="chips">
                {countries.map((m) => {
                  const on = c.markets.includes(m.id);
                  return <button key={m.id} type="button" className="chip" aria-pressed={on} disabled={busy} title={m.label}
                    onClick={() => save(c, { markets: on ? c.markets.filter((x) => x !== m.id) : [...c.markets, m.id] }, `${c.name}: markets updated.`)}>{m.id}</button>;
                })}
              </div>
            </div>
            <label className="lbl">Status
              <select className="inp" value={c.status} disabled={busy || c.isSelf} onChange={(e) => save(c, { status: e.target.value as Competitor["status"] }, `${c.name} is now ${e.target.value}.`)}>
                <option value="active">active</option><option value="draft">draft</option><option value="archived">archived</option>
              </select>
            </label>
            <button className="btn" type="button" disabled={busy || finding || !(c.website || c.crawlPages[0])} onClick={suggest} style={{ alignSelf: "flex-end" }} title="Scan their website for pricing, product, news and regional pages, and feeds">{finding ? "Scanning…" : "Suggest pages"}</button>
            <button className="btn" type="button" disabled={busy || c.crawlPages.length + c.feeds.length === 0} onClick={() => crawl(c.id)} style={{ alignSelf: "flex-end" }}>Crawl {c.name} now</button>
          </div>
          {findErr && <p className="bad" style={{ margin: 0, fontSize: 12 }}>{findErr}</p>}
          {sugg && (
            <div className="blueprint" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "color-mix(in srgb, var(--card) 70%, var(--content))" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <b>Found on {c.website ?? c.crawlPages[0]?.url}</b>
                <span className="muted" style={{ fontSize: 12 }}>{sugg.pages.length} page{sugg.pages.length === 1 ? "" : "s"}, {sugg.feeds.length} feed{sugg.feeds.length === 1 ? "" : "s"} · pricing and product pre-selected</span>
              </div>
              {sugg.pages.map((p) => (
                <label key={p.url} style={{ display: "grid", gridTemplateColumns: "auto 110px 90px 1fr", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={picked.has(p.url)} onChange={() => toggle(p.url)} />
                  <select className="inp" style={{ padding: "3px 6px", fontSize: 12 }} value={p.kind} onChange={(e) => setKindFor(p.url, e.target.value as CrawlPage["kind"])}>
                    {["pricing", "product", "news", "about", "other"].map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select className="inp" style={{ padding: "3px 6px", fontSize: 12 }} value={p.marketId} onChange={(e) => setMarketFor(p.url, e.target.value as MarketId)}>
                    <option value="GLOBAL">All</option>{countries.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                  </select>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.url}>{p.text ? <><b style={{ fontWeight: 500 }}>{p.text}</b> <span className="muted">· </span></> : null}<span className="muted">{p.url.replace(/^https?:\/\//, "")}</span></span>
                </label>
              ))}
              {sugg.feeds.map((f) => (
                <label key={f} style={{ display: "grid", gridTemplateColumns: "auto 208px 1fr", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={picked.has(f)} onChange={() => toggle(f)} /><span className="rule" style={{ justifySelf: "start" }}>feed</span><span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f}</span>
                </label>
              ))}
              {sugg.pages.length + sugg.feeds.length === 0 && <span className="muted">Nothing new found beyond what is already watched.{sugg.notes.length ? ` ${sugg.notes.join(" · ")}` : ""}</span>}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" type="button" disabled={busy || picked.size === 0} onClick={addPicked}>Add {picked.size} selected</button>
                <button className="btn" type="button" onClick={() => setSugg(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Pages watched</div>
            {c.crawlPages.length === 0 && <div className="muted">None yet. Add the product and pricing pages, one per market where prices differ.</div>}
            {c.crawlPages.map((p) => (
              <div key={p.url} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
                <span className="rule">{p.kind}</span><span className="rule">{p.marketId}</span>
                <a href={p.url} target="_blank" rel="noreferrer" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: p.pausedAt ? 0.6 : 1 }}>{p.url}</a>
                {p.pausedAt ? <span className="tag-conflict" title={`Paused after ${p.failCount} failed fetches: ${p.lastError}`}>paused · {(p.lastError ?? "").slice(0, 40)}</span>
                  : (p.failCount ?? 0) > 0 ? <span className="muted" style={{ fontSize: 11 }} title={p.lastError}>{p.failCount} failed</span> : null}
                {p.pausedAt && <button className="btn" type="button" disabled={busy} style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => save(c, { crawlPages: c.crawlPages.map((x) => (x.url === p.url ? { ...x, failCount: 0, lastError: "", pausedAt: undefined } : x)) }, "Page will be fetched again on the next crawl.")}>retry</button>}
                <button className="btn" type="button" disabled={busy} style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => save(c, { crawlPages: c.crawlPages.filter((x) => x.url !== p.url) }, "Page removed.")}>remove</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
              <input className="inp" style={{ flex: 1, minWidth: 260 }} placeholder="https://…/pricing" value={url} onChange={(e) => setUrl(e.target.value)} />
              <select className="inp" style={{ width: 120 }} value={kind} onChange={(e) => setKind(e.target.value as CrawlPage["kind"])}>
                {["pricing", "product", "news", "about", "other"].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <select className="inp" style={{ width: 110 }} value={market} onChange={(e) => setMarket(e.target.value as MarketId)}>
                <option value="GLOBAL">All</option>{countries.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
              </select>
              <button className="btn" type="button" disabled={busy || !url.trim()} onClick={addPage}>Add page</button>
            </div>
          </div>

          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>News feeds (RSS / Atom)</div>
            {c.feeds.map((f) => (
              <div key={f} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
                <a href={f} target="_blank" rel="noreferrer" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f}</a>
                <button className="btn" type="button" disabled={busy} style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => save(c, { feeds: c.feeds.filter((x) => x !== f) }, "Feed removed.")}>remove</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
              <input className="inp" style={{ flex: 1 }} placeholder="https://…/feed.xml" value={feed} onChange={(e) => setFeed(e.target.value)} />
              <button className="btn" type="button" disabled={busy || !feed.trim()} onClick={addFeed}>Add feed</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
