# Nofence competitor analytics: build and operations

*For whoever maintains the tool. Companion to "What this is about". Written 23 September 2026.*

## Links

| What | Where |
|---|---|
| The tool | https://nofence-competitor-compare.web.app |
| Source code | https://github.com/jounihyotyla-max/CompetitorComparison (branch `v2`; `main` still holds the hackathon v1 until the PR is merged) |
| Architecture plan and decisions | `docs/v2-architecture.md` in the repo |
| Firebase project | `nofence-competitor-compare` in the Nofence Google account, region europe-west1: https://console.firebase.google.com/project/nofence-competitor-compare |
| Cloud Functions logs | Firebase console → Functions → Logs, or `firebase functions:log` |
| Slack app | "Nofence competitor analytics" at https://api.slack.com/apps (bot token stored as a secret, see below) |
| Design mockups | Claude Design canvas "Competitor Comparison Table" (Jouni) |
| Product team inputs | Google Sheet "VF Competitor comparison" (feature matrix, last edited 9 Jul 2026); Figma board "Competitors features" (hardware specs) |

## Architecture in one picture

```
sources ──► documents ──► pipeline ──► claims ──► cells + verdicts ──► web app
 web pages    (masked      mask · match · extract (Claude) ·          Overview · Battlecards
 RSS feeds     text)       verify (code) · resolve (tiers)            Marketing · Review · Ask
 Slack                                   └─► reviews (equal-tier conflicts, human decides)
 manual notes                            └─► events (dated timeline)
 HubSpot, Aircall (next)
```

Everything runs inside the Google project. Google's data-processing terms cover Nofence; the only external
processor is the Anthropic API (Claude), which sees masked text only. Netlify (v1 hosting) was dropped for this reason.

| Piece | Service |
|---|---|
| Frontend | Firebase Hosting, static Next.js export (`web/`) |
| Sign-in | Firebase Auth, Google provider; Firestore rules require `@nofence.com` |
| Data | Firestore (`europe-west1`); collections below |
| Snapshots | Cloud Storage bucket (EU multi-region), `snapshots/<documentId>.txt`, masked text |
| Logic | Cloud Functions for Firebase, 2nd gen, Node 22, TypeScript, bundled with esbuild (`functions/`) |
| Shared types | Zod schemas in `shared/`, used by both |
| Model | Claude API, `claude-opus-5` (parameter `CLAUDE_MODEL`) |
| Secrets | Secret Manager: `ANTHROPIC_API_KEY`, `SLACK_BOT_TOKEN` (later `HUBSPOT_TOKEN`, `AIRCALL_API_KEY`) |

## Data model (Firestore collections)

| Collection | One document per… | Notes |
|---|---|---|
| `competitors` | company (Nofence itself has `isSelf: true`) | name, aliases, website, `crawlPages[]` (url, kind, market), `feeds[]`, status active / draft / archived |
| `fields` | comparison row | type, comparison rule, group (overview / features / pricing / hardware / context), `perMarket`, `decayDays` |
| `markets` | country: US, UK, IE, NO, SE, ES (+ GLOBAL) | `group` drives the UI switcher (UK/IE) |
| `documents` | ingested source | connector, externalId, tier, capturedAt, masked `text`, `contentHash`, status new → processed |
| `claims` | one statement from one document about one (competitor, field, market) | quote + offsets, verified, tier, three dates, `supersededBy`, `rejected`, `sourceKey` |
| `cells` | current answer per (competitor, field, market) | winning `claimId`, value, tier, corroboration, `conflict`, `publishable`, confirm/outdate flags |
| `verdicts` | win / lose / tie / n/a per competitor cell vs Nofence | rule-based for numbers, prices, booleans; model for qualitative rows |
| `events` | dated happening (funding, launch, market entry…) | feeds "Recent moves" on battlecards |
| `reviews` | equal-tier conflict awaiting a decision | open / parked / accepted / rejected / merged |
| `battlecards`, `snippets` | generated content per competitor / market | `generatedFromCellIds` → "inputs changed" flag |
| `questions`, `feedback` | Ask history per user; ideas and problems | admins see all |
| `users`, `settings` | roles; channels, intervals, cursors | first sign-in = viewer; `ADMIN_EMAILS` promoted automatically |

Ids: `cells` and `verdicts` use `competitorId__fieldId__marketId`.

## The pipeline (per document)

1. **Mask** (`mask.ts`): emails, phone numbers and labelled customer names → placeholders. Employees stay named. *To be extended for transcripts.*
2. **Match** (`match.ts`): which competitors does the text mention (names and aliases, whole word)? None → document ignored.
3. **Extract** (`extract.ts`, Claude with a JSON schema): claims (field, market, value, status stated / inferred, verbatim quote) and events.
4. **Verify** (`verify.ts`): quote must be a substring of the masked text; a stated number or price must be inside the quote; otherwise downgrade or drop. Types normalised (booleans, lists, categories, prices with currency).
5. **Resolve** (`resolve.ts`): against the cell's current claim. Agree → corroborate. Higher tier → replace. Equal or lower → keep, flag conflict, open a review. Free text at equal tier → newest wins. Lists at equal tier → union. Newer snapshot of the same page → supersedes its own older claims.
6. **Verdicts** (`verdict.ts`): recomputed for touched (field, market) keys.

