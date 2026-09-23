import type { Competitor } from "@cc/shared";
import { norm } from "@cc/shared";

/**
 * Step 3: which competitors does this text talk about? Alias match on normalised text, whole words only.
 * Nofence (isSelf) is matched like any other so our own launch briefs populate our column.
 */
export function matchCompetitors(text: string, competitors: Competitor[]): { id: string; hits: number }[] {
  const hay = ` ${norm(text)} `;
  const out: { id: string; hits: number }[] = [];
  for (const c of competitors) {
    if (c.status === "archived") continue;
    const names = [c.name, ...c.aliases].map(norm).filter((n) => n.length >= 2);
    let hits = 0;
    for (const n of names) {
      const rx = new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu");
      hits += (hay.match(rx) ?? []).length;
    }
    if (hits > 0) out.push({ id: c.id, hits });
  }
  return out.sort((a, b) => b.hits - a.hits);
}
