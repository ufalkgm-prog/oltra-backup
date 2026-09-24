/* ONE RECORD PER CONCIERGE ANSWER, FOR MONITORING REAL USE (Ulrik,
 * 2026-09-24).
 *
 * The chat route logged failures only, so an answer that worked - or was wrong
 * without erroring - left no trace. The monitoring agent reads these records
 * (table `concierge_answer_log`, members project; setup in
 * scripts/members/2026-09-24-concierge-answer-log.sql) and checks them against
 * the rules in docs/concierge-monitoring-brief.md.
 *
 * ANSWERS ONLY (Ulrik): the member's question is never stored - not as text,
 * not quoted. The member is a hash, never their id.
 *
 * Pure, so it can be tested without the model or the database: the route
 * hands it what it already has and writes what comes back. */

export type AnswerLogRecord = {
  member_hash: string;
  page: string | null;
  turn: number;
  model: string;
  triage_label: string;
  removed_kind: string | null;
  declined: boolean;
  duration_ms: number;
  steps: number;
  tools: string[];
  finish_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  reasoning_tokens: number | null;
  presented: boolean;
  hotel_count: number;
  restaurant_count: number;
  flight_count: number;
  later_stop_count: number;
  stay: Record<string, unknown> | null;
  destination: Record<string, unknown> | null;
  flights: Record<string, unknown>[] | null;
  search_party: Record<string, unknown> | null;
  framing: string | null;
  follow_up: string | null;
  answer_text: string | null;
};

type ToolCall = { toolName: string; input?: unknown };
type Step = { toolCalls?: ToolCall[]; text?: string };
type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
};

export type AnswerLogInput = {
  memberHash: string;
  page: string | null;
  turn: number;
  model: string;
  triageLabel: string;
  removedKind: string | null;
  durationMs: number;
  /** A reply triage gave instead of the model (a decline or an account reply). */
  declineReply?: string;
  steps?: Step[];
  finishReason?: string | null;
  usage?: Usage;
};

const TEXT_CAP = 4000;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, TEXT_CAP) : null;

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Keeps only the named fields of an object (no free text slips in). */
function pick(source: Record<string, unknown> | null, keys: string[]): Record<string, unknown> | null {
  if (!source) return null;
  const out: Record<string, unknown> = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return Object.keys(out).length ? out : null;
}

export function buildAnswerLog(input: AnswerLogInput): AnswerLogRecord {
  const steps = input.steps ?? [];
  const calls = steps.flatMap((step) => step.toolCalls ?? []);
  const last = (name: string) => record([...calls].reverse().find((call) => call.toolName === name)?.input);

  const present = last("presentResults");
  const flights = Array.isArray(present?.flights)
    ? (present.flights as unknown[])
        .map((leg) =>
          pick(record(leg), ["origin", "destination", "departureDate", "returnDate", "cabin", "departAfter", "returnAfter"])
        )
        .filter((leg): leg is Record<string, unknown> => Boolean(leg))
    : null;

  /* The party the searches actually used, to compare with what reached the
     pages: a flights-only answer that searched one adult but handed on two
     was a real bug (2026-09-24). */
  const hotelSearch = record(last("searchHotels")?.stay);
  const availability = last("checkAvailability");
  const flightSearch = last("searchFlights");
  const searchParty =
    hotelSearch || availability || flightSearch
      ? {
          ...(pick(hotelSearch, ["adults", "kids", "childrenAges", "rooms"]) ?? {}),
          // A budget the visitor named, so "over budget but still shown" can
          // be checked without their question.
          ...(pick(hotelSearch, ["maxPricePerStay", "currency"]) ?? {}),
          ...(pick(availability, ["adults", "kids", "childrenAges", "rooms"]) ?? {}),
          ...(flightSearch
            ? {
                flightAdults: flightSearch.adults,
                flightChildren: flightSearch.children,
                cabin: flightSearch.cabinClass,
                alliance: flightSearch.alliance,
              }
            : {}),
        }
      : null;

  // The prose shown after the last tool call (earlier prose is dropped by
  // the panel), or triage's own reply.
  const finalText = input.declineReply ?? [...steps].reverse().find((step) => text(step.text))?.text;

  return {
    member_hash: input.memberHash,
    page: input.page,
    turn: input.turn,
    model: input.model,
    triage_label: input.triageLabel,
    removed_kind: input.removedKind,
    declined: input.declineReply !== undefined,
    duration_ms: Math.round(input.durationMs),
    steps: steps.length,
    tools: calls.map((call) => call.toolName),
    finish_reason: input.finishReason ?? null,
    input_tokens: num(input.usage?.inputTokens),
    output_tokens: num(input.usage?.outputTokens),
    cache_read_tokens: num(input.usage?.inputTokenDetails?.cacheReadTokens),
    cache_write_tokens: num(input.usage?.inputTokenDetails?.cacheWriteTokens),
    reasoning_tokens: num(input.usage?.outputTokenDetails?.reasoningTokens),
    presented: Boolean(present),
    hotel_count: count(present?.hotelIds),
    restaurant_count: count(present?.restaurantIds),
    flight_count: count(present?.flights),
    later_stop_count: count(present?.laterStops),
    stay: pick(record(present?.stay), ["checkIn", "checkOut", "adults", "kids", "childrenAges", "rooms"]),
    destination: pick(record(present?.destination), ["city", "area", "adminRegion", "country"]),
    flights: flights && flights.length ? flights : null,
    search_party: searchParty && Object.keys(searchParty).length ? searchParty : null,
    framing: text(present?.framing),
    follow_up: text(present?.followUp),
    answer_text: text(finalText),
  };
}
