import type { AiPageContext, AiPageType } from "./types";

/* Where the visitor is standing, on its way to the model.
 *
 * No "server-only" and no "use client": the browser builds this object and the
 * chat route re-reads it, so both sides import from here. The hook that writes
 * it into the store lives in useAiPageContext.ts, which is client-only.
 *
 * SECURITY NOTE, and the reason sanitise() is as blunt as it is: this value
 * originates in the browser and ends up in a SYSTEM block — the
 * highest-trust position in the request. A hotel name is legitimate page
 * state, but the transport is a POST body anyone can forge, so nothing that
 * could read as an instruction may survive. Fields are whitelisted by name,
 * stripped to a narrow character set, and capped. What is left cannot express
 * a sentence, let alone a directive.
 *
 * Tool results take the opposite route on purpose: supplier text is genuinely
 * prose, so it is wrapped in <untrusted-data> markers rather than scrubbed
 * (see asUntrustedData in systemPrompt.ts). */

const PAGE_TYPES: AiPageType[] = [
  "landing",
  "hotels",
  "flights",
  "restaurants",
  "inspire",
];

/** Letters (including accented ones — Cernobbio and Hôtel du Cap both have to
 * survive), digits, space, and the handful of marks that appear inside a real
 * place or property name. Everything else goes. */
const SAFE_TEXT = /[^\p{L}\p{N} .,'&/()-]/gu;

const MAX_TEXT = 80;

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(SAFE_TEXT, " ").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.slice(0, MAX_TEXT);
}

/** IATA-shaped only. Anything else is dropped rather than passed through. */
function iata(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function count(value: unknown, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.floor(value);
  return n >= 0 && n <= max ? n : undefined;
}

function id(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value > 0 && value < 1_000_000_000 ? value : undefined;
}

/** Returns null for anything that is not a recognised page — an unknown value
 * means no context rather than a guessed one. */
export function sanitisePageContext(input: unknown): AiPageContext | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const page = PAGE_TYPES.find((p) => p === raw.page);
  if (!page) return null;

  const out: AiPageContext = { page };

  const assign = <K extends keyof AiPageContext>(
    key: K,
    value: AiPageContext[K] | undefined
  ) => {
    if (value !== undefined) out[key] = value;
  };

  assign("hotelName", text(raw.hotelName));
  assign("hotelId", id(raw.hotelId));
  assign("city", text(raw.city));
  assign("area", text(raw.area));
  assign("country", text(raw.country));
  assign("origin", iata(raw.origin));
  assign("homeAirport", iata(raw.homeAirport));
  assign("destination", iata(raw.destination));
  assign("restaurantName", text(raw.restaurantName));
  assign("month", text(raw.month));
  assign("from", isoDate(raw.from));
  assign("to", isoDate(raw.to));
  assign("adults", count(raw.adults, 20));
  assign("kids", count(raw.kids, 20));
  assign("rooms", count(raw.rooms, 20));

  return out;
}

const PAGE_LABEL: Record<AiPageType, string> = {
  landing: "the myOLTRA home page",
  hotels: "the Hotels page",
  flights: "the Flights page",
  restaurants: "the Restaurants page",
  inspire: "the Inspire page",
};

/** One short sentence for the model's page-context system block. Kept to a
 * sentence deliberately: it is a default to lean on, not a brief. */
export function describePageContext(context: AiPageContext | null): string {
  if (!context) return "";

  const facts: string[] = [];
  if (context.hotelName) facts.push(`looking at ${context.hotelName}`);
  if (context.restaurantName) facts.push(`looking at ${context.restaurantName}`);

  const place = [context.city, context.area, context.country]
    .filter(Boolean)
    .join(", ");
  if (place) facts.push(`with ${place} selected`);

  if (context.origin && context.destination) {
    facts.push(`with the route ${context.origin} to ${context.destination}`);
  } else if (context.origin) {
    facts.push(`flying from ${context.origin}`);
  }

  /* Stated separately from `origin`, and only when it adds something. `origin`
     is what a form on the page currently reads; this is the member's standing
     answer to where they fly from, which the prompt tells the model to assume
     when the visitor names no origin of their own. */
  if (context.homeAirport && context.homeAirport !== context.origin) {
    facts.push(`whose home airport is ${context.homeAirport}`);
  }

  if (context.month) facts.push(`exploring ${context.month}`);
  /* Said as form contents, not as the visitor's wish, because that is what they
     are. These fields carry whatever was last put in them — including dates the
     concierge itself proposed on an earlier turn, which the results sync writes
     into the URL and the panel then reads back. Phrased as "for 6-13 March" the
     model adopted them as a stated intention and priced a beach question in
     France against a leftover ski week. The prompt tells it to offer these
     rather than assume them; this wording is what makes that possible. */
  if (context.from && context.to) {
    facts.push(`with ${context.from} to ${context.to} filled into the search form`);
  }

  const party: string[] = [];
  if (context.adults) party.push(`${context.adults} adult${context.adults === 1 ? "" : "s"}`);
  if (context.kids) party.push(`${context.kids} child${context.kids === 1 ? "" : "ren"}`);
  if (context.rooms && context.rooms > 1) party.push(`${context.rooms} rooms`);
  if (party.length) facts.push(party.join(", "));

  const where = PAGE_LABEL[context.page];
  const tail = facts.length ? `, ${facts.join(", ")}` : "";

  return (
    `The visitor opened you from ${where}${tail}. ` +
    `Default to that scope when their question does not name one, and answer ` +
    `anything else they ask regardless.`
  );
}
