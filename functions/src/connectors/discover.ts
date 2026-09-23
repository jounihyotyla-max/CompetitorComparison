/**
 * Suggest pages to watch for a competitor from its homepage: pricing, product, news and regional pages, plus RSS
 * feeds. Heuristics on URL paths and link text; an admin ticks what to keep. One level of regional homepages is
 * followed so "/en-us" leads to "/en-us/pricing".
 */
import type { CrawlPage, MarketId } from "@cc/shared";
import { fetchPage } from "./html.ts";

export interface Suggestion extends CrawlPage { text: string; score: number }
export interface Discovery { pages: Suggestion[]; feeds: string[]; notes: string[] }

const MARKET_SEGMENT: [RegExp, MarketId][] = [
  [/^(en-)?us$|^us-en$|^en-us$/i, "US"], [/^(en-)?gb$|^uk$|^en-gb$|^en-uk$/i, "UK"], [/^(en-)?ie$|^en-ie$/i, "IE"],
  [/^no$|^nb$|^nb-no$|^nn$|^nor$/i, "NO"], [/^se$|^sv$|^sv-se$|^swe$/i, "SE"], [/^es$|^es-es$|^spa$/i, "ES"],
];
const KIND: [RegExp, CrawlPage["kind"], number][] = [
  [/pric|price|prices|plans?|packages?|offer|tilbud|erbjudande|precio|shop|store|buy|order|kjøp|köp|comprar|subscription|abonnement|cost/i, "pricing", 5],
  [/news|press|blog|media|articles?|stories|nyhet|aktuelt|noticias|updates|announcement|release|insights|case-stud|customer-stor/i, "news", 3],
  [/product|collar|klave|halsband|collares?|how-it-works|hvordan|features|technology|tech|solution|cattle|beef|dairy|sheep|goat|storfe|sau|geit|får|get|ovejas|cabras|vacas|virtual-fenc|gjerde|stängsel|support|getting-started/i, "product", 4],
  [/about|company|team|om-oss|om-|sobre|who-we-are|careers|investors/i, "about", 1],
];
const SKIP = /\.(png|jpe?g|gif|svg|webp|pdf|zip|css|js|ico|mp4|woff2?)($|\?)|mailto:|tel:|javascript:|#|\/(privacy|cookie|terms|legal|login|sign-?in|account|cart|checkout|support\/ticket|wp-admin|wp-json)\b/i;

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const sameSite = (a: string, b: string) => { const x = hostOf(a), y = hostOf(b); return !!x && !!y && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`)); };

function marketFromPath(url: string): MarketId {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean).slice(0, 2);
    for (const s of segs) for (const [rx, m] of MARKET_SEGMENT) if (rx.test(s)) return m;
    const sub = u.hostname.split(".")[0];
    for (const [rx, m] of MARKET_SEGMENT) if (rx.test(sub)) return m;
    if (/\.no$/.test(u.hostname)) return "NO"; if (/\.se$/.test(u.hostname)) return "SE"; if (/\.(co\.uk|uk)$/.test(u.hostname)) return "UK"; if (/\.ie$/.test(u.hostname)) return "IE"; if (/\.es$/.test(u.hostname)) return "ES";
  } catch {}
  return "GLOBAL";
}

function links(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(m[1].trim(), base);
      url.hash = ""; url.search = "";
      const s = url.toString().replace(/\/$/, "");
      if (!/^https?:/.test(s) || SKIP.test(s)) continue;
      out.push({ url: s, text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) });
    } catch {}
  }
  return out;
}

function feeds(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<link\b[^>]*type\s*=\s*["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1];
    if (href) { try { out.add(new URL(href, base).toString()); } catch {} }
  }
  return [...out];
}

export async function discoverPages(website: string, opts: { maxRegional?: number } = {}): Promise<Discovery> {
  const notes: string[] = [];
  const home = await fetchPage(website);
  if (!home.ok) return { pages: [], feeds: [], notes: [`${website}: ${home.error}`] };
  const base = home.finalUrl || website;
  const found = new Map<string, Suggestion>();
  const feedSet = new Set<string>(feeds(home.html, base));

  const consider = (l: { url: string; text: string }, from: string) => {
    if (!sameSite(l.url, base) || found.has(l.url)) return;
    const hay = `${l.url} ${l.text}`;
    let kind: CrawlPage["kind"] = "other", score = 0;
    for (const [rx, k, sc] of KIND) if (rx.test(hay)) { kind = k; score = sc; break; }
    const marketId = marketFromPath(l.url);
    const depth = new URL(l.url).pathname.split("/").filter(Boolean).length;
    if (kind === "other" && depth > 1) return; // only shallow unknown pages (regional homes)
    if (kind === "other" && marketId === "GLOBAL") return;
    found.set(l.url, { url: l.url, label: l.text || (kind === "other" ? `${marketId} home` : kind), marketId, kind, text: l.text, score: score + (marketId !== "GLOBAL" ? 1 : 0) - depth * 0.1 + (from === base ? 0.5 : 0) });
  };
  for (const l of links(home.html, base)) consider(l, base);

  // Follow regional homepages one level to pick up their pricing / product pages.
  const regional = [...found.values()].filter((p) => p.kind === "other" && p.marketId !== "GLOBAL").slice(0, opts.maxRegional ?? 6);
  for (const r of regional) {
    const res = await fetchPage(r.url, r.marketId);
    if (!res.ok) { notes.push(`${r.url}: ${res.error}`); continue; }
    for (const f of feeds(res.html, r.url)) feedSet.add(f);
    for (const l of links(res.html, r.url)) if (marketFromPath(l.url) === r.marketId || marketFromPath(l.url) === "GLOBAL") consider(l, r.url);
  }
  // Common feed paths, checked cheaply.
  for (const path of ["/feed", "/rss", "/feed.xml", "/rss.xml", "/blog/feed", "/news/feed", "/blog/rss.xml"]) {
    try {
      const u = new URL(path, base).toString();
      const res = await fetch(u, { method: "GET", headers: { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
      const ct = res.headers.get("content-type") ?? "";
      if (res.ok && /xml|rss|atom/.test(ct)) feedSet.add(u);
    } catch {}
  }
  const pages = [...found.values()].filter((p) => p.kind !== "about").sort((a, b) => b.score - a.score).slice(0, 30);
  return { pages, feeds: [...feedSet].slice(0, 5), notes };
}
