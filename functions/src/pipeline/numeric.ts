/** Deterministic price and number parsing. Ported from v1 backend/numeric.py and extended for kr / NOK / SEK. */

export interface Price {
  amount: number;
  currency: string;
  /** month | year | week | one-time | unspecified */
  period: string;
  perMonth: number | null;
  raw: string;
}

const CURRENCIES: Record<string, string> = {
  $: "USD", "€": "EUR", "£": "GBP", usd: "USD", eur: "EUR", gbp: "GBP", nok: "NOK", sek: "SEK", kr: "NOK",
};
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", NOK: "kr ", SEK: "kr " };
const CUR = "[$€£]|\\b(?:USD|EUR|GBP|NOK|SEK|kr)\\b";
const AMOUNT = new RegExp(
  `(?<pre>${CUR})?\\s?(?<num>\\d{1,3}(?:[,\\u00a0 ]\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)\\s?(?<post>${CUR})?`,
  "gi",
);
const PERIODS: [string, RegExp, number | null][] = [
  ["month", /\b(?:month|mo|monthly|mnd)\b/i, 1],
  ["year", /\b(?:year|yr|annual|annually|per annum|år)\b/i, 1 / 12],
  ["week", /\b(?:week|wk|weekly)\b/i, 52 / 12],
  ["one-time", /\b(?:one[- ]time|lifetime|once|upfront)\b/i, null],
];
const WINDOW = 40;

export const fmtPrice = (p: Price): string => {
  const sym = SYMBOL[p.currency] ?? `${p.currency} `;
  const s = `${sym}${Number.isInteger(p.amount) ? p.amount.toLocaleString("en-GB") : p.amount}`;
  if (p.period === "unspecified") return s;
  if (p.period === "one-time") return `${s} one-time`;
  return `${s}/${p.period}`;
};

/** Every currency-tagged amount in `text`. "kr" is read as NOK unless the text says SEK. */
export function parsePrices(text: string): Price[] {
  const out: Price[] = [];
  const sek = /\bSEK\b|\bSE\b/.test(text);
  for (const m of text.matchAll(AMOUNT)) {
    const g = m.groups!;
    const cur = g.pre || g.post;
    if (!cur) continue;
    const amount = parseFloat(g.num.replace(/[,  ]/g, ""));
    const window = text.slice(m.index! + m[0].length, m.index! + m[0].length + WINDOW);
    let best: [number, string, number | null] | null = null;
    for (const [name, rx, factor] of PERIODS) {
      const pm = rx.exec(window);
      if (pm && (best === null || pm.index < best[0])) best = [pm.index, name, factor];
    }
    const [period, factor] = best ? [best[1], best[2]] : ["unspecified", 1];
    let currency = CURRENCIES[cur.toLowerCase()];
    if (cur.toLowerCase() === "kr" && sek && !/\bNO\b|\bNOK\b/.test(text)) currency = "SEK";
    out.push({ amount, currency, period, perMonth: factor === null ? null : Math.round(amount * factor * 1e4) / 1e4, raw: m[0].trim() });
  }
  return out;
}

export function firstNumber(text: string): number | null {
  const m = /\d+(?:,\d{3})*(?:\.\d+)?/.exec(text);
  return m ? parseFloat(m[0].replace(/,/g, "")) : null;
}

export function comparePrices(you: Price, them: Price): [string, string] {
  if (you.currency !== them.currency) return ["n/a", `currency mismatch (${you.currency} vs ${them.currency}); not compared`];
  if (you.perMonth === null || them.perMonth === null) return ["n/a", "one-time vs recurring pricing; not comparable"];
  const r = `${fmtPrice(you)} vs ${fmtPrice(them)}`;
  if (you.perMonth < them.perMonth) return ["win", `${r}: we are cheaper`];
  if (you.perMonth > them.perMonth) return ["lose", `${r}: they are cheaper`];
  return ["tie", `${r}: same price`];
}

export function compareNumbers(you: number, them: number, higherIsBetter: boolean, unit = ""): [string, string] {
  const u = unit ? ` ${unit}` : "";
  const r = `${you}${u} vs ${them}${u}`;
  if (you === them) return ["tie", `${r}: equal`];
  const youWin = higherIsBetter ? you > them : you < them;
  return [youWin ? "win" : "lose", r];
}
