import type { StoredMessage } from "../../store";
import type { WorkflowReadThreadResponse } from "../../../shared/workflow-read-thread-contract";

/** Persist the same host display segments that readThread supplies to the UI. */
export function storedMessagesForRuntimeTurn(
  snapshot: WorkflowReadThreadResponse,
  runtimeTurnId: string,
): StoredMessage[] {
  const segments = snapshot.turns.filter(
    (turn) =>
      turn.id === runtimeTurnId ||
      turn.id.startsWith(`${runtimeTurnId}:steer:`),
  );
  if (snapshot.page.order === "newest_first") segments.reverse();
  return segments.flatMap((turn): StoredMessage[] => {
    const user = turn.items.find((item) => item.type === "userMessage");
    const items = turn.items.filter((item) => item.type !== "userMessage");
    const startedAt = numericTime(turn.startedAt);
    const completedAt = numericTime(turn.completedAt);
    const timestamp = startedAt ?? completedAt ?? 0;
    const messages: StoredMessage[] = [];
    if (user?.type === "userMessage") {
      messages.push({
        id: user.id,
        turnId: turn.id,
        role: "user",
        content: user.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n"),
        userContent: user.content,
        userClientId: user.clientId,
        userSettled: user.settled,
        timestamp,
        status: "completed",
        items: [],
      });
    }
    messages.push({
      id: `assistant-${turn.id}`,
      turnId: turn.id,
      continuationFragment: turn.continuationFragment,
      continuesPreviousTurn: turn.continuesPreviousTurn,
      role: "assistant",
      content: items
        .filter((item) => item.type === "agentMessage")
        .map((item) => item.text)
        .join("\n\n"),
      error: turn.error?.message,
      errorDetails: turn.error?.additionalDetails,
      timestamp,
      startedAt,
      completedAt,
      durationMs: turn.durationMs,
      timing: turn.timing,
      status:
        turn.status === "failed" ||
        turn.status === "cancelled" ||
        turn.status === "running"
          ? turn.status
          : "completed",
      modelId: turn.modelId ?? undefined,
      modelName: turn.modelName ?? undefined,
      usage: turn.usage,
      items,
    });
    return messages;
  });
}

function numericTime(
  value: number | string | null | undefined,
): number | undefined {
  if (value == null) return undefined;
  const result =
    typeof value === "number" ? value : Number(value) || Date.parse(value);
  return Number.isFinite(result) ? result : undefined;
}
