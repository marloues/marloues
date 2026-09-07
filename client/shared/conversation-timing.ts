import type { RuntimeEvent } from "./agent-runtime";

/** Observed by the host event reducer, persisted with the turn, never inferred at mount. */
export interface ConversationTiming {
  workStartedAt: number | null;
  finalAnswerStartedAt: number | null;
  basis: "host-observed" | "codex-recorded";
}
export function observeConversationTiming(
  previous: ConversationTiming | undefined,
  event: RuntimeEvent,
  timestamp: number,
  turnStartedAt?: number,
): ConversationTiming | undefined {
  if (!Number.isFinite(timestamp)) return previous;
  let work: boolean;
  let final = false;
  if (event.kind === "item-updated") {
    const item = event.payload.item;
    final =
      item.type === "agentMessage" &&
      (item.phase === "final_answer" || item.phase === "final") &&
      Boolean(item.text.trim());
    work =
      (item.type === "agentMessage" &&
        item.phase === "commentary" &&
        Boolean(item.text.trim())) ||
      [
        "reasoning",
        "commandExecution",
        "fileChange",
        "mcpToolCall",
        "dynamicToolCall",
        "webSearch",
        "imageGeneration",
        "collabAgentToolCall",
        "contextCompaction",
      ].includes(item.type);
  } else
    work =
      event.kind === "thinking-chunk" ||
      (event.kind === "tool-start" && event.payload.isReady !== false);
  if (!work && !final) return previous;
  return {
    basis: "host-observed",
    workStartedAt:
      previous?.workStartedAt ?? (work ? (turnStartedAt ?? timestamp) : null),
    finalAnswerStartedAt:
      previous?.finalAnswerStartedAt ?? (final ? timestamp : null),
  };
}
