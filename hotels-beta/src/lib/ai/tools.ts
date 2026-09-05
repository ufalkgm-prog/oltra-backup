import "server-only";
import { tool, jsonSchema } from "ai";
import { getHotels, type HotelRecord } from "@/lib/directus";
import { filterHotelsByTags } from "@/lib/hotelFilters";
import { getAirportsForCity, pickPrimaryAirportForCity } from "@/lib/cityAirports";
import { getRestaurantCities, searchRestaurants as findRestaurants } from "@/lib/restaurants";
import {
  buildGuestsArray,
  fetchRatehawkSerpBatch,
  ratePrice,
} from "@/lib/ratehawk/availability";
import { asUntrustedData } from "./systemPrompt";
import {
  MAX_AVAILABILITY_IDS,
  MAX_HOTEL_CANDIDATES,
  MAX_RESTAURANT_CANDIDATES,
} from "./config";
import { ACTIVITY_VALUES, SETTING_VALUES, STYLE_VALUES } from "./taxonomy";

/* Tools for the concierge. Every one is read-only: they search and retrieve,
 * and nothing here writes, sends, charges, or mutates state (CLAUDE.md §50).
 *
 * The important design rule is in checkAvailability: it never returns a price
 * to the model. It returns an ordinal and a pass/fail against a ceiling the
 * user named. That makes "never quote a price" a property of the system rather
 * than a promise in a prompt — the model cannot leak a figure it was never
 * given, no matter how it is asked. Every number the visitor sees is rendered
 * by the card from its own live fetch. */

const CANDIDATE_FIELDS = [
  "id",
  "hotel_name",
  "city",
  "state_province_county_island",
  "admin_region",
  "country",
  "region",
  "affiliation",
  "highlights",
  "setting",
  "style",
  "activities",
  "ratehawk_status",
  "ratehawk_hid",
  "editor_rank",
  "ext_points",
  "best50",
  "cn",
  "forbes5",
  "michelin3keys",
  "telegraph",
  "tl100",
  "aaa5d",
] as const;

const AWARD_LABELS: Record<string, string> = {
  best50: "World's 50 Best",
  cn: "Condé Nast Gold List",
  forbes5: "Forbes 5 Star",
  michelin3keys: "Michelin 3 Keys",
  telegraph: "Telegraph Best Hotels",
  tl100: "Travel + Leisure 100",
  aaa5d: "AAA Five Diamond",
};

function awardsFor(hotel: HotelRecord): string[] {
  const record = hotel as unknown as Record<string, unknown>;
  return Object.keys(AWARD_LABELS).filter((code) => record[code] === true).map(
    (code) => AWARD_LABELS[code]
  );
}

function candidateShape(hotel: HotelRecord) {
  return {
    id: Number(hotel.id),
    name: hotel.hotel_name ?? "",
    city: hotel.city ?? "",
    area: hotel.state_province_county_island ?? "",
    adminRegion: (hotel as unknown as Record<string, string | null>).admin_region ?? "",
    country: hotel.country ?? "",
    brand: hotel.affiliation ?? "",
    highlights: hotel.highlights ?? "",
    setting: hotel.setting ?? [],
    style: hotel.style ?? [],
    activities: hotel.activities ?? [],
    awards: awardsFor(hotel),
    // "passive" means the property is not sold through our availability
    // supplier at all and never will be (CLAUDE.md §42) — not that it is sold
    // out. The model should still recommend these; it just must not promise
    // they can be priced here.
    bookableHere: hotel.ratehawk_status !== "passive" && Boolean(hotel.ratehawk_hid),
  };
}

/* ------------------------------------------------------------------------- */

