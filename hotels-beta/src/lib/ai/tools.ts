import "server-only";
import { tool, jsonSchema } from "ai";
import { getHotels, type HotelRecord } from "@/lib/directus";
import { filterHotelsByTags } from "@/lib/hotelFilters";
import { getAirportsForCity, pickPrimaryAirportForCity } from "@/lib/cityAirports";
import {
  buildGuestsArray,
  fetchRatehawkSerpBatch,
  ratePrice,
} from "@/lib/ratehawk/availability";
import { asUntrustedData } from "./systemPrompt";
import {
  MAX_AVAILABILITY_IDS,
  MAX_HOTEL_CANDIDATES,
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
    "yourself. Contains no prices and no availability. Use the broadest " +
    "geography that fits, then narrow — city is often too tight, and `area` " +
    "(Lake Como, Amalfi Coast, Engadin) is usually what a traveller means.",
  inputSchema: jsonSchema<{
    country?: string;
    adminRegion?: string;
    area?: string;
    city?: string;
    settings?: string[];
    styles?: string[];
    activities?: string[];
    limit?: number;
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

    return asUntrustedData("myoltra-hotels", {
      matched: narrowed.length,
      returned: capped.length,
      truncated: narrowed.length > capped.length,
      hotels: capped.map(candidateShape),
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
    const ids = input.ids.slice(0, MAX_AVAILABILITY_IDS);
    if (!ids.length) return asUntrustedData("availability", { hotels: [] });

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
      return asUntrustedData("availability", {
        hotels: rows.map((h) => ({
          id: Number(h.id),
          available: false,
          reason:
            h.ratehawk_status === "passive"
              ? "not-sold-here"
              : "no-supplier-record",
        })),
      });
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

    return asUntrustedData("availability", {
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
    });
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
const presentResults = tool({
  description:
    "Show results to the visitor. Call this once you have decided what to " +
    "recommend. The framing line appears above the cards in the editorial " +
    "voice; the cards themselves render live prices, so put no figures in it.",
  inputSchema: jsonSchema<{
    framing: string;
    hotelIds?: number[];
    rationales?: { id: number; reason: string }[];
    flights?: {
      origin: string;
      destination: string;
      departureDate: string;
      returnDate?: string;
      cabin?: string;
    };
  }>({
    type: "object",
    properties: {
      framing: {
        type: "string",
        description: "One or two editorial sentences. No prices, no lists.",
      },
      hotelIds: {
        type: "array",
        items: { type: "number" },
        description: "Directus ids, best first.",
      },
      rationales: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "number" },
            reason: { type: "string" },
          },
          required: ["id", "reason"],
          additionalProperties: false,
        },
      },
      flights: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          departureDate: { type: "string" },
          returnDate: { type: "string" },
          cabin: { type: "string" },
        },
        required: ["origin", "destination", "departureDate"],
        additionalProperties: false,
      },
    },
    required: ["framing"],
    additionalProperties: false,
  }),
  // No execute: the client reads the tool call itself and renders from it.
  // Returning a value would only add tokens.
});

export const conciergeTools = {
  searchHotels,
  getHotelDetails,
  checkAvailability,
  nearestAirport,
  searchFlights,
  presentResults,
};
