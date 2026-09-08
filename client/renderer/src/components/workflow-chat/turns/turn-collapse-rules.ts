import { workflowStatusIsRunning } from "../adapter/item-status";
import { isTaskManagementToolName } from "@shared/execution-tools";
export { workflowStatusIsRunning } from "../adapter/item-status";
import type {
  WorkflowMessageBlock as WorkflowMessageBlock,
  WorkflowTurnItem,
} from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import {
  codexActivityGrouping,
  codexActivityShouldRenderStandalone,
} from "../activity/codex-activity-contract";

type AgentMessageItem = Extract<WorkflowTurnItem, { type: "agentMessage" }>;
export type WorkflowProcessItem = Exclude<
  WorkflowTurnItem,
  AgentMessageItem | { type: "userMessage" }
>;

export type WorkflowActivityGroupViewState = {
  showSummary: boolean;
  summaryExpanded: boolean;
  showDetail: boolean;
};

export type WorkflowTurnRuntimeState = {
  activity: WorkflowMessageBlock["activity"];
  status: WorkflowMessageBlock["status"];
  isLastStreaming: boolean;
};

export function workflowTurnStateKey(scope: string, messageId: string): string {
  return `${scope}:${messageId}`;
}

export function workflowTurnIsCompleted(
  message: Pick<WorkflowMessageBlock, "activity" | "status">,
): boolean {
  return message.activity === "done" || message.status === "completed";
}

export function workflowTurnDefaultCollapsed(
  message: Pick<WorkflowMessageBlock, "activity" | "status">,
): boolean {
  return workflowTurnIsCompleted(message);
}

export function workflowTurnShouldCollapseAfterRuntime(
  message: Pick<WorkflowMessageBlock, "activity" | "status">,
  previous: WorkflowTurnRuntimeState | undefined,
  isLastStreaming: boolean,
): boolean {
  if (isLastStreaming) return false;
  if (!workflowTurnIsCompleted(message)) return false;
  const wasIncomplete = previous != null && !workflowTurnIsCompleted(previous);
  const streamingJustStopped =
    previous?.isLastStreaming === true && !isLastStreaming;
  return wasIncomplete || streamingJustStopped;
}

export function workflowActivityGroupViewState(
  parentExpanded: boolean,
  summaryExpanded: boolean,
): WorkflowActivityGroupViewState {
  if (parentExpanded) {
    return {
      showSummary: true,
      summaryExpanded,
      showDetail: summaryExpanded,
    };
  }

  return {
    showSummary: true,
    summaryExpanded,
    showDetail: summaryExpanded,
  };
}

export function workflowShouldShowProcessItem(
  item: WorkflowProcessItem,
): boolean {
  // Execution plans belong to task progress; permission decisions belong to
  // the interaction area. Questions share the protocol type but remain in chat.
  if (item.type === "plan") return false;
  if (item.type === "permissionRequest" && !item.question) return false;
  if (item.type === "dynamicToolCall" || item.type === "mcpToolCall") {
    const name = item.tool.toLowerCase().split(/[.:/]/).at(-1) ?? "";
    if (
      ["update_plan", "plan_snapshot", "todowrite", "todo_write"].includes(
        name,
      ) ||
      isTaskManagementToolName(name)
    )
      return false;
  }
  if (item.type === "reasoning")
    return Boolean(
      item.encrypted ||
      item.summary.trim() ||
      item.content?.some((part) => part.text.trim()),
    );
  return codexActivityGrouping(item) !== "hidden";
}

export function workflowShouldShowActivityItem(
  item: WorkflowProcessItem,
): boolean {
  if (!workflowShouldShowProcessItem(item)) return false;
  if (workflowIsResultCardSourceItem(item)) {
    if (item.type === "webSearch" || item.type === "dynamicToolCall")
      return true;
    // A live file edit is process information. It becomes a result card only
    // after the runtime settles it, so it must not disappear between those
    // two phases.
    if (
      item.type === "fileChange" &&
      (workflowItemIsRunning(item) ||
        [
          "failed",
          "error",
          "denied",
          "timed_out",
          "rejected",
          "cancelled",
          "canceled",
          "stopped",
        ].includes(String(item.status)))
    )
      return true;
    return false;
  }
  if (item.type === "imageView") return Boolean(item.path);
  if (item.type === "imageGeneration" && (item.result || item.savedPath))
    return false;
  return true;
}

export function workflowIsCollapsibleActivityItem(
  item: WorkflowProcessItem,
): boolean {
  return codexActivityGrouping(item) === "groupable";
}

export function workflowShouldKeepSingleActivityItem(
  items: WorkflowProcessItem[],
): boolean {
  return codexActivityShouldRenderStandalone(items, workflowItemIsRunning);
}

export function workflowIsResultCardSourceItem(
  item: WorkflowProcessItem,
): boolean {
  if (item.type === "fileChange") return item.changes.length > 0;
  if (item.type === "imageGeneration")
    return Boolean(item.result || item.savedPath);
  if (item.type === "webSearch") return true;
  if (item.type === "dynamicToolCall")
    return workflowLayoutToolName(item) === "js";
  return false;
}

export function workflowItemIsRunning(item: WorkflowProcessItem): boolean {
  if (!("status" in item)) return false;
  return workflowStatusIsRunning(item.status);
}

export function workflowLayoutToolName(item: WorkflowProcessItem): string {
  if (item.type === "mcpToolCall")
    return [item.server, item.tool].filter(Boolean).join(".") || item.tool;
  if (item.type === "dynamicToolCall") return item.tool.toLowerCase();
  return item.type;
}
