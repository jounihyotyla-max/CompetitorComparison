/**
 * Fetching a public web page and reducing it to readable text. No headless browser: competitor sites are
 * mostly server-rendered marketing pages, and the pipeline only needs the words, not the layout.
 */
import type { MarketId } from "@cc/shared";

const ACCEPT_LANGUAGE: Record<MarketId, string> = {
  GLOBAL: "en", US: "en-US,en;q=0.8", UK: "en-GB,en;q=0.8", IE: "en-IE,en;q=0.8", NO: "nb-NO,nb;q=0.9,en;q=0.5", SE: "sv-SE,sv;q=0.9,en;q=0.5", ES: "es-ES,es;q=0.9,en;q=0.5",
};
const UA = "Mozilla/5.0 (compatible; NofenceCompetitorAnalytics/1.0; +https://www.nofence.no)";
const MAX_BYTES = 2_000_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", euro: "€", pound: "£", copy: "©", reg: "®", trade: "™", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const DROP = /<(script|style|noscript|svg|iframe|template|head)\b[\s\S]*?<\/\1>/gi;
const CHROME = /<(nav|footer|header|aside|form)\b[\s\S]*?<\/\1>/gi; // menus, footers, cookie banners
// A real tag tokenizer: attribute values may contain ">" (Alpine/Vue handlers like `() => show = true`), which a
// naive /<[^>]+>/ splits in the middle, leaking attribute text into the page text.
const TAG = /<\/?([a-zA-Z][\w:-]*)(?:\s+[^\s"'=<>`/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;
const BLOCKS = new Set(["p", "div", "section", "article", "main", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "td", "th", "table", "br", "hr", "blockquote", "figure", "figcaption", "dt", "dd", "dl", "summary", "details", "pre", "address"]);

/** Page title and body text, whitespace-normalised, block elements separated by newlines. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim());
  let body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  body = body.replace(/<!--[\s\S]*?-->/g, "").replace(DROP, " ").replace(CHROME, " ");
  body = body.replace(TAG, (_m, name: string) => (BLOCKS.has(name.toLowerCase()) ? "\n" : " "));
  body = body.replace(/<[^>]*>/g, " "); // anything malformed that survived
  body = decodeEntities(body);
  const lines = body.split("\n").map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim()).filter(Boolean);
  // Collapse exact-duplicate short lines (repeated menus, badges) while keeping order.
  const seen = new Set<string>();
  const text = lines.filter((l) => (l.length < 40 && seen.has(l) ? false : (seen.add(l), true))).join("\n");
  return { title, text };
}

export async function fetchPage(url: string, marketId: MarketId = "GLOBAL"): Promise<{ ok: true; status: number; html: string; finalUrl: string } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": ACCEPT_LANGUAGE[marketId] },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const ct = res.headers.get("content-type") ?? "";
    if (!/html|xml|text/.test(ct)) return { ok: false, status: res.status, error: `not a text page (${ct})` };
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
    return { ok: true, status: res.status, html, finalUrl: res.url || url };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}
