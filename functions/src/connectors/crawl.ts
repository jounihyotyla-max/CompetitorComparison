/**
 * Phase 3 connectors: competitor websites (tier 1) and news feeds (tier 2).
 *
 * Every crawl produces `documents`; the ordinary pipeline (onDocumentNew) does the rest. A page whose text hash
 * is unchanged since the last snapshot is not re-extracted: its existing claims and cells only get a fresh
 * lastCheckedAt (that is what "checked, not changed" means in docs/v2-architecture.md §6).
 */
import { COLLECTIONS, Competitor, DEFAULT_TIER, SourceDocument, type CrawlPage, type MarketId, type Tier } from "@cc/shared";
import { clean, db, nowIso } from "../lib/admin.ts";
import { matchCompetitors } from "../pipeline/match.ts";
import { touchDocument } from "../pipeline/run.ts";
import { sha256 } from "../pipeline/text.ts";
import { fetchPage, htmlToText } from "./html.ts";
import { parseFeed } from "./rss.ts";

const log = (...a: unknown[]) => console.log("[crawl]", ...a);
const MIN_TEXT = 200; // shorter than this and the fetch almost certainly hit a bot wall or an empty shell

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
/** A page on the competitor's own site is official (tier 1); press, studies, partners and marketplaces are tier 2. */
export function tierFor(c: Competitor, url: string): Tier {
  const own = [c.website ?? "", ...c.aliases.filter((a) => a.includes("."))].map(host).filter(Boolean);
  const h = host(url);
  return own.some((o) => h === o || h.endsWith(`.${o}`) || o.endsWith(`.${h}`)) ? DEFAULT_TIER.web : DEFAULT_TIER.rss;
}

export interface CrawlReport { pagesChecked: number; pagesChanged: number; pagesFailed: number; feedsChecked: number; newItems: number; notes: string[] }

/** The most recent document for a source, by connector + externalId. */
async function latestDoc(connector: "web" | "rss", externalId: string) {
  const q = await db.collection(COLLECTIONS.documents).where("connector", "==", connector).where("externalId", "==", externalId).get();
  const docs = q.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SourceDocument, "id">) })).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  return docs[0];
}

async function crawlPage(c: Competitor, p: CrawlPage, rep: CrawlReport) {
  rep.pagesChecked++;
  const now = nowIso();
  const res = await fetchPage(p.url, p.marketId);
  if (!res.ok) { rep.pagesFailed++; rep.notes.push(`${c.name} ${p.url}: ${res.error}`); log(c.id, p.url, "failed:", res.error); return; }
  const { title, text } = htmlToText(res.html);
  if (text.length < MIN_TEXT) { rep.pagesFailed++; rep.notes.push(`${c.name} ${p.url}: only ${text.length} chars of text`); return; }
  const hash = await sha256(text);
  const prev = await latestDoc("web", p.url);
  if (prev && prev.contentHash === hash && prev.status === "processed") {
    const touched = await touchDocument(prev.id, now);
    log(c.id, p.url, "unchanged; refreshed", touched, "cells");
    return;
  }
  rep.pagesChanged++;
  const doc: Omit<SourceDocument, "id"> = {
    connector: "web", externalId: p.url, externalUrl: res.finalUrl, title: title ? `${c.name}: ${title}` : `${c.name} — ${p.label || p.kind}`,
    author: "", capturedAt: now, competitorIds: [c.id], marketId: p.marketId, tier: tierFor(c, p.url), relevance: 1, status: "new",
    snapshotPath: "", text, contentHash: hash, charCount: text.length, claimCount: 0, eventCount: 0, checkCount: 0,
  };
  const ref = await db.collection(COLLECTIONS.documents).add(clean(SourceDocument.omit({ id: true }).parse(doc)));
  log(c.id, p.url, prev ? "changed" : "first snapshot", "->", ref.id);
}

async function crawlFeed(c: Competitor | null, url: string, competitors: Competitor[], rep: CrawlReport) {
  rep.feedsChecked++;
  const res = await fetchPage(url);
  if (!res.ok) { rep.notes.push(`feed ${url}: ${res.error}`); return; }
  let feed: ReturnType<typeof parseFeed>;
  try { feed = parseFeed(res.html); } catch (e) { rep.notes.push(`feed ${url}: ${(e as Error).message}`); return; }
  const now = nowIso();
  for (const item of feed.items.slice(0, 30)) {
    if (await latestDoc("rss", item.id)) continue;
    // A competitor's own feed is about that competitor; a shared trade-media feed needs an alias match.
    const matched = c ? [c.id] : matchCompetitors(`${item.title}\n${item.summary}`, competitors).map((m) => m.id);
    if (matched.length === 0) continue;
    // Prefer the article body; fall back to the feed summary.
    let text = item.summary, title = item.title;
    const page = await fetchPage(item.link);
    if (page.ok) { const t = htmlToText(page.html); if (t.text.length >= MIN_TEXT) { text = t.text; title = title || t.title; } }
    if (text.length < 40) continue;
    const doc: Omit<SourceDocument, "id"> = {
      connector: "rss", externalId: item.id, externalUrl: item.link, title: `${feed.title || "News"}: ${title}`.slice(0, 200), author: "",
      capturedAt: now, publishedAt: item.publishedAt, competitorIds: matched, marketId: "GLOBAL", tier: c ? DEFAULT_TIER.web : DEFAULT_TIER.rss,
      relevance: 1, status: "new", snapshotPath: "", text, contentHash: await sha256(text), charCount: text.length, claimCount: 0, eventCount: 0, checkCount: 0,
    };
    await db.collection(COLLECTIONS.documents).add(clean(SourceDocument.omit({ id: true }).parse(doc)));
    rep.newItems++;
    log("feed", url, "new item ->", item.link);
  }
}

/**
 * Crawl every active competitor's pages and feeds (or one competitor's). `force` ignores the crawl interval;
 * the scheduled run passes the interval from settings so pages are re-fetched at most once per period.
 */
export async function runCrawl(opts: { competitorId?: string; force?: boolean; everyDays?: number } = {}): Promise<CrawlReport> {
  const rep: CrawlReport = { pagesChecked: 0, pagesChanged: 0, pagesFailed: 0, feedsChecked: 0, newItems: 0, notes: [] };
  const snap = await db.collection(COLLECTIONS.competitors).get();
  const competitors = snap.docs.flatMap((d) => { const r = Competitor.safeParse(d.data()); return r.success ? [r.data] : []; });
  const targets = competitors.filter((c) => c.status !== "archived" && (!opts.competitorId || c.id === opts.competitorId));
  const cutoff = opts.force || !opts.everyDays ? null : new Date(Date.now() - opts.everyDays * 86_400_000).toISOString();
  for (const c of targets) {
    for (const p of c.crawlPages) {
      if (cutoff) {
        const prev = await latestDoc("web", p.url);
        const last = prev?.lastCheckedAt ?? prev?.capturedAt;
        if (last && last > cutoff) { log(c.id, p.url, "checked recently, skipping"); continue; }
      }
      await crawlPage(c, p, rep);
    }
    for (const f of c.feeds) await crawlFeed(c, f, competitors, rep);
  }
  const settings = (await db.collection(COLLECTIONS.settings).doc("global").get()).data();
  for (const f of (settings?.newsFeeds as string[] | undefined) ?? []) await crawlFeed(null, f, competitors, rep);
  log("done", JSON.stringify(rep));
  return rep;
}
