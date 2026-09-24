import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  hasToolCall,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { createClient } from "@/lib/supabase/server";
import { buildConciergeTools } from "@/lib/ai/tools";
import { readMemberFavourites, readMemberSavedTrips } from "@/lib/ai/memberData";
import { SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { consumeRateLimit } from "@/lib/ai/rateLimit";
import { triageMessage, type RemovedKind } from "@/lib/ai/triage";
import {
  dropProviderExecutedTools,
  dropUnansweredToolCalls,
} from "@/lib/ai/sanitiseHistory";
import { describePageContext, sanitisePageContext } from "@/lib/ai/pageContext";
import { isValidResidencyCode, residencyFromAcceptLanguage } from "@/lib/countries";
import {
  CHAT_MODEL,
  MAX_MESSAGE_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_STEPS,
  MAX_TURNS,
  MAX_WEB_SEARCHES,
  WEB_SEARCH_ALLOWED_DOMAINS,
} from "@/lib/ai/config";

/* The concierge chat route.
 *
 * This is the proxy: ANTHROPIC_API_KEY is read here and nowhere else, and never
 * reaches the browser — the same posture the Directus and Ratehawk credentials
 * follow. The browser talks only to this route.
 *
 * Order matters. Session, then rate limit, then input caps, then a cheap triage
 * pass — every rejection happens before any spend on the conversation model. */

export const runtime = "nodejs";

/** The words the visitor last read from the concierge: its prose, plus the
 * framing and follow-up of a presentResults call — which is where most answers
 * and nearly every offer live, and which carry no text part of their own. */
function previousReplyText(history: UIMessage[]): string {
  const last = [...history].reverse().find((message) => message.role === "assistant");
  if (!last) return "";
  const pieces: string[] = [];
  for (const part of last.parts ?? []) {
    if (part.type === "text") {
      pieces.push((part as { text: string }).text);
    } else if (part.type === "tool-presentResults") {
      const input = (part as { input?: { framing?: unknown; followUp?: unknown } }).input;
      if (typeof input?.framing === "string") pieces.push(input.framing);
      if (typeof input?.followUp === "string") pieces.push(input.followUp);
    }
  }
  return pieces.join("\n");
}
/* 180s (Ulrik, 2026-09-16). At 60 a two-city trip with flights — Tokyo and
   Kyoto from Copenhagen, measured at 110s locally — would be cut off by Vercel
   mid-answer, leaving the panel on "Thinking…". 300 was judged too long for
   anyone to wait. The panel gives up a little before this (AiConversation's
   ANSWER_LIMIT_MS), so the visitor reads a message rather than losing the
   connection. */
export const maxDuration = 180;

/** The member's preferred airlines, as stored by Personal Information: one
 * array element holding a comma-separated list. Scrubbed like page context —
 * it ends up in a system block — and capped. */
function readPreferredAirlines(stored: unknown): string[] {
  const raw = Array.isArray(stored) ? stored : [];
  return [
    ...new Set(
      raw
        .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
        .map((name) => name.replace(/[^\p{L}\p{N} .&'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40))
        .filter(Boolean)
    ),
  ].slice(0, 10);
}

function reject(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Server-side "today", so relative dates resolve correctly. */
function todayNote(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today's date is ${today}. Resolve every relative date against it — a bare month or season means its next occurrence, never one already past.`;
}

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_AI_CHAT_ENABLED !== "1") {
    return reject(404, "Not found");
  }

  // 1. Session gate. Members-only at launch, and deliberately the first check
  //    after the flag: an unauthenticated caller should learn nothing about our
  //    configuration, so the missing-key case is answered below it.
  let userId: string;
  let preferredAirlines: string[] = [];
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return reject(401, "Please sign in to use the concierge.");
    userId = data.user.id;

    /* Their preferred airlines lead every flight answer where the connection
       is sensible (Ulrik, 2026-09-15). Read here, from their own profile row,
       rather than sent by the browser. A failure costs only the ordering. */
    const { data: profile } = await supabase
      .from("member_profiles")
      .select("preferred_airlines")
      .eq("user_id", userId)
      .maybeSingle();
    preferredAirlines = readPreferredAirlines(profile?.preferred_airlines);
  } catch {
    return reject(401, "Please sign in to use the concierge.");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[ai chat] ANTHROPIC_API_KEY is not set");
    return reject(503, "The concierge is unavailable right now.");
  }

  // 2. Rate limit.
  const limit = consumeRateLimit(userId);
  if (!limit.allowed) {
    return Response.json(
      { error: "You've reached today's limit for the concierge." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  // 3. Input caps.
  let messages: UIMessage[];
  let pageContext: ReturnType<typeof sanitisePageContext> = null;
  let residency = "";
  try {
    const body = (await req.json()) as {
      messages?: UIMessage[];
      pageContext?: unknown;
      residency?: unknown;
    };
    messages = Array.isArray(body.messages) ? body.messages : [];
    // The passport country for supplier calls (§32), validated against the
    // country list. Never reaches the model. Without a valid one the request's
    // own Accept-Language region stands in, the same signal the browser-side
    // guess reads — not a fixed country.
    residency =
      typeof body.residency === "string" && isValidResidencyCode(body.residency)
        ? body.residency.toLowerCase()
        : residencyFromAcceptLanguage(req.headers.get("accept-language"));
    // Whitelisted and scrubbed before it goes anywhere near a system block —
    // the browser sends it, so it is forgeable. See lib/ai/pageContext.ts for
    // why the sanitiser is as blunt as it is.
    pageContext = sanitisePageContext(body.pageContext);
  } catch {
    return reject(400, "Invalid request.");
  }
  if (!messages.length) return reject(400, "Nothing to answer.");

  const latest = messages[messages.length - 1];
  const latestText = (latest?.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();

  if (latest?.role !== "user" || !latestText) return reject(400, "Nothing to answer.");
  if (latestText.length > MAX_MESSAGE_CHARS) {
    return reject(413, "That message is a little long — could you shorten it?");
  }

  // Keep the tail. A landing-page exchange that outgrows this is better
  // restarted than silently compacted into something the visitor can't see.
  const trimmed = messages.slice(-MAX_TURNS);

  // 4. Cheap triage before any conversation-model spend.
  //
  //    A decline is streamed back as a normal assistant message rather than a
  //    JSON error, so the client has one code path and the visitor sees a
  //    reply rather than a failure. It costs nothing beyond the Haiku call.
  //
  //    With the concierge's previous reply as context, so a follow-up that
  //    takes up its own offer ("List the others") is not read in isolation
  //    and declined as off-topic. See triage.ts.
  const verdict = await triageMessage(latestText, previousReplyText(trimmed.slice(0, -1)));
  if (verdict.allow === false) {
    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute({ writer }) {
          const id = "refusal";
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: verdict.reply });
          writer.write({ type: "text-end", id });
        },
      }),
    });
  }

  // A mixed message goes on as its travel request alone (triage.ts), and so do
  // earlier ones: each answer to one carries the rewrite in its metadata, and
  // the question before it is replaced on every later turn, so the removed part
  // never reaches the model on the way back either.
  const travelOnly = verdict.travelOnly;
  const modelHistory = withTravelOnlyQuestions(trimmed, travelOnly?.text);

  /* When the removed part asked about another guest, the hotel or restaurant
     open on the page is left out of what the model is told (2026-09-23).
     "Which hotel did my colleague pick?" came back opening on "Cheval Blanc -
     the one you were looking at": the visitor's own selection, but read right
     after "I can't see other guests' bookings" it looked like the colleague's.
     Structural rather than a prompt line, so no property can be tied to them. */
  const pageContextNote = describePageContext(
    pageContext && travelOnly?.removed === "PRIVACY"
      ? { ...pageContext, hotelName: undefined, restaurantName: undefined }
      : pageContext
  );

  // 5. The conversation.
  const result = streamText({
    model: anthropic(CHAT_MODEL),
    // Two system blocks, not one string. The cache breakpoint sits on the
    // stable prompt; today's date follows it, uncached. Appending the date to
    // the prompt itself would invalidate the cached prefix for every user every
    // day — and the call-level cacheControl this replaces cached the LAST
    // block, which would have been the volatile one, so the cache never hit.
    //
    // Page context follows the date, for the same reason and on the same side
    // of the breakpoint: it changes on every navigation, so folding it into
    // the prompt would invalidate the cached prefix for everyone.
    instructions: [
      {
        role: "system" as const,
        content: SYSTEM_PROMPT,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      { role: "system" as const, content: todayNote() },
      ...(pageContextNote
        ? [{ role: "system" as const, content: pageContextNote }]
        : []),
      ...(travelOnly
        ? [{ role: "system" as const, content: removedPartNote(travelOnly.removed) }]
        : []),
      ...(preferredAirlines.length
        ? [
            {
              role: "system" as const,
              content:
                `The visitor's preferred airlines, from their member profile: ${preferredAirlines.join(", ")}. ` +
                "searchFlights puts sensible options on them first; in every flight answer, " +
                "name those first when there are any.",
            },
          ]
        : []),
    ],
    /* Repaired, not trusted, in two passes — a history carrying a tool call
       with no result is rejected outright, and so is one carrying the web
       search's provider-executed parts. Neither is something the client can
       reliably avoid persisting. The search parts go BEFORE conversion, where
       `providerExecuted` is still visible on them. */
    messages: dropUnansweredToolCalls(
      await convertToModelMessages(dropProviderExecutedTools(modelHistory))
    ),
    tools: {
      ...buildConciergeTools({
        preferredAirlines,
        residency,
        // Their own favourites and saved trips, read with their own session
        // and only when the model asks (lib/ai/memberData.ts). Read only.
        member: {
          favourites: () => readMemberFavourites(supabase, userId),
          savedTrips: () => readMemberSavedTrips(supabase, userId),
        },
      }),
      // Anthropic's own server-side search. maxUses is enforced upstream, so
      // the model cannot exceed the cap even if it tries, and the allow-list
      // keeps this a travel-reference tool rather than a general web search.
      // The 2025 version, deliberately (Ulrik, 2026-09-23): the 2026 one lets
      // the model filter results by running Python, which it also used to
      // call our own searchHotels - an extra round trip each time, for
      // nothing measurable.
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: MAX_WEB_SEARCHES,
        allowedDomains: WEB_SEARCH_ALLOWED_DOMAINS,
      }),
    },
    // presentResults ends the turn. It used to be followed by one more model
    // round trip that emitted a single short sentence — measured at 2.4s of a
    // 26.6s answer for 30 tokens. That sentence is now the tool's own
    // `followUp` field, so the answer and the question arrive together.
    stopWhen: [stepCountIs(MAX_TOOL_STEPS), hasToolCall("presentResults")],
    /* THE LAST STEP IS FOR ANSWERING (2026-09-15). A family ski question spent
       all eight steps searching and checking other weeks, and the turn ended
       with nothing on screen — once with presentResults cut off mid-stream,
       once without it. On the final step only presentResults is offered, so
       the model either presents what it has or says so in prose. */
    prepareStep: ({ stepNumber }) =>
      stepNumber >= MAX_TOOL_STEPS - 1 ? { activeTools: ["presentResults"] } : undefined,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // Stop, or the panel giving up, ends the model call and its tools too —
    // without this the answer carried on (and cost) after nobody was waiting.
    abortSignal: req.signal,
    onError({ error }) {
      console.error("[ai chat]", error);
    },  });

  return result.toUIMessageStreamResponse(
    travelOnly
      ? { messageMetadata: ({ part }) => (part.type === "start" ? { travelOnly: travelOnly.text } : undefined) }
      : undefined
  );
}

