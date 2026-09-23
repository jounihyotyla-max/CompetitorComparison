/**
 * Step 2 of the pipeline (docs/v2-architecture.md §7): pseudonymise personal data BEFORE anything is stored
 * or sent to the model. Placeholders are stable within one document so "Customer A" stays the same person.
 *
 * Phase 1 covers the patterns regexes can catch reliably: emails, phone numbers, and explicit
 * "Farmer: Name" style labels from CRM notes (every later mention of a labelled name is masked too).
 * Person-name detection for free-running transcripts arrives with the Aircall connector (phase 4) and
 * reuses this module's placeholder allocation.
 *
 * Employees on the Nofence side are not masked (they are authors, not customers); pass their emails in `keep`.
 */
export interface MaskResult {
  text: string;
  replacements: number;
  /** placeholder -> kind, for debugging counts only; originals are never stored */
  placeholders: Record<string, "email" | "phone" | "person">;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// International and Nordic/US local formats, 7+ digits with separators. Excludes prices and years by requiring the phone shape.
const PHONE = /(?<![\w€$£])(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?(?!\w)/g;
// "Farmer: John Smith", "Customer name: Anna Berg", "Contact - Ola Nordmann"
const LABELLED_NAME = /\b(?:farmer|customer|contact|caller|owner|rancher|client|producer)(?:\s+name)?\s*[:\-]\s*([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){1,2})/giu;

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

export function mask(text: string, opts: { keep?: string[] } = {}): MaskResult {
  const keep = new Set((opts.keep ?? []).map((s) => s.toLowerCase()));
  const placeholders: MaskResult["placeholders"] = {};
  const seen = new Map<string, string>();
  let people = 0, emails = 0, phones = 0;

  const alloc = (original: string, kind: "email" | "phone" | "person") => {
    const key = `${kind}:${original.toLowerCase().replace(/\s+/g, " ").trim()}`;
    let p = seen.get(key);
    if (!p) {
      p = kind === "person" ? `Customer ${letter(people++)}` : kind === "email" ? `[email ${++emails}]` : `[phone ${++phones}]`;
      seen.set(key, p);
      placeholders[p] = kind;
    }
    return p;
  };

  // People: collect labelled names first, then mask every mention of each.
  const names = new Set<string>();
  for (const m of text.matchAll(LABELLED_NAME)) names.add(m[1]);
  let out = text;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const p = alloc(name, "person");
    out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRx(name)}(?![\\p{L}])`, "gu"), p);
  }

  out = out.replace(EMAIL, (m) => (keep.has(m.toLowerCase()) || /@nofence\.com$/i.test(m) ? m : alloc(m, "email")));
  out = out.replace(PHONE, (m) => {
    const digits = m.replace(/\D/g, "");
    // 7-15 digits, not a year, and with at least one separator so ids and amounts stay untouched
    if (digits.length < 7 || digits.length > 15 || /^(19|20)\d{2}$/.test(digits)) return m;
    if (!/[\s.()+-]/.test(m.trim())) return m;
    return alloc(m, "phone");
  });

  return { text: out, replacements: seen.size, placeholders };
}
