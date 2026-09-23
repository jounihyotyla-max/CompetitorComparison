/**
 * The registry the pipeline needs before it can do anything: markets, the field schema, and the competitors.
 * Fields merge v1's presets with the agtech-livestock set from the brainstorm doc and the rows the mockup shows.
 * All of this is admin-editable in the tool afterwards; this is only the starting point.
 */
import type { Competitor, FieldDefinition, Market, Settings } from "@cc/shared";

export const MARKETS: Market[] = [
  { id: "GLOBAL", label: "All markets", currencies: [], languages: [], order: 0 },
  { id: "US", label: "United States", currencies: ["USD"], languages: ["en-US"], order: 1 },
  { id: "UK_IE", label: "UK and Ireland", currencies: ["GBP", "EUR"], languages: ["en-GB"], order: 2 },
  { id: "NO_SE", label: "Norway and Sweden", currencies: ["NOK", "SEK"], languages: ["nb", "sv"], order: 3 },
  { id: "ES", label: "Spain", currencies: ["EUR"], languages: ["es"], order: 4 },
];

type F = Omit<FieldDefinition, "enabled" | "order" | "perMarket" | "decayDays" | "group" | "description"> &
  Partial<Pick<FieldDefinition, "perMarket" | "decayDays" | "group" | "description">>;

const group = (g: FieldDefinition["group"], rows: F[]): FieldDefinition[] =>
  rows.map((r) => ({ enabled: true, order: 0, perMarket: false, decayDays: 90, description: "", ...r, group: g }));

export const FIELDS: FieldDefinition[] = [
  ...group("overview", [
    { id: "hq_country", label: "HQ / country of origin", type: "categorical", comparisonRule: "not_compared", decayDays: null,
      description: "Where the company is headquartered. Context only." },
    { id: "founded_year", label: "Founded", type: "number", comparisonRule: "not_compared", unit: "year", decayDays: null,
      description: "Year founded, if stated." },
    { id: "livestock_species", label: "Livestock", type: "list", comparisonRule: "presence_is_better", decayDays: 365,
      description: "Which animals the product is sold for: cattle, sheep, goats, other. Name what the source names; note explicit gaps (\"no goat product\")." },
    { id: "connectivity", label: "Connectivity", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "How the collar talks to the network: cellular, satellite, LoRa / mesh, base station required or not, and the base station's cost if stated." },
    { id: "collar_and_power", label: "Collar and power", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "Placement on the animal (top of neck, below the neck), charging approach (battery, solar), stated battery life." },
    { id: "markets_served", label: "Markets", type: "list", comparisonRule: "presence_is_better", decayDays: 180,
      description: "Countries or regions the product actually ships to or operates in. Use country codes or names as the source gives them, not marketing 'worldwide'." },
    { id: "scale_and_momentum", label: "Scale and momentum", type: "free_text", comparisonRule: "not_compared", decayDays: 90,
      description: "Stated volume or growth signals: animals collared, collars sold, funding raised, sell-outs, record weeks." },
    { id: "positioning", label: "Positioning", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 180,
      description: "The category or promise the company leads with, in its own words (e.g. 'Precision Livestock Management', 'herd automation')." },
    { id: "icp", label: "Target audience", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "Producer type and scale the product is built for: dairy vs beef, small mixed farms vs large ranches, research or conservation grazing." },
  ]),
  ...group("features", [
    { id: "goat_collars", label: "Goat collars", type: "boolean", comparisonRule: "presence_is_better", decayDays: 365,
      description: "Yes if a goat product is sold today; No if the source says goats are not covered." },
    { id: "no_base_station", label: "Works without a base station", type: "boolean", comparisonRule: "presence_is_better", decayDays: 365,
      description: "Yes if collars operate with no on-farm base station or tower; No if one is required." },
    { id: "battery_life_days", label: "Battery life", type: "number", comparisonRule: "higher_is_better", unit: "days", decayDays: 365,
      description: "Stated standalone battery life in days. Convert '10 day standalone' to 10." },
    { id: "escape_alerts", label: "Real-time escape alerts", type: "boolean", comparisonRule: "presence_is_better", decayDays: 365,
      description: "Yes if the app pushes an alert when an animal leaves the fence." },
    { id: "containment_rate", label: "Containment rate", type: "number", comparisonRule: "higher_is_better", unit: "%", decayDays: 365,
      description: "Stated share of animals kept inside the virtual fence, as a percentage." },
    { id: "scheduled_moves", label: "Scheduled moves", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 180,
      description: "Can the farmer schedule fence moves in advance? live = shipping feature; partial = basic version; in development = announced, not shipping." },
    { id: "health_monitoring", label: "Health monitoring", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 180,
      description: "Heat, rumination, calving or illness detection from collar data. live / partial (e.g. activity anomalies only) / in development / none." },
    { id: "pulse_calibration", label: "Per-animal pulse calibration", type: "boolean", comparisonRule: "presence_is_better", decayDays: 365,
      description: "Yes if the correction pulse is calibrated per animal or adapts to the animal's behaviour." },
    { id: "known_weak_spots", label: "Known weak spots", type: "free_text", comparisonRule: "not_compared", decayDays: 180,
      description: "Reported problems: GPS errors, unintended pulses, hardware faults, support issues, cost complaints. Say who reports it if the source does." },
  ]),
  ...group("pricing", [
    { id: "price_first_year", label: "Collar + first year", type: "price", comparisonRule: "lower_is_better", perMarket: true, decayDays: 90,
      description: "List price of one collar including the first year of subscription, in local currency, per market. Lease models: the per-head per-year lease price with 'lease' noted." },
    { id: "subscription_yearly", label: "Subscription, year 2+", type: "price", comparisonRule: "lower_is_better", perMarket: true, decayDays: 90,
      description: "Ongoing yearly subscription per collar after the first year, per market. Ranges as written (\"£25-35\")." },
    { id: "minimum_order", label: "Minimum order", type: "number", comparisonRule: "lower_is_better", unit: "animals", perMarket: true, decayDays: 180,
      description: "Smallest order or herd size the company will sell to, in animals. Note 'per species' or 'per farm' in the value." },
    { id: "warranty_years", label: "Warranty", type: "number", comparisonRule: "higher_is_better", unit: "years", decayDays: 365,
      description: "Hardware warranty length in years. 'Lifetime' under a lease: 99 with a note." },
    { id: "ownership_model", label: "Ownership", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["purchase", "lease", "hybrid"], decayDays: 365,
      description: "Does the farmer own the collar (purchase), rent it (lease), or a mix (hybrid)?" },
    { id: "current_offers", label: "Current offers", type: "free_text", comparisonRule: "not_compared", perMarket: true, decayDays: 30,
      description: "Time-limited discounts, pre-sales, trade-in credits, price-match guarantees, with end dates when stated." },
  ]),
  ...group("context", [
    { id: "key_differentiator", label: "Key differentiator", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "The one claim the company stakes its identity on, not a feature list." },
    { id: "customer_references", label: "Customer references", type: "list", comparisonRule: "presence_is_better", decayDays: 365,
      description: "Named testimonials, case studies, institutions or partners the company cites." },
    { id: "market_share_tier", label: "Market position", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["leader", "challenger", "niche"], decayDays: 365,
      description: "Tier only. Never a percentage unless the source states one." },
    { id: "growth_yoy", label: "Growth YoY", type: "number", comparisonRule: "higher_is_better", unit: "%", decayDays: 365,
      description: "Year-on-year growth if explicitly stated. Do not estimate from funding news." },
  ]),
].map((f, i) => ({ ...f, order: (i + 1) * 10 }));

