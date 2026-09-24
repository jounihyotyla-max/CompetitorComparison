/**
 * The product team's Figma board "Competitors features" (exported to PDF, Sep 2026): a hardware spec comparison
 * for cattle collars (13 companies) and sheep/goat collars (4). Internal research with no per-cell sources, so
 * it goes in at tier 3 (firsthand internal research); official spec pages the crawler finds are tier 1 and will
 * replace these where they disagree.
 *
 * BOARD_DATE: when the board was written. Set from Jouni's answer; freshness counts from it.
 */
import type { SourceDocument } from "@cc/shared";

/**
 * The board is maintained continuously by Svitlana (product team) and was exported on 23 Sep 2026; freshness counts
 * from the export. Re-export and bump this date when the board has changed materially, then "Re-run all sources".
 */
export const BOARD_DATE = "2026-09-23T14:33:00.000Z";

const note = (id: string, competitorId: string, title: string, text: string, capturedAt: string): SourceDocument => ({
  id, connector: "manual", externalId: "figma:WyONoOIWWvr805Qauujl2g", externalUrl: "https://www.figma.com/board/WyONoOIWWvr805Qauujl2g/Competitors-features",
  title, author: "Svitlana, product team", capturedAt, competitorIds: [competitorId], marketId: "GLOBAL", tier: 3, relevance: 1, status: "new",
  snapshotPath: "", text, contentHash: "", charCount: text.length, claimCount: 0, eventCount: 0, checkCount: 0,
});

