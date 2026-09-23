"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { useAiConversation, useAiSearch } from "@/lib/ai/aiSearchStore";
import { collapseReturnLegs } from "@/lib/ai/flightLegs";
import { flightLegsAreAlternatives } from "@/lib/ai/handoff";
import {
  MAX_NAMED,
  completeLegsForHotels,
  gatewayForHotel,
  namedHotels,
} from "@/lib/ai/hotelGateways";
import { decodeStrayEscapes, panelText, stripLeadingName } from "@/lib/ai/rationale";
import type { AiPageContext } from "@/lib/ai/types";
import {
  rememberConciergeStays,
  rememberedConciergeStays,
  stayKey,
} from "@/lib/ai/conciergeStays";
import { isMacroRegionTerm } from "@/lib/ai/macroRegionTerms";
import { useAiResultRecords } from "@/lib/ai/useAiResultRecords";
import { useHomeAirport } from "@/lib/members/useHomeAirport";
import { currentResidency } from "@/lib/countries";
import { michelinStatus } from "@/app/restaurants/utils";
import { EMPTY_RESULT_SET, type AiQueryState, type AiResultSet } from "@/lib/ai/types";
import styles from "./AiConcierge.module.css";

/* The conversation, and the summary of what it found.
 *
 * Moved wholesale from the landing page's AskPanel — the chat logic is
 * unchanged and hard-won (see CLAUDE.md §50: the half-streamed tool call, the
 * orphaned user message, the framing-equality guard). What is new is the
 * summary block, and why it exists: the concierge is now a modal over a dimmed
 * page, so the cards it produces are not readable while it is open. The
 * visitor's only view of the answer is this panel, so it names each pick and
 * says why.
 *
 * Still no prices anywhere in here. The model is never handed a figure
 * (checkAvailability returns a rank, not an amount), and the summary renders
 * identity and rationale only — every number the visitor acts on is fetched by
 * the card behind the modal. */

/* The opening prompt, and the only one: this used to be a sentence ABOVE the
   input as well as the placeholder inside it, saying the same thing twice
   before the visitor had typed anything. */
const PLACEHOLDER =
  "What are you looking for — ask me anything about your upcoming trip";

/** Ceiling on the growing input, in px — roughly six lines. */
const ASK_INPUT_MAX_PX = 132;

type PresentInput = {
  framing?: string;
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
    details?: string;
  }[];
  stay?: {
    checkIn?: string;
    checkOut?: string;
    adults?: number;
    kids?: number;
    childrenAges?: number[];
    rooms?: number;
  };
  destination?: {
    city?: string;
    area?: string;
    adminRegion?: string;
    country?: string;
  };
  searchTags?: { settings?: string[]; activities?: string[] };
  laterStops?: {
    place?: string;
    checkIn?: string;
    checkOut?: string;
    hotelIds?: number[];
    restaurantIds?: number[];
  }[];
};

/** Pulls the newest presentResults call out of the message list. The model
 * hands us a structured result set through a tool rather than us parsing hotel
 * names out of its prose — prose parsing would break the moment it phrased
 * something differently. */
function flightKey(origin?: string, destination?: string, depart?: string, ret?: string): string {
  const code = (value?: string) => (value ?? "").trim().toUpperCase();
  return `${code(origin)}-${code(destination)}-${depart ?? ""}-${ret ?? ""}`;
}

/** The "searchedRoutes" a searchFlights result reports ("LHR-RAK"). Tool output
 * reaches the client wrapped in untrusted-data markers, so the JSON is cut out
 * of the string rather than parsed whole. */
function searchedRoutesOf(output: unknown): string[] {
  let data: unknown = output;
  if (typeof output === "string") {
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}");
    if (start < 0 || end <= start) return [];
    try {
      data = JSON.parse(output.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  const routes = (data as { searchedRoutes?: unknown } | null)?.searchedRoutes;
  return Array.isArray(routes)
    ? routes.filter((route): route is string => typeof route === "string" && /^[A-Z]{3}-[A-Z]{3}$/.test(route))
    : [];
}

type Presentation = {
  toolCallId: string;
  framing: string;
  followUp: string;
  /* Partial on purpose: only the facets this call actually spoke to. A turn
   * that answers the flights half of a trip says nothing about hotels, and the
   * store keeps whatever it is not told about. */
  results: Partial<AiResultSet>;
  query: Partial<AiQueryState>;
};

/** A destination value, unless it is one of our colloquial regions. */
function placeOnly(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return isMacroRegionTerm(trimmed) ? "" : trimmed;
}

function readLatestPresentation(messages: UIMessage[]): Presentation | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const found = readPresentation(messages[i]);
    if (found) return found;
  }
  return null;
}

/** The completed presentResults call in ONE message, if it has one. Split out
 * of readLatestPresentation so an earlier answer can be redrawn from its own
 * call rather than vanishing when a newer one arrives. */
