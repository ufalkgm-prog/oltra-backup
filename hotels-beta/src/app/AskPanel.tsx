"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { useAiSearch } from "@/lib/ai/aiSearchStore";
import type { AiQueryState, AiResultSet } from "@/lib/ai/types";
import styles from "./page.module.css";

/* Ask mode: the conversation, and the results it produces.
 *
 * The conversation panel grows with the exchange rather than living inside the
 * search bar's height — the brief is explicit that a compact bar is not enough
 * room for a real multi-turn exchange. Results sit in their own region below
 * and shift down as the conversation lengthens.
 *
 * There are no chips anywhere, by design. The conversation is the only way to
 * narrow results, so nothing beside the cards can desync them from what was
 * actually said. */

const PLACEHOLDER = "Where would you like to go, and what are you after?";

/** Ceiling on the growing input, in px — roughly six lines. Past that it
 * scrolls rather than pushing the results off the page. */
const ASK_INPUT_MAX_PX = 132;

type PresentInput = {
  framing?: string;
  followUp?: string;
  hotelIds?: number[];
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
      const query: Partial<AiQueryState> = {
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

export default function AskPanel() {
  const {
    messages: stored,
    framing,
    followUp,
    setMessages: persistMessages,
    setPresentation,
    clear,
    ready,
  } = useAiSearch();

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const seededRef = useRef(false);
  const appliedPresentationRef = useRef<string | null>(null);

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

  // Restore the conversation once the store has hydrated from sessionStorage,
  // so navigating away and back does not lose the exchange.
  useEffect(() => {
    if (!ready || seededRef.current) return;
    seededRef.current = true;
    if (stored.length) setMessages(stored);
  }, [ready, stored, setMessages]);

  // Persist, and lift any new result set into the shared store so the cards,
  // the Search-mode back-fill and the handoff all read the same thing.
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

    // Merge what the model reported on top of the vertical. Previously the
    // hotel branch set only the vertical, so dates and occupancy never reached
    // the store — and AskResults skips pricing entirely without dates, which is
    // why cards appeared with no figure even when the visitor had given
    // everything needed.
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
    void sendMessage({ text });
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

  /* The answer, and the one question that follows it. Both arrive inside
     presentResults now, so this is the whole assistant turn in the usual case
     — there is no separate message after it. */
  const framingBlock = framing ? (
    <Fragment key="framing">
      <p className={styles.askFraming}>{framing}</p>
      {followUp ? <p className={styles.askTurnAgent}>{followUp}</p> : null}
    </Fragment>
  ) : null;

  return (
    <div className={styles.askPanel}>
      {hasConversation || framing ? (
        <div className={styles.askScroll} ref={scrollRef}>
          {messages.map((message, index) => {
            const text = messageText(message);
            if (!text.trim()) return null;
            const row = (
              <div
                key={message.id}
                className={
                  message.role === "user" ? styles.askTurnUser : styles.askTurnAgent
                }
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

          {busy ? <div className={styles.askThinking}>Thinking…</div> : null}

          {error ? (
            <div className={styles.askError}>{errorMessage(error)}</div>
          ) : null}
        </div>
      ) : null}

      <form className={styles.askForm} onSubmit={submit}>
        {/* A textarea, not an input: a brief long enough to be worth writing
            scrolled its own beginning out of sight while it was being typed.
            It grows with the text and then scrolls, so the whole question
            stays visible. Enter still sends — Shift+Enter breaks the line. */}
        <textarea
          ref={inputRef}
          rows={1}
          className={styles.askInput}
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
            className={`oltra-button-secondary ${styles.askAction}`}
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
            } ${styles.askAction}`}
            disabled={!draft.trim()}
            aria-label="Send"
          >
            Ask
          </button>
        )}
        {hasConversation && !busy ? (
          <button
            type="button"
            className={`oltra-button-secondary ${styles.askAction} ${styles.askClear}`}
            onClick={startOver}
          >
            Clear
          </button>
        ) : null}
      </form>

    </div>
  );
}
