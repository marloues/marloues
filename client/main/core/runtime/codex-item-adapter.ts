import { workflowToolResult } from "@shared/workflow-tool-result";
import type { NormalizedThreadItem } from "../../codex/normalize";
import type { WorkflowTurnItem } from "@shared/workflow-read-thread-contract";
import { messageItemToWorkflowTurnItem } from "@shared/adapters/message-item-to-workflow-turn-item";
import { textOutputFromUnknown } from "@shared/adapters/runtime-event-to-turn-item";

/** Codex-specific fields are interpreted here, before entering the host contract. */
export function codexItemToWorkflowTurnItem(
  item: NormalizedThreadItem,
): WorkflowTurnItem {
  const fallback = messageItemToWorkflowTurnItem(item);
  const raw = record(item.rawItem);
  if (!raw) return fallback;
  const base = { id: item.id, settled: fallback.settled };
  const status =
    item.status === "in_progress" || item.status === "inProgress"
      ? "running"
      : item.status || "running";
  switch (raw.type) {
    case "plan":
      return { ...base, type: "plan", text: string(raw.text) };
    case "dynamicToolCall":
      return {
        ...base,
        type: "dynamicToolCall",
        tool: string(raw.tool) || "tool",
        arguments: raw.arguments,
        status,
        success: typeof raw.success === "boolean" ? raw.success : undefined,
        output: textOutputFromUnknown(raw.output ?? raw.result),
        result: workflowToolResult(raw.output ?? raw.result),
      };
    case "collabAgentToolCall":
      return {
        ...base,
        type: "collabAgentToolCall",
        tool: string(raw.tool) || "agent",
        status,
        senderThreadId: optionalString(raw.senderThreadId),
        receiverThreadIds: Array.isArray(raw.receiverThreadIds)
          ? raw.receiverThreadIds.filter(
              (id): id is string => typeof id === "string",
            )
          : undefined,
        prompt: optionalString(raw.prompt),
        model: optionalString(raw.model),
        reasoningEffort: optionalString(raw.reasoningEffort),
      };
    case "imageView":
      return { ...base, type: "imageView", path: string(raw.path) };
    case "imageGeneration":
      return {
        ...base,
        type: "imageGeneration",
        status,
        result: raw.result,
        savedPath: optionalString(raw.savedPath),
        revisedPrompt: optionalString(raw.revisedPrompt),
      };
    case "enteredReviewMode":
    case "exitedReviewMode":
      return { ...base, type: raw.type, review: raw.review };
    case "hookPrompt":
      return {
        ...base,
        type: "hookPrompt",
        fragmentCount:
          typeof raw.fragmentCount === "number" ? raw.fragmentCount : 0,
      };
    case "permissionRequest":
      return {
        ...base,
        type: "permissionRequest",
        toolName: string(raw.toolName) || "tool",
        reason: string(raw.reason),
        status,
      };
    case "contextCompaction":
      return { ...base, type: "contextCompaction" };
  }
  if (fallback.type === "fileChange" && Array.isArray(raw.changes)) {
    return {
      ...fallback,
      changes: raw.changes.flatMap((value) => {
        const change = record(value);
        return change && typeof change.path === "string"
          ? [
              {
                path: change.path,
                kind:
                  string(change.kind) ||
                  string(record(change.kind)?.type) ||
                  "update",
                diff: textOutputFromUnknown(change.diff),
              },
            ]
          : [];
      }),
    };
  }
  if (fallback.type === "webSearch") return { ...fallback, action: raw.action };
  if (fallback.type === "mcpToolCall")
    return { ...fallback, output: textOutputFromUnknown(item.result), result: workflowToolResult(item.result) };
  return fallback;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