function readPresentation(message: UIMessage): Presentation | null {
  {
    if (message.role !== "assistant") return null;

    for (let j = message.parts.length - 1; j >= 0; j -= 1) {
      const part = message.parts[j];
      if (!isToolUIPart(part)) continue;
      if (getToolName(part) !== "presentResults") continue;

      // Tool input streams in field by field, and while it does, `input` is a
      // DeepPartial. `framing` is the first property in the schema, so it
      // completes while hotelIds, stay and destination are still absent —
      // reading that snapshot yields a framing line with no cards, no dates
      // and no destination, which is exactly what the visitor sees. Wait for
      // the input to be whole.
      if (part.state === "input-streaming") continue;

      const input = part.input as PresentInput | undefined;
      if (!input?.framing) continue;

      // Text about restaurants alone may not call them "rooms" (panelText).
      const hotelIdSet = new Set([
        ...(input.hotelIds ?? []),
        ...(input.laterStops ?? []).flatMap((stop) => stop?.hotelIds ?? []),
      ]);
      const restaurantIdSet = new Set([
        ...(input.restaurantIds ?? []),
        ...(input.laterStops ?? []).flatMap((stop) => stop?.restaurantIds ?? []),
      ]);
      const answerHasHotels = hotelIdSet.size > 0;

      const rationales: Record<string, string> = {};
      for (const entry of input.rationales ?? []) {
        if (entry?.id != null && entry.reason) {
          rationales[String(entry.id)] = panelText(entry.reason, {
            restaurantsOnly: restaurantIdSet.has(entry.id) && !hotelIdSet.has(entry.id),
          });
        }
      }

      // The stay is what makes the cards price themselves. Without it they
      // render with no figure at all, however complete the answer looked.
      const stay = input.stay ?? {};
      const dest = input.destination ?? {};
      const tags = input.searchTags ?? {};
      const query: Partial<AiQueryState> = {
        ...(tags.settings ? { settings: tags.settings.filter(Boolean) } : {}),
        ...(tags.activities ? { activities: tags.activities.filter(Boolean) } : {}),
        ...(stay.checkIn ? { from: stay.checkIn } : {}),
        ...(stay.checkOut ? { to: stay.checkOut } : {}),
        ...(typeof stay.adults === "number" ? { adults: Math.max(1, stay.adults) } : {}),
        ...(typeof stay.kids === "number" ? { kids: Math.max(0, stay.kids) } : {}),
        /* The ages the concierge priced with. Without them the stay reached the
           page as "2 children" of no age, so the page priced a different stay
           from the one the answer checked (found 2026-09-14). */
        ...(Array.isArray(stay.childrenAges)
          ? {
              childrenAges: stay.childrenAges
                .map((age) => Number(age))
                .filter((age) => Number.isFinite(age) && age >= 0 && age <= 17)
                .map((age) => Math.floor(age)),
            }
          : {}),
        ...(typeof stay.rooms === "number" ? { bedrooms: Math.max(1, stay.rooms) } : {}),
        ...(dest.city || dest.area || dest.adminRegion || dest.country
          ? {
              /* A colloquial region is not a place a hotel row holds. The model
                 sometimes passes one ("area": "The Alps"), and written into a
                 page URL or the shared session it searched a place that does
                 not exist — "See all hotels in The Alps" found nothing. Such a
                 value is dropped; the rest of the destination stands, and an
                 all-region destination clears the previous one rather than
                 leaving it in place. */
              destination: {
                city: placeOnly(dest.city),
                area: placeOnly(dest.area),
                adminRegion: placeOnly(dest.adminRegion),
                country: placeOnly(dest.country),
              },
            }
          : {}),
      };

      // The highlighted set is exactly who the model wrote a line about in
      // THIS call. Derived here rather than merged from `rationales`, which
      // accumulates across turns — a line written two answers ago would
      // otherwise promote a hotel the model did not choose to name now.
      const highlightIds = (input.rationales ?? [])
        .map((entry) => entry?.id)
        .filter((id): id is number => Number.isFinite(id));

      const results: Partial<AiResultSet> = {};
      if (input.hotelIds) {
        results.hotelIds = highlightsFirst(
          input.hotelIds.filter((id) => Number.isFinite(id)),
          highlightIds
        );
      }
      if (input.restaurantIds) {
        results.restaurantIds = highlightsFirst(
          input.restaurantIds.filter((id) => Number.isFinite(id)),
          highlightIds
        );
      }
      if (input.rationales) {
        results.rationales = rationales;
        results.highlightIds = highlightIds;
      }
      if (input.flights) {
        /* Flight details are shown only for a journey this turn actually
           SEARCHED, airports and dates matching. Found live on the first run
           (2026-09-13): the model searched Copenhagen-LINATE and presented the
           leg as Copenhagen-MALPENSA, so the times and airlines under the
           Malpensa line described a different airport. The tool description
           already said "these exact airports"; this makes the panel incapable
           of showing a mismatch rather than trusting that it was read. */
        // One searchFlights call may cover several airports at either end
        // ("destinations", or every airport of an "originCity"), so each route
        // it searched counts. The tool reports those routes in its output;
        // the input alone cannot say which airports a city expanded to.
        const searched = new Set(
          message.parts
            .filter((p) => isToolUIPart(p) && getToolName(p) === "searchFlights")
            .flatMap((p) => {
              if (!isToolUIPart(p)) return [];
              const s = p.input as
                | {
                    origin?: string;
                    destination?: string;
                    destinations?: string[];
                    departureDate?: string;
                    returnDate?: string;
                  }
                | undefined;
              const fromInput = [s?.destination, ...(s?.destinations ?? [])]
                .filter(Boolean)
                .map((destination) =>
                  flightKey(s?.origin, destination, s?.departureDate, s?.returnDate)
                );
              const fromOutput = searchedRoutesOf(p.output).map((route) => {
                const [from, to] = route.split("-");
                return flightKey(from, to, s?.departureDate, s?.returnDate);
              });
              return [...fromInput, ...fromOutput];
            })
        );
        // Collapsed here rather than at the frame, so the summary, the cards,
        // the handoff URL and the Flights page's trip type all read the same
        // one round trip.
        results.flightsForHotels = Boolean(input.hotelIds?.length);
        results.flights = collapseReturnLegs(
          input.flights
            .filter((leg) => leg?.origin && leg?.destination && leg?.departureDate)
            .map((leg) => ({
              origin: leg.origin,
              destination: leg.destination,
              departureDate: leg.departureDate,
              returnDate: leg.returnDate ?? "",
              cabin: leg.cabin ?? "economy",
              ...(leg.details &&
              searched.has(flightKey(leg.origin, leg.destination, leg.departureDate, leg.returnDate))
                ? { details: panelText(leg.details) }
                : {}),
            }))
        );
      }

      /* The places after the first (see AiResultSet.laterStops). Written with
         every answer that speaks to hotels or restaurants, so an answer about a
         single place clears the stops a previous one left behind. */
      if (input.hotelIds || input.restaurantIds || input.laterStops) {
        const ids = (list?: number[]) => (list ?? []).filter((id) => Number.isFinite(id));
        results.laterStops = (input.laterStops ?? [])
          .filter((stop) => stop?.place?.trim())
          .map((stop) => ({
            place: decodeStrayEscapes(stop.place ?? "").trim(),
            checkIn: stop.checkIn ?? "",
            checkOut: stop.checkOut ?? "",
            hotelIds: ids(stop.hotelIds),
            restaurantIds: ids(stop.restaurantIds),
          }));
      }

      return {
        toolCallId: part.toolCallId,
        framing: panelText(input.framing, { restaurantsOnly: !answerHasHotels }),
        // Not the follow-up: it often offers hotels next ("how many rooms?").
        followUp: panelText(input.followUp ?? ""),
        query,
        results,
      };
    }
  }
  return null;
}

/** The route answers a rejection with `{error}` and a real reason — not
 * signed in, daily limit reached, message too long. The AI SDK surfaces the
 * response body as the Error's message, so pull the reason back out and show
 * it. Falling back to a generic "try again" for a 401 told a signed-out
 * visitor to retry something that could never succeed. */
function errorMessage(error: Error | undefined): string {
  const generic = "I couldn't answer that just now. Please try again.";
  if (!error?.message) return generic;
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    return typeof parsed.error === "string" && parsed.error ? parsed.error : generic;
  } catch {
    return generic;
  }
}

/* The concierge's own turns, rendered.
 *
 * It writes Markdown — the prompt asks it for short bullets, and it bolds the
 * thing each bullet is about — and the transcript used to print the source:
 * literal asterisks and hyphens, newlines collapsed, three bullets running
 * together as one paragraph. Invisible while nearly every answer came through
 * presentResults as one framing line; unmissable now that declining to rank
 * the collection is answered in prose.
 *
 * Bold, bullets and line breaks, and nothing else — that is the whole of what
 * it emits here. No Markdown library: this is a dozen lines against a new
 * dependency, and §2 says no new libraries unless asked.
 *
 * Only the agent's side. A visitor who types an asterisk means an asterisk. */
