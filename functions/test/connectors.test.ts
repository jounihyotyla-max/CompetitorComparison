import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, decodeEntities } from "../src/connectors/html.ts";
import { parseFeed } from "../src/connectors/rss.ts";

test("htmlToText keeps the words, drops scripts, menus and footers, decodes entities", () => {
  const html = `<html><head><title>Halter &ndash; Pricing</title><style>p{}</style></head><body>
    <nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav>
    <main><h1>Simple pricing</h1><p>$0 upfront. <b>$90</b> per head per year.</p><script>track()</script>
    <ul><li>100 head minimum</li><li>Lifetime warranty</li></ul></main>
    <footer>&copy; 2026 Halter</footer></body></html>`;
  const { title, text } = htmlToText(html);
  assert.equal(title, "Halter – Pricing");
  assert.match(text, /Simple pricing\n\$0 upfront\. \$90 per head per year\.\n100 head minimum\nLifetime warranty/);
  assert.doesNotMatch(text, /Home|track\(\)|©/);
});

test("entity decoding handles named, decimal and hex", () => {
  assert.equal(decodeEntities("&pound;215 &amp; &#8364;245 &#x24;239"), "£215 & €245 $239");
});

test("parseFeed reads RSS 2.0 and Atom", () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Halter News</title>
    <item><title>Halter raises $220M</title><link>https://halterhq.com/news/series-e</link><guid>se-2026</guid><pubDate>Thu, 12 Mar 2026 09:00:00 GMT</pubDate><description><![CDATA[<p>Series E led by...</p>]]></description></item>
    </channel></rss>`;
  const r = parseFeed(rss);
  assert.equal(r.title, "Halter News");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].id, "se-2026");
  assert.equal(r.items[0].link, "https://halterhq.com/news/series-e");
  assert.equal(r.items[0].publishedAt, "2026-03-12T09:00:00.000Z");
  assert.equal(r.items[0].summary, "Series E led by...");

  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Monil blog</title>
    <entry><title>Warranty now 10 years</title><id>tag:monil,2026:warranty</id><link rel="alternate" href="https://www.monil.no/blog/warranty"/><updated>2026-08-28T10:00:00Z</updated><summary>We extended the warranty.</summary></entry>
    </feed>`;
  const a = parseFeed(atom);
  assert.equal(a.title, "Monil blog");
  assert.equal(a.items[0].link, "https://www.monil.no/blog/warranty");
  assert.equal(a.items[0].publishedAt, "2026-08-28T10:00:00.000Z");
});
