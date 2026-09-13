"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { useAiConversation, useAiSearch } from "@/lib/ai/aiSearchStore";
import { collapseReturnLegs } from "@/lib/ai/flightLegs";
import { stripLeadingName } from "@/lib/ai/rationale";
import { useAiResultRecords } from "@/lib/ai/useAiResultRecords";
import { useHomeAirport } from "@/lib/members/useHomeAirport";
import type { AiQueryState, AiResultSet } from "@/lib/ai/types";
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
};

/** Pulls the newest presentResults call out of the message list. The model
 * hands us a structured result set through a tool rather than us parsing hotel
 * names out of its prose — prose parsing would break the moment it phrased
 * something differently. */
function readLatestPresentation(messages: UIMessage[]): {
  toolCallId: string;
  framing: string;
  followUp: string;
  /* Partial on purpose: only the facets this call actually spoke to. A turn
   * that answers the flights half of a trip says nothing about hotels, and the
   * store keeps whatever it is not told about. */
  results: Partial<AiResultSet>;
  query: Partial<AiQueryState>;
} | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;

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

      const rationales: Record<string, string> = {};
      for (const entry of input.rationales ?? []) {
        if (entry?.id != null && entry.reason) rationales[String(entry.id)] = entry.reason;
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
        ...(typeof stay.rooms === "number" ? { bedrooms: Math.max(1, stay.rooms) } : {}),
        ...(dest.city || dest.area || dest.adminRegion || dest.country
          ? {
              destination: {
                city: dest.city ?? "",
                area: dest.area ?? "",
                adminRegion: dest.adminRegion ?? "",
                country: dest.country ?? "",
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
        // Collapsed here rather than at the frame, so the summary, the cards,
        // the handoff URL and the Flights page's trip type all read the same
        // one round trip.
        results.flights = collapseReturnLegs(
          input.flights
            .filter((leg) => leg?.origin && leg?.destination && leg?.departureDate)
            .map((leg) => ({
              origin: leg.origin,
              destination: leg.destination,
              departureDate: leg.departureDate,
              returnDate: leg.returnDate ?? "",
              cabin: leg.cabin ?? "economy",
            }))
        );
      }

      return {
        toolCallId: part.toolCallId,
        framing: input.framing,
        followUp: input.followUp ?? "",
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
      const closing = line.includes("?") || /^if you (want|wish|would like|'d like)\b/i.test(line);
      return closing && line.length <= CLOSING_QUESTION_MAX_CHARS ? i : -1;
    }
    return -1;
  })();

  lines.forEach((line, index) => {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push({ key: `l${index}`, text: bullet[1] });
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

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

const MONTH_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function shortDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return MONTH_DAY.format(new Date(Date.UTC(y, m - 1, d)));
}


/** Most the panel will ever read out, however many the model wrote lines for.
 *
 * The panel is a spoken answer, not a listing — past eight names it stops being
 * something anyone takes in, and the page behind is where a set is browsed. A
 * hard cap here rather than trust in the prompt, because the cost of the model
 * getting expansive is the one screen the visitor can actually read. */
const MAX_NAMED = 8;

/* Ulrik's wording, 2026-09-13. The second half matters as much as the first:
 * a visitor told to close the panel needs to know the conversation survives. */
const REVIEW_BEHIND = "Close this window to review — you can reopen this concierge chat anytime.";

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
function ResultSummary() {
  const { results, query, pageContext } = useAiSearch();
  const { hotels, restaurants, loading } = useAiResultRecords();

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
  const rendersBehind =
    page === "landing" ||
    (page === "hotels" && results.hotelIds.length > 0) ||
    (page === "flights" && results.flights.length > 0);

  const reason = (id: number | string, name: string | null) => {
    const raw = results.rationales[String(id)] ?? "";
    return raw ? stripLeadingName(raw, name ?? "") : "";
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

  const hotelPicks = shortlist(hotels);
  const restaurantPicks = shortlist(restaurants);
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
  const listHotels = hotels.length > 1;
  const listRestaurants = restaurants.length > 1;

  return (
    <div className={styles.summary}>
      {listHotels && hotelPicks.length ? (
        <div className={styles.summaryGroup}>
          <div className={styles.summaryHeading}>
            {hotelPicks.length < hotels.length
                ? "For example"
                : "Hotels"}
          </div>
          <ul className={styles.summaryList}>
            {hotelPicks.map((hotel) => {
              const why = reason(hotel.id, hotel.hotel_name);
              return (
                <li key={`h-${hotel.id}`} className={styles.summaryItem}>
                  <span className={styles.summaryName}>{hotel.hotel_name}</span>
                  {why ? <span className={styles.summaryReason}> — {why}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {listRestaurants && restaurantPicks.length ? (
        <div className={styles.summaryGroup}>
          <div className={styles.summaryHeading}>
            {restaurantPicks.length < restaurants.length
                ? "For example"
                : "Restaurants"}
          </div>
          <ul className={styles.summaryList}>
            {restaurantPicks.map((restaurant) => {
              const why = reason(restaurant.id, restaurant.restaurant_name);
              return (
                <li key={`r-${restaurant.id}`} className={styles.summaryItem}>
                  <span className={styles.summaryName}>{restaurant.restaurant_name}</span>
                  {why ? <span className={styles.summaryReason}> — {why}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {results.flights.length ? (
        <div className={styles.summaryGroup}>
          <div className={styles.summaryHeading}>
            {results.flights.length === 1 ? "Flight" : "Flights"}
          </div>
          <ul className={styles.summaryList}>
            {results.flights.map((leg) => (
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
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Only three places actually render this result set behind the modal:
          the landing page, which draws a frame per vertical, and the Hotels
          and Flights pages, where AiResultsSync writes the answer into the
          URL. Asked from Inspire — or from Restaurants, whose standalone page
          keeps its own city list rather than the concierge's picks — there is
          nothing behind this panel, and saying otherwise sends the visitor
          looking for cards that are not there. */}
      {/* When the panel has named only some of them, say where the rest are and
          that these lead the list — the order is guaranteed by highlightsFirst,
          so this is a promise the page behind actually keeps. */}
      {/* "The cards are on the page behind this panel" was unclear to Ulrik on
          first reading: it named a UI part ("cards") and a location without
          saying what to do. Every behind-the-panel variant now says where the
          results are, how to see them, and that closing loses nothing. */}
      <p className={styles.summaryFootnote}>
        {alsoBehind > 0
          ? rendersBehind
            ? `These are listed first in the window behind this panel, with the other ${alsoBehind} below${priced ? " — all with prices and availability" : ""}. ${REVIEW_BEHIND}`
            : `These come first on the cards, with the other ${alsoBehind} below — open them with the link below.`
          : priced
            ? rendersBehind
              ? `The results of your query, with prices and availability, are listed in the window behind this panel. ${REVIEW_BEHIND}`
              : "Prices and availability are on the cards — open them with the link below."
            : rendersBehind
              ? `The results of your query are listed in the window behind this panel. ${REVIEW_BEHIND}`
              : "The cards are open with the link below."}
      </p>
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

  const startOver = useCallback(() => {
    stop();
    clearError();
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
    if (stored.length) setMessages(stored);
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

  // SyntheticEvent, not FormEvent: Enter in the textarea submits too.
  function submit(event: React.SyntheticEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void sendMessage(
      { text },
      // Where the visitor is standing, per request. It is re-validated and
      // scrubbed server-side before it reaches a system block.
      { body: { pageContext: pageContextRef.current } }
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
          // A turn with no prose still renders, if it is the one that carried
          // the answer.
          if (!text.trim() && !anchorsAnswer) return null;

          const row = text.trim() ? (
            <div
              key={message.id}
              className={message.role === "user" ? styles.turnUser : styles.turnAgent}
            >
              {message.role === "user" ? text : <AgentText text={text} />}
            </div>
          ) : null;

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

        {busy ? <div className={styles.thinking}>Thinking…</div> : null}

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
          <button
            type="button"
            className={`oltra-button-secondary ${styles.action}`}
            onClick={() => stop()}
          >
            Stop
          </button>
        ) : (
          /* Standard active/passive pair: primary while there is something to
             send, secondary when there is not. */
          <button
            type="submit"
            className={`${
              draft.trim() ? "oltra-button-primary" : "oltra-button-secondary"
            } ${styles.action}`}
            disabled={!draft.trim()}
            aria-label="Send"
          >
            Ask
          </button>
        )}
      </form>
    </div>
  );
}
