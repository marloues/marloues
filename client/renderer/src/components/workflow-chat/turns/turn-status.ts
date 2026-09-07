import type { WorkflowMessageBlock } from "../../../../../shared/adapters/workflow-messages-to-read-thread";

export function workflowTurnStatusTone(message: WorkflowMessageBlock): string {
  if (message.activity === "failed") return "is-danger";
  return "is-muted";
}

export function workflowTurnStatusLabel(
  message: WorkflowMessageBlock,
  options: { hasActivityItems?: boolean; isLastStreaming?: boolean } = {},
): string {
  if (message.status === "cancelled") return "已取消";
  if (message.activity === "failed" || message.status === "failed")
    return "任务失败";
  if (message.activity === "done" || message.status === "completed")
    return "耗时";
  if (options.isLastStreaming && options.hasActivityItems) return "处理中";
  return "处理中";
}

export function workflowTurnDurationLabel(
  durationMs: number | null,
  _options: { running?: boolean } = {},
): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0)
    return "";
  if (durationMs < 1000) return "";
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0
    ? `${minutes}分钟 ${remainingSeconds}秒`
    : `${minutes}分钟`;
}
