/**
 * Slack connector (phase 4): once a day, read the configured channels since the last cursor, keep only messages
 * that mention a known competitor, and store each message (with its thread) as a tier-4 document. Masking of
 * customer data happens in the pipeline; the poster is a Nofence employee and stays named.
 *
 * Also the outbound side: the weekly digest is posted with chat.postMessage.
 */
import { COLLECTIONS, Competitor, DEFAULT_TIER, Settings, SourceDocument } from "@cc/shared";
import { clean, db, nowIso } from "../lib/admin.ts";
import { matchCompetitors } from "../pipeline/match.ts";
import { sha256 } from "../pipeline/text.ts";

const log = (...a: unknown[]) => console.log("[slack]", ...a);

type SlackResp = { ok: boolean; error?: string; [k: string]: unknown };

export function slackClient(token: string) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /**
   * One Web API call. Slack rate-limits per method; non-Marketplace apps created after May 2025 get
   * conversations.history / replies at 1 request per minute with 15 messages per page. On 429 we wait for
   * Retry-After (capped at 70 s) and retry a few times instead of failing the whole run.
   */
  const call = async (method: string, params: Record<string, string | number | boolean | undefined> = {}, post = false): Promise<SlackResp> => {
    for (let attempt = 0; ; attempt++) {
      const url = new URL(`https://slack.com/api/${method}`);
      const init: RequestInit = { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) };
      if (post) { init.method = "POST"; init.headers = { ...init.headers, "content-type": "application/json; charset=utf-8" }; init.body = JSON.stringify(params); }
      else for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
      const res = await fetch(url, init);
      const json = (await res.json().catch(() => ({ ok: false, error: `http ${res.status}` }))) as SlackResp;
      if (json.ok) return json;
      if ((res.status === 429 || json.error === "ratelimited") && attempt < 3) {
        const wait = Math.min(70, Number(res.headers.get("retry-after") ?? 30)) * 1000;
        log(method, "rate limited, waiting", wait / 1000, "s");
        await sleep(wait);
        continue;
      }
      throw new Error(`slack ${method}: ${json.error ?? res.status}`);
    }
  };
  const users = new Map<string, { name: string; email: string; bot: boolean }>();
  const user = async (id: string) => {
    if (!users.has(id)) {
      try {
        const r = await call("users.info", { user: id });
        const u = r.user as { real_name?: string; name?: string; is_bot?: boolean; profile?: { email?: string; real_name?: string } };
        users.set(id, { name: u.profile?.real_name ?? u.real_name ?? u.name ?? id, email: u.profile?.email ?? "", bot: !!u.is_bot });
      } catch { users.set(id, { name: id, email: "", bot: false }); }
    }
    return users.get(id)!;
  };
  return {
    call,
    user,
    async channels(): Promise<Map<string, { id: string; name: string; isPrivate: boolean; isMember: boolean }>> {
      const out = new Map<string, { id: string; name: string; isPrivate: boolean; isMember: boolean }>();
      let cursor: string | undefined;
      do {
        const r = await call("conversations.list", { types: "public_channel,private_channel", exclude_archived: true, limit: 200, cursor });
        for (const c of r.channels as { id: string; name: string; is_private: boolean; is_member?: boolean }[]) out.set(c.name, { id: c.id, name: c.name, isPrivate: c.is_private, isMember: !!c.is_member });
        cursor = (r.response_metadata as { next_cursor?: string } | undefined)?.next_cursor || undefined;
      } while (cursor);
      return out;
    },
    /** One page (15 messages, oldest first) after `oldest`; the caller keeps the cursor and the time budget. */
    async historyPage(channel: string, oldest?: string): Promise<{ messages: SlackMessage[]; hasMore: boolean }> {
      const r = await call("conversations.history", { channel, oldest, limit: 15, inclusive: false });
      const messages = (r.messages as SlackMessage[]).sort((a, b) => Number(a.ts) - Number(b.ts));
      return { messages, hasMore: !!r.has_more };
    },
    async replies(channel: string, ts: string) {
      const r = await call("conversations.replies", { channel, ts, limit: 15 });
      return (r.messages as SlackMessage[]).filter((m) => m.ts !== ts);
    },
    async permalink(channel: string, ts: string) {
      try { return String((await call("chat.getPermalink", { channel, message_ts: ts })).permalink ?? ""); } catch { return ""; }
    },
    async post(channel: string, text: string, blocks?: unknown[]) {
      return call("chat.postMessage", { channel, text, ...(blocks ? { blocks: JSON.stringify(blocks) as unknown as string } : {}), unfurl_links: false }, true);
    },
  };
}

export interface SlackMessage { type: string; subtype?: string; user?: string; bot_id?: string; text?: string; ts: string; thread_ts?: string; reply_count?: number; files?: unknown[] }

/** <@U123> → @Name, <#C123|name> → #name, <url|label> → label (url). */
async function render(text: string, c: ReturnType<typeof slackClient>) {
  let out = text;
  for (const m of [...text.matchAll(/<@([A-Z0-9]+)>/g)]) out = out.replace(m[0], `@${(await c.user(m[1])).name}`);
  out = out.replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1").replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)").replace(/<(https?:[^>]+)>/g, "$1");
  return out.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

