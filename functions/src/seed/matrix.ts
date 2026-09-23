/**
 * The product team's competitor feature matrix (Google Sheet 16wUOqzcxcm0sg2SEEv-2iKopW8lmAVHa6xOm2qA1Yww),
 * one note per competitor. Each statement in the sheet cites a public source, so the notes go in as tier 2
 * (third-party public analysis); the cited pages themselves are watched by the crawler (registry MATRIX_PAGES)
 * and will corroborate or replace these as tier 1 where they are the competitor's own site.
 *
 * capturedAt is the sheet's last-modified date, not the seed date, so freshness starts from when it was written.
 */
import type { SourceDocument } from "@cc/shared";

/** Drive metadata for the sheet: created 2026-06-29, last modified 2026-07-09. Freshness counts from the latter. */
export const MATRIX_MODIFIED_AT = "2026-07-09T07:18:20.285Z";

const note = (id: string, competitorId: string, title: string, text: string, capturedAt: string): SourceDocument => ({
  id, connector: "manual", externalId: "gsheet:16wUOqzcxcm0sg2SEEv-2iKopW8lmAVHa6xOm2qA1Yww", externalUrl: "https://docs.google.com/spreadsheets/d/16wUOqzcxcm0sg2SEEv-2iKopW8lmAVHa6xOm2qA1Yww/edit",
  title, author: "product team", capturedAt, competitorIds: [competitorId], marketId: "GLOBAL", tier: 2, relevance: 1, status: "new",
  snapshotPath: "", text, contentHash: "", charCount: text.length, claimCount: 0, eventCount: 0, checkCount: 0,
});

