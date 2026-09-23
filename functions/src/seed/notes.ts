/**
 * Phase-1 sample sources: Jouni's competitor notes from the brainstorm doc (22 Sep 2026), loaded as
 * manual tier-4 documents so the real pipeline produces the first tables. They are replaced by
 * connector data from phase 3 onwards; keeping them here means anyone can rebuild the demo state.
 */
import type { SourceDocument } from "@cc/shared";

const captured = "2026-09-22T12:00:00.000Z";

const note = (id: string, competitorId: string, title: string, text: string): SourceDocument => ({
  id, connector: "manual", externalId: "", externalUrl: "", title, author: "jouni.hyotyla@nofence.com",
  capturedAt: captured, competitorIds: [competitorId], marketId: "GLOBAL", tier: 4, relevance: 1, status: "new",
  snapshotPath: "", text, contentHash: "", charCount: text.length, claimCount: 0, eventCount: 0,
});

export const SEED_NOTES: SourceDocument[] = [
  note("seed_nofence_2026_09_22", "nofence", "Nofence — product and pricing notes (Jouni, Sep 2026)",
`Nofence. Cattle, sheep and goat. No base station, cellular + HerdNet, satellite now in the mix. Below-the-neck, 50 day battery, real-time push escape alerts, ~99.7% containment. Scheduled moves in development, health monitoring rolling out 2026. Min order 5 per species. N3 list bundle (collar + first year sub): NO 2,700 kr, SE 2,750 kr, UK £215, IE €245, ES €299, US $239, year 2+ sub £25-35 / €32-45 / $45-60. Lately: N3 launched September in all six markets at lower prices with a 10 year warranty, 30% pre-sale in Northern Europe and ~20% in ES/US closing 31 Oct (US 31 Dec), SG2.5 aligned down to N3 level, legacy upgrade programmes launching in NO and UK, positioning shift from virtual fencing to Precision Livestock Management, best ever sales week in Norway at 2,700 collars.`),

  note("seed_monil_2026_09_22", "monil", "Monil — competitor notes (Jouni, Sep 2026)",
`Monil. Cattle and sheep, no goat product. Cellular, no base station, top-of-neck. Activity anomaly detection, basic scheduled moves, mobile push notifications. Reported weak spots: GPS errors and unintended pulses under cover, bracket issues, support struggling with reception cases. UK ~£230 including first year, sub £28-40/yr. US ~$310 including first year, sub ~$45/yr. Norway 3,499 NOK including first year. Lately: extended SG warranty to 10 years so our warranty edge in Norway is gone, US entry from Kansas City, sold out of sheep collars for 2026, giving free collars to research institutes (Noble, U of Missouri), guarantees to match any Nofence offer in Norway.`),

  note("seed_halter_2026_09_22", "halter", "Halter — competitor notes (Jouni, Sep 2026)",
`Halter. Cattle only, dairy and beef. Top-of-neck, solar, ~10 day standalone battery, base station required at $4,500. Scheduled moves is the hero feature (3 days ahead), health monitoring covers heat, rumination ~75% acc. and calving, per-animal calibrated pulse 0.1-0.45 J, adaptive AI for fence jumpers, RFID and LED control. US $0 upfront lease at $90/head/yr with a 100 head minimum since 1 March 2026, AU/NZ ~$8.50/month, lifetime warranty but no ownership, trade-in credits offered for Nofence collars in the US. Lately: 1.6M+ cattle collared worldwide, expanded Foundation for America's Public Lands partnership (~$3M committed, 15 BLM projects, 4,500 cattle, 1,300 miles of virtual fence), satellite coverage messaging on beef pages, $220M Series E reported March 2026 but still unverified in Confluence, expected to enter UK and Ireland within months.`),
];
