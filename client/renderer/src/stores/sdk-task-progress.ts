import type { WorkflowReadThreadResponse } from "@shared/workflow-read-thread-contract";
import {
  isTaskCreateToolName,
  isTaskUpdateToolName,
} from "@shared/execution-tools";
import type { ExecutionTaskRecord } from "./chat-slices/types";

export const SDK_TASK_TYPE = "sdk-task-management";

/** Recover SDK task progress when the host supplies tool records only. */
export function restoreSdkTaskProgress(
  snapshot: WorkflowReadThreadResponse,
  previous: Record<string, ExecutionTaskRecord> = {},
): Record<string, ExecutionTaskRecord> {
  // Structured execution events remain authoritative on hosts that emit them.
  if (Object.values(previous).some((task) => task.taskType !== SDK_TASK_TYPE))
    return previous;
  const tasks = { ...previous };
  let changed = false;
  for (const turn of [...snapshot.turns].reverse()) {
    const timestamp =
      typeof turn.startedAt === "number"
        ? turn.startedAt
        : Date.parse(turn.startedAt ?? "") || 0;
    for (const item of turn.items) {
      if (
        (item.type !== "mcpToolCall" && item.type !== "dynamicToolCall") ||
        !["completed", "done"].includes(item.status)
      )
        continue;
      const name = item.tool.split(/[.:/]/).at(-1) ?? "";
      if (!isTaskCreateToolName(name) && !isTaskUpdateToolName(name)) continue;
      const args = item.arguments;
      if (!args || typeof args !== "object" || Array.isArray(args)) continue;
      const record = args as Record<string, unknown>;
      const rawId =
        record.taskId ??
        record.task_id ??
        item.output?.text.match(/\bTask\s+#([^\s:]+)/i)?.[1];
      if (typeof rawId !== "string" && typeof rawId !== "number") continue;
      const id = `sdk-task:${rawId}`;
      const existing = tasks[id];
      if (isTaskUpdateToolName(name) && !existing) continue;
      if (record.status === "deleted") {
        delete tasks[id];
        changed = true;
        continue;
      }
      const title =
        typeof record.subject === "string" ? record.subject : existing?.title;
      if (!title) continue;
      const status =
        record.status === "completed"
          ? "completed"
          : record.status === "in_progress"
            ? "running"
            : record.status === "pending"
              ? "creating"
              : (existing?.status ?? "creating");
      tasks[id] = {
        id,
        taskType: SDK_TASK_TYPE,
        turnId: turn.id,
        title,
        detail:
          typeof record.description === "string"
            ? record.description
            : existing?.detail,
        status,
        ordinal:
          existing?.ordinal ??
          Object.values(tasks).reduce(
            (max, task) => Math.max(max, task.ordinal),
            0,
          ) + 1,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      changed = true;
    }
  }
  return changed ? tasks : previous;
}