export const matrixNotes = (capturedAt: string): SourceDocument[] => [
  note("matrix_nofence", "nofence", "Product team feature matrix — Nofence (Jul 2026)",
`Nofence N3 (Dec 2026). Markets: NO, SE, UK, IE, ES, US.
Proven containment: yes. Peer-reviewed studies report 99.3 to 99.8% containment within inclusion zones for cattle and sheep (ScienceDirect S2772375524003174; PMC9951726).
Anomaly detection: yes. Reduced-activity alerts and no-movement detection learn each animal's baseline. Live in-app feature.
Heat detection: coming soon. Announced "Coming soon: Heat detection for your 2.5 collars", later this season. 2.5 hardware only.
Calving detection: coming at N3 launch.
Scheduled moves: Q1 2027, coming at N3 launch.
Automated moves: no.
Grazing reporting: coming at N3 launch.
Satellite offering: coming at N3 launch.
Solution for calves: coming at N3 launch.`, capturedAt),

  note("matrix_halter", "halter", "Product team feature matrix — Halter (Jul 2026)",
`Halter satellite. Markets: NZ, AU, US, CA.
Proven containment: yes. Peer-reviewed Journal of Dairy Science (2024): 90% of cows spent at most 1.7 min/day beyond the virtual fence and received at most 0.71 pulses/day.
Anomaly detection: yes. Publishes alerts for about 80% of cows with sustained behavioural changes. Specific lameness and mastitis early-warning models.
Heat detection: yes. Dedicated heat-detection product, in-app on-heat marker, flashing white LED. Case study cites 81% 6-week in-calf rate.
Calving detection: partial. No predictive calving alert. Ships a "Calving with Halter" workflow plus a post-calving "Recovering poorly" alert. Calving-adjacent, not calving-predictive.
Scheduled moves: yes. Farmers queue breaks days ahead and cattle shift automatically, including across paddocks.
Automated moves: yes.
Grazing reporting: yes. Smart wedge (pasture cover vs demand), per-cow kgDM allocation, Photo APC residuals. Documented harvest lift from 12.7 to 14.3 tDM/ha.
Satellite offering: yes. Direct-to-satellite collars launched 28 April 2026 with Starlink. Available US and NZ, AU and CA coming soon.
Solution for calves: no. Collar fits cows and heifers, sized for adult and near-adult. No calf-specific SKU found in public material; confirm with a Halter rep.`, capturedAt),

  note("matrix_monil", "monil", "Product team feature matrix — Monil (Jul 2026)",
`Monil. Markets: NO, SE, UK, US (5 states).
Proven containment: no published number. Monil cites "91 million grazing hours" and has academic partnerships (AFBI Hillsborough PhD trial), but no Monil-specific peer-reviewed containment rate is published.
Anomaly detection: yes. Product page: alerts on escape or abnormal behaviour, enabling detection of potential injuries or illnesses.
Heat detection: yes. Launched start of May 2026 based on rumination data, per CEO Torstein Nesse. Live for customers.
Calving detection: autumn 2026. Announced as next feature after heat.
Scheduled moves: no. "Rotational Grazing Assistant" with "easy shortcuts for moving fences directly in the app" announced for late summer 2025. Shortcuts, not full unattended scheduling.
Automated moves: no.
Grazing reporting: no. Shows real-time positions and activity, markets "optimized pasture utilization". No explicit biomass or paddock-utilization analytics found.
Satellite offering: rumoured soon. Currently cellular only: 4G LTE-M and NB-IoT (Nordic nRF9160 SiP) with multi-GNSS positioning.
Solution for calves: no. Single SKU, neck band 67 to 128 cm, about 1 kg. No calf variant.`, capturedAt),

  note("matrix_vence", "vence", "Product team feature matrix — Vence (Merck) (Jul 2026)",
`Vence (Merck Animal Health). Markets: US only.
Proven containment: partial. Field trials show 97 to 99% containment after short training. 2022 SDSU trial: high containment but 44% collar retention, so durability is a known field issue.
Anomaly detection: partial. Real-time alerts for boundary crossings, prolonged stationarity (sick or dropped collar), chronic-stress parameters. Less advanced.
Heat detection: partial, with SenseHub. Vence does not offer estrus detection; Merck handles heat detection through a separate product (SenseHub Cow Calf).
Calving detection: no. Public coverage explicitly states the system is "not designed as a calving-alert system".
Scheduled moves: yes. HerdManager supports programming multiple virtual paddocks on a schedule, queued from phone or computer.
Automated moves: no.
Grazing reporting: partial. HerdManager visualises forage use by time-in-paddock and location heat-maps. No biomass / kgDM-per-acre reporting found.
Satellite offering: no. Base stations need cellular service, about 15 ft tall, about 6 mile radius (terrain dependent).
Solution for calves: no. No calf-specific collar. Mother-follow design: uncollared calves stay with collared cows. Deployed from about 12 months.`, capturedAt),

  note("matrix_gallagher", "gallagher", "Product team feature matrix — Gallagher eShepherd (Jul 2026)",
`Gallagher eShepherd. Markets: IE, ES, AU, NZ, US, CA and 9 more.
Proven containment: yes. Peer-reviewed CSIRO work (Campbell et al.): 99.8% containment time. Gallagher publicly quotes 99%. Great Barrier Reef Foundation trial corroborates.
Anomaly detection: partial. Single "Animal still/down" alert when inactive more than 10% of a rolling 24h window (about 2.4h). No stress, gait or rumination anomaly model. Narrower than peers.
Heat detection: no. No commercial heat-detection feature. A 2024 NSW submission describes "capacity" to detect heat as platform potential, not a shipping feature.
Calving detection: no. Named as future possibility in the NSW submission, not in the app today.
Scheduled moves: yes. "Scheduled Move" is a named feature. Queue paddock moves and the mob shifts automatically. Mobile-app authoring launched October 2025.
Automated moves: no.
Grazing reporting: partial. Live grazing-pressure heat maps plus Vision Weigh integration. Customer stories cite 50% to 90% utilisation jumps but those are user reports, not in-app metrics.
Satellite offering: no. Cellular or on-farm LoRa base stations. Gallagher told NZ Herald no immediate plans for Starlink, citing cost. Explicit point of difference vs Halter.
Solution for calves: no. Neckband eS1 specified for cattle over 200 kg. No smaller or calf-specific variant.`, capturedAt),

  note("matrix_innogando", "innogando", "Product team feature matrix — Innogando RUMI (Jul 2026)",
`Innogando (RUMI). Markets: Spain, Portugal.
Proven containment: unproven, summer 2026. Current RUMI is monitoring and geofence-alert only (no cue to the animal). True virtual fencing ships with RUMI PRO, announced for summer 2026. No published containment rate yet.
Anomaly detection: yes. Tracks 5 activity categories with alerts for behavioural change, falling rumination, stress peaks, escapes, anomalous movements. Vendor claim: detect disease 48h before clinical symptoms.
Heat detection: yes. Flagship feature with vendor-published numbers: 90.9% sensitivity, 100% specificity, 93.6% accuracy, AI window 11 to 15h after onset.
Calving detection: yes. "Rumi Partos" calving alarm surfaces in the app with the cow's GPS location. Caveat: trade press notes it requires an auxiliary device (likely intravaginal or tail sensor) integrated with the collar app.
Scheduled moves: likely no. RUMI PRO mentions rotational grazing but does not document an automatic scheduled-move feature. Likely manual redraw only, cannot confirm.
Automated moves: no.
Grazing reporting: partial. Auto-generated grazing logs reporting time grazing/ruminating/resting/walking per animal, used in Spanish PAC eco-schemes. No biomass or pasture-yield metrics.
Satellite offering: no, apparently possible. LoRaWAN architecture with on-farm antennas (mains or solar). Innogando is explicit: GPS collars "do not connect directly to satellite".
Solution for calves: partial. Markets to young replacement stock (recría, terneras, novillas) using the same adult collar, about 40 EUR per animal after PAC subsidy. No calf-sized hardware SKU.`, capturedAt),
];