const searchHotels = tool({
  description:
    "Search the myOLTRA hotel collection by geography and character. Returns " +
    "candidate properties with their editorial detail so you can rank them " +
    "yourself. Never returns a price. Use the broadest " +
    "geography that fits, then narrow — city is often too tight, and `area` " +
    "(Lake Como, Amalfi Coast, Engadin) is usually what a traveller means.\n\n" +
    "PASS `stay` WHENEVER YOU KNOW THE DATES. It costs nothing extra and " +
    "returns each candidate's availability and price rank with the results, " +
    "so you do not need checkAvailability afterwards — that second call is a " +
    "whole extra round trip and it is the slowest part of an answer.",
  inputSchema: jsonSchema<{
    country?: string;
    adminRegion?: string;
    area?: string;
    city?: string;
    settings?: string[];
    styles?: string[];
    activities?: string[];
    limit?: number;
    stay?: {
      checkIn: string;
      checkOut: string;
      adults?: number;
      kids?: number;
      childrenAges?: number[];
      rooms?: number;
      maxPricePerStay?: number;
      currency?: string;
    };
  }>({
    type: "object",
    properties: {
      country: { type: "string", description: "Exact country name, e.g. Italy." },
      adminRegion: {
        type: "string",
        description: "Administrative unit, e.g. Lombardy, Valais, Kyoto Prefecture.",
      },
      area: {
        type: "string",
        description:
          "Traveller-facing area, e.g. Lake Como, Amalfi Coast, Engadin, Masai Mara.",
      },
      city: { type: "string", description: "Exact city name." },
      // Enumerated, not free text. These are locked vocabularies (§44), and a
      // tag outside them matches nothing — live testing had the model guessing
      // "quiet"/"secluded"/"wellness" and burning two round trips on an empty
      // result before broadening. An enum makes that impossible.
      settings: {
        type: "array",
        items: { type: "string", enum: [...SETTING_VALUES] },
        description: "Setting tags. Use only these exact values.",
      },
      styles: {
        type: "array",
        items: { type: "string", enum: [...STYLE_VALUES] },
        description: "Architectural/character tags. Use only these exact values.",
      },
      activities: {
        type: "array",
        items: { type: "string", enum: [...ACTIVITY_VALUES] },
        description: "Purpose tags. Use only these exact values.",
      },
      limit: { type: "number" },
      stay: {
        type: "object",
        description:
          "The dates and party, if known. Supply it and the results come " +
          "back with availability and price rank already attached.",
        properties: {
          checkIn: { type: "string", description: "yyyy-mm-dd" },
          checkOut: { type: "string", description: "yyyy-mm-dd" },
          adults: { type: "number" },
          kids: { type: "number" },
          childrenAges: { type: "array", items: { type: "number" } },
          rooms: { type: "number" },
          maxPricePerStay: {
            type: "number",
            description:
              "Ceiling for the whole stay, if the visitor named one. Used " +
              "only to set withinBudget — the figure is never echoed back.",
          },
          currency: { type: "string" },
        },
        required: ["checkIn", "checkOut"],
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  }),
  async execute(input) {
    const and: Record<string, unknown>[] = [{ published: { _eq: true } }];
    if (input.country) and.push({ country: { _eq: input.country } });
    if (input.adminRegion) and.push({ admin_region: { _eq: input.adminRegion } });
    if (input.area) and.push({ state_province_county_island: { _eq: input.area } });
    if (input.city) and.push({ city: { _eq: input.city } });

    const rows = await getHotels({
      fields: CANDIDATE_FIELDS as unknown as string[],
      filter: and.length === 1 ? and[0] : { _and: and },
      sort: ["-ext_points", "-editor_rank", "hotel_name"],
      limit: -1,
    });

    // setting/style/activities are native Postgres text[] columns that Directus
    // cannot filter (CLAUDE.md §4), so this narrowing runs in JS — exactly as
    // the Hotels page does it.
    const narrowed = filterHotelsByTags(rows, {
      activities: input.activities ?? [],
      settings: input.settings ?? [],
      styles: input.styles ?? [],
    });

    const capped = narrowed.slice(
      0,
      Math.min(input.limit ?? MAX_HOTEL_CANDIDATES, MAX_HOTEL_CANDIDATES)
    );

    const shaped = capped.map(candidateShape);

    // Availability in the same round trip when the dates are known. The model
    // asked for these two things back to back every single time, and the
    // second ask cost more than the supplier call it triggered.
    if (input.stay?.checkIn && input.stay?.checkOut) {
      const ranked = await rankAvailability({
        ...input.stay,
        ids: shaped.map((h) => h.id),
      });
      return asUntrustedData("myoltra-hotels", {
        matched: narrowed.length,
        returned: shaped.length,
        truncated: narrowed.length > shaped.length,
        hotels: shaped,
        availability: ranked,
      });
    }

    return asUntrustedData("myoltra-hotels", {
      matched: narrowed.length,
      returned: shaped.length,
      truncated: narrowed.length > shaped.length,
      hotels: shaped,
    });
  },
});

const getHotelDetails = tool({
  description:
    "Full editorial description for one hotel, when you need more than the " +
    "highlights line to judge fit. Contains no prices.",
  inputSchema: jsonSchema<{ id: number }>({
    type: "object",
    properties: { id: { type: "number" } },
    required: ["id"],
    additionalProperties: false,
  }),
  async execute({ id }) {
    const rows = await getHotels({
      fields: [...CANDIDATE_FIELDS, "description", "total_rooms_suites_villas"] as unknown as string[],
      filter: { id: { _eq: id } },
      limit: 1,
    });
    const hotel = rows[0];
    if (!hotel) return asUntrustedData("myoltra-hotels", { found: false });

    return asUntrustedData("myoltra-hotels", {
      found: true,
      ...candidateShape(hotel),
      description: hotel.description ?? "",
      rooms: (hotel as unknown as Record<string, unknown>).total_rooms_suites_villas ?? null,
    });
  },
});

type StayInput = {
  ids: number[];
  checkIn: string;
  checkOut: string;
  adults?: number;
  kids?: number;
  childrenAges?: number[];
  rooms?: number;
  maxPricePerStay?: number;
  currency?: string;
};

/* The availability pass, shared by checkAvailability and by searchHotels'
 * inline mode.
 *
 * Extracted so searchHotels can return availability WITH the candidates. When
 * the two were separate tools the model always called them back to back, and
 * that second call is a whole extra model round trip — measured at 9.7s of a
 * 26.6s answer, far more than the supplier request it wraps. Deciding to ask
 * is the expensive part here, not the asking.
 *
 * Returns ranks and a within-budget flag. The amount is used to sort and to
 * test the ceiling and is then dropped: the model is never handed a figure, so
 * it cannot leak one (§50). */
async function rankAvailability(input: StayInput) {
  // The supplier rejects a past check-in outright, and the whole batch fails
  // with it. Catching it here turns a dead end into something the model can
  // act on — it gets told the year is wrong rather than that availability is
  // down, which is what the visitor was previously shown.
  const today = new Date().toISOString().slice(0, 10);
  if (input.checkIn < today) {
    return {
      error: "check-in is in the past",
      today,
      received: input.checkIn,
      fix: "Re-run with the next occurrence of that month, not one already past.",
    };
  }
  if (input.checkOut <= input.checkIn) {
    return {
      error: "check-out must be after check-in",
      received: { checkIn: input.checkIn, checkOut: input.checkOut },
    };
  }

  const ids = input.ids.slice(0, MAX_AVAILABILITY_IDS);
  if (!ids.length) return { hotels: [] };

  const rows = await getHotels({
    fields: ["id", "ratehawk_hid", "ratehawk_status"],
    filter: { id: { _in: ids } },
    limit: -1,
  });

  // Skip passive properties entirely — they will never return rates, so
  // asking wastes a request against a rate-limited supplier (§42).
  const priceable = rows.filter(
    (h) => h.ratehawk_status !== "passive" && h.ratehawk_hid
  );
  const hidToId = new Map<number, number>();
  for (const h of priceable) hidToId.set(Number(h.ratehawk_hid), Number(h.id));

  if (!hidToId.size) {
    return {
      hotels: rows.map((h) => ({
        id: Number(h.id),
        available: false,
        reason:
          h.ratehawk_status === "passive" ? "not-sold-here" : "no-supplier-record",
      })),
    };
  }

  const rooms = Math.max(1, input.rooms ?? 1);
  const serp = await fetchRatehawkSerpBatch({
    hids: [...hidToId.keys()],
    checkin: input.checkIn,
    checkout: input.checkOut,
    guests: buildGuestsArray(
      Math.max(1, input.adults ?? 2),
      Math.max(0, input.kids ?? 0),
      input.childrenAges ?? [],
      rooms
    ),
    currency: input.currency || "EUR",
    residency: "gb",
  });

  // Cheapest rate per hotel, used ONLY to rank and to test the ceiling.
  // The amount is deliberately dropped before anything reaches the model.
  const cheapest = new Map<number, number>();
  for (const hotel of serp) {
    const id = hidToId.get(Number(hotel.hid));
    if (!id) continue;
    for (const rate of hotel.rates ?? []) {
      const price = ratePrice(rate);
      if (!price) continue;
      const current = cheapest.get(id);
      if (current === undefined || price.amount < current) {
        cheapest.set(id, price.amount);
      }
    }
  }

  const ranked = [...cheapest.entries()].sort((a, b) => a[1] - b[1]);
  const rankById = new Map(ranked.map(([id], index) => [id, index + 1]));

  return {
    note: "Ranks only. No amounts are provided; the cards display live prices.",
    hotels: rows.map((h) => {
      const id = Number(h.id);
      const amount = cheapest.get(id);
      if (amount === undefined) {
        return {
          id,
          available: false,
          reason:
            h.ratehawk_status === "passive"
              ? "not-sold-here"
              : "no-rates-for-these-dates",
        };
      }
      return {
        id,
        available: true,
        priceRank: rankById.get(id) ?? null,
        withinBudget:
          input.maxPricePerStay == null ? null : amount <= input.maxPricePerStay,
      };
    }),
  };
}

const checkAvailability = tool({
  description:
    "Check which of these hotels can be booked for the given dates, and how " +
    "they rank against each other on price. Returns a rank and a within-budget " +
    "flag — never an amount. Use it to filter and order, never to state a " +
    "price: the cards show live figures.",
  inputSchema: jsonSchema<{
    ids: number[];
    checkIn: string;
    checkOut: string;
    adults?: number;
    kids?: number;
    childrenAges?: number[];
    rooms?: number;
    maxPricePerStay?: number;
    currency?: string;
  }>({
    type: "object",
    properties: {
      ids: { type: "array", items: { type: "number" } },
      checkIn: { type: "string", description: "yyyy-mm-dd" },
      checkOut: { type: "string", description: "yyyy-mm-dd" },
      adults: { type: "number" },
      kids: { type: "number" },
      childrenAges: { type: "array", items: { type: "number" } },
      rooms: { type: "number" },
      maxPricePerStay: {
        type: "number",
        description:
          "Ceiling for the whole stay, if the visitor named one. Used only to " +
          "set withinBudget — the figure is never echoed back to you.",
      },
      currency: { type: "string" },
    },
    required: ["ids", "checkIn", "checkOut"],
    additionalProperties: false,
  }),
  async execute(input) {
    return asUntrustedData("availability", await rankAvailability(input));
  },
});

const nearestAirport = tool({
  description:
    "Which airports serve a destination we cover, with distance. Use this for " +
    "any airport question rather than searching the web.",
  inputSchema: jsonSchema<{ city: string }>({
    type: "object",
    properties: { city: { type: "string", description: "Exact myOLTRA city name." } },
    required: ["city"],
    additionalProperties: false,
  }),
  async execute({ city }) {
    const airports = getAirportsForCity(city);
    const primary = pickPrimaryAirportForCity(city);
    return asUntrustedData("airports", {
      city,
      found: airports.length > 0,
      primary: primary
        ? { iata: primary.iata, label: primary.label, distKm: primary.distKm }
        : null,
      airports: airports.map((a) => ({
        iata: a.iata,
        label: a.label,
        distKm: a.distKm,
      })),
    });
  },
});

const searchFlights = tool({
  description:
    "Check whether a route flies on given dates and how the options compare. " +
    "Returns routing, timings and a price rank — never an amount. The flight " +
    "cards show live fares.",
  inputSchema: jsonSchema<{
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    adults?: number;
    children?: number;
    cabinClass?: string;
  }>({
    type: "object",
    properties: {
      origin: { type: "string", description: "IATA code." },
      destination: { type: "string", description: "IATA code." },
      departureDate: { type: "string", description: "yyyy-mm-dd" },
      returnDate: { type: "string", description: "yyyy-mm-dd" },
      adults: { type: "number" },
      children: { type: "number" },
      cabinClass: {
        type: "string",
        enum: ["economy", "premium_economy", "business", "first"],
      },
    },
    required: ["origin", "destination", "departureDate"],
    additionalProperties: false,
  }),
  async execute(input) {
    const { searchFlightOffers } = await import("./flightSearch");
    const offers = await searchFlightOffers(input);
    return asUntrustedData("flights", offers);
  },
});

/** Not a data tool. This is how the model hands the UI a structured result set
 * to render, instead of the UI parsing hotel names out of prose. Calling it is
 * what makes cards appear. */
const RESTAURANT_TYPE_VALUES = [
  "Fine dining",
  "High-end casual",
  "Informal local favorite",
  "Beach club",
] as const;

const searchRestaurants = tool({
  description:
    "Search the myOLTRA restaurant collection for one city. Returns candidate " +
    "restaurants with their editorial detail so you can rank them yourself. " +
    "Coverage is by city, not by country or region — if the city is not " +
    "covered, the tool says so and lists nothing. Never returns a price.",
  inputSchema: jsonSchema<{
    city: string;
    cuisine?: string;
    restaurantType?: string;
    limit?: number;
  }>({
    type: "object",
    properties: {
      city: {
        type: "string",
        description:
          "Exact city name, e.g. Paris, Kyoto, Saint-Tropez - Ramatuelle.",
      },
      cuisine: {
        type: "string",
        description:
          "Optional. Matched loosely, so 'French' also finds 'Modern French'.",
      },
      // Enumerated for the same reason the hotel tags are (§44 / the taxonomy
      // enum fix): these are the four exact stored values, and anything else
      // silently matches nothing.
      restaurantType: {
        type: "string",
        enum: [...RESTAURANT_TYPE_VALUES],
        description: "Optional. Use only these exact values.",
      },
      limit: { type: "number" },
    },
    required: ["city"],
    additionalProperties: false,
  }),
  async execute(input) {
    const rows = await findRestaurants({
      city: input.city,
      cuisine: input.cuisine,
      restaurantType: input.restaurantType,
      limit: Math.min(input.limit ?? MAX_RESTAURANT_CANDIDATES, MAX_RESTAURANT_CANDIDATES),
    });

    // An empty result is ambiguous on its own — "no Japanese in Oslo" and "we
    // do not cover Oslo at all" call for different answers, and only the
    // second should send the visitor elsewhere. So say which it is.
    if (!rows.length) {
      const cities = await getRestaurantCities();
      const covered = cities.some(
        (city) => city.toLowerCase() === input.city.trim().toLowerCase()
      );
      return asUntrustedData("myoltra-restaurants", {
        returned: 0,
        cityCovered: covered,
        note: covered
          ? "We cover this city, but nothing matched those filters."
          : "We do not cover this city yet.",
      });
    }

    return asUntrustedData("myoltra-restaurants", {
      returned: rows.length,
      restaurants: rows.map((row) => ({
        id: Number(row.id),
        name: row.restaurant_name,
        type: row.restaurant_type ?? "",
        cuisine: row.cuisine ?? "",
        city: row.city ?? "",
        area: row.local_area ?? "",
        country: row.country ?? "",
        highlights: row.highlights ?? "",
        setting: row.restaurant_setting ?? "",
        style: row.restaurant_style ?? "",
        awards: row.awards ?? [],
      })),
    });
  },
});

const presentResults = tool({
  description:
    "Show results to the visitor. Call this once you have decided what to " +
    "recommend. The framing line appears above the cards in the editorial " +
    "voice; the cards themselves render live prices, so put no figures in it.",
  inputSchema: jsonSchema<{
    framing: string;
    followUp?: string;
    hotelIds?: number[];
    restaurantIds?: number[];
    rationales?: { id: number; reason: string }[];
    flights?: {
      origin: string;
      destination: string;
      departureDate: string;
      returnDate?: string;
      cabin?: string;
    }[];
    stay?: {
      checkIn?: string;
      checkOut?: string;
      adults?: number;
      kids?: number;
      rooms?: number;
    };
    destination?: {
      city?: string;
      area?: string;
      adminRegion?: string;
      country?: string;
    };
    searchTags?: { settings?: string[]; activities?: string[] };
  }>({
    type: "object",
    properties: {
      framing: {
        type: "string",
        description: "One or two editorial sentences. No prices, no lists.",
      },
      // Calling this tool ENDS YOUR TURN — say everything here. A separate
      // message afterwards cost a whole extra model round trip (measured at
      // ~2.4s) to emit a single sentence, so there is no longer one.
      followUp: {
        type: "string",
        description:
          "Optional. One short question to continue the conversation, e.g. " +
          "'Shall I price it in business too?'. Omit it if nothing useful " +
          "remains to ask. Never put the answer here — that is the framing.",
      },
      hotelIds: {
        type: "array",
        items: { type: "number" },
        description: "Directus ids, best first.",
      },
      // Restaurant ids get their own frame beside the hotels and flights.
      // Only ids that came back from searchRestaurants — a restaurant we do
      // not hold has no card to render, and naming one is exactly what the
      // inventory rule forbids.
      restaurantIds: {
        type: "array",
        items: { type: "number" },
        description: "Directus restaurant ids from searchRestaurants, best first.",
      },
      // FILL THIS IN FOR EVERY PICK. The concierge opens over a dimmed page,
      // so the cards are not visible while the visitor is reading you — these
      // lines are the whole summary of what you found. One clause each,
      // naming the property and why it fits. Never a price or an
      // availability claim; the cards carry those.
      rationales: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "A hotel or restaurant id from the lists above.",
            },
            reason: {
              type: "string",
              description:
                "One short clause saying why it suits them. Do NOT begin " +
                "with the property's name — it is printed immediately " +
                "before your words, so repeating it reads as a stutter. " +
                "Start with the reason itself. No prices.",
            },
          },
          required: ["id", "reason"],
          additionalProperties: false,
        },
      },
      // An ARRAY, one entry per journey, in travel order. A trip is not always
      // a there-and-back on one pair of airports: flying into Nice and home
      // out of Marseille is two one-way entries, neither carrying a
      // returnDate. A plain round trip is a single entry WITH returnDate —
      // do not split that into two, or the visitor loses the cheaper
      // round-trip fares.
      flights: {
        type: "array",
        items: {
          type: "object",
          properties: {
            origin: { type: "string", description: "IATA code." },
            destination: { type: "string", description: "IATA code." },
            departureDate: { type: "string", description: "yyyy-mm-dd" },
            returnDate: {
              type: "string",
              description:
                "yyyy-mm-dd. Only for a round trip on this same pair of " +
                "airports. Leave unset on the legs of an open jaw.",
            },
            cabin: { type: "string" },
          },
          required: ["origin", "destination", "departureDate"],
          additionalProperties: false,
        },
      },
      // The stay these results are for. WITHOUT THIS THE CARDS SHOW NO PRICE:
      // pricing needs check-in, check-out and occupancy, and nothing else in
      // the answer carries them. Fill it in whenever the visitor has given or
      // implied dates, even loosely — the same values you passed to
      // checkAvailability.
      stay: {
        type: "object",
        properties: {
          checkIn: { type: "string", description: "yyyy-mm-dd" },
          checkOut: { type: "string", description: "yyyy-mm-dd" },
          adults: { type: "number" },
          kids: { type: "number" },
          rooms: { type: "number" },
        },
        additionalProperties: false,
      },
      // Where these results are, so the page can offer "see all hotels in X"
      // and hand the destination on.
      destination: {
        type: "object",
        properties: {
          city: { type: "string" },
          area: { type: "string" },
          adminRegion: { type: "string" },
          country: { type: "string" },
        },
        additionalProperties: false,
      },
      // What the answer is ABOUT, beyond where and when. Pass the same tags
      // you searched on. The pages behind mirror these into their own
      // controls — the Inspire page's Purpose selector has nothing to show
      // without them, so "skiing in the Alps" would come back reading "All".
      searchTags: {
        type: "object",
        properties: {
          settings: {
            type: "array",
            items: { type: "string", enum: [...SETTING_VALUES] },
          },
          activities: {
            type: "array",
            items: { type: "string", enum: [...ACTIVITY_VALUES] },
          },
        },
        additionalProperties: false,
      },
    },
    required: ["framing"],
    additionalProperties: false,
  }),
  // The client renders from this tool call's INPUT, not its output — but the
  // tool still needs an execute. Without one the call has no tool_result, and
  // the Anthropic API rejects any later turn whose history contains an
  // unanswered tool_use ("Tool result is missing for tool call ..."). That made
  // every second turn in a conversation fail. The acknowledgement is
  // deliberately tiny; it exists to close the loop, not to inform the model.
  async execute() {
    return "shown";
  },
});

export const conciergeTools = {
  searchHotels,
  getHotelDetails,
  checkAvailability,
  nearestAirport,
  searchFlights,
  searchRestaurants,
  presentResults,
};