Re-running a document (`reprocessDocument`, or Settings → Re-run all sources) first deletes its earlier claims and rebuilds the affected cells.

## Connectors and schedules (Europe/Oslo)

| Function | When | Does |
|---|---|---|
| `crawlScheduled` | daily 06:00 | Re-fetch pages older than their kind's interval (pricing 7 d, product 14 d, news 1 d, about 30 d); changed text → new tier-1/2 document; unchanged → *last checked* refreshed. Feeds daily. |
| `slackScheduled` | daily 06:30 | Read configured channels (or all the bot is in) since each channel's cursor; competitor mentions with thread → tier-4 documents. Slack allows 1 history request/minute for this app, so a run reads up to 4 pages (60 messages) per channel within a 12-minute budget and continues next day. |
| `digestWeekly` | Monday 07:00 | Post to `settings.digestSlackChannel`: new sources, changed values, open reviews, stale pricing, drafts, open feedback. |
| `onDocumentNew` | on create | The pipeline above. |
| `onReviewDecided` | on update | Applies accept / reject / merge to the cell, supersedes or rejects claims, recomputes verdicts. |
| `onUserNew` | on create | Promotes `ADMIN_EMAILS` to admin. |

Admin-callable from Settings: `seed` (load / fill registry, optional reset of watched pages), `reprocessDocument`,
`crawlNow`, `suggestPages` (scan a site for pages to watch), `slackSyncNow`, `digestNow` (preview or post),
`autoResolveReviews` (tidy up), `battlecard`, `marketing`. Anyone signed in: `ask`.

## Deploying

```bash
git clone https://github.com/jounihyotyla-max/CompetitorComparison && cd CompetitorComparison
npm install
npm test && npm run typecheck
firebase login            # once
firebase deploy --only functions,hosting,firestore,storage
```

Non-secret parameters live in `functions/.env` (`CLAUDE_MODEL`, `ADMIN_EMAILS`). Secrets:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set SLACK_BOT_TOKEN
```

A first deploy of the whole codebase needs every referenced secret to exist. The Firestore emulator needs Java,
which the dev Mac lacks; the pipeline's Firestore glue is exercised against the real project via *Re-run all sources*.

## Slack app

Created from a manifest (in the repo's docs). Bot scopes: `channels:read`, `channels:history`, `groups:read`,
`groups:history`, `chat:write`, `users:read`, `users:read.email`. The bot must be **invited** to every channel it
reads and to the digest channel; private channels are invisible to it until invited. Messages from bots and
non-competitor messages are never stored.

## Runbook

| Situation | Do |
|---|---|
| New competitor | Settings → Competitors → Add (name, website) → *Suggest pages* → tick → *Crawl X now*. Keep as **draft** until it should appear in the tables. |
| Competitor changed its website structure | Settings → Competitors → open it → remove dead pages, *Suggest pages* again. Failed fetches show in the crawl result and in Sources. |
| Too many reviews | Review → *Tidy up* (folds duplicates, settles descriptive fields and list unions). What remains needs a human. |
| A value is wrong | Click it → *Mark as outdated*, or add a note by hand with the right tier, or decide the review if one is open. |
| Something added by hand should be retracted | Sources → the document → *Re-run* after editing is not supported; instead mark affected cells outdated and add a corrective note. |
| Field or prompt changed | Settings → *Re-run all sources* (costs one model call per source and competitor). |
| Slack channel list | Settings → Sources: Slack. Empty list = every channel the bot is in. |
| Someone needs more rights | Settings → People → role. Keep two admins. |
| Ideas and problems from users | Settings → Ideas and problems → *Copy for Claude* → paste to the builder session; *Done* when handled. |
| Costs | Firebase: a few dollars a month. Claude: roughly one call per source per competitor plus verdict and generation calls; the first crawl of ~60 pages cost in the low dollars. |

## GDPR notes

Legal covers storing customer emails and transcripts; Google contracts cover processing. Customer names, emails,
phones and farm names are masked at ingestion before storage or any model call. Only Nofence employees (Google SSO,
`@nofence.com`) can sign in. Anthropic API coverage: to be confirmed on record.

## Roadmap

Done: phases 1–3 of the plan plus Battlecards, Marketing, Ask, Talk to me, Slack, digest. Next: HubSpot and
Aircall connectors with transcript masking (phase 4), then per-page kinds of review policy, exports (slide, PDF),
translation of battlecards and snippets for NO/SE/ES, custom domain `compare.nofence.com`.
