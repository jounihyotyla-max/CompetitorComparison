"use client";
import { useEffect, useState } from "react";

const KEY = (tab: string) => `intro:${tab}`;

export const INTROS: Record<string, { title: string; lines: string[] }> = {
  overview: {
    title: "What you can do here",
    lines: [
      "Compare Nofence with every active competitor, row by row. Green is a real advantage, amber partial or coming, a dash means no source covers it yet.",
      "Switch market at the top right: prices and offers change per country, everything else is global.",
      "Click any value to see where it comes from: the quote, the source, its trust tier, when it was last checked, and how many sources agree.",
      "Italic means inferred rather than stated; a red conflict tag means two sources disagree and the Review tab is waiting for a decision.",
    ],
  },
  battlecards: {
    title: "What you can do here",
    lines: [
      "Pick a competitor. The card lists where Nofence wins, where they genuinely win, and objection handling, all written from the compared values only.",
      "Every line links back to its cell, so you can check the source before you use it in a conversation.",
      "Generate or regenerate when the tag says inputs changed. Recent moves come from dated events in the sources.",
    ],
  },
  review: {
    title: "What you can do here",
    lines: [
      "A review opens when a source of equal or lower trust disagrees with a current value. Until it is decided, the cell keeps its value, shows a conflict tag and stays out of Marketing.",
      "Accept the new value, keep the current one, or type the value that is actually true (Both prefills the two values with their sources).",
      "Park it with a note when you have looked but need to check with someone; it moves to Waiting for confirmation.",
    ],
  },
  sources: {
    title: "What you can do here",
    lines: [
      "Everything in the tables traces back to one of these sources. Competitor pages and feeds arrive automatically; notes can be added by hand.",
      "When you add a note, say how you know it (official page, press, a customer told us, hearsay, our opinion). That trust tier decides whether it can overrule what is already there.",
      "Customer names, emails and phone numbers are masked before anything is stored.",
    ],
  },
  settings: {
    title: "What you can do here",
    lines: [
      "Competitors: what we watch for each one (pages per market, feeds, aliases), add a competitor, crawl now.",
      "Fields: how long each value stays trusted before it is flagged stale, and which rows are shown.",
      "People: viewer reads, editor adds notes and decides reviews, admin manages everything. Keep at least two admins.",
    ],
  },
};

/** Per-tab introduction, closable; the choice is remembered in this browser. Settings has a "show again" link. */
export default function Intro({ tab }: { tab: string }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(KEY(tab)) === "1"); } catch { setHidden(false); } }, [tab]);
  const intro = INTROS[tab];
  if (!intro || hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(KEY(tab), "1"); } catch {} };
  return (
    <div className="blueprint intro">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <b>{intro.title}</b>
        <button className="btn" type="button" onClick={close} style={{ fontSize: 12, padding: "4px 10px" }}>Got it</button>
      </div>
      <ul>{intro.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

export function resetIntros() {
  try { for (const k of Object.keys(INTROS)) localStorage.removeItem(KEY(k)); } catch {}
}
