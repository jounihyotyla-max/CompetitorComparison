/** Deterministic text helpers. Ported from v1 backend/text.py; no model, no IO. */

const CURLY: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"' };
export const straighten = (s: string) => s.replace(/[‘’“”]/g, (c) => CURLY[c]);

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Exact substring first; then whitespace / case / curly-quote insensitive.
 * Returns [start, end) in source coordinates, or null when the quote is not in the source.
 * The straightened source has the same length as the original, so offsets carry over.
 */
export function findQuote(source: string, quote: string): [number, number] | null {
  const i = source.indexOf(quote);
  if (i >= 0) return [i, i + quote.length];
  const tokens = straighten(quote).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const rx = new RegExp(tokens.map(escapeRx).join("\\s+"), "i");
  const m = rx.exec(straighten(source));
  return m ? [m.index, m.index + m[0].length] : null;
}

export const trim = (s: string, n = 90) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");

/** Sentence spans whose offsets index the original string. */
export function sentences(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const rx = /[^.!?\n]+[.!?]*['")\]]*/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body) out.push({ start: m.index + lead, end: m.index + lead + body.length, text: body });
  }
  return out;
}

export const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