const ts = "2026-09-23T00:00:00.000Z";

export const COMPETITORS: Competitor[] = [
  {
    id: "nofence", name: "Nofence", aliases: ["Nofence AS", "N3", "SG2.5"], website: "https://www.nofence.no", hqCountry: "Norway",
    isSelf: true, status: "active", markets: ["US", "UK_IE", "NO_SE", "ES"],
    crawlPages: [
      { url: "https://www.nofence.no/en-us/", label: "US home", marketId: "US", kind: "product" },
      { url: "https://www.nofence.no/en-gb/", label: "UK home", marketId: "UK_IE", kind: "product" },
      { url: "https://www.nofence.no/nb-no/", label: "Norway home", marketId: "NO_SE", kind: "product" },
    ],
    feeds: [], createdAt: ts, updatedAt: ts,
  },
  {
    id: "monil", name: "Monil", aliases: ["Monil AS", "Monil Technology"], website: "https://www.monil.no", hqCountry: "Norway",
    isSelf: false, status: "active", markets: ["NO_SE", "UK_IE", "US"],
    crawlPages: [{ url: "https://www.monil.no", label: "Home", marketId: "GLOBAL", kind: "product" }],
    feeds: [], createdAt: ts, updatedAt: ts,
  },
  {
    id: "halter", name: "Halter", aliases: ["Halter Ltd", "Halter USA", "halterhq"], website: "https://halterhq.com", hqCountry: "New Zealand",
    isSelf: false, status: "active", markets: ["US"],
    crawlPages: [
      { url: "https://halterhq.com", label: "Home", marketId: "GLOBAL", kind: "product" },
      { url: "https://halterhq.com/us", label: "US", marketId: "US", kind: "pricing" },
    ],
    feeds: [], createdAt: ts, updatedAt: ts,
  },
];

export const SETTINGS: Settings = {
  id: "global",
  selfCompetitorId: "nofence",
  digestSlackChannel: "",
  digestWeekday: 1,
  crawlEveryDays: 7,
  slackChannels: [],
  updatedAt: ts,
};
