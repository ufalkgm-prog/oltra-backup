/* Shared types for the AI concierge. No "server-only" here — the store and the
 * UI components import these too. */

export type AiVertical = "hotels" | "flights" | "restaurants" | null;

/** The page the visitor is standing on, and what they are looking at there.
 *
 * The concierge is mounted app-wide now, so it has to know where it was opened
 * from — a question asked on a hotel's page usually means *that* hotel. This
 * is deliberately not persisted: it describes right now, not the conversation.
 *
 * It reaches the model as its own system block, never appended to the cached
 * prompt prefix. Every field is optional; the page type is the only constant. */
export type AiPageType = "landing" | "hotels" | "flights" | "restaurants" | "inspire";

export type AiPageContext = {
  page: AiPageType;
  /** Hotels page: the property currently selected in the right-hand pane. */
  hotelName?: string;
  hotelId?: number;
  /** Wherever the page knows a place — hotels, restaurants, landing. */
  city?: string;
  area?: string;
  country?: string;
  /** Flights page: the route as the form currently reads. */
  origin?: string;
  destination?: string;
  /** The member's saved home airport, from Personal Information. Not page
   * state — it travels the same way because it is the same per-request
   * envelope, and it is what the concierge assumes a trip departs from. */
  homeAirport?: string;
  /** Restaurants page: the restaurant selected in the sidebar. */
  restaurantName?: string;
  /** Inspire page: the month being explored. */
  month?: string;
  /** Stay details the page's own controls already hold. */
  from?: string;
  to?: string;
  adults?: number;
  kids?: number;
  rooms?: number;
};

/** The structured parameters the model extracts from the conversation, and the
 * Search-mode fields back-fill from when the user toggles AI off.
 *
 * Geography mirrors the four-field model in CLAUDE.md §3 — `area` is the
 * traveller-facing name (Lake Como, Engadin), `adminRegion` the administrative
 * unit (Lombardy, Valais). Both are searchable, so the model may set either. */
export type AiQueryState = {
  vertical: AiVertical;
  destination: {
    city: string;
    area: string;
    adminRegion: string;
    country: string;
  };
  /** ISO yyyy-mm-dd. Empty when the user has only said "in March". */
  from: string;
  to: string;
  /** Free text the model extracted when no exact dates were given, e.g.
   * "March 2027". Never sent to a supplier — display and re-prompting only. */
  datesLabel: string;
  adults: number;
  kids: number;
  childrenAges: number[];
  bedrooms: number;
  /** The locked taxonomy tags the concierge actually searched on.
   *
   * Carried so the classic controls can mirror what the conversation asked
   * for, not just where and when: "skiing in the Alps" is a purpose, and
   * without it the Inspire page's own Purpose selector has nothing to be set
   * to and the page still reads "All". Values come from the same locked
   * vocabularies the tools enumerate (§44). */
  settings: string[];
  activities: string[];
  /** Hard filters, applied only when the conversation asks for them (§4.4). */
  availableOnly: boolean;
  maxPricePerStay: number | null;
  currency: string;
  /** Origin IATA for the flights side. */
  origin: string;
};

export const EMPTY_QUERY_STATE: AiQueryState = {
  vertical: null,
  destination: { city: "", area: "", adminRegion: "", country: "" },
  from: "",
  to: "",
  datesLabel: "",
  adults: 2,
  kids: 0,
  childrenAges: [],
  bedrooms: 1,
  settings: [],
  activities: [],
  availableOnly: false,
  maxPricePerStay: null,
  currency: "EUR",
  origin: "",
};

/** What the model returns alongside its prose so the UI can render cards.
 *
 * Note what is absent: any price, any availability claim, any currency amount.
 * The model supplies identity and an optional one-line rationale; every figure
 * on screen is rendered by the card from its own live fetch (§2). */
export type AiResultSet = {
  /** Directus hotel ids, in the order the model ranked them. */
  hotelIds: number[];
  /** Directus restaurant ids, in the order the model ranked them.
   *
   * Restaurants are a landing-page result frame only — the standalone
   * Restaurants page keeps its own city-driven data and design, so a handoff
   * there carries the city, not this list. */
  restaurantIds: number[];
  /** id -> one-line editorial rationale. Never a price. */
  rationales: Record<string, string>;
  /** The subset of `hotelIds`/`restaurantIds` the model chose to name, in its
   * own order.
   *
   * `hotelIds` is everything that fits and becomes the cards; this is the
   * shortlist the panel reads out. They are the same list when the result set
   * is small, and they diverge when it is not — fifteen hotels are worth
   * browsing but not worth reciting, so the panel names the best few and says
   * how many more are behind it. Empty means "name them all", which is what an
   * answer with no rationales at all should still do. */
  highlightIds: number[];
  /** One entry per journey the answer covers, in travel order.
   *
   * An array rather than a single search because a real trip is not always a
   * there-and-back on one pair of airports: fly into Nice, home out of
   * Marseille. That open jaw has no `returnDate` on either leg — it is two
   * one-way legs. A plain round trip is one leg carrying a `returnDate`.
   * Empty when the answer is not about flights. */
  flights: AiFlightLeg[];
};

/** One journey in the answer. `returnDate` is set only when this leg is itself
 * a round trip on the same pair of airports. */
export type AiFlightLeg = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  cabin: string;
  /** The concierge's one-line account of the options on this journey —
   * airlines, direct or with stops, and the departure times each way — taken
   * from searchFlights. Never a fare; the cards carry those. */
  details?: string;
};

export const EMPTY_RESULT_SET: AiResultSet = {
  hotelIds: [],
  restaurantIds: [],
  rationales: {},
  highlightIds: [],
  flights: [],
};

/** The editorial framing line above the cards, plus the result set it frames.
 * Produced by the `presentResults` tool — see lib/ai/tools.ts for why this is a
 * tool rather than parsed out of the prose. */
export type AiPresentation = {
  framing: string;
  results: AiResultSet;
  query: Partial<AiQueryState>;
};

/** Card-shaped hotel data for the AI results region. Deliberately its own
 * route (/api/ai/hotels) rather than widening /api/hotels/by-ids, which the
 * Members area depends on. */
export type AiHotelCard = {
  id: number;
  hotel_name: string | null;
  city: string | null;
  country: string | null;
  affiliation: string | null;
  highlights: string | null;
  ratehawk_hid: number | null;
  ratehawk_status: string | null;
  ratehawk_image_1: string | null;
  agoda_photo1: string | null;
  agoda_photo2: string | null;
  agoda_photo3: string | null;
  agoda_photo4: string | null;
  agoda_photo5: string | null;
  www: string | null;
  booking_provider: string | null;
  booking_URL: string | null;
  booking_enabled: boolean | null;
  booking_hotel_ref: string | null;
  /** The airports this hotel is reached through, best first (its destination's
   * standing order), added by /api/ai/hotels. Server-side because the airport
   * table is ~80KB and has no business in the browser bundle. */
  airports: { iata: string; label: string }[];
};
