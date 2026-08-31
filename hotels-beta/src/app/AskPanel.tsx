"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { useAiSearch } from "@/lib/ai/aiSearchStore";
import { voiceFont } from "@/lib/ai/fonts";
import type { AiQueryState, AiResultSet } from "@/lib/ai/types";
import AskResults from "./AskResults";
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

type PresentInput = {
  framing?: string;
  hotelIds?: number[];
  rationales?: { id: number; reason: string }[];
  flights?: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    cabin?: string;
  };
};

/** Pulls the newest presentResults call out of the message list. The model
 * hands us a structured result set through a tool rather than us parsing hotel
 * names out of its prose — prose parsing would break the moment it phrased
 * something differently. */
function readLatestPresentation(messages: UIMessage[]): {
  framing: string;
  results: AiResultSet;
} | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;

    for (let j = message.parts.length - 1; j >= 0; j -= 1) {
      const part = message.parts[j];
      if (!isToolUIPart(part)) continue;
      if (getToolName(part) !== "presentResults") continue;

      const input = part.input as PresentInput | undefined;
      if (!input?.framing) continue;

      const rationales: Record<string, string> = {};
      for (const entry of input.rationales ?? []) {
        if (entry?.id != null && entry.reason) rationales[String(entry.id)] = entry.reason;
      }

      return {
        framing: input.framing,
        results: {
          hotelIds: (input.hotelIds ?? []).filter((id) => Number.isFinite(id)),
          rationales,
          flights: input.flights
            ? {
                origin: input.flights.origin,
                destination: input.flights.destination,
                departureDate: input.flights.departureDate,
                returnDate: input.flights.returnDate ?? "",
                cabin: input.flights.cabin ?? "economy",
              }
            : null,
        },
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
    results,
    query,
    setMessages: persistMessages,
    setPresentation,
    clear,
    ready,
  } = useAiSearch();

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef(false);

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
    if (presentation.framing === framing) return;

    const nextQuery: Partial<AiQueryState> = presentation.results.flights
      ? {
          vertical: "flights",
          origin: presentation.results.flights.origin,
          from: presentation.results.flights.departureDate,
          to: presentation.results.flights.returnDate,
        }
      : { vertical: "hotels" };

    setPresentation(presentation.framing, presentation.results, nextQuery);
  }, [messages, framing, persistMessages, setPresentation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, status]);

  const busy = status === "submitted" || status === "streaming";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void sendMessage({ text });
  }

  const hasConversation = messages.length > 0;

  return (
    <div className={styles.askPanel}>
      {hasConversation ? (
        <div className={styles.askThread} ref={scrollRef}>
          {messages.map((message) => {
            const text = messageText(message);
            if (!text.trim()) return null;
            return (
              <div
                key={message.id}
                className={
                  message.role === "user" ? styles.askTurnUser : styles.askTurnAgent
                }
              >
                {text}
              </div>
            );
          })}

          {busy ? <div className={styles.askThinking}>Thinking…</div> : null}

          {error ? (
            <div className={styles.askError}>{errorMessage(error)}</div>
          ) : null}
        </div>
      ) : null}

      <form className={styles.askForm} onSubmit={submit}>
        <input
          className={styles.askInput}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={hasConversation ? "Refine, or ask something else…" : PLACEHOLDER}
          aria-label="Ask the concierge"
          autoComplete="off"
          disabled={busy}
        />
        {hasConversation && !busy ? (
          <button type="button" className={styles.askReset} onClick={startOver}>
            Start over
          </button>
        ) : null}
        {busy ? (
          <button type="button" className={styles.askStop} onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className={styles.askSend}
            disabled={!draft.trim()}
            aria-label="Send"
          >
            Ask
          </button>
        )}
      </form>

      {!hasConversation ? (
        <p className={`${styles.askHint} ${voiceFont.className}`}>
          Describe the trip — a place, a month, a mood — and I&apos;ll find what we have.
        </p>
      ) : null}

      {results.hotelIds.length || results.flights ? (
        <AskResults framing={framing} results={results} query={query} />
      ) : null}
    </div>
  );
}
