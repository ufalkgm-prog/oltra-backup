import "server-only";
import type { ModelMessage, UIMessage } from "ai";

/* Removes the web search's own parts before the history is replayed.
 *
 * Anthropic's web search is a PROVIDER-EXECUTED tool: it runs on their side
 * and comes back as a part with `providerExecuted: true` and a `srvtoolu_`
 * id, not as a call we answer. Sent back on the next turn it arrives as a
 * result block with no `server_tool_use` before it, and the API rejects the
 * whole request:
 *
 *   messages.1.content.1: unexpected `tool_use_id` found in
 *   `code_execution_tool_result` blocks … Each `code_execution_tool_result`
 *   block must have a corresponding `server_tool_use` block before it.
 *
 * The damage is the same shape as an orphaned tool call, and worse in
 * practice: the turn that searched succeeds, and every turn after it 400s —
 * so answering the concierge's own follow-up question is what kills the
 * conversation, and a reload does not help, because the history is in
 * sessionStorage. dropUnansweredToolCalls cannot catch it: the part HAS its
 * output. It simply is not replayable.
 *
 * Dropping it loses nothing the model needs. What it learned from the search
 * is already in the reasoning and the answer it wrote at the time; only the
 * unreplayable envelope goes.
 */
export function dropProviderExecutedTools(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    const hasProviderExecuted = message.parts.some(
      (part) => (part as { providerExecuted?: boolean }).providerExecuted
    );
    if (!hasProviderExecuted) return message;

    /* The reasoning goes with it, and only from the messages actually being
       edited. Removing the search part alone traded one 400 for another:
       "`thinking` or `redacted_thinking` blocks in the latest assistant
       message cannot be modified. These blocks must remain as they were in
       the original response." The turn interleaved reasoning with its tool
       calls, so taking a block out of the middle left thinking that no longer
       matched what was sent. A turn we do not touch keeps its thinking intact
       and stays valid, which is why this is scoped rather than applied to
       every message. */
    const parts = message.parts.filter(
      (part) =>
        !(part as { providerExecuted?: boolean }).providerExecuted &&
        part.type !== "reasoning"
    );
    return { ...message, parts };
  });
}

/* Removes tool calls that never got a result.
 *
 * The Anthropic API rejects any request whose history contains a `tool_use`
 * with no matching `tool_result` — "Tool result is missing for tool call ...".
 * Two things produce that here, and both are ordinary rather than exotic:
 *
 *  - the tool loop stops at MAX_TOOL_STEPS with a call still in flight, so the
 *    last assistant message ends on an unanswered `tool_use`;
 *  - a request fails mid-stream, and the partial assistant turn is persisted by
 *    the client.
 *
 * Either way the conversation is then permanently broken: every subsequent turn
 * replays the orphan and 400s, and because the history lives in sessionStorage
 * the visitor cannot clear it by reloading. That is a bad failure — the feature
 * appears to work once and then refuses everything.
 *
 * So the route repairs the history rather than trusting it. This also heals
 * conversations that were poisoned before the fix existed, which matters
 * because those are already sitting in real browsers.
 */
export function dropUnansweredToolCalls(messages: ModelMessage[]): ModelMessage[] {
  const answered = new Set<string>();

  for (const message of messages) {
    if (message.role !== "tool" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part && typeof part === "object" && "toolCallId" in part) {
        answered.add(String((part as { toolCallId: unknown }).toolCallId));
      }
    }
  }

  const repaired: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      repaired.push(message);
      continue;
    }

    const kept = message.content.filter((part) => {
      if (!part || typeof part !== "object") return true;
      if ((part as { type?: unknown }).type !== "tool-call") return true;
      return answered.has(String((part as { toolCallId: unknown }).toolCallId));
    });

    // An assistant turn that was nothing but an unanswered call has no content
    // left; dropping it entirely is correct, since it said nothing.
    if (kept.length === 0) continue;

    repaired.push({ ...message, content: kept } as ModelMessage);
  }

  return repaired;
}