/** The history the model sees: every question a mixed-message rewrite answered
 * replaced by that rewrite, the latest by this request's own. */
function withTravelOnlyQuestions(history: UIMessage[], latestRewrite?: string): UIMessage[] {
  const asked = (message: UIMessage, text: string): UIMessage => ({
    ...message,
    parts: [{ type: "text", text }],
  });
  return history.map((message, index) => {
    if (message.role !== "user") return message;
    if (index === history.length - 1) return latestRewrite ? asked(message, latestRewrite) : message;
    const answer = history[index + 1];
    const rewrite = (answer?.metadata as { travelOnly?: unknown } | undefined)?.travelOnly;
    return answer?.role === "assistant" && typeof rewrite === "string" && rewrite.trim()
      ? asked(message, rewrite.trim())
      : message;
  });
}

/** Told to the model when part of the visitor's message was taken out. */
function removedPartNote(removed: RemovedKind): string {
  const base =
    "Part of the visitor's latest message was removed before it reached you, because it was " +
    "not a travel request; the message you see is the travel part alone. Answer it as usual. " +
    "Never guess at, quote or discuss what was removed.";
  if (removed === "ACCOUNT") {
    return (
      `${base} It asked you to change something stored in their account: add one sentence that ` +
      "you cannot change it from here, and where they can — ADD TO FAVOURITES and SAVE TO TRIP " +
      "on each hotel, restaurant and flight, and their profile, favourites and saved trips under " +
      "Members. Never say you have done it."
    );
  }
  // Saying it reveals nothing: having no access to anyone else is the point.
  if (removed === "PRIVACY") {
    return (
      `${base} It asked about another person's booking or trip: say in one short clause that you ` +
      "cannot see other guests' bookings, then answer the travel request."
    );
  }
  return (
    `${base} If anything needs acknowledging, one short clause is enough: that you can only help ` +
    "with the trip itself."
  );
}