function inlineBold(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const at = match.index ?? 0;
    if (at > cursor) nodes.push(text.slice(cursor, at));
    nodes.push(<strong key={`${keyBase}-b${at}`}>{match[1]}</strong>);
    cursor = at + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/* Every bullet starts with a capital (Ulrik, 2026-09-13). The model writes list
 * items as sentence fragments — "a spa (21 have one)" — and a prompt line is
 * the kind of rule this file records being skipped, so the display does it.
 * Skips a leading `**` so a bolded lead is capitalised inside the bold. */
function capitaliseFirst(text: string): string {
  const match = /^(\*\*)?(\p{Ll})/u.exec(text);
  if (!match) return text;
  const at = match[1] ? 2 : 0;
  return text.slice(0, at) + text[at].toUpperCase() + text.slice(at + 1);
}

/* A closing question plus a follow-on sentence; longer than this and it is a
 * paragraph, not a sign-off. */
const CLOSING_QUESTION_MAX_CHARS = 180;

function AgentText({
  text,
  /* Off when the caller is already styling the whole block as the question —
     the presentResults `followUp` field is one sentence ending in "?", so it
     matched the detection below and got the spacing twice: 8px on the wrapper
     and 14.4px on the paragraph inside it, on top of the column gap. The
     question drifted a clear line away from the answer it belongs to. */
  detectClosingQuestion = true,
}: {
  text: string;
  detectClosingQuestion?: boolean;
}) {
  const blocks: React.ReactNode[] = [];
  let bullets: { key: string; text: string }[] = [];

  function flushBullets() {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${items[0].key}`}>
        {items.map((item) => (
          <li key={item.key}>{inlineBold(item.text, item.key)}</li>
        ))}
      </ul>
    );
  }

  const lines = text.split("\n");

  /* Which line, if any, is the closing question.
   *
   * When results are shown the question arrives in its own presentResults
   * field and is styled as such. Answering in prose there is no such field —
   * the question is simply the last sentence — so it was set like the rest of
   * the answer and the two cases did not match. Last non-empty line, not a
   * bullet, CONTAINING a question mark.
   *
   * Contains, not ends with. The first version tested `endsWith("?")` and
   * missed every answer where the model asks and then adds a short
   * instruction — "Shall I price the Copenhagen-Nairobi flights? Tell me when
   * you're going." — a shape it writes routinely. Those lines fell through as
   * ordinary prose, losing BOTH the italic and the 0.9rem break above, so the
   * question sat tight against the answer reading as one more sentence of it:
   * exactly the case this styling exists to prevent.
   *
   * The length cap is a guard, not a rule — it stops a long final paragraph
   * that happens to contain a question being set entirely in italic. A real
   * closing question plus its follow-on runs well under it. */
  const closingIndex = (() => {
    if (!detectClosingQuestion) return -1;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line) continue;
      if (/^[-*•]\s+/.test(line)) return -1;
      /* Or a courteous offer, which is how the prompt now asks for the date
         request (2026-09-13): "If you want me to check availability and
         prices, please provide the dates for your stay." has no question mark,
         and without this it would sit upright in a prose answer while the same
         sentence is italic in the presentResults follow-up. */
      /* Any "If you…" offer: the model varies the verb ("If you tell me your
         dates, I'd be glad to…"), and the narrower want/wish/would-like list
         missed that one on its first appearance. */
      const closing = line.includes("?") || /^if you\b/i.test(line);
      return closing && line.length <= CLOSING_QUESTION_MAX_CHARS ? i : -1;
    }
    return -1;
  })();

  lines.forEach((line, index) => {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push({ key: `l${index}`, text: capitaliseFirst(bullet[1]) });
      return;
    }
    flushBullets();
    if (line.trim()) {
      blocks.push(
        <p
          key={`l${index}`}
          className={index === closingIndex ? styles.closingQuestion : undefined}
        >
          {inlineBold(line, `l${index}`)}
        </p>
      );
    }
  });

  flushBullets();
  return <>{blocks}</>;
}

/* HOW LONG THE PANEL WAITS (Ulrik, 2026-09-16).
 *
 * The route's own limit is 180s (maxDuration). Giving up just before it means
 * the visitor reads why, instead of the platform dropping the connection under
 * a "Thinking…" that never ends. The stall limit catches a stream that stops
 * sending anything at all — every chunk resets it — and sits well above the
 * slowest single search we make (a 300-hotel availability batch, ~20s; ETG's
 * own 30s search timeout). */
const ANSWER_LIMIT_MS = 170_000;
const STALL_LIMIT_MS = 90_000;

const TIMED_OUT_MESSAGE =
  "This is taking longer than it should, so I stopped. Your question is back in the box: try again, or ask about one destination at a time.";

function inputField(input: unknown, key: string): string {
  if (!input || typeof input !== "object") return "";
  const value = (input as Record<string, unknown>)[key];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string").join(", ");
  }
  return "";
}

/* What the concierge is doing, in the visitor's words, one line per search it
 * runs — read from the tool calls already streaming into the turn. The panel
 * used to show only "Thinking…", for as long as two minutes. Inputs may still
 * be arriving, so every field is optional here. */
function progressLabel(toolName: string, input: unknown): string {
  const city = inputField(input, "city");
  switch (toolName) {
    case "searchHotels": {
      const name = inputField(input, "name");
      if (name) return `Looking up ${name}`;
      const place =
        city ||
        inputField(input, "area") ||
        inputField(input, "adminRegion") ||
        inputField(input, "region") ||
        inputField(input, "country") ||
        inputField(input, "macroRegion");
      return place ? `Searching hotels in ${place}` : "Searching hotels";
    }
    case "getHotelDetails":
      return "Reading hotel details";
    case "checkAvailability":
      return "Checking availability";
    case "nearestAirport":
      return city ? `Finding the nearest airport to ${city}` : "Finding the nearest airport";
    case "compareGateways":
      return city ? `Comparing airports for ${city}` : "Comparing airports";
    case "searchFlights": {
      const from = inputField(input, "originCity") || inputField(input, "origin");
      const to = inputField(input, "destinations") || inputField(input, "destination");
      return from && to ? `Searching flights ${from} → ${to}` : "Searching flights";
    }
    case "searchRestaurants":
      return city ? `Searching restaurants in ${city}` : "Searching restaurants";
    case "web_search": {
      const query = inputField(input, "query");
      return query ? `Checking the web for “${query}”` : "Checking the web";
    }
    case "presentResults":
      return "Putting the answer together";
    default:
      return "Working";
  }
}

type ProgressStep = { key: string; label: string; done: boolean };

function progressSteps(message: UIMessage | undefined): ProgressStep[] {
  if (!message || message.role !== "assistant") return [];
  return message.parts.flatMap((part, index) => {
    if (!isToolUIPart(part)) return [];
    return [
      {
        key: part.toolCallId || String(index),
        label: progressLabel(getToolName(part), part.input),
        done: part.state === "output-available" || part.state === "output-error",
      },
    ];
  });
}

/* Every stay a presentResults call in this transcript has presented — the
 * dates the results sync may have written into the page's search form. Also
 * remembered past Clear, in lib/ai/conciergeStays. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function conciergeStayKeys(messages: UIMessage[]): Set<string> {
  const keys = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolUIPart(part) || getToolName(part) !== "presentResults") continue;
      // A streaming input is partial: "2026-10" is not yet a date.
      if (part.state === "input-streaming") continue;
      const input = part.input as PresentInput | undefined;
      const stays = [input?.stay, ...(input?.laterStops ?? [])];
      for (const stay of stays) {
        const { checkIn, checkOut } = stay ?? {};
        if (checkIn && checkOut && ISO_DAY.test(checkIn) && ISO_DAY.test(checkOut)) {
          keys.add(stayKey(checkIn, checkOut));
        }
      }
    }
  }
  return keys;
}

/* The page's party goes to the concierge only when it differs from the form's
 * default of 2 adults, no children, one room (Ulrik, 2026-09-23): a default
 * is not something the visitor told us. Any change sends the whole party. */
function withoutDefaultParty(context: AiPageContext | null): AiPageContext | null {
  if (!context) return context;
  const isDefault =
    (context.adults ?? 2) === 2 && !context.kids && (context.rooms ?? 1) <= 1;
  if (!isDefault) return context;
  const rest = { ...context };
  delete rest.adults;
  delete rest.kids;
  delete rest.rooms;
  return rest;
}

/* The prose of a turn (2026-09-23). A concierge turn can speak before a tool
 * call as well as after it — "I can't book or take payment — but let me check
 * those nights for you." then the real answer — and joining the pieces with
 * nothing between them printed "…for you.I can't book…", the opening twice.
 * So an agent turn shows only what it said after its last tool call when it
 * said anything there; otherwise all of it, a paragraph apart. */
function messageText(message: UIMessage): string {
  const texts = (parts: UIMessage["parts"]) =>
    parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text.trim())
      .filter(Boolean);

  if (message.role !== "assistant") return panelText(texts(message.parts).join("\n\n"));

  let lastTool = -1;
  message.parts.forEach((part, index) => {
    if (isToolUIPart(part)) lastTool = index;
  });
  const after = texts(message.parts.slice(lastTool + 1));
  return panelText((after.length ? after : texts(message.parts)).join("\n\n"));
}

const MONTH_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function shortDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return MONTH_DAY.format(new Date(Date.UTC(y, m - 1, d)));
}



/* Ulrik's wording, 2026-09-13. The second half matters as much as the first:
 * a visitor told to close the panel needs to know the conversation survives. */
const REVIEW_BEHIND = "Close this window to review — you can reopen this concierge chat anytime.";

/* The same promise for the pages where nothing renders behind the panel and the
 * results are one link away (Ulrik, 2026-09-14). "Cards" is our word for a UI
 * part, not a guest's: the earlier "Prices and availability are on the cards"
 * survived the 2026-09-13 rewording because only the behind-the-panel variants
 * were changed. */
const RESUME_CHAT = "You can resume this chat anytime.";

/* The second half of REVIEW_BEHIND, for the landing page, where closing the
 * window is what shows the results. */
const REOPEN_CHAT = "You can reopen this concierge chat anytime.";

/* Ulrik's standard wording for a hotel we cannot price or book. */
const NOT_SOLD_HERE = "Not available at myOLTRA yet.";

/** Put the properties the concierge named at the head of the list.
 *
 * The panel names a handful and the page behind carries the whole set, so the
 * two have to agree on order: a visitor who reads five names, closes the panel
 * and finds them scattered down a list of fifteen has been told something that
 * turned out not to be true. The model is asked to lead with them anyway, but
 * asking is not the same as knowing — and this is one line of code.
 *
 * Order within each group is preserved: the model's ranking among the named
 * ones, and its ranking among the rest. */
function highlightsFirst(ids: number[], highlightIds: number[]): number[] {
  if (!highlightIds.length) return ids;
  const named = new Set(highlightIds);
  const lead = ids.filter((id) => named.has(id));
  if (!lead.length) return ids;
  return [...lead, ...ids.filter((id) => !named.has(id))];
}

/* What the concierge found, in words — the whole point of which is that the
 * cards behind the modal are dimmed and unreadable while it is open.
 *
 * Names come from the same records the cards render from, not from anything
 * the model wrote, so a name here can never disagree with the card beside it.
 * The rationale is the model's. No prices: the summary is deliberately
 * incapable of carrying one. */
function ResultSummary({ past }: { past?: Presentation }) {
  const store = useAiSearch();
  const { pageContext } = store;
  /* An EARLIER answer, redrawn further up the transcript, reads its own call:
     its own ids, rationales and flights, not whatever the store holds now. */
  const results: AiResultSet = past ? { ...EMPTY_RESULT_SET, ...past.results } : store.results;
  const query = past ? past.query : store.query;
  const { hotels, restaurants, loading } = useAiResultRecords(
    past ? { hotelIds: results.hotelIds, restaurantIds: results.restaurantIds } : undefined
  );
  /* The later places of a trip that moves on, fetched separately: they are
     named here but are not the cards, so they must not count towards the set
     the footnote and "For example" describe. */
  const laterStops = results.laterStops ?? [];
  const later = useAiResultRecords({
    hotelIds: laterStops.flatMap((stop) => stop.hotelIds),
    restaurantIds: laterStops.flatMap((stop) => stop.restaurantIds),
  });

  /* The cards price themselves from the stay, so with no dates there is
     nothing on them to see. Saying "with prices and availability" regardless
     sends the visitor to look for figures that are not there — and a question
     with no dates in it is exactly when the concierge is told not to invent
     any, so this is the normal case, not an edge one. */
  const priced = Boolean(query.from && query.to);

  const hasAny =
    results.hotelIds.length || results.restaurantIds.length || results.flights.length;
  if (!hasAny) return null;

  if (loading && !hotels.length && !restaurants.length) {
    return <div className={styles.summaryNote}>Gathering those…</div>;
  }

  const page = pageContext?.page ?? "landing";

  /* WHICH PARTS OF THE ANSWER ARE BEHIND THIS PANEL, per type (2026-09-14).
     This was one yes/no for the whole answer, true on the Flights page as soon
     as the answer had a flight — so a hotels-and-flights answer there said the
     hotels were "listed first in the window behind this panel" when the Flights
     page shows only the flight. The landing page renders every type; Hotels
     and Flights render their own type only, as Restaurants does since 2026-09-15 through its
     "AI curated results" type; nothing renders behind elsewhere. */
  type Part = "hotels" | "flights" | "restaurants";
  const answerParts: Part[] = [
    ...(results.hotelIds.length ? (["hotels"] as const) : []),
    ...(results.flights.length ? (["flights"] as const) : []),
    ...(results.restaurantIds.length ? (["restaurants"] as const) : []),
  ];
  const shownBehind = (part: Part) =>
    page === "landing" ||
    (page === "hotels" && part === "hotels") ||
    (page === "flights" && part === "flights") ||
    (page === "restaurants" && part === "restaurants");
  const partsBehind = answerParts.filter(shownBehind);
  const partsElsewhere = answerParts.filter((part) => !shownBehind(part));
  const rendersBehind = partsElsewhere.length === 0;
  // "flight" when the answer has one journey; the others are always plural.
  const partName = (part: Part) =>
    part === "flights" && flights.length === 1 ? "flight" : part;
  const listParts = (parts: Part[]) => {
    const names = parts.map(partName);
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "";
  };
  const verb = (parts: Part[]) =>
    parts.length === 1 && partName(parts[0]) === "flight" ? "is" : "are";

  /* Where the link under the panel goes, in a guest's words. What is not behind
     the panel is on the main page, the one page that renders every part. */
  const linkedPage = "the main page";

  const reason = (id: number | string, name: string | null) => {
    const raw = results.rationales[String(id)] ?? "";
    // Capitalised so every line in a list reads the same way, whichever case
    // the model happened to start it in.
    return raw ? capitaliseFirst(stripLeadingName(raw, name ?? "")) : "";
  };

  /* Name the shortlist, not the whole result set.
   *
   * Above a handful, reciting every card is not a summary — it is the list the
   * visitor opened the concierge to avoid. So the panel reads out the ones the
   * model chose to write a line about and counts the remainder, which are a
   * click away on the cards behind. With no shortlist we are back to the old
   * behaviour and name everything, which is right for the small sets where the
   * model gives every pick a line. */
  const shortlist = <T extends { id: number | string }>(items: T[]): T[] => {
    if (!results.highlightIds.length) return items.slice(0, MAX_NAMED);
    const wanted = new Set(results.highlightIds.map(String));
    const picked = items.filter((item) => wanted.has(String(item.id)));
    return (picked.length ? picked : items).slice(0, MAX_NAMED);
  };

  /* A TRIP IN SEVERAL PLACES NAMES EVERY PICK OF A SMALL PLACE (2026-09-15).
     The model read the eight-line limit as one for the whole trip, so Lake Como
     took three and Florence's sixth hotel had a card and no line. Up to
     MAX_NAMED per place, every one is listed, with or without a reason. */
  const tripHasStops = laterStops.length > 0;
  const placePicks = <T extends { id: number | string }>(list: T[], pick: (items: T[]) => T[]) =>
    tripHasStops && list.length <= MAX_NAMED ? list : pick(list);
  const hotelPicks = placePicks(hotels, (list) => namedHotels(list, results.highlightIds));
  const restaurantPicks = placePicks(restaurants, shortlist);

  /* Flights to every airport the named hotels are reached through, following
     the hotels' order, and each hotel line names its airport — but only in an
     answer that has flights at all. An answer about hotels alone gets no
     airport lines. See lib/ai/hotelGateways.ts. */
  const flights = completeLegsForHotels(
    results.flights,
    hotelPicks,
    MAX_NAMED,
    results.flightsForHotels && !laterStops.length ? hotels : undefined
  );
  const showAirports = flights.length > 0;
  const airportLine = (hotel: (typeof hotels)[number]) => {
    if (!showAirports) return null;
    const gateway = gatewayForHotel(hotel, flights);
    return gateway ? `Fly into ${gateway.label} (${gateway.iata}).` : null;
  };
  const alsoBehind =
    hotels.length - hotelPicks.length + (restaurants.length - restaurantPicks.length);

  /* ONE PROPERTY IS AN ANSWER, NOT A LIST (Ulrik, 2026-09-13). Asked what Aman
     Sveti Stefan is like, how to get there and whether the spa is good, the
     concierge answered all three in the framing — and the panel then printed a
     "Hotel" heading over a one-bullet list repeating the name, which read as
     the start of a list that never came. A lone hotel or restaurant is named
     in the framing instead (the prompt requires it), so its group is not
     drawn. Structural rather than a prompt line: the model cannot be talked
     into drawing a heading it is never given. */
  /* A trip in several places always lists, even one hotel per place: the
     framing introduces the trip, so it cannot also be the answer about one
     property in it. */
  const multiStop = laterStops.length > 0;
  const listHotels = hotels.length > 1 || (multiStop && hotels.length > 0);
  const listRestaurants = restaurants.length > 1 || (multiStop && restaurants.length > 0);

  /* The first place's name and dates, for the group headings of a multi-stop
     answer. Taken from the answer's own destination; a colloquial region was
     already dropped from it on the way in. */
  const firstPlace =
    query.destination?.city ||
    query.destination?.area ||
    query.destination?.adminRegion ||
    query.destination?.country ||
    "";
  const stayLabel = (from?: string, to?: string) =>
    from && to ? ` · ${shortDate(from)} – ${shortDate(to)}` : "";
  const stopHeading = (kind: string, place: string, from?: string, to?: string) =>
    `${kind}${place ? ` in ${place}` : ""}${stayLabel(from, to)}`;

  /* THE STANDARD LINE FOR A HOTEL WE CANNOT PRICE (Ulrik, 2026-09-13):
     "Not available at myOLTRA yet.", italic, the last sentence under that
     hotel — never in the intro. The model used to say it in its own words in
     the framing ("two of the five aren't sold through us, so they appear
     without a price"), which read as though the panel itself carried prices,
     and never said which two. Drawn from the record rather than asked of the
     model, so the wording cannot drift and the right hotels get it: passive,
     or no supplier id at all — the same test searchHotels' `bookableHere` and
     the member price route apply. */
  const notSoldHere = (hotel: { ratehawk_status: string | null; ratehawk_hid: number | null }) =>
    hotel.ratehawk_status === "passive" || !hotel.ratehawk_hid;
  const loneHotel = !listHotels && hotels.length === 1 ? hotels[0] : null;
  /* A STARRED RESTAURANT CARRIES ITS STARS (Ulrik, 2026-09-15): said
     whenever it has them, and nothing when it has none. Drawn from the
     record, like the not-sold-here note, so it is never a remembered star. */
  const loneRestaurant = !listRestaurants && restaurants.length === 1 ? restaurants[0] : null;

  /* An earlier single-hotel answer that we CAN price draws nothing at all here
     — no list, no note, and no footnote under a past answer — and an empty
     block still took the transcript's gap, leaving a blank line between the
     answer and its question. */
  const drawsAnything =
    !past ||
    Boolean(loneHotel && notSoldHere(loneHotel)) ||
    (listHotels && hotelPicks.length > 0) ||
    (listRestaurants && restaurantPicks.length > 0) ||
    multiStop ||
    flights.length > 0;
  if (!drawsAnything) return null;

  const hotelItem = (hotel: (typeof hotels)[number]) => {
    const why = reason(hotel.id, hotel.hotel_name);
    const airport = airportLine(hotel);
    return (
      <li key={`h-${hotel.id}`} className={styles.summaryItem}>
        <span className={styles.summaryName}>{hotel.hotel_name}</span>
        {why ? (
          <span className={styles.summaryReason}>
            {" "}
            — {/* The model often ends a line without a full stop, and a
                note after it then ran on as part of it: "…from Malpensa Not
                available at myOLTRA yet." Closed on every line, note or not:
                only lines with a note used to get one, so the Aman line ended
                in a stop and the six beneath it did not (2026-09-15). */}
            {/[.!?]$/.test(why.trim()) ? why.trim() : `${why.trim()}.`}
          </span>
        ) : null}
        {airport ? <span className={styles.summaryAirport}> {airport}</span> : null}
        {notSoldHere(hotel) ? (
          <span className={styles.notSoldHere}> {NOT_SOLD_HERE}</span>
        ) : null}
      </li>
    );
  };

  const restaurantItem = (restaurant: (typeof restaurants)[number]) => {
    const why = reason(restaurant.id, restaurant.restaurant_name);
    return (
      <li key={`r-${restaurant.id}`} className={styles.summaryItem}>
        <span className={styles.summaryName}>{restaurant.restaurant_name}</span>
        {why ? (
          <span className={styles.summaryReason}>
            {" "}
            — {/[.!?]$/.test(why.trim()) ? why : `${why.trim()}.`}
          </span>
        ) : null}
        {/* With no reason the status follows the name directly, and read as
            part of it — "La Palme d'Or Michelin 1 star." (2026-09-15). Nothing
            for a restaurant without stars: "Not Michelin" is implied. */}
        {michelinStatus(restaurant) ? (
          <span className={styles.summaryAirport}>
            {why ? " " : " — "}
            {michelinStatus(restaurant)}.
          </span>
        ) : null}
      </li>
    );
  };

  /* Restaurants under their own city, whatever stop they belong to (Ulrik,
     2026-09-15): a stop called "Côte d'Azur" held Nice and Cannes under one
     heading. In first-appearance order, so the trip's order holds. */
  const restaurantsByCity = (list: (typeof restaurants)[number][]) => {
    const groups = new Map<string, (typeof restaurants)[number][]>();
    for (const restaurant of list) {
      const city = restaurant.city?.trim() || "";
      groups.set(city, [...(groups.get(city) ?? []), restaurant]);
    }
    return [...groups.entries()];
  };

  /* Each later place's properties, in the order the model gave them. */
  const stopRecords = laterStops.map((stop) => {
    const pick = <T extends { id: number | string }>(ids: number[], records: T[]) =>
      ids
        .map((id) => records.find((record) => String(record.id) === String(id)))
        .filter((record): record is T => Boolean(record));
    return {
      stop,
      hotels: placePicks(pick(stop.hotelIds, later.hotels), (list) =>
        namedHotels(list, results.highlightIds)
      ),
      restaurants: placePicks(pick(stop.restaurantIds, later.restaurants), shortlist),
    };
  });

  /* THE WHOLE TRIP ON THE MAIN PAGE (Ulrik, 2026-09-15; replacing "one
     destination at a time" from earlier the same day). The landing page lists
     every stay's hotels under that stay's place and dates, restaurants under
     each city, and the flights; the other pages show the first place only. So
     the panel says how the trip is laid out, where to see it, and how to keep
     it: SAVE on each choice builds the itinerary in Members, Saved trips. */
  const multiStopFootnote = (() => {
    if (!multiStop) return "";
    const places = [firstPlace, ...laterStops.map((stop) => stop.place)].filter(Boolean);
    const placeList =
      places.length > 1
        ? `${places.slice(0, -1).join(", ")} and then ${places[places.length - 1]}`
        : places[0] ?? "";
    const hasRestaurants =
      results.restaurantIds.length > 0 || laterStops.some((stop) => stop.restaurantIds.length);
    const hasFlights = results.flights.length > 0;
    // Only when there are dates to show: an undated trip printed "each under
    // its dates" over headers that carried none (2026-09-15).
    const hasDates = Boolean(query.from) || laterStops.some((stop) => stop.checkIn);
    const layout =
      `the hotels stay by stay — ${placeList}${hasDates ? " — each under its dates" : ""}` +
      (hasRestaurants ? ", the restaurants under each city" : "") +
      (hasFlights ? ", and the flights" : "");
    const where =
      page === "landing"
        ? `When you close this window, the whole trip is listed on this page: ${layout}.`
        : `I can only show the full trip on the main page — open it with the button below. There you will find ${layout}.`;
    // "…in each city, on your flights —" had lost its "and" (2026-09-15).
    const saveOn = [
      "on your choice in each city",
      ...(hasFlights ? ["on your flights"] : []),
      ...(hasRestaurants ? ["on the restaurants"] : []),
    ];
    const keep =
      `Pick your favourites there and use SAVE ${
        saveOn.length > 1 ? `${saveOn.slice(0, -1).join(", ")} and ${saveOn.at(-1)}` : saveOn[0]
      } — your full itinerary then appears under Members, in Saved trips.`;
    return `${where} ${keep} ${page === "landing" ? REOPEN_CHAT : RESUME_CHAT}`;
  })();

  /* ALTERNATIVE ROUTES ON THE FLIGHTS PAGE (2026-09-23). The page can search
     one route, so the handoff gives it the first of them; the footnote said
     "the results of your query are listed in the window behind" over three
     airports of which the page held one. It names the one behind and how to
     reach the others. */
  const flightAlternativesFootnote = (() => {
    if (page !== "flights" || multiStop || partsElsewhere.length > 0) return "";
    if (!flightLegsAreAlternatives(flights)) return "";
    const [shown, ...others] = flights;
    const otherList =
      others.length > 1
        ? `${others.slice(0, -1).map((leg) => leg.destination).join(", ")} or ${others.at(-1)?.destination}`
        : others[0]?.destination ?? "";
    return `Flights to ${shown.destination} are listed in the window behind this panel. To see ${otherList}, change the destination in the search form there. ${REVIEW_BEHIND}`;
  })();

  return (
    <div className={styles.summary}>
      {loneHotel && notSoldHere(loneHotel) ? (
        <p className={styles.notSoldHereSolo}>{NOT_SOLD_HERE}</p>
      ) : null}
      {loneRestaurant && !past && michelinStatus(loneRestaurant) ? (
        <p className={styles.notSoldHereSolo}>{michelinStatus(loneRestaurant)}.</p>
      ) : null}

      {listHotels && hotelPicks.length ? (
        <div className={styles.summaryGroup}>
          <div className={styles.summaryHeading}>
            {multiStop
              ? stopHeading("Hotels", firstPlace, query.from, query.to)
              : hotelPicks.length < hotels.length
                ? "For example"
                : "Hotels"}
          </div>
          <ul className={styles.summaryList}>{hotelPicks.map(hotelItem)}</ul>
        </div>
      ) : null}

      {listRestaurants && restaurantPicks.length && multiStop
        ? restaurantsByCity(restaurantPicks).map(([city, list]) => (
            <div key={`rc-${city}`} className={styles.summaryGroup}>
              <div className={styles.summaryHeading}>{stopHeading("Restaurants", city || firstPlace)}</div>
              <ul className={styles.summaryList}>{list.map(restaurantItem)}</ul>
            </div>
          ))
        : null}
      {listRestaurants && restaurantPicks.length && !multiStop ? (
        <div className={styles.summaryGroup}>
          <div className={styles.summaryHeading}>
            {restaurantPicks.length < restaurants.length ? "For example" : "Restaurants"}
          </div>
          <ul className={styles.summaryList}>{restaurantPicks.map(restaurantItem)}</ul>
        </div>
      ) : null}

      {stopRecords.map(({ stop, hotels: stopHotels, restaurants: stopRestaurants }) => (
        <Fragment key={`stop-${stop.place}-${stop.checkIn}`}>
          {stopHotels.length ? (
            <div className={styles.summaryGroup}>
              <div className={styles.summaryHeading}>
                {stopHeading("Hotels", stop.place, stop.checkIn, stop.checkOut)}
              </div>
              <ul className={styles.summaryList}>{stopHotels.map(hotelItem)}</ul>
            </div>
          ) : null}
          {restaurantsByCity(stopRestaurants).map(([city, list]) => (
            <div key={`rc-${stop.place}-${city}`} className={styles.summaryGroup}>
              <div className={styles.summaryHeading}>
                {stopHeading("Restaurants", city || stop.place)}
              </div>
              <ul className={styles.summaryList}>{list.map(restaurantItem)}</ul>
            </div>
          ))}
        </Fragment>
      ))}

      {flights.length ? (
        <div className={styles.summaryGroup}>
          <div className={styles.summaryHeading}>
            {flights.length === 1 ? "Flight" : "Flights"}
          </div>
          <ul className={styles.summaryList}>
            {flights.map((leg) => (
              <li
                key={`f-${leg.origin}-${leg.destination}-${leg.departureDate}`}
                className={styles.summaryItem}
              >
                <span className={styles.summaryName}>
                  {/* A return is one journey on one pair of airports, so it is
                      drawn as one — the same double arrow the Flights page
                      puts in its route header. A single arrow here said
                      one-way about a trip that comes home. */}
                  {leg.origin} {leg.returnDate ? "⇆" : "→"} {leg.destination}
                </span>
                <span className={styles.summaryReason}>
                  {" "}
                  — {shortDate(leg.departureDate)}
                  {leg.returnDate ? ` – ${shortDate(leg.returnDate)}` : ""}
                  {/* The options themselves, in the model's words from
                      searchFlights: airlines, direct or not, times each way. */}
                  {leg.details ? `. ${leg.details}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Only four places actually render this result set behind the modal:
          the landing page, which draws a frame per vertical, and the Hotels
          and Flights pages, where AiResultsSync writes the answer into the
          URL — and the Restaurants page, which lists the picks as "AI curated
          results". Asked from Inspire there is nothing behind this panel, and saying otherwise sends the visitor
          looking for cards that are not there. */}
      {/* When the panel has named only some of them, say where the rest are and
          that these lead the list — the order is guaranteed by highlightsFirst,
          so this is a promise the page behind actually keeps. */}
      {/* "The cards are on the page behind this panel" was unclear to Ulrik on
          first reading: it named a UI part ("cards") and a location without
          saying what to do. Every behind-the-panel variant now says where the
          results are, how to see them, and that closing loses nothing. */}
      {/* Not under an earlier answer: the window behind shows the LATEST one,
          so pointing there from further up would send the visitor to results
          for a different question. */}
      {past ? null : <p className={styles.summaryFootnote}>
        {multiStopFootnote
          ? multiStopFootnote
          : flightAlternativesFootnote
          ? flightAlternativesFootnote
          : partsBehind.length > 0 && partsElsewhere.length > 0
          ? /* Split: part of the answer is behind the panel, the rest is one
               link away — say which is where. */
            `The ${listParts(partsBehind)} ${verb(partsBehind)} in the window behind this panel. The ${listParts(partsElsewhere)}${
              priced && partsElsewhere.includes("hotels") ? ", with prices and availability," : ""
            } ${verb(partsElsewhere)} on the main page${
              alsoBehind > 0 && !partsBehind.includes("hotels") && !partsBehind.includes("restaurants")
                ? ` — the ones named here first, with the other ${alsoBehind} after them`
                : ""
            }. Open it with the button below. ${RESUME_CHAT}`
          : page === "landing"
          ? /* The landing page no longer shows its results under the open
               panel (2026-09-15) — they appear when it closes — so "behind this
               panel" would send the visitor looking for something hidden. */
            alsoBehind > 0
            ? `These are listed first on this page when you close this window, with the other ${alsoBehind} below${priced ? " — all with prices and availability" : ""}. ${REOPEN_CHAT}`
            : `The results of your query${priced ? ", with prices and availability," : ""} appear on this page when you close this window. ${REOPEN_CHAT}`
          : alsoBehind > 0
          ? rendersBehind
            ? `These are listed first in the window behind this panel, with the other ${alsoBehind} below${priced ? " — all with prices and availability" : ""}. ${REVIEW_BEHIND}`
            : `These are listed first on ${linkedPage}, with the other ${alsoBehind} after them${priced ? " — all with prices and availability" : ""}. Open it with the button below. ${RESUME_CHAT}`
          : priced
            ? rendersBehind
              ? `The results of your query, with prices and availability, are listed in the window behind this panel. ${REVIEW_BEHIND}`
              : `Prices and availability are on ${linkedPage} — open it with the button below. ${RESUME_CHAT}`
            : rendersBehind
              ? `The results of your query are listed in the window behind this panel. ${REVIEW_BEHIND}`
              : `The results are on ${linkedPage} — open it with the button below. ${RESUME_CHAT}`}
      </p>}
    </div>
  );
}

