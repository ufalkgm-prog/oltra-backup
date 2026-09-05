"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { useAiConversation, useAiSearch } from "@/lib/ai/aiSearchStore";
import { useAiResultRecords } from "@/lib/ai/useAiResultRecords";
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

const PLACEHOLDER = "Where would you like to go, and what are you after?";

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

      const results: Partial<AiResultSet> = {};
      if (input.hotelIds) {
        results.hotelIds = input.hotelIds.filter((id) => Number.isFinite(id));
      }
      if (input.restaurantIds) {
        results.restaurantIds = input.restaurantIds.filter((id) => Number.isFinite(id));
      }
      if (input.rationales) results.rationales = rationales;
      if (input.flights) {
        results.flights = input.flights
          .filter((leg) => leg?.origin && leg?.destination && leg?.departureDate)
          .map((leg) => ({
            origin: leg.origin,
            destination: leg.destination,
            departureDate: leg.departureDate,
            returnDate: leg.returnDate ?? "",
            cabin: leg.cabin ?? "economy",
          }));
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

const WORDS = /[^\p{L}\p{N}]+/u;

function tokens(value: string): string[] {
  return value.toLowerCase().split(WORDS).filter(Boolean);
}

function squash(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/* Drops the property's name off the front of its own rationale.
 *
 * The model leads with the name whatever the prompt says — it is writing a
 * sentence, and a sentence needs a subject — so the row rendered as
 * "Le Meurice — Le Meurice — grand old Paris". The prompt asks it not to, but
 * a prompt is guidance and this is the display: doing it here means the row
 * cannot read wrong even when the model ignores the instruction.
 *
 * Matched on tokens rather than exact text, because what it writes is a
 * variant, not a copy — "Mandarin Oriental Lutetia" for a record named
 * "Mandarin Oriental, Lutetia, Paris". A leading clause is dropped only when
 * most of its words belong to the name, so a genuine opening clause that
 * happens to share a word survives. */
function stripLeadingName(reason: string, name: string): string {
  const text = reason.trim();
  const nameTokens = new Set(tokens(name));
  if (!nameTokens.size) return text;

  // The usual shape: "<name variant> — <the actual reason>".
  const split = text.split(/\s+[—–-]\s+/);
  if (split.length > 1) {
    const head = tokens(split[0]);
    const overlap = head.filter((token) => nameTokens.has(token)).length;
    if (head.length && overlap / head.length >= 0.6) {
      const rest = split.slice(1).join(" — ").trim();
      if (rest) return rest;
    }
  }

  // No dash, but it still opens with the name verbatim.
  const squashedName = squash(name);
  if (squashedName && squash(text).startsWith(squashedName)) {
    let seen = "";
    for (let i = 0; i < text.length; i += 1) {
      seen += squash(text[i]);
      if (seen === squashedName) {
        const rest = text.slice(i + 1).replace(/^[\s—–\-:,·|]+/, "").trim();
        if (rest) return rest;
        break;
      }
    }
  }

  return text;
}

/* What the concierge found, in words — the whole point of which is that the
 * cards behind the modal are dimmed and unreadable while it is open.
 *
 * Names come from the same records the cards render from, not from anything
 * the model wrote, so a name here can never disagree with the card beside it.
 * The rationale is the model's. No prices: the summary is deliberately
 * incapable of carrying one. */
function ResultSummary() {
  const { results, pageContext } = useAiSearch();
  const { hotels, restaurants, loading } = useAiResultRecords();

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

  return (
    <div className={styles.summary}>
      {hotels.length ? (
        <div className={styles.summaryGroup}>
          <div className={styles.summaryHeading}>
            {hotels.length === 1 ? "Hotel" : "Hotels"}
          </div>
          <ul className={styles.summaryList}>
            {hotels.map((hotel) => {
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

      {restaurants.length ? (
        <div className={styles.summaryGroup}>
          <div className={styles.summaryHeading}>
            {restaurants.length === 1 ? "Restaurant" : "Restaurants"}
          </div>
          <ul className={styles.summaryList}>
            {restaurants.map((restaurant) => {
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
                  {leg.origin} &rarr; {leg.destination}
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
      <p className={styles.summaryFootnote}>
        {rendersBehind
          ? "Prices and availability are on the cards behind this panel."
          : "Prices and availability are on the cards — open them with the link below."}
      </p>
    </div>
  );
}

export default function AiConversation() {
  const { framing, followUp, pageContext, setPresentation, clear, ready } =
    useAiSearch();
  // Its own context: the transcript changes on every streamed token, and
  // everything else reading the store would re-render with it.
  const { messages: stored, setMessages: persistMessages } = useAiConversation();

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const seededRef = useRef(false);
  const appliedPresentationRef = useRef<string | null>(null);

  // The context is read at send time, not at render time, so a stale closure
  // cannot pin the question to the page the modal was first opened on.
  const pageContextRef = useRef(pageContext);
  pageContextRef.current = pageContext;

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

  function startOver() {
    stop();
    clearError();
    setMessages([]);
    setDraft("");
    appliedPresentationRef.current = null;
    clear();
  }

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

  // The framing line is the answer, so it has to come BEFORE the model's
  // follow-up question rather than after it — reading "would you prefer X?"
  // and only then the answer is backwards. It belongs immediately above the
  // last assistant turn, which is where that question lives.
  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant" && messageText(messages[i]).trim()) return i;
    }
    return -1;
  })();

  /* The answer, what it found, and the one question that follows. */
  const framingBlock = framing ? (
    <Fragment key="framing">
      <p className={styles.framing}>{framing}</p>
      <ResultSummary />
      {followUp ? <p className={styles.turnAgent}>{followUp}</p> : null}
    </Fragment>
  ) : null;

  return (
    <div className={styles.conversation}>
      <div className={styles.scroll} ref={scrollRef}>
        {!hasConversation && !framing ? (
          <p className={styles.opening}>
            Tell me the shape of the trip — where, roughly when, and what you are
            after. I can look at hotels, flights and restaurants together.
          </p>
        ) : null}

        {messages.map((message, index) => {
          const text = messageText(message);
          if (!text.trim()) return null;
          const row = (
            <div
              key={message.id}
              className={message.role === "user" ? styles.turnUser : styles.turnAgent}
            >
              {text}
            </div>
          );
          return index === lastAssistantIndex ? (
            <Fragment key={message.id}>
              {framingBlock}
              {row}
            </Fragment>
          ) : (
            row
          );
        })}

        {/* No assistant turn to sit above (the model said nothing beyond the
            results), so the answer stands alone at the end. */}
        {framing && lastAssistantIndex === -1 ? framingBlock : null}

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
        {hasConversation && !busy ? (
          <button
            type="button"
            className={`oltra-button-secondary ${styles.action} ${styles.clear}`}
            onClick={startOver}
          >
            Clear
          </button>
        ) : null}
      </form>
    </div>
  );
}
