import "server-only";
import type { ModelMessage } from "ai";

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