export default function AiConversation() {
  const { framing, followUp, pageContext, setPresentation, clear, ready, clearSignal } =
    useAiSearch();
  // Its own context: the transcript changes on every streamed token, and
  // everything else reading the store would re-render with it.
  const { messages: stored, setMessages: persistMessages } = useAiConversation();

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const seededRef = useRef(false);
  const appliedPresentationRef = useRef<string | null>(null);

  /* The context is read at send time, not at render time, so a stale closure
     cannot pin the question to the page the modal was first opened on.

     The home airport rides along with it: it is the same per-request envelope,
     and reading it here rather than in each page's own useAiPageContext call
     means every page gets it from one place. It is re-validated as IATA
     server-side like everything else in this object. */
  const homeAirport = useHomeAirport();
  const pageContextRef = useRef(pageContext);
  pageContextRef.current = pageContext
    ? { ...pageContext, ...(homeAirport ? { homeAirport } : {}) }
    : null;

  // Grow to fit the text, then scroll. Measured from the element rather than
  // counting characters, so it stays right at any width or font size: reset to
  // auto first or scrollHeight only ever reports the current height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight covers content + padding but not the border, and the box is
    // border-box — so add the border back or the field is 2px short and
    // scrolls by a sliver on every line.
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, ASK_INPUT_MAX_PX)}px`;
  }, [draft]);

  const { messages, sendMessage, status, error, setMessages, stop, clearError } =
    useChat({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });

  // Every stay an answer presents is remembered past Clear (see
  // rememberedConciergeStays), so its dates are never mistaken for the
  // visitor's own once the transcript is gone.
  useEffect(() => {
    rememberConciergeStays(conciergeStayKeys(messages));
  }, [messages]);

  // A failed turn leaves the user's message in the list with no reply. Left
  // there it is not just cosmetic: the next request replays it, so the model
  // answers the old question alongside the new one, and a retry shows the same
  // message twice. Drop it, and let the error line carry the explanation.
  useEffect(() => {
    if (!error) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return last?.role === "user" ? prev.slice(0, -1) : prev;
    });
  }, [error, setMessages]);

  /* Giving up on an answer that has run too long: stop it, take the turn back
     out (as a failed turn is, above — replayed, the model would answer it
     again beside the next question), and put the question back in the box. */
  const [timedOut, setTimedOut] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const giveUp = useCallback(() => {
    stop();
    const current = messagesRef.current;
    let lastUser = -1;
    for (let i = current.length - 1; i >= 0; i -= 1) {
      if (current[i].role === "user") {
        lastUser = i;
        break;
      }
    }
    if (lastUser >= 0) {
      const question = current[lastUser].parts
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("");
      setMessages(current.slice(0, lastUser));
      setDraft((draftNow) => draftNow || question);
    }
    setTimedOut(true);
  }, [stop, setMessages]);

  const startOver = useCallback(() => {
    stop();
    clearError();
    setTimedOut(false);
    setMessages([]);
    setDraft("");
    appliedPresentationRef.current = null;
    clear();
  }, [stop, clearError, setMessages, clear]);

  /* Clear now lives in the modal header, which cannot reach useChat's own
     message list — so it raises a signal and the reset happens here. Compared
     against a ref rather than run on mount, so restoring a stored conversation
     does not immediately wipe it. */
  const clearedRef = useRef(clearSignal);
  useEffect(() => {
    if (clearSignal === clearedRef.current) return;
    clearedRef.current = clearSignal;
    startOver();
  }, [clearSignal, startOver]);

  // Restore the conversation once the store has hydrated from sessionStorage.
  // This is what makes one conversation span the site: the store now lives in
  // the root layout, so opening the concierge on a different page re-seeds the
  // same exchange rather than starting a fresh thread.
  useEffect(() => {
    if (!ready || seededRef.current) return;
    seededRef.current = true;
    if (stored.length) {
      setMessages(stored);
      /* The stored answer is already in the store, so mark it applied. Without
         this, every time the concierge opened (this component mounts with the
         modal) the persist effect re-applied the latest answer with a fresh
         presentedAt — an old answer re-dated as new, which put its dates back
         into the landing form and let AiResultsSync treat it as a new answer
         that overrides a search made since (found 2026-09-14). */
      appliedPresentationRef.current = readLatestPresentation(stored)?.toolCallId ?? null;
    }
  }, [ready, stored, setMessages]);

  // Persist, and lift any new result set into the shared store so the cards,
  // the classic controls' back-fill and the handoff all read the same thing.
  useEffect(() => {
    if (!seededRef.current || !messages.length) return;
    persistMessages(messages);

    const presentation = readLatestPresentation(messages);
    if (!presentation) return;
    // Keyed on the tool call, not on the framing text. Framing equality was
    // the reason a half-streamed presentation stuck: once its framing was in
    // the store, the completed call read as "no change" and was dropped. It
    // would also swallow a fresh turn that happened to reuse a framing line.
    if (presentation.toolCallId === appliedPresentationRef.current) return;
    appliedPresentationRef.current = presentation.toolCallId;

    // The stay comes from `stay` alone, never from a flight leg. Leg dates are
    // the journey's, not the room's, and an open jaw's legs carry no return
    // date at all — reading them here blanked the hotel check-out, and the
    // cards silently lost their prices with it.
    const legs = presentation.results.flights ?? [];
    const nextQuery: Partial<AiQueryState> = {
      ...(legs.length ? { origin: legs[0].origin } : {}),
      vertical: presentation.results.hotelIds?.length
        ? "hotels"
        : legs.length
          ? "flights"
          : presentation.results.restaurantIds?.length
            ? "restaurants"
            : "hotels",
      ...presentation.query,
    };

    setPresentation(
      presentation.framing,
      presentation.followUp,
      presentation.results,
      nextQuery
    );
  }, [messages, persistMessages, setPresentation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, status]);

  const busy = status === "submitted" || status === "streaming";

  // The whole answer, from sending to the end of the stream.
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(giveUp, ANSWER_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [busy, giveUp]);

  // Nothing new arriving at all. `messages` changes with every chunk, which is
  // what restarts this one.
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(giveUp, STALL_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [busy, messages, giveUp]);

  const progress = busy ? progressSteps(messages[messages.length - 1]) : [];
  /* ONE LINE, REPLACED AS IT GOES (Ulrik, 2026-09-21).
   *
   * Every search used to keep its own line, finished ones ticked and dimmed,
   * so a trip covering several cities grew a list as long as the answer while
   * the visitor waited for it. What they want to know is what is happening
   * now, which is one line's worth.
   *
   * The LAST pending step, not the first: steps finish in order, so the most
   * recently started one is what is actually running. All of them done means
   * the model is writing rather than searching, which is "Thinking…" again. */
  const progressLine = (() => {
    if (!progress.length) return "Thinking…";
    for (let i = progress.length - 1; i >= 0; i -= 1) {
      if (!progress[i].done) return `${progress[i].label}…`;
    }
    return "Thinking…";
  })();

  // SyntheticEvent, not FormEvent: Enter in the textarea submits too.
  function submit(event: React.SyntheticEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setTimedOut(false);
    // Dates in the form that no answer here presented are the visitor's own
    // choice, which the concierge uses rather than offers (Ulrik, 2026-09-23).
    const context = withoutDefaultParty(pageContextRef.current);
    const formStay = context?.from && context.to ? stayKey(context.from, context.to) : null;
    const pageContextForRequest =
      context && formStay
        ? {
            ...context,
            datesChosenByVisitor:
              !conciergeStayKeys(messages).has(formStay) &&
              !rememberedConciergeStays().has(formStay),
          }
        : context;
    void sendMessage(
      { text },
      // Where the visitor is standing, per request. It is re-validated and
      // scrubbed server-side before it reaches a system block. Residency
      // travels beside it, not inside it: it is for the supplier call only
      // and never reaches the model.
      { body: { pageContext: pageContextForRequest, residency: currentResidency() } }
    );
  }

  const hasConversation = messages.length > 0;

  /* Where the answer belongs in the transcript: at the turn that produced it.
   *
   * This used to anchor to the last assistant turn that had TEXT, on the
   * reasoning that the answer must come above the follow-up question rather
   * than after it. That holds only while the newest turn is the one that
   * spoke. A turn that answers purely with presentResults — no prose — leaves
   * the last text turn an OLDER one, so the new answer was rendered above it
   * and the previous reply reappeared underneath, reading as though the
   * concierge had just said it again. Anchoring to the presentResults call
   * itself puts the answer where its turn actually happened, and the
   * follow-up is part of the block so it still sits below the framing. */
  const presentationIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      const presented = message.parts.some(
        (part) =>
          isToolUIPart(part) &&
          getToolName(part) === "presentResults" &&
          part.state !== "input-streaming"
      );
      if (presented) return i;
    }
    return -1;
  })();

  /* The answer, what it found, and the one question that follows. */
  const framingBlock = framing ? (
    <Fragment key="framing">
      <p className={styles.framing}>{framing}</p>
      <ResultSummary />
      {followUp ? (
        <div className={`${styles.turnAgent} ${styles.followUp}`}>
          <AgentText text={followUp} detectClosingQuestion={false} />
        </div>
      ) : null}
    </Fragment>
  ) : null;

  return (
    <div className={styles.conversation}>
      <div className={styles.scroll} ref={scrollRef}>
        {messages.map((message, index) => {
          const text = messageText(message);
          const anchorsAnswer = index === presentationIndex;
          /* EARLIER ANSWERS STAY ON SCREEN (Ulrik, 2026-09-13). Only the latest
             answer used to be drawn, from the store; an earlier turn that
             answered purely through presentResults has no prose, so the moment
             a newer answer arrived it rendered as nothing and the transcript
             read as though the concierge had never replied. Each such turn is
             now redrawn from its own call. */
          const pastAnswer = anchorsAnswer ? null : readPresentation(message);
          if (!text.trim() && !anchorsAnswer && !pastAnswer) return null;

          const row = text.trim() ? (
            <div
              key={message.id}
              className={message.role === "user" ? styles.turnUser : styles.turnAgent}
            >
              {message.role === "user" ? text : <AgentText text={text} />}
            </div>
          ) : null;

          if (pastAnswer) {
            return (
              <Fragment key={message.id}>
                <p className={styles.framing}>{pastAnswer.framing}</p>
                <ResultSummary past={pastAnswer} />
                {pastAnswer.followUp ? (
                  <div className={`${styles.turnAgent} ${styles.followUp}`}>
                    <AgentText text={pastAnswer.followUp} detectClosingQuestion={false} />
                  </div>
                ) : null}
                {row}
              </Fragment>
            );
          }

          return anchorsAnswer ? (
            <Fragment key={message.id}>
              {framingBlock}
              {row}
            </Fragment>
          ) : (
            row
          );
        })}

        {/* A stored answer whose own turn is no longer in the list — it stands
            at the end rather than vanishing. */}
        {framing && presentationIndex === -1 ? framingBlock : null}

        {busy ? (
          <div className={styles.thinking} role="status" aria-live="polite">
            {progressLine}
          </div>
        ) : null}

        {timedOut && !busy ? <div className={styles.error}>{TIMED_OUT_MESSAGE}</div> : null}

        {error ? <div className={styles.error}>{errorMessage(error)}</div> : null}
      </div>

      <form className={styles.form} onSubmit={submit}>
        {/* A textarea, not an input: a brief long enough to be worth writing
            scrolled its own beginning out of sight while it was being typed.
            It grows with the text and then scrolls. Enter sends — Shift+Enter
            breaks the line. */}
        <textarea
          ref={inputRef}
          rows={1}
          className={styles.input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(event);
            }
          }}
          placeholder={hasConversation ? "Refine, or ask something else…" : PLACEHOLDER}
          aria-label="Ask the concierge"
          autoComplete="off"
          disabled={busy}
        />
        {busy ? (
          <button type="button" className={`oltra-btn ${styles.action}`} onClick={() => stop()}>
            Stop
          </button>
        ) : (
          /* Passive, not disabled, while there is nothing to send: a click
             moves focus to the question field instead of submitting (submit()
             also ignores an empty draft, which covers Enter). */
          <button
            type="submit"
            className={`oltra-btn ${styles.action}`}
            aria-disabled={!draft.trim()}
            data-reason={draft.trim() ? undefined : "Type a question to continue"}
            onClick={(event) => {
              if (draft.trim()) return;
              event.preventDefault();
              inputRef.current?.focus();
            }}
            aria-label="Send"
          >
            Ask
          </button>
        )}
      </form>
    </div>
  );
}
