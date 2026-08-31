/* Shared types for the AI concierge. No "server-only" here — the store and the
 * UI components import these too. */

export type AiVertical = "hotels" | "flights" | null;

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
  /** id -> one-line editorial rationale. Never a price. */
  rationales: Record<string, string>;
  /** Set when the answer is about flights. */
  flights: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string;
    cabin: string;
  } | null;
};

export const EMPTY_RESULT_SET: AiResultSet = {
  hotelIds: [],
  rationales: {},
  flights: null,
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
};
