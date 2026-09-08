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
import { conciergeTools } from "@/lib/ai/tools";
import { SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { consumeRateLimit } from "@/lib/ai/rateLimit";
import { triageMessage } from "@/lib/ai/triage";
import {
  dropProviderExecutedTools,
  dropUnansweredToolCalls,
} from "@/lib/ai/sanitiseHistory";
import { describePageContext, sanitisePageContext } from "@/lib/ai/pageContext";
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
export const maxDuration = 60;

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
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return reject(401, "Please sign in to use the concierge.");
    userId = data.user.id;
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
  let pageContextNote = "";
  try {
    const body = (await req.json()) as { messages?: UIMessage[]; pageContext?: unknown };
    messages = Array.isArray(body.messages) ? body.messages : [];
    // Whitelisted and scrubbed before it goes anywhere near a system block —
    // the browser sends it, so it is forgeable. See lib/ai/pageContext.ts for
    // why the sanitiser is as blunt as it is.
    pageContextNote = describePageContext(sanitisePageContext(body.pageContext));
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
  const verdict = await triageMessage(latestText);
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
    ],
    /* Repaired, not trusted, in two passes — a history carrying a tool call
       with no result is rejected outright, and so is one carrying the web
       search's provider-executed parts. Neither is something the client can
       reliably avoid persisting. The search parts go BEFORE conversion, where
       `providerExecuted` is still visible on them. */
    messages: dropUnansweredToolCalls(
      await convertToModelMessages(dropProviderExecutedTools(trimmed))
    ),
    tools: {
      ...conciergeTools,
      // Anthropic's own server-side search. maxUses is enforced upstream, so
      // the model cannot exceed the cap even if it tries, and the allow-list
      // keeps this a travel-reference tool rather than a general web search.
      web_search: anthropic.tools.webSearch_20260209({
        maxUses: MAX_WEB_SEARCHES,
        allowedDomains: WEB_SEARCH_ALLOWED_DOMAINS,
      }),
    },
    // presentResults ends the turn. It used to be followed by one more model
    // round trip that emitted a single short sentence — measured at 2.4s of a
    // 26.6s answer for 30 tokens. That sentence is now the tool's own
    // `followUp` field, so the answer and the question arrive together.
    stopWhen: [stepCountIs(MAX_TOOL_STEPS), hasToolCall("presentResults")],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    onError({ error }) {
      console.error("[ai chat]", error);
    },
  });

  return result.toUIMessageStreamResponse();
}
