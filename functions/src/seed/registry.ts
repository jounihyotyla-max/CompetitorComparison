/**
 * The registry the pipeline needs before it can do anything: markets, the field schema, and the competitors.
 * Fields merge v1's presets with the agtech-livestock set from the brainstorm doc and the rows the mockup shows.
 * All of this is admin-editable in the tool afterwards; this is only the starting point.
 */
import type { Competitor, CrawlPage, FieldDefinition, Market, MarketId, Settings } from "@cc/shared";

export const MARKETS: Market[] = [
  { id: "GLOBAL", label: "All markets", group: "All", currencies: [], languages: [], order: 0 },
  { id: "US", label: "United States", group: "US", currencies: ["USD"], languages: ["en-US"], order: 1 },
  { id: "UK", label: "United Kingdom", group: "UK/IE", currencies: ["GBP"], languages: ["en-GB"], order: 2 },
  { id: "IE", label: "Ireland", group: "UK/IE", currencies: ["EUR"], languages: ["en-IE"], order: 3 },
  { id: "NO", label: "Norway", group: "NO", currencies: ["NOK"], languages: ["nb"], order: 4 },
  { id: "SE", label: "Sweden", group: "SE", currencies: ["SEK"], languages: ["sv"], order: 5 },
  { id: "ES", label: "Spain", group: "ES", currencies: ["EUR"], languages: ["es"], order: 6 },
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
    // Product team feature matrix (Sep 2026). Same four-level scale as scheduled_moves.
    { id: "proven_containment", label: "Proven containment", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 365,
      description: "live = a published, ideally peer-reviewed, containment rate exists; partial = field trials or vendor claims only, or durability caveats; in development = product not yet shipping; none = no evidence. Quote the rate when stated." },
    { id: "anomaly_detection", label: "Anomaly detection", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 180,
      description: "Alerts on abnormal behaviour (illness, injury, stillness, stress) from collar data. live = behavioural models with several alert types; partial = a single stillness or escape alert; in development; none." },
    { id: "heat_detection", label: "Heat detection", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 180,
      description: "Oestrus / heat detection from the collar. live = shipping to customers; partial = via a separate product; in development = announced with a date; none." },
    { id: "calving_detection", label: "Calving detection", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 180,
      description: "Predictive calving alerts. live = predictive alarm in the app; partial = calving workflow or post-calving alerts only, or needs an auxiliary device; in development = announced; none." },
    { id: "automated_moves", label: "Automated moves", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 180,
      description: "The system shifts the herd between paddocks by itself on a plan (beyond a farmer scheduling one move). live / partial / in development / none." },
    { id: "grazing_reporting", label: "Grazing reporting", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 180,
      description: "Pasture and grazing analytics: biomass or kgDM allocation, utilisation, residuals. live = quantitative pasture metrics in-app; partial = heat maps or time-in-paddock only; in development; none." },
    { id: "satellite_offering", label: "Satellite offering", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 180,
      description: "Collars that work via satellite without cellular coverage or a base station. live = shipping; partial = limited markets; in development = announced or rumoured with a source; none = cellular or LoRa only." },
    { id: "calf_solution", label: "Solution for calves", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 365,
      description: "A collar or approach for calves / young stock. live = calf-specific SKU; partial = adult collar marketed for young stock, or mother-follow design; in development; none = adult sizes only." },
    { id: "exclusion_zones", label: "Exclusion zones", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["live", "partial", "in development", "none"], decayDays: 365,
      description: "Can the farmer draw areas the animals must stay out of (water, roads, crops) inside a grazing area? live / partial / in development / none." },
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
  ...group("hardware", [
    { id: "collar_position", label: "Position on the animal", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["under the neck", "on top of the neck", "on the sides", "ear tag"], decayDays: 365,
      description: "Where the collar body sits: under the neck, on top of the neck (with counter-weight), on the sides, or an ear tag." },
    { id: "bluetooth", label: "Bluetooth", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "Bluetooth in the hardware and its range if stated (e.g. 300 m)." },
    { id: "gps_precision", label: "GPS precision", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "Stated positioning precision in metres, GNSS bands, reliance on IMU, and known complaints." },
    { id: "ip_rating", label: "Water and dust proof", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["IP68", "IP67", "IPX7", "IPX6", "other"], decayDays: 365,
      description: "IP rating of the collar." },
    { id: "weight_kg", label: "Weight", type: "number", comparisonRule: "lower_is_better", unit: "kg", decayDays: 365,
      description: "Collar weight including chains and straps, in kilograms (convert grams: 595 g = 0.595)." },
    { id: "operating_temp", label: "Temperatures", type: "free_text", comparisonRule: "not_compared", decayDays: 365,
      description: "Operating, charging and storage temperature ranges as stated." },
    { id: "sound_db", label: "Sound level", type: "number", comparisonRule: "not_compared", unit: "dB", decayDays: 365,
      description: "Loudness of the audio cue in dB, if stated." },
    { id: "pulse_energy_j", label: "Pulse energy", type: "number", comparisonRule: "lower_is_better", unit: "J", decayDays: 365,
      description: "Energy of the correction pulse in joules. Give the lowest stated value when a range is given, and put the range in the note." },
    { id: "pulse_method", label: "Pulse method", type: "categorical", comparisonRule: "qualitative_llm", allowedValues: ["chains", "electrode on strap", "metal plates", "electrical muscle stimulation", "other"], decayDays: 365,
      description: "How the pulse reaches the animal: chains, an electrode on the strap, metal plates, muscle stimulation, other." },
    { id: "vibration_cue", label: "Vibration cue", type: "boolean", comparisonRule: "presence_is_better", decayDays: 365,
      description: "Yes if the collar uses vibration as a secondary cue before or instead of the pulse." },
    { id: "battery_life", label: "Battery life", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "How long the collar runs: 'entire season', 'battery for life' (solar), 'one-time battery 3 to 6 months', months without sun, capacity (V, Ah) if stated." },
    { id: "solar_panels", label: "Solar panels", type: "number", comparisonRule: "not_compared", unit: "panels", decayDays: 365,
      description: "Number of solar panels on the collar; 0 if none." },
    { id: "removable_battery", label: "Removable battery / separate charger", type: "boolean", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "Yes if the battery is removable or charged in a separate charger." },
    { id: "update_interval", label: "Position update interval", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "How often the collar reports to the server, e.g. 'up to 15 min', 'real time'." },
    { id: "status_led", label: "Status LED", type: "boolean", comparisonRule: "presence_is_better", decayDays: 365,
      description: "Yes if the collar has an LED that reports status." },
    { id: "min_animal_age", label: "Minimum animal age", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "Youngest animal the collar is approved for, e.g. '6 months', 'adult only', '12 months'." },
    { id: "release_load_kg", label: "Anti-strangulation release", type: "number", comparisonRule: "not_compared", unit: "kg", decayDays: 365,
      description: "Load at which the collar's safety release opens, in kg." },
    { id: "fitting", label: "Fitting", type: "free_text", comparisonRule: "not_compared", decayDays: 365,
      description: "How the collar is fitted and adjusted: two points chain to strap, one point on the belt, fastening clip, counter-weight." },
    { id: "animal_id", label: "Animal identification", type: "free_text", comparisonRule: "qualitative_llm", decayDays: 365,
      description: "How animals and collars are identified: hold to detect, RFID / NFC, collar ID marking, naming in the app." },
    { id: "power_on", label: "Power on", type: "free_text", comparisonRule: "not_compared", decayDays: 365,
      description: "How the collar is switched on: insert battery, button, magnet, key device." },
    { id: "mesh_network", label: "Collar-to-collar mesh", type: "boolean", comparisonRule: "presence_is_better", decayDays: 365,
      description: "Yes if collars relay data between each other (Nofence HerdNet, collar-to-collar range)." },
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
    id: "nofence", name: "Nofence", aliases: ["Nofence AS", "N3", "SG2.5", "nofence.com"], website: "https://www.nofence.com", hqCountry: "Norway",
    isSelf: true, status: "active", markets: ["US", "UK", "IE", "NO", "SE", "ES"],
    crawlPages: [
      { url: "https://www.nofence.com/en-gb/", label: "UK home", marketId: "UK", kind: "product" },
      { url: "https://www.nofence.com/en-us/", label: "US home", marketId: "US", kind: "product" },
    ],
    feeds: [], createdAt: ts, updatedAt: ts,
  },
  {
    id: "monil", name: "Monil", aliases: ["Monil AS", "monil.com"], website: "https://www.monil.com", hqCountry: "Norway",
    isSelf: false, status: "active", markets: ["NO", "SE", "UK", "US"],
    crawlPages: [
      { url: "https://www.monil.com/no", label: "Norway home", marketId: "NO", kind: "product" },
      { url: "https://www.monil.com/no/offer", label: "Norway offer", marketId: "NO", kind: "pricing" },
      { url: "https://no.shop.monil.com/shop", label: "Norway shop", marketId: "NO", kind: "pricing" },
      { url: "https://www.monil.com/se", label: "Sweden home", marketId: "SE", kind: "product" },
      { url: "https://www.monil.com/uk", label: "UK home", marketId: "UK", kind: "product" },
      { url: "https://www.monil.com/uk/offer", label: "UK offer", marketId: "UK", kind: "pricing" },
      { url: "https://uk.shop.monil.com/shop/1500-monil-cattle-collar-11", label: "UK shop, cattle collar", marketId: "UK", kind: "pricing" },
      { url: "https://www.monil.com/us", label: "US home", marketId: "US", kind: "product" },
      { url: "https://www.monil.com/us/offer", label: "US offer", marketId: "US", kind: "pricing" },
      { url: "https://us.shop.monil.com/shop/1500-monil-cattle-collar-11", label: "US shop, cattle collar", marketId: "US", kind: "pricing" },
      { url: "https://www.monil.com/uk/blogs", label: "Blog", marketId: "GLOBAL", kind: "news" },
    ],
    feeds: [], createdAt: ts, updatedAt: ts,
  },
  {
    id: "halter", name: "Halter", aliases: ["Halter Ltd", "Halter USA", "halterhq", "halterhq.com"], website: "https://www.halterhq.com", hqCountry: "New Zealand",
    isSelf: false, status: "active", markets: ["US"],
    crawlPages: [
      { url: "https://www.halterhq.com/en-us", label: "US home", marketId: "US", kind: "product" },
      { url: "https://www.halterhq.com/en-us/beef", label: "US beef", marketId: "US", kind: "product" },
      { url: "https://www.halterhq.com/en-us/beef/packages", label: "US packages (pricing)", marketId: "US", kind: "pricing" },
      { url: "https://www.halterhq.com/en-us/news", label: "US news", marketId: "US", kind: "news" },
      { url: "https://www.halterhq.com/en-nz", label: "NZ home", marketId: "GLOBAL", kind: "product" },
    ],
    feeds: [], createdAt: ts, updatedAt: ts,
  },
  {
    id: "vence", name: "Vence", aliases: ["Vence (Merck)", "Merck Animal Health Vence", "HerdManager", "vence.io"], website: "https://www.merck-animal-health-usa.com/species/cattle/vence", hqCountry: "United States",
    isSelf: false, status: "active", markets: ["US"], crawlPages: [], feeds: [], createdAt: ts, updatedAt: ts,
  },
  {
    id: "gallagher", name: "Gallagher", aliases: ["Gallagher eShepherd", "eShepherd", "eshepherd.com"], website: "https://eshepherd.com", hqCountry: "New Zealand",
    isSelf: false, status: "active", markets: ["IE", "ES", "US"], crawlPages: [], feeds: [], createdAt: ts, updatedAt: ts,
  },
  {
    id: "innogando", name: "Innogando", aliases: ["RUMI", "Rumi Pro", "innogando.com"], website: "https://innogando.com", hqCountry: "Spain",
    isSelf: false, status: "active", markets: ["ES"], crawlPages: [], feeds: [], createdAt: ts, updatedAt: ts,
  },
];

// Source URLs behind the product team's feature matrix (Sep 2026): official pages are watched as tier 1,
// press, studies and partner pages as tier 2 (crawl.ts decides by host).
const matrixPages = (pages: [string, CrawlPage["kind"], MarketId?][]): CrawlPage[] =>
  pages.map(([url, kind, marketId]) => ({ url, label: "from product team matrix", marketId: marketId ?? "GLOBAL", kind }));

export const MATRIX_PAGES: Record<string, CrawlPage[]> = {
  nofence: matrixPages([ ["https://pmc.ncbi.nlm.nih.gov/articles/PMC9951726/", "news"],
    ["https://www.nofence.com/what-is-nofence/features/", "product"], ["https://www.nofence.com/community/news/articles/coming-soon-heat-detection-for-your-2-5-collars/", "news"],
    ["https://www.nofence.com/grazing-patterns/rotational-grazing/", "product"], ["https://www.nofence.com/grazing-patterns/solar-grazing/", "product"],
    ["https://www.nofence.com/knowledge-hub/articles/cell-service/", "product"], ["https://www.nofence.com/what-is-nofence/cellular-network/?lang=en-us", "product", "US"],
    ["https://www.nofence.no/en-gb/faq", "product", "UK"],
  ]),
  monil: matrixPages([
    ["https://www.monil.com/uk/blogs/using-monil-for-research", "news", "UK"], ["https://www.monil.com/us/products/collar", "product", "US"],
    ["https://agronews.com/us/en/news/kaleidoscope/2026-05-28/93358", "news", "US"],
  ]),
  halter: matrixPages([
    ["https://www.halterhq.com/animal-welfare-charter/animal-health-benefits", "product"], ["https://www.halterhq.com/dairy/improve-mating-results", "product"], ["https://www.halterhq.com/dairy/reduce-farm-workload", "product"], ["https://www.halterhq.com/articles/pasture-management-and-farm-performance", "news"],
    ["https://www.halterhq.com/en-us/our-technology", "product", "US"], ["https://www.halterhq.com/articles/a-closer-look-at-the-halter-collar", "product"],
  ]),
  vence: matrixPages([ ["https://pmc.ncbi.nlm.nih.gov/articles/PMC11088281/", "news", "US"],
    ["https://www.merck-animal-health-usa.com/hub/vence/", "product", "US"], ["https://ambiq.com/blog/virtual-fencing-is-on-the-mooove/", "news", "US"],
    ["https://www.merck-animal-health-usa.com/species/cattle/vence", "product", "US"], ["https://calfnews.net/featured/artificial-intelligence-virtual-fences/", "news", "US"],
    ["https://www.billpelton.com/virtual-fences-two-producers-share-their-experiences/", "news", "US"], ["https://tutorial.vence.io/", "product", "US"],
    ["https://www.merck-animal-health-usa.com/species/cattle/vence/how-it-works", "product", "US"], ["https://onland.westernlandowners.org/2023/steward-tips/the-invisible-fenceline/", "news", "US"],
    ["https://www.exterrajsc.com/p/satellite-connected-virtual-fencing", "news", "US"],
  ]),
  gallagher: matrixPages([
    ["https://eshepherd.com/faq/", "product"], ["https://landing.eshepherd.com/features/alerts/", "product"],
    ["https://am.gallagher.com/en/knowledge-hub/articles/news/eshepherd-new-features", "news"],
    ["https://am.gallagher.com/en-CA/Knowledge-Hub/Articles/Customer-Stories/Precision-Grazing-with-eShepherd-in-Albertas-Drylands", "news"],
    ["https://www.nzherald.co.nz/business/companies/agribusiness/gallaghers-eshepherd-challenges-halter-in-global-virtual-cattle-fencing-race/premium/MQBQBZQ7CNC7LG5SNX7AKS7A4Q/", "news"],
    ["https://eshepherd.com/neckband/", "product"],
  ]),
  innogando: matrixPages([
    ["https://www.campogalego.es/rumi-pro-el-dispositivo-inteligente-que-incorpora-vallado-virtual-para-transformar-la-gestion-ganadera/", "news", "ES"],
    ["https://innogando.com/en/smart-collars-for-cows/", "product", "ES"], ["https://innogando.com/en/rumi-app/", "product", "ES"],
    ["https://innogando.com/2026/03/05/rumi-de-innogando-tecnologia-inteligente-para-la-deteccion-del-celo-en-vacas-y-optimizacion-de-la-inseminacion-artificial/", "news", "ES"],
    ["https://www.campogalego.es/llega-rumi-el-dispositivo-gps-para-monitorizar-en-tiempo-real-vacas-y-novillas-tanto-en-el-establo-como-en-la-pradera/", "news", "ES"],
    ["https://www.campogalego.es/rumi-una-solucion-por-solo-40-euros-para-tener-la-recria-siempre-controlada/", "news", "ES"],
  ]),
};

export const SETTINGS: Settings = {
  id: "global",
  selfCompetitorId: "nofence",
  digestSlackChannel: "market_intelligence",
  digestWeekday: 1,
  crawlEveryDays: 7,
  crawlDaysByKind: { pricing: 7, product: 14, news: 1, about: 30, other: 14 },
  slackCursors: {},
  newsFeeds: [],
  slackChannels: ["market_intelligence", "product-updates-and-feedback", "commercial", "customer-facing-changes", "marketing", "nofence_in_media"],
  updatedAt: ts,
};
