# Nofence competitor analytics: what this is about

*For everyone who will use the tool. Five minutes to read. Written 23 September 2026, first pilot.*

## In one paragraph

Competitor analytics is an internal web tool that keeps a live, side-by-side comparison of Nofence and its
virtual-fencing competitors: Halter, Monil, Vence (Merck), Gallagher eShepherd, Innogando, and more as they appear.
Every value in it comes from a named source with a date and a verbatim quote, so you can always see *where a fact
comes from* and *how much to trust it*. Nothing in the tables is typed in by hand or generated from general
knowledge; the tool reads sources, extracts what they state, checks the quote is really there, and shows it.

Open it at **https://nofence-competitor-compare.web.app** with your Nofence Google account.

## What you can use it for

| You are… | Use it to… |
|---|---|
| **Sales** | Prepare for a conversation where a competitor comes up: the *Battlecards* tab gives where we win, where they genuinely win, and objection handling, every line linked to its source. |
| **Marketing** | Find claims that are safe to publish and copy-ready snippets per market; the *Marketing* tab only uses official or press sources that are current and undisputed, and lists what must stay internal. |
| **Product** | See a feature matrix across all competitors (features, hardware, connectivity, pricing), with a timeline of their recent moves (funding, launches, market entries). |
| **Leadership** | Ask a question in plain words ("Has Halter announced anything about sheep?") and get an answer that cites its sources, or says the sources don't cover it. |
| **Anyone** | Notice something wrong, missing or annoying → tell the builders in two clicks. |

## What it can do today

- **Overview**: Nofence against every active competitor, grouped as company basics, competitive features, pricing (per country), hardware and context. Green means a real advantage, amber partial or coming, a dash means no source covers it.
- **Market switcher**: All · US · UK/IE · NO · SE · ES. Prices, offers and minimum orders differ per country; everything else is global.
- **Where does this come from?** Click any value: the quote, the source, its trust tier, when it was first seen, last changed and last checked, and how many sources agree.
- **Battlecards** per competitor, generated from the compared values only, flagged when any input changed.
- **Marketing** pack per market: differentiators we can say out loud, snippets, and a "don't use" list with reasons.
- **Review** inbox: where the tool asks a human to decide between two sources.
- **Sources & inputs**: every source the tables are built on, and a box to add your own notes.
- **Talk to me** (bottom right): ask the data, or tell the builders what to change.

## Where the data comes from

| Source | How | Trust tier |
|---|---|---|
| Competitor websites (product, pricing, news pages, per country) | Read automatically; pricing pages weekly, product pages every two weeks, news daily. Only re-read when the page text changed. | 1 · Official |
| Press, studies, partner pages, RSS feeds | Read on the same schedule; feed items kept only when they mention a known competitor. | 2 · Third-party public |
| Product team research (feature matrix, hardware board) | Loaded once, dated from when it was written. | 2–3 |
| Slack: #market_intelligence, #product-updates-and-feedback, #commercial, #customer-facing-changes, #marketing, #nofence_in_media | Read daily. Only messages that mention a competitor by name are kept, with their thread. | 4 · Hearsay |
| Notes you add by hand | *Sources & inputs → Add notes by hand*. You say how you know it; that sets the tier. | 1–5, your choice |
| HubSpot notes and Aircall call transcripts | Coming next. Customer names, emails and phone numbers are masked before anything is stored. | 3 · Firsthand internal |

The trust tiers, from most to least trusted: **1 Official** (the competitor's own site), **2 Third-party public**
(press, studies), **3 Firsthand internal** (a customer told us, a support ticket), **4 Hearsay** (a colleague
recalls what a farmer said), **5 Opinion** (our own assessment).

## How the data is curated

The tool never overwrites a fact silently, and never invents one.

1. **Extraction, then verification.** A model reads each source and proposes values with a verbatim quote. Code then checks the quote really is in the source and that any number or price is inside the quote. What fails the check is downgraded to *inferred* or dropped.
2. **Higher trust wins; equal trust asks.** If an official page says something that contradicts a Slack remark, the page wins automatically (the old value stays in history). If two sources of the *same* tier disagree, a **review** opens: the cell keeps its current value with a red *conflict* tag and stays out of Marketing until someone decides. Descriptive text (positioning, connectivity descriptions) simply takes the newest official wording; lists (species, markets) merge.
3. **Freshness.** Every value shows when it was last checked. Each row has its own decay: prices go stale after 90 days, product features after 180, founding year never. Stale values are tagged, and stale pricing drops out of Marketing until someone confirms it.
4. **Corroboration.** The popover shows how many independent sources agree, and how many disagree.
5. **Humans decide the hard cases.** In *Review*, an editor can accept the new value, keep the current one, type the value that is actually true (often "both are right, per product"), or park it with a note when it needs checking with someone.
6. **Marketing only sees publishable values**: tier 1 or 2, current, undisputed. Internal knowledge shapes battlecards and the Overview but never public copy.

## How to get access, and which role to ask for

Sign in with your **@nofence.com Google account**; the first sign-in creates you as a *viewer*. Ask Jouni Hyötylä
(or any admin, listed under *Settings → People*) for a higher role if you need one:

| Role | Who | Can |
|---|---|---|
| **Viewer** | Everyone in sales, marketing, product, leadership | Read everything, use Battlecards and Marketing, ask questions, send ideas and problems |
| **Editor** | People who will keep the data honest: one or two per team | Everything above, plus add notes, decide reviews, confirm or outdate values, generate battlecards and marketing packs |
| **Admin** | The tool's owners (at least two) | Everything, plus competitors and watched pages, fields and freshness rules, Slack settings, roles |

For the pilot: **Viewer** unless you want to help curate, in which case ask for **Editor**.

## What we ask of pilot users

Use it for real work for two weeks. When something is missing, wrong, phrased the wrong way, or you wish it analysed
things differently, press **Talk to me** (bottom right) → *Change something*, pick the closest category, one sentence
is enough. Where you were in the tool is attached automatically. You'll see your requests and their status there.
When an answer from *Ask the data* doesn't help, press *Didn't help*; that alone tells us where the data has gaps.
