import type { RuntimeEvent } from "./agent-runtime";
import type { UIEvent } from "./ui-protocol";

const textChunkCounters = new Map<string, number>();

type SubagentPayloadEvent = Extract<
  UIEvent,
  {
    type:
      | "text.chunk"
      | "thinking.chunk"
      | "tool.start"
      | "tool.progress"
      | "tool.complete"
      | "runtime.status";
  }
>;

type PayloadRuntimeEvent = Extract<
  RuntimeEvent,
  {
    kind:
      | "text-chunk"
      | "thinking-chunk"
      | "tool-start"
      | "tool-progress"
      | "tool-complete"
      | "runtime-status";
  }
>;

function turnCounterKey(sessionId: string, turnId: string): string {
  return `${sessionId}:${turnId}`;
}

function nextTextChunkIndex(sessionId: string, turnId: string): number {
  const key = turnCounterKey(sessionId, turnId);
  const next = (textChunkCounters.get(key) ?? 0) + 1;
  textChunkCounters.set(key, next);
  return next;
}

function subagentEvent(
  sessionId: string,
  turnId: string,
  parentToolId: string,
  event: SubagentPayloadEvent,
): UIEvent {
  return {
    type: "execution.subagent.event",
    sessionId,
    turnId,
    parentToolId,
    subagentId: parentToolId,
    event,
    timestamp: Date.now(),
  };
}

function payloadEvent(
  evt: PayloadRuntimeEvent,
  base: { sessionId: string; turnId: string },
  skipTextChunkCounter: boolean,
): SubagentPayloadEvent {
  switch (evt.kind) {
    case "text-chunk":
      return {
        ...base,
        type: "text.chunk",
        content: evt.payload.content,
        index: skipTextChunkCounter
          ? 0
          : nextTextChunkIndex(base.sessionId, base.turnId),
        parentToolId: evt.payload.parentToolId,
      };
    case "thinking-chunk":
      return {
        ...base,
        type: "thinking.chunk",
        content: evt.payload.content,
        parentToolId: evt.payload.parentToolId,
      };
    case "tool-start":
      return {
        ...base,
        type: "tool.start",
        toolId: evt.payload.toolId,
        toolName: evt.payload.toolName,
        input: evt.payload.input,
        isReady: evt.payload.isReady,
        parentToolId: evt.payload.parentToolId,
      };
    case "tool-progress":
      return {
        ...base,
        type: "tool.progress",
        toolId: evt.payload.toolId,
        toolName: evt.payload.toolName,
        partialInput: evt.payload.partialInput ?? "",
        input: evt.payload.input,
        isReady: evt.payload.isReady,
        parentToolId: evt.payload.parentToolId,
      };
    case "tool-complete":
      return {
        ...base,
        type: "tool.complete",
        toolId: evt.payload.toolId,
        output: evt.payload.output,
        isError: evt.payload.isError,
        status: evt.payload.status,
        parentToolId: evt.payload.parentToolId,
      };
    case "runtime-status":
      return {
        ...base,
        type: "runtime.status",
        id: evt.payload.id,
        label: evt.payload.label,
        detail: evt.payload.detail,
        status: evt.payload.status,
        parentToolId: evt.payload.parentToolId,
      };
  }
}

