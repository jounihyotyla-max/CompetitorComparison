"use client";
import { useEffect, useState } from "react";

const KEY = (tab: string) => `intro:${tab}`;

/** One tip per card; the carousel is closable and the choice is remembered in this browser. */
export const TIPS: Record<string, string[]> = {
  overview: [
    "Compare Nofence with every active competitor, row by row. Green is a real advantage, amber partial or coming, a dash means no source covers it yet.",
    "Switch market at the top right. Prices, offers and minimum orders change per country; everything else is global.",
    "Click any value to see where it comes from: the quote, the source, its trust tier, when it was last checked, and how many sources agree.",
    "Italic means inferred rather than stated. A red conflict tag means two sources disagree and the Review tab is waiting for a decision.",
    "Talk to me (bottom right) answers questions from our sources with citations, and is where you tell the builders what to analyse or show differently.",
  ],
  battlecards: [
    "Pick a competitor. The card lists where Nofence wins, where they genuinely win, and objection handling, all written from the compared values only.",
    "Every line links back to its cell, so you can check the quote before using it in a conversation.",
    "Regenerate when the tag says inputs changed. Recent moves come from dated events found in the sources.",
  ],
  marketing: [
    "Only publishable values get in here: official or reputable public sources, current, and undisputed. Internal notes and hearsay never do.",
    "Differentiators are phrased in Nofence's voice. “Check first” means one of the values behind it is not publishable yet.",
    "Snippets are starting points for web, ads and social; copy and edit freely. Pick a single country for market prices.",
    "“Don't use in marketing” lists tempting claims that must stay internal, with the reason.",
  ],
  review: [
    "A review opens when a source of equal or lower trust disagrees with a current value. Until decided, the cell keeps its value, shows a conflict tag and stays out of Marketing.",
    "Accept the new value, keep the current one, or type the value that is actually true. “Both” prefills the two values with their sources.",
    "Park it with a note when you need to check with someone; it moves to Waiting for confirmation and stops nagging.",
  ],
  sources: [
    "Everything in the tables traces back to one of these sources. Competitor pages and feeds arrive automatically; notes can be added by hand.",
    "When you add a note, say how you know it: official page, press, a customer told us, hearsay, our opinion. That trust tier decides whether it can overrule what is already there.",
    "Customer names, emails and phone numbers are masked before anything is stored.",
  ],
  settings: [
    "Competitors: what we watch for each one (pages per market, feeds, aliases). Add a competitor, then crawl it.",
    "Fields: how long each value stays trusted before it is flagged stale, and which rows are shown.",
    "People: viewer reads, editor adds notes and decides reviews, admin manages everything. Keep at least two admins.",
  ],
};

export default function Intro({ tab }: { tab: string }) {
  const [hidden, setHidden] = useState(true);
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); try { setHidden(localStorage.getItem(KEY(tab)) === "1"); } catch { setHidden(false); } }, [tab]);
  const tips = TIPS[tab];
  if (!tips || hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(KEY(tab), "1"); } catch {} };
  const last = i >= tips.length - 1;
  return (
    <div className="blueprint intro" role="region" aria-label="Tips">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="kicker" style={{ whiteSpace: "nowrap" }}>Tip {i + 1} of {tips.length}</span>
        <span style={{ flex: 1, lineHeight: 1.55 }}>{tips[i]}</span>
        <span className="dots" aria-hidden>{tips.map((_, k) => <i key={k} className={k === i ? "on" : ""} onClick={() => setI(k)} />)}</span>
        <button className="btn" type="button" style={{ fontSize: 12, padding: "4px 10px" }} disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous tip">‹</button>
        {last
          ? <button className="btn btn-primary" type="button" style={{ fontSize: 12, padding: "4px 10px" }} onClick={close}>Got it</button>
          : <button className="btn" type="button" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setI(i + 1)} aria-label="Next tip">›</button>}
        <button className="btn" type="button" style={{ fontSize: 12, padding: "4px 8px" }} onClick={close} aria-label="Close tips" title="Don't show again">×</button>
      </div>
    </div>
  );
}

export function resetIntros() {
  try { for (const k of Object.keys(TIPS)) localStorage.removeItem(KEY(k)); } catch {}
}
