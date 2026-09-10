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

/** Hotels handed to the model in one candidate set.
 *
 * This is a context ceiling, not an editorial one. It used to be 40, which was
 * doing real damage: a family-ski search matched 53, and the 13 it silently cut
 * were ranked purely by `ext_points` — an awards score, orthogonal to what was
 * asked. Eight of the thirteen carried the "Family" tag, so the cut removed the
 * family-strongest candidates (Suvretta House, Les Fermes de Marie, Rosewood
 * Courchevel) before the model ever saw them, and it presented four trophy
 * hotels from what was left.
 *
 * Narrowing is the concierge's job, not the tool's — so the tool now returns
 * everything that matched and lets the model choose. See BROAD_RESULT_LIMIT for
 * what happens when "everything" is too much to choose from. */
export const MAX_HOTEL_CANDIDATES = 120;

/** Above this many candidates, the concierge asks before it shows.
 *
 * A set this large is not an answer, it is a list — the visitor asked for a
 * recommendation and got a directory. So searchHotels stops returning the
 * properties at this point and returns counts and narrowing axes instead: the
 * model cannot present a set it was not given, which makes "ask before showing
 * a broad set" structural rather than a line in the prompt that testing showed
 * gets skipped.
 *
 * Counted on what the visitor would actually see: available properties when the
 * dates are known, matches otherwise. `showAll` overrides it, for the visitor
 * who answers "just show me all of them". */
export const BROAD_RESULT_LIMIT = 20;

/** Ratehawk caps a batch at 300 hids (§32); we stay well below it. Matches
 * MAX_HOTEL_CANDIDATES so the availability count the model quotes covers every
 * candidate it was told about, rather than the first 40 of them. */
export const MAX_AVAILABILITY_IDS = 120;

/** Restaurants handed to the model in one candidate set. Smaller than the
 * hotel cap: a city's list is short editorial copy, and the answer is a
 * handful of picks rather than a browsable set. */
export const MAX_RESTAURANT_CANDIDATES = 30;

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
