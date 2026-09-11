export const MARLOUES_ACP_EXTENSION_NAMESPACE = "com.marloues";

export const MARLOUES_ACP_META_KEYS = {
  source: "com.marloues.source",
  nativeType: "com.marloues.nativeType",
  itemType: "com.marloues.itemType",
  userContent: "com.marloues.userContent",
  parentToolId: "com.marloues.parentToolId",
  modeLabel: "com.marloues.mode.label",
  reason: "com.marloues.reason",
  timeout: "com.marloues.timeout",
} as const;

export const MARLOUES_ACP_EXTENSION_NAMES = {
  contextCompaction: "context.compaction",
  subagentStart: "execution.subagent.start",
  subagentEvent: "execution.subagent.event",
  subagentComplete: "execution.subagent.complete",
  taskUpdate: "execution.task.update",
  sessionInfo: "session.info",
} as const;
