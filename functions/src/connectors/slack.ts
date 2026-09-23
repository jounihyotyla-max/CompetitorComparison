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
  const call = async (method: string, params: Record<string, string | number | boolean | undefined> = {}, post = false): Promise<SlackResp> => {
    const url = new URL(`https://slack.com/api/${method}`);
    const init: RequestInit = { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) };
    if (post) { init.method = "POST"; init.headers = { ...init.headers, "content-type": "application/json; charset=utf-8" }; init.body = JSON.stringify(params); }
    else for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetch(url, init);
    const json = (await res.json()) as SlackResp;
    if (!json.ok) throw new Error(`slack ${method}: ${json.error ?? res.status}`);
    return json;
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
    async channels(): Promise<Map<string, { id: string; name: string; isPrivate: boolean }>> {
      const out = new Map<string, { id: string; name: string; isPrivate: boolean }>();
      let cursor: string | undefined;
      do {
        const r = await call("conversations.list", { types: "public_channel,private_channel", exclude_archived: true, limit: 200, cursor });
        for (const c of r.channels as { id: string; name: string; is_private: boolean }[]) out.set(c.name, { id: c.id, name: c.name, isPrivate: c.is_private });
        cursor = (r.response_metadata as { next_cursor?: string } | undefined)?.next_cursor || undefined;
      } while (cursor);
      return out;
    },
    async history(channel: string, oldest?: string) {
      const out: SlackMessage[] = [];
      let cursor: string | undefined;
      do {
        const r = await call("conversations.history", { channel, oldest, limit: 200, cursor, inclusive: false });
        out.push(...(r.messages as SlackMessage[]));
        cursor = (r.response_metadata as { next_cursor?: string } | undefined)?.next_cursor || undefined;
      } while (cursor && out.length < 2000);
      return out.sort((a, b) => Number(a.ts) - Number(b.ts));
    },
    async replies(channel: string, ts: string) {
      const r = await call("conversations.replies", { channel, ts, limit: 200 });
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

export async function syncSlack(token: string, opts: { channels?: string[]; force?: boolean } = {}): Promise<SlackReport> {
  const rep: SlackReport = { channelsRead: 0, messagesSeen: 0, documentsCreated: 0, notes: [] };
  const client = slackClient(token);
  const settingsRef = db.collection(COLLECTIONS.settings).doc("global");
  const settings = Settings.parse({ id: "global", updatedAt: nowIso(), ...(await settingsRef.get()).data() });
  const wanted = opts.channels ?? settings.slackChannels;
  if (wanted.length === 0) { rep.notes.push("no Slack channels configured in settings"); return rep; }
  const competitors = (await db.collection(COLLECTIONS.competitors).get()).docs.flatMap((d) => { const r = Competitor.safeParse(d.data()); return r.success ? [r.data] : []; });
  const all = await client.channels();
  const cursors = { ...settings.slackCursors };
  // First sync reads the last 30 days; later syncs read from the cursor.
  const initialOldest = String(Math.floor((Date.now() - 30 * 86_400_000) / 1000));

  for (const name of wanted) {
    const ch = all.get(name.replace(/^#/, ""));
    if (!ch) { rep.notes.push(`#${name}: not found or the bot is not a member`); continue; }
    rep.channelsRead++;
    let messages: SlackMessage[];
    try { messages = await client.history(ch.id, opts.force ? initialOldest : (cursors[ch.name] ?? initialOldest)); }
    catch (e) { rep.notes.push(`#${name}: ${(e as Error).message}`); continue; }
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
  }
  await settingsRef.set({ slackCursors: cursors, updatedAt: nowIso() }, { merge: true });
  log("done", JSON.stringify(rep));
  return rep;
}