export const boardNotes = (capturedAt: string): SourceDocument[] => [
  note("board_nofence", "nofence", "Product team hardware board — Nofence Switchgrass, C2.5 and SG2.5",
`Nofence Switchgrass (cattle). Position: under the neck. Cellular: Cat-M, NB-IoT, Verizon, Telit. Satellite: yes. Bluetooth: 300 m. GPS precision: about ±3 metres. Water and dust proof: IP67. Weight: 1.1 kg. Temperatures: operating -20 to 60 °C, charging 0 to 45 °C. Sound: 65 dBA at 1 m. Containment rate 99.7%, pulse energy 0.7 J. Pulse method: chains. Vibration cue: no. Battery life: entire season. Charger as separate device: yes. Solar panels: 2. Update frequency: up to 15 min. Battery: 3 months without sun, 4.2 V 20.1 Ah. LED: yes. Minimum animal age: not decided. Anti-strangulation release: 350 kg. Fitting: two points, chain to strap. ID: hold to detect ID. Additional data: activity monitor, heat detection, circuit breaker. Power on: insert battery. Mesh between devices: HerdNet. Warranty: 10 years.
Nofence C2.5 (cattle). Position: under the neck. Cellular: 2G-4G Cat-M NB-IoT, KORE. Satellite: no. Bluetooth: 100 m. GPS precision: about ±3 metres. IP67. Weight: 1.5 kg. Temperatures: operating -20 to 60 °C, charging 0 to 45 °C, storage 15 to 35 °C. Sound: 82 dB. Containment rate 99.7%, pulse energy 0.7 J. Pulse method: chains. Vibration cue: no. Battery life: entire season. Removable battery. Solar panels: 1. Update frequency: up to 15 min. Battery: 3 months, 4.2 V 20.1 Ah. LED: no. Minimum animal age: 6 months and up. Anti-strangulation release: 300 kg. Fitting: two points, chain to strap. ID: hold to detect ID. Additional data: activity monitor. Power on: insert battery. Mesh: HerdNet. Warranty: 5 years.
Nofence SG2.5 (sheep and goats). Position: under the neck. Cellular: 2G-4G Cat-M NB-IoT, KORE. Satellite: no. Bluetooth: 50 m. GPS precision: about ±3 metres. IP67. Weight: 1.5 kg. Temperatures: operating -20 to 60 °C, charging 0 to 45 °C, storage 15 to 35 °C. Sound: 82 dB. Pulse energy 0.34 J. Pulse method: chains. Containment rate 99.3%. Battery life: entire season. Removable battery. Solar panels: yes. Update frequency: up to 15 min. Battery 4.2 V 20.1 Ah. LED: no. Minimum animal age: 6 months and up. Anti-strangulation release: 300 kg. Fitting: two points, chain to strap. ID: collar ID marking, naming collars as animals in the app. Additional data: activity monitor. Power on: insert battery. Mesh: HerdNet. Warranty: 5 years. Animals: sheep and goat.`, capturedAt),

  note("board_gallagher", "gallagher", "Product team hardware board — Gallagher eShepherd",
`Gallagher eShepherd (cattle). Position: under the neck. Cellular: 3G-4G and LoRa. Satellite: unknown. Bluetooth: unknown. GPS precision: ±1 metre. Water and dust proof: IPX7. Weight: 2.7 kg. Temperatures: operating -10 to +70 °C. Pulse energy: 0.22 J. Pulse method: chains. Vibration cue: no. Containment rate: 99% (only in studies). Battery life: battery for life (solar). Charger as separate device: no. Solar panels: 2. Update frequency: 30 min. Battery: 3.2 V 12 Ah. LED: yes. Minimum animal age: adult. Anti-strangulation release: 150 kg. Fitting: two points, chain to fastening mechanism. ID: RFID tag. Additional data: detailed grazing behaviour analysis. Power on: hold the supplied magnet near the LED indicator. Mesh between devices: no. Warranty: 3 years.`, capturedAt),

  note("board_vence", "vence", "Product team hardware board — Merck AH USA + Vence",
`Vence (Merck Animal Health, cattle). Position: under the neck. Cellular: LoRaWAN (base station). Satellite: unknown. Bluetooth: unknown. GPS: many complaints about precision. Water and dust proof: unknown. Weight: 1.13 kg. Pulse energy: 0.18 J. Pulse method: chains. Vibration cue: no. Containment rate: 90 to 96%. Battery life: one-time use battery, 3 to 6 months. Removable battery. Solar panels: none. LED: no. Minimum animal age: adult, but may change. Anti-strangulation release: 360 kg. Fitting: two points, fastening clip. ID: collar ID marking. Additional data: real-time tracking, movement and grazing patterns. Power on: insert battery. Mesh between devices: no. Warranty: lifetime (unconfirmed).`, capturedAt),

  note("board_halter", "halter", "Product team hardware board — Halter",
`Halter (cattle). Position: on the sides. Cellular: LTE Cat 1 bis. Satellite: yes. Bluetooth: yes (range not stated). GPS: heavy reliance on IMU. Water and dust proof: unknown. Weight: 1.42 kg. Pulse energy: 0.1 to 0.45 J. Pulse method: metal plates that attach the collar to the strap. Vibration cue: yes. Containment rate: 90 to 99%. Battery life: battery for life (solar). Charger as separate device: no. Solar panels: 2. Update frequency: unknown. Battery: about 16 weeks without sun (uncertain). LED: 2 LEDs. Minimum animal age: 12 months. Anti-strangulation release: 370 kg. Fitting: two points, fastening clip. ID: RFID tag or NFC, scanning with the app. Additional data: heat detection, behavioural monitoring, pasture insights. Power on: additional key device (magnet). Mesh between devices: no. Warranty: lifetime (lease).`, capturedAt),

  note("board_monil", "monil", "Product team hardware board — Monil",
`Monil (cattle). Position: on top of the neck with counter-weight. Cellular: Cat-M, NB-IoT. Satellite: yes (per board). Bluetooth: yes (range not stated). GPS: GNSS with reliance on IMU; Monil advises keeping at least 30 m / 100 ft distance from walls and forests. Water and dust proof: IP67. Weight: 1 kg. Temperatures: operating -5 to 45 °C, charging 0 to 30 °C, storage -20 to 60 °C. Sound: 82 dB. Pulse: 3000 V, 0.25 J. Pulse method: strap with electrode. Vibration cue: no. Battery life: battery for life (solar). Charger as separate device: yes. Solar panels: 1. Update frequency: 20 min. LED: yes. Minimum animal age: 6 months and up. Fitting: one point, under the neck. ID: collar ID marking. Additional data: heat detection. Power on: button. Mesh between devices: coming (uncertain). Warranty: 10 years.
Monil (sheep). Position: on top of the neck with counter-weight. Cellular: 4G, NB-IoT; SIM card Telekom (DE), Telenor and Telia. GPS: heavy reliance on IMU, precision about ±5 metres. IP67. Weight: 1 kg. Temperatures: operating -5 to 45 °C, charging 0 to 30 °C, storage -20 to 60 °C. Sound: 82 dB. Pulse: 3000 V, 0.1 J. Pulse method: strap with electrode. Battery life: battery for life. Solar panels: yes. LED: yes. Minimum animal age: 6 months and up. Fitting: one point, under the neck. ID: collar ID marking. Additional data: heat detection. Power on: button. Mesh between devices: no. Warranty: 5 years. Animals: sheep only.`, capturedAt),

  note("board_innogando", "innogando", "Product team hardware board — Innogando",
`Innogando (cattle, launch 2026). Position: on the sides of the neck with counter-weight. Cellular: Cat-M plus NB-IoT capability, LoRaWAN. Satellite: unknown. GPS: good feedback on precision. Weight: 1.5 kg. Pulse method: electrode (uncertain). Vibration cue: no. Battery life: battery for life (solar). Solar panels: 1. Update frequency: real time (uncertain). Minimum animal age: 6 months and up. Fitting: one point, on the belt. Additional data: heat detection. Mesh between devices: no. Warranty: 5 years.`, capturedAt),

  note("board_fencee", "fencee", "Product team hardware board — fencee",
`fencee (Czechia, cattle, limited availability). Position: on top of the neck with counter-weight. Connectivity: base station. Bluetooth: yes. Water and dust proof: IPX6. Weight: 595 g and up. Temperatures: -20 to +70 °C. Pulse method: electrode. Vibration cue: no. Battery life: season. Solar panels: 1. Update frequency: up to 10 min. Battery: 3.7 V 44 Ah. LED: yes. Fitting: one point, on the belt, with counterweight. Mesh between devices: no. Warranty: 3 years (uncertain).`, capturedAt),

  note("board_pappstor", "pappstor", "Product team hardware board — Pappstor",
`Pappstor (Spain, cattle, limited availability). Position: under the neck. Connectivity: LoRaWAN. GPS precision: about ±3 metres. Pulse method: chains. Vibration cue: no. Battery life: 6 months. Solar panels: 1. Fitting: two points, chain to strap. Mesh between devices: no.`, capturedAt),

  note("board_skygraze", "skygraze", "Product team hardware board — Skygraze",
`Skygraze (Sweden, cattle launch 2026, sheep launch 2027). Position: on top of the neck with counter-weight. Connectivity: cellular. GPS: dual band. Weight: 1 kg. Pulse energy: about 0.5 J (roughly one tenth of a regular electric fence). Vibration cue: no. Removable battery. Solar panels: 1. Minimum animal age: 6 months and up. Mesh between devices: no. Sheep collar: IP67, removable battery, solar panel, dual band GPS, minimum age 6 months, animals: sheep.`, capturedAt),

  note("board_drover", "drover", "Product team hardware board — Drover",
`Drover (United States, launch 2027, getdrover.com). Form factor: ear tag. Connectivity: "no base stations". Weight: up to 50 g. Pulse: less than 3000 V. Pulse method: electrical muscle stimulation. Vibration cue: no. Solar panels: 1. Mesh between devices: no.`, capturedAt),

  note("board_collie", "collie", "Product team hardware board — collie",
`collie (Netherlands, launch TBD, collie.eu). Connectivity: 4G and LoRa. Solar panels: 2. Vibration cue: no. Other specifications not published.`, capturedAt),

  note("board_verdecer", "verdecer", "Product team hardware board — Verdecer",
`Verdecer (Spain, launch TBD, verdecer.io). Position: on top of the neck with counter-weight. Connectivity: LTE coverage with satellite. Satellite: yes. GPS: high precision, error of less than 2 metres. Water and dust proof: IP67. Solar panels: 2. Vibration cue: no.`, capturedAt),

  note("board_herdstreet", "herdstreet", "Product team hardware board — HerdStreet",
`HerdStreet (sheep and goats, limited availability). Position: under the neck. Cellular: LTE-M. Bluetooth: yes. Water and dust proof: IP68. Weight: about 1.5 lbs (680 g). Temperatures: operating -20 to 60 °C. Sound: 100 dB. Pulse method: chains. LED: yes. Minimum animal age: 6 months and up. Mesh between devices: collar-to-collar up to a quarter mile. Warranty: 1 year. Animals: sheep and goat, lamb collar coming soon.`, capturedAt),
];
