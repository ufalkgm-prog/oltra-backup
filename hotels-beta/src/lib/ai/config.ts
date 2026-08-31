import "server-only";

/* Central knobs for the AI concierge (CLAUDE.md §50).
 *
 * Everything here is server-side except FEATURE_FLAG_ENV_KEY, which names the
 * one public variable the browser is allowed to see. The Anthropic key is read
 * only inside the chat route — it must never reach a NEXT_PUBLIC_* variable or
 * any client bundle, same rule the Ratehawk and Directus credentials follow. */

/** Conversation model. */
export const CHAT_MODEL = "claude-opus-5";

/** Cheap triage pass, run before any CHAT_MODEL spend. */
export const TRIAGE_MODEL = "claude-haiku-4-5";

/** Public flag name. The value is read in client components as
 * process.env.NEXT_PUBLIC_AI_CHAT_ENABLED — Next inlines it at build time, so
 * it cannot be read dynamically from a variable. */
export const FEATURE_FLAG_ENV_KEY = "NEXT_PUBLIC_AI_CHAT_ENABLED";

/* ---------------------------------------------------------------- caps --- */

/** Per user, per rolling day. A single conversation is many requests, so this
 * is deliberately well above a normal session's turn count. */
export const MAX_REQUESTS_PER_USER_PER_DAY = 60;

/** One message. Long enough for a detailed brief, short enough that nobody
 * pastes a novel into the context. */
export const MAX_MESSAGE_CHARS = 2000;

/** Conversation turns kept and sent. Older turns are dropped from the tail
 * rather than summarised — a landing-page concierge exchange that runs past
 * this is better restarted than compacted. */
export const MAX_TURNS = 24;

/** Ceiling on one response. */
export const MAX_OUTPUT_TOKENS = 4096;

/** Tool-call rounds per request, so a confused model cannot loop indefinitely
 * at our expense. */
export const MAX_TOOL_STEPS = 8;

/** Web searches per request. §6 asks for a per-session cap; Anthropic's own
 * server-side tool enforces it via maxUses, so the model cannot exceed it even
 * if it tries. */
export const MAX_WEB_SEARCHES = 3;

/** Hotels handed to the model in one candidate set. Enough for a real choice,
 * small enough to keep the context (and the re-rank) tight. */
export const MAX_HOTEL_CANDIDATES = 40;

/** Ratehawk caps a batch at 300 hids (§32); we stay far below it. */
export const MAX_AVAILABILITY_IDS = 40;

/* ------------------------------------------------------- web search scope - */

/** The web-search tool is for genuinely current or fuzzy travel facts —
 * weather windows, seasonality, whether a route is seasonal. It is not a
 * general search engine, and it must never be the source of a price or an
 * availability claim. Domains are allow-listed rather than blocked so the
 * surface stays small and predictable.
 *
 * EVERY DOMAIN HERE MUST BE CRAWLABLE BY ANTHROPIC. A site that blocks the
 * crawler is rejected at request validation with
 * `400 The following domains are not accessible to our user agent`, which
 * fails the WHOLE request — so one bad entry breaks every query, not just the
 * ones that would have searched. This list was verified empirically, one
 * domain at a time.
 *
 * cntraveler.com and travelandleisure.com were in the first version and are
 * exactly the two that fail. In hindsight that was predictable: CLAUDE.md §25
 * already records both as bot-blocked (T+L returns 402 to a plain fetch,
 * Condé Nast needs its embedded JSON scraped). They were the wrong kind of
 * source for this anyway — editorial "best of" lists, where we should be
 * recommending our own inventory rather than someone else's.
 *
 * If you add a domain, verify it first. */
export const WEB_SEARCH_ALLOWED_DOMAINS = [
  // Reference
  "wikipedia.org",
  "britannica.com",
  "nationalgeographic.com",
  // Climate and seasonality — the main reason this tool exists
  "weatherspark.com",
  "climatestotravel.com",
  "timeanddate.com",
  "worldweatheronline.com",
  "weather.com",
  "metoffice.gov.uk",
  // Aviation
  "iata.org",
];
