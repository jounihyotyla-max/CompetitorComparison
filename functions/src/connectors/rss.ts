/** RSS 2.0 and Atom feeds → items. Small on purpose: title, link, date, summary. */
import { XMLParser } from "fast-xml-parser";
import { decodeEntities } from "./html.ts";

export interface FeedItem { id: string; title: string; link: string; publishedAt?: string; summary: string }

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["#text"] ?? "");
  if (typeof v === "object" && "@_href" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["@_href"] ?? "");
  return String(v);
};
const arr = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const iso = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); };
const strip = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parseFeed(xml: string): { title: string; items: FeedItem[] } {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", cdataPropName: "#cdata", textNodeName: "#text" });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const cd = (v: unknown) => { const o = v as Record<string, unknown> | undefined; return o && typeof o === "object" && "#cdata" in o ? String(o["#cdata"]) : text(v); };

  const rss = (doc.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
  if (rss) {
    const items = arr(rss.item as Record<string, unknown>[]).map((it) => {
      const link = cd(it.link).trim();
      return { id: cd(it.guid).trim() || link, title: strip(cd(it.title)), link, publishedAt: iso(cd(it.pubDate) || cd(it["dc:date"])), summary: strip(cd(it.description) || cd(it["content:encoded"])).slice(0, 2000) };
    });
    return { title: strip(cd(rss.title)), items: items.filter((i) => i.link) };
  }
  const atom = doc.feed as Record<string, unknown> | undefined;
  if (atom) {
    const items = arr(atom.entry as Record<string, unknown>[]).map((it) => {
      const links = arr(it.link as Record<string, unknown>[]);
      const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      const link = text(alt).trim();
      return { id: cd(it.id).trim() || link, title: strip(cd(it.title)), link, publishedAt: iso(cd(it.published) || cd(it.updated)), summary: strip(cd(it.summary) || cd(it.content)).slice(0, 2000) };
    });
    return { title: strip(cd(atom.title)), items: items.filter((i) => i.link) };
  }
  return { title: "", items: [] };
}