export interface SlackReport { channelsRead: number; messagesSeen: number; documentsCreated: number; notes: string[] }

export async function syncSlack(token: string, opts: { channels?: string[]; force?: boolean; budgetMs?: number } = {}): Promise<SlackReport> {
  const rep: SlackReport = { channelsRead: 0, messagesSeen: 0, documentsCreated: 0, notes: [] };
  const client = slackClient(token);
  const settingsRef = db.collection(COLLECTIONS.settings).doc("global");
  const settings = Settings.parse({ id: "global", updatedAt: nowIso(), ...(await settingsRef.get()).data() });
  const competitors = (await db.collection(COLLECTIONS.competitors).get()).docs.flatMap((d) => { const r = Competitor.safeParse(d.data()); return r.success ? [r.data] : []; });
  const all = await client.channels();
  // An explicit list wins; with no list, every channel the bot has been invited to is read.
  let wanted = opts.channels ?? settings.slackChannels;
  if (wanted.length === 0) {
    wanted = [...all.values()].filter((c) => c.isMember).map((c) => c.name);
    rep.notes.push(wanted.length ? `no channel list set; reading the ${wanted.length} channel${wanted.length === 1 ? "" : "s"} the bot is in: ${wanted.map((n) => `#${n}`).join(", ")}` : "the bot is not a member of any channel yet");
    if (wanted.length === 0) return rep;
  }
  const cursors = { ...settings.slackCursors };
  // First sync starts 14 days back; later syncs continue from each channel's cursor. With Slack's 1 request per
  // minute on history, a run reads what it can within the budget and the next run picks up where it stopped.
  const initialOldest = String(Math.floor((Date.now() - 14 * 86_400_000) / 1000));
  const deadline = Date.now() + (opts.budgetMs ?? 12 * 60_000);
  const saveCursors = () => settingsRef.set({ slackCursors: cursors, updatedAt: nowIso() }, { merge: true });
  let outOfTime = false;

  for (const name of wanted) {
    if (Date.now() > deadline) { outOfTime = true; break; }
    const ch = all.get(name.replace(/^#/, ""));
    if (!ch) { rep.notes.push(`#${name}: no such channel (private channels appear only once the bot is invited)`); continue; }
    if (!ch.isMember) { rep.notes.push(`#${name}: the bot is not a member, invite it with /invite`); continue; }
    rep.channelsRead++;
    const messages: SlackMessage[] = [];
    let oldest = opts.force ? initialOldest : (cursors[ch.name] ?? initialOldest);
    // At most a few pages per channel per run, so every channel gets a turn inside the budget.
    for (let page = 0; page < 4 && Date.now() < deadline; page++) {
      let r: { messages: SlackMessage[]; hasMore: boolean };
      try { r = await client.historyPage(ch.id, oldest); } catch (e) { rep.notes.push(`#${name}: ${(e as Error).message}`); break; }
      messages.push(...r.messages);
      if (r.messages.length) oldest = r.messages[r.messages.length - 1].ts;
      if (!r.hasMore) break;
      rep.notes.push(`#${name}: more history remains, continuing next run`);
    }
    for (const m of messages) {
      rep.messagesSeen++;
      cursors[ch.name] = m.ts;
      if (m.type !== "message" || (m.subtype && m.subtype !== "thread_broadcast") || m.bot_id || !m.text || m.thread_ts && m.thread_ts !== m.ts) continue;
      const author = m.user ? await client.user(m.user) : { name: "unknown", email: "", bot: false };
      if (author.bot) continue;
      let text = await render(m.text, client);
      if (m.reply_count) {
        for (const r of await client.replies(ch.id, m.ts)) {
          if (!r.text || r.bot_id) continue;
          const u = r.user ? await client.user(r.user) : { name: "unknown" };
          text += `\n\n[reply from ${u.name}] ${await render(r.text, client)}`;
        }
      }
      const matched = matchCompetitors(text, competitors).map((x) => x.id);
      if (matched.length === 0) continue;
      const externalId = `${ch.id}:${m.ts}`;
      const dup = await db.collection(COLLECTIONS.documents).where("connector", "==", "slack").where("externalId", "==", externalId).limit(1).get();
      if (!dup.empty) continue;
      const when = new Date(Number(m.ts) * 1000).toISOString();
      const doc: Omit<SourceDocument, "id"> = {
        connector: "slack", externalId, externalUrl: await client.permalink(ch.id, m.ts),
        title: `#${ch.name}: ${author.name}, ${when.slice(0, 10)}`.slice(0, 200), author: author.email || author.name,
        capturedAt: when, competitorIds: matched, marketId: "GLOBAL", tier: DEFAULT_TIER.slack, relevance: 1, status: "new",
        snapshotPath: "", text, contentHash: await sha256(text), charCount: text.length, claimCount: 0, eventCount: 0, checkCount: 0,
      };
      await db.collection(COLLECTIONS.documents).add(clean(SourceDocument.omit({ id: true }).parse(doc)));
      rep.documentsCreated++;
      log(`#${ch.name}`, m.ts, "->", matched.join(","));
    }
    await saveCursors();
  }
  if (outOfTime) rep.notes.push("time budget used up; the rest continues on the next run");
  await saveCursors();
  rep.notes = [...new Set(rep.notes)];
  log("done", JSON.stringify(rep));
  return rep;
}
