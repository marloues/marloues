import type { RuntimeEvent } from "@shared/agent-runtime";
import type { WorkflowTurnItem } from "@shared/workflow-read-thread-contract";
import { codexItemToWorkflowTurnItem } from "./codex-item-adapter";
import type { ThreadEvent } from "../../codex/service";

export function createBinaryEventAdapter(turnId: string) {
  const items = new Map<string, WorkflowTurnItem>();
  return (event: ThreadEvent): RuntimeEvent[] => {
    if (event.type === "turn.completed") {
      return [
        { kind: "turn-complete", payload: { turnId, result: "success" } },
      ];
    }
    if (event.type === "turn.failed") {
      const message = event.error?.message ?? "Binary runtime failed";
      return [
        {
          kind: "error",
          payload: {
            code: "BINARY_TURN_FAILED",
            message,
            recoverable: Boolean(event.error?.recoverable),
          },
        },
        {
          kind: "turn-complete",
          payload: { turnId, result: "error", error: message },
        },
      ];
    }
    if (event.type === "approval_requested" && event.approval) {
      return [
        {
          kind: "approval-request",
          payload: {
            requestId: event.approval.id,
            toolName: event.approval.tool,
            reason: JSON.stringify(event.approval.toolInput ?? {}),
            timeout: 120_000,
            allowSession: event.approval.allowSession,
          },
        },
      ];
    }
    if (!event.item) return [];
    if (event.item.type === "error") {
      const message =
        event.item.message ??
        event.item.error?.message ??
        "Binary runtime item error";
      return [
        {
          kind: "error",
          payload: { code: "BINARY_ITEM_ERROR", message, recoverable: true },
        },
      ];
    }
    const incoming = codexItemToWorkflowTurnItem(event.item);
    const previous = items.get(incoming.id);
    // Delta notifications contain a full text snapshot but may omit the role
    // provided by item.started. Preserve it until the runtime supplies a new role.
    const item =
      incoming.type === "agentMessage" && previous?.type === "agentMessage"
        ? { ...previous, ...incoming, phase: incoming.phase ?? previous.phase }
        : incoming;
    items.set(item.id, item);
    return [{ kind: "item-updated", payload: { turnId, item } }];
  };
}