export function translateRuntimeEventToUIEvent(
  evt: RuntimeEvent,
  sessionId: string,
  turnId: string,
  options: { countTextChunks?: boolean } = {},
): UIEvent | null {
  const base = { sessionId, turnId };
  const skipTextChunkCounter = options.countTextChunks === false;

  switch (evt.kind) {
    case "turn-start":
      textChunkCounters.set(turnCounterKey(sessionId, turnId), 0);
      return { ...base, type: "turn.start", timestamp: evt.payload.timestamp };
    case "text-chunk":
    case "thinking-chunk":
    case "tool-start":
    case "tool-progress":
    case "tool-complete":
    case "runtime-status": {
      const event = payloadEvent(evt, base, skipTextChunkCounter);
      return evt.payload.parentToolId
        ? subagentEvent(sessionId, turnId, evt.payload.parentToolId, event)
        : event;
    }
    case "mode-update":
      return {
        ...base,
        type: "mode.update",
        modeId: evt.payload.modeId,
        label: evt.payload.label,
      };
    case "plan-item":
      return {
        ...base,
        type: "plan.item",
        itemId: evt.payload.itemId,
        content: evt.payload.content,
      };
    case "execution-task-update":
      return {
        ...base,
        type: "execution.task.update",
        taskId: evt.payload.taskId,
        parentToolId: evt.payload.parentToolId,
        ordinal: evt.payload.ordinal,
        title: evt.payload.title,
        detail: evt.payload.detail,
        status: evt.payload.status,
        agentType: evt.payload.agentType,
        prompt: evt.payload.prompt,
        taskType: evt.payload.taskType,
        blockedBy: evt.payload.blockedBy,
        output: evt.payload.output,
        timestamp: evt.payload.timestamp,
      };
    case "execution-subagent-start":
      return {
        ...base,
        type: "execution.subagent.start",
        parentToolId: evt.payload.parentToolId,
        subagentId: evt.payload.subagentId,
        agentType: evt.payload.agentType,
        agentName: evt.payload.agentName,
        description: evt.payload.description,
        prompt: evt.payload.prompt,
        title: evt.payload.title,
        taskId: evt.payload.taskId,
        ordinal: evt.payload.ordinal,
        status: evt.payload.status,
        timestamp: evt.payload.timestamp,
      };
    case "execution-subagent-complete":
      return {
        ...base,
        type: "execution.subagent.complete",
        parentToolId: evt.payload.parentToolId,
        subagentId: evt.payload.subagentId,
        status: evt.payload.status,
        output: evt.payload.output,
        timestamp: evt.payload.timestamp,
      };
    case "turn-complete":
      textChunkCounters.delete(turnCounterKey(sessionId, turnId));
      return {
        ...base,
        type: "turn.complete",
        result: evt.payload.result,
        content: evt.payload.content,
        error: evt.payload.error,
        sdkSessionId: evt.payload.sdkSessionId,
        final: evt.payload.final,
        timestamp: Date.now(),
      };
    case "steer-message":
      return {
        ...base,
        type: "steer.message",
        messageId: evt.payload.messageId,
        text: evt.payload.text,
        content: evt.payload.content,
        status: evt.payload.status,
        timestamp: evt.payload.timestamp,
      };
    case "session-info":
      return {
        ...base,
        type: "session.info",
        skills: evt.payload.skills,
        slashCommands: evt.payload.slashCommands,
        agents: evt.payload.agents,
      };
    case "mcp-status":
      return {
        ...base,
        type: "mcp.status",
        servers: evt.payload.servers,
        tools: evt.payload.tools,
      };
    case "memory-recall":
      return {
        ...base,
        type: "memory.recall",
        mode: evt.payload.mode,
        memories: evt.payload.memories,
      };
    case "prompt-suggestion":
      return {
        ...base,
        type: "prompt.suggestion",
        suggestion: evt.payload.suggestion,
      };
    case "context-usage":
      return {
        ...base,
        type: "context.usage",
        phase: evt.payload.phase,
        percentage: evt.payload.percentage,
        limit: evt.payload.limit,
        usage: evt.payload.usage,
      };
    case "context-warning":
      return {
        ...base,
        type: "context.warning",
        level: evt.payload.level,
        message: evt.payload.message,
        percentage: evt.payload.percentage,
      };
    case "token-usage":
      return {
        ...base,
        type: "usage",
        usage: evt.payload.usage,
      };
    case "approval-request":
      return {
        type: "approval.request",
        sessionId,
        turnId,
        requestId: evt.payload.requestId,
        toolName: evt.payload.toolName,
        reason: evt.payload.reason,
        timeout: evt.payload.timeout,
        allowSession:
          typeof evt.payload.allowSession === "boolean"
            ? evt.payload.allowSession
            : true,
      };
    case "error":
      return {
        ...base,
        type: "error",
        code: evt.payload.code,
        message: evt.payload.message,
        recoverable: evt.payload.recoverable,
      };
    default:
      return null;
  }
}
