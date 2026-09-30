import { mustAskRooms, ROOMS_QUESTION } from "./rooms.ts";

/* WHAT A PRESENTED ANSWER MAY CONTAIN (2026-09-30).
 *
 * presentResults is drawn from the model's own input, so anything the model
 * writes there reaches the visitor. The model test found three ways that went
 * wrong, each in a handful of answers and none stoppable by a prompt line:
 *
 *  - a hotel id no search had returned became a card (a St. Regis in a Mallorca
 *    answer; an extra Paris id), and a line was written for an id that was not
 *    presented at all, reading "placeholder";
 *  - a family of four was given dated cards with no room count, which prices a
 *    split of rooms the model chose - the rule searchHotels and
 *    checkAvailability already enforce (rooms.ts) had no hold on the answer.
 *
 * So presentResults' execute checks the input against what the tools actually
 * returned in this conversation and hands back corrections; the panel applies
 * them before it draws. Pure and shared by server and client, so it is tested
 * on its own (presentGuard.test.ts). */

export type PresentInputShape = {
  framing?: string;
  followUp?: string;
  hotelIds?: number[];
  restaurantIds?: number[];
  rationales?: { id: number; reason: string }[];
  nearHotelId?: number;
  stay?: {
    checkIn?: string;
    checkOut?: string;
    adults?: number;
    kids?: number;
    childrenAges?: number[];
    rooms?: number;
  };
  laterStops?: {
    place?: string;
    checkIn?: string;
    checkOut?: string;
    hotelIds?: number[];
    restaurantIds?: number[];
  }[];
};

export type PresentCorrections = {
  /** Ids no tool returned in this conversation: no card, no line. */
  unknownIds?: number[];
  /** Lines for ids that are not presented. */
  strayRationaleIds?: number[];
  /** A party that must be asked its rooms: its dates are dropped so nothing is priced. */
  roomsAsked?: boolean;
  /** Replaces followUp when it did not ask the rooms question. */
  followUp?: string;
};

/** The acknowledgement presentResults returns: "shown", or the corrections the
 * panel applies, which the model also reads on its next turn. */
export type PresentOutput = "shown" | { shown: true; corrections: PresentCorrections; note: string };

const ID_KEYS = new Set(["id", "hotelId", "nearHotelId"]);

/* Our own tools wrap their JSON as <untrusted-data source="...">…</untrusted-data>. */
function parseToolText(text: string): unknown {
  const inner = text.match(/<untrusted-data[^>]*>\s*([\s\S]*?)\s*<\/untrusted-data>/);
  try {
    return JSON.parse(inner ? inner[1] : text);
  } catch {
    return null;
  }
}

function collect(value: unknown, into: Set<number>): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, inner] of Object.entries(value)) {
    if (ID_KEYS.has(key) && typeof inner === "number" && Number.isInteger(inner) && inner > 0) into.add(inner);
    else collect(inner, into);
  }
}

/** Every hotel and restaurant id our tools have returned in these messages
 * (the model-message history, this turn's earlier steps included). Hotel and
 * restaurant ids share one set: they are separate Directus collections and
 * could coincide, which would only let a real id through, never block one. */
export function returnedIds(messages: unknown[]): Set<number> {
  const ids = new Set<number>();
  for (const message of messages) {
    const content = (message as { role?: string; content?: unknown }).content;
    if ((message as { role?: string }).role !== "tool" || !Array.isArray(content)) continue;
    for (const part of content) {
      const p = part as { type?: string; output?: { type?: string; value?: unknown } };
      if (p.type !== "tool-result" || !p.output) continue;
      const { type, value } = p.output;
      if (type === "text" && typeof value === "string") collect(parseToolText(value), ids);
      else if (type === "json") collect(typeof value === "string" ? parseToolText(value) : value, ids);
    }
  }
  return ids;
}

/** The corrections an answer needs, or null when it is fine as written.
 * `known` is returnedIds(...) plus the hotel open on the visitor's page. */
export function checkPresentation(input: PresentInputShape, known: Set<number>): PresentCorrections | null {
  const presented = [
    ...(input.hotelIds ?? []),
    ...(input.restaurantIds ?? []),
    ...(input.laterStops ?? []).flatMap((stop) => [...(stop?.hotelIds ?? []), ...(stop?.restaurantIds ?? [])]),
  ].filter((id) => typeof id === "number");
  const unknownIds = [...new Set(presented.filter((id) => !known.has(id)))];
  const shown = new Set(presented.filter((id) => known.has(id)));
  const strayRationaleIds = (input.rationales ?? [])
    .map((entry) => entry?.id)
    .filter((id): id is number => typeof id === "number" && !shown.has(id) && !unknownIds.includes(id));

  const dated = Boolean(input.stay?.checkIn || (input.laterStops ?? []).some((stop) => stop?.checkIn));
  const roomsAsked = dated && mustAskRooms(input.stay);
  const followUp = roomsAsked && !/\brooms?\b/i.test(input.followUp ?? "") ? ROOMS_QUESTION : undefined;

  if (!unknownIds.length && !strayRationaleIds.length && !roomsAsked) return null;
  return {
    ...(unknownIds.length ? { unknownIds } : {}),
    ...(strayRationaleIds.length ? { strayRationaleIds } : {}),
    ...(roomsAsked ? { roomsAsked: true } : {}),
    ...(followUp ? { followUp } : {}),
  };
}

/** What the model reads back, in its own terms. */
export function correctionNote(c: PresentCorrections): string {
  const parts: string[] = [];
  if (c.unknownIds?.length) parts.push(`not shown: ids ${c.unknownIds.join(", ")}, which no search returned`);
  if (c.strayRationaleIds?.length) parts.push(`lines dropped for ids ${c.strayRationaleIds.join(", ")}, which were not presented`);
  if (c.roomsAsked) parts.push("shown without dates or prices until the visitor says how many rooms");
  return `Shown, with corrections: ${parts.join("; ")}.`;
}

/** The input as the panel should draw it. Corrections come from the tool's
 * output; an answer stored before this existed has none and is unchanged. */
export function applyCorrections<T extends PresentInputShape>(input: T, c: PresentCorrections | null | undefined): T {
  if (!c) return input;
  const drop = new Set(c.unknownIds ?? []);
  const keep = (ids?: number[]) => (ids ? ids.filter((id) => !drop.has(id)) : ids);
  const strays = new Set([...(c.strayRationaleIds ?? []), ...drop]);
  const out: T = {
    ...input,
    hotelIds: keep(input.hotelIds),
    restaurantIds: keep(input.restaurantIds),
    rationales: input.rationales?.filter((entry) => !strays.has(entry?.id)),
    laterStops: input.laterStops?.map((stop) => ({
      ...stop,
      hotelIds: keep(stop.hotelIds),
      restaurantIds: keep(stop.restaurantIds),
      ...(c.roomsAsked ? { checkIn: undefined, checkOut: undefined } : {}),
    })),
  };
  if (input.nearHotelId != null && drop.has(input.nearHotelId)) out.nearHotelId = undefined;
  if (c.roomsAsked && input.stay) out.stay = { ...input.stay, checkIn: undefined, checkOut: undefined };
  if (c.followUp) out.followUp = c.followUp;
  return out;
}

/** The corrections carried by a presentResults tool part's output, if any. */
export function correctionsFromOutput(output: unknown): PresentCorrections | null {
  if (!output || typeof output !== "object") return null;
  const corrections = (output as { corrections?: unknown }).corrections;
  return corrections && typeof corrections === "object" ? (corrections as PresentCorrections) : null;
}
