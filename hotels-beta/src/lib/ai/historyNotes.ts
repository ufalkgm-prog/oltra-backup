import type { UIMessage } from "ai";
import { askedFromNote, sanitisePageContext } from "./pageContext.ts";
import type { AiPageContext } from "./types";

/* Notes the model reads in its own history (2026-09-30), from the model test.
 * Pure, so they are tested on their own (historyNotes.test.ts); the route
 * applies them before the history is converted. */

/** Each question's page, as a note after its text. The latest question's
 * comes from the request; earlier ones from the page context the browser stored
 * on each message when it was sent. A question that was cut to its travel part
 * (triage) never names the hotel or restaurant open on the page - the same
 * thing the route does for the current question on a PRIVACY rewrite, applied
 * to every rewrite so the note reads the same on every later turn. */
export function withPageNotes(
  history: UIMessage[],
  latest: AiPageContext | null,
  latestRewritten: boolean
): UIMessage[] {
  const lastUser = history.map((m) => m.role).lastIndexOf("user");
  return history.map((message, index) => {
    if (message.role !== "user") return message;
    const isLatest = index === lastUser;
    const stored = (message.metadata as { pageContext?: unknown } | undefined)?.pageContext;
    const context = isLatest ? latest : sanitisePageContext(stored);
    if (!context) return message;
    const answer = history[index + 1];
    const rewritten = isLatest
      ? latestRewritten
      : typeof (answer?.metadata as { travelOnly?: unknown } | undefined)?.travelOnly === "string";
    const note = askedFromNote(
      rewritten ? { ...context, hotelName: undefined, restaurantName: undefined } : context
    );
    return note ? { ...message, parts: [...message.parts, { type: "text" as const, text: note }] } : message;
  });
}

type SearchResult = { url?: unknown; title?: unknown };

function hostOf(url: unknown): string {
  if (typeof url !== "string") return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/* WHAT A WEB SEARCH FOUND, KEPT AS A LINE (2026-09-30). The search's own part
 * cannot be replayed and its turn's reasoning goes with it
 * (sanitiseHistory.ts), so nothing of the lookup survived: asked about pools
 * after a weather answer, the model apologised for not having given the
 * weather. It now keeps what it searched for and where the results came from.
 * The result text itself is encrypted by the provider and is not available. */
export function webSearchNote(part: { input?: unknown; output?: unknown }): string {
  const query = (part.input as { query?: unknown } | undefined)?.query;
  const results = Array.isArray(part.output) ? (part.output as SearchResult[]) : [];
  const found = results
    .slice(0, 4)
    .map((r) => {
      const title = typeof r.title === "string" ? r.title.trim().slice(0, 90) : "";
      const host = hostOf(r.url);
      return title && host ? `${title} (${host})` : title || host;
    })
    .filter(Boolean);
  const searched = typeof query === "string" && query.trim() ? `searched the web for "${query.trim().slice(0, 120)}"` : "searched the web";
  return `[Not shown to the visitor: this answer ${searched}${found.length ? `; results: ${found.join("; ")}` : ""}. What it found is in the answer's own words.]`;
}
