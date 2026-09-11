import type {
  PromptResponse,
  SessionNotification,
  SessionUpdate,
  ToolCall,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import { planEntriesFromText } from "./acp-event-to-workflow-item";
import {
  MARLOUES_ACP_EXTENSION_NAMES,
  MARLOUES_ACP_EXTENSION_NAMESPACE,
  MARLOUES_ACP_META_KEYS,
} from "./acp-extensions";
import type { ACPWorkflowEvent } from "./acp-types";

export interface CodexSessionRecord {
  type?: string;
  timestamp?: string | number;
  ordinal?: number;
  payload?: unknown;
}

interface CodexSessionContext {
  sessionId?: string;
  turnId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function timestamp(record: CodexSessionRecord): number | undefined {
  if (typeof record.timestamp === "number") return record.timestamp;
  if (typeof record.timestamp === "string") {
    const parsed = Date.parse(record.timestamp);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const record = asRecord(block);
        const text = record ? string(record.text) : undefined;
        return text ?? "";
      })
      .join("");
  }
  return "";
}

function textFromSummary(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        const record = asRecord(block);
        return record ? (string(record.text) ?? "") : "";
      })
      .join("");
  }
  return "";
}

function meta(nativeType: string) {
  return {
    [MARLOUES_ACP_META_KEYS.source]: "codex",
    [MARLOUES_ACP_META_KEYS.nativeType]: nativeType,
  };
}

function sessionUpdateEvent(
  sessionId: string,
  turnId: string | undefined,
  update: SessionUpdate,
  nativeType: string,
  raw: unknown,
  at?: number,
): ACPWorkflowEvent {
  const notification: SessionNotification = {
    sessionId,
    update,
    _meta: meta(nativeType),
  };
  return {
    type: "session/update",
    sessionId,
    turnId,
    notification,
    source: "codex",
    nativeType,
    rawEvent: raw,
    timestamp: at,
  };
}

function extension(
  sessionId: string | undefined,
  turnId: string | undefined,
  name: string,
  data: unknown,
  nativeType: string,
  at?: number,
): ACPWorkflowEvent {
  return {
    type: "extension",
    namespace: MARLOUES_ACP_EXTENSION_NAMESPACE,
    name,
    sessionId,
    turnId,
    data,
    source: "codex",
    nativeType,
    rawEvent: data,
    timestamp: at,
  };
}

function unknownEvent(
  record: CodexSessionRecord,
  sessionId: string | undefined,
  turnId: string | undefined,
): ACPWorkflowEvent {
  return {
    type: "unknown",
    sessionId,
    turnId,
    source: "codex",
    nativeType: record.type ?? "codex.unknown",
    raw: record,
    timestamp: timestamp(record),
  };
}

function commandString(command: unknown): string {
  if (typeof command === "string") return command;
  if (Array.isArray(command)) return command.join(" ");
  return "";
}

function toolStatus(
  status: unknown,
): "pending" | "in_progress" | "completed" | "failed" {
  switch (status) {
    case "pending":
      return "pending";
    case "running":
      return "in_progress";
    case "completed":
      return "completed";
    case "failed":
    case "error":
    case "cancelled":
      return "failed";
    default:
      return "completed";
  }
}

function usageFromTokenCount(info: unknown): {
  used: number;
  size: number;
  update: SessionUpdate;
} {
  const record = asRecord(info) ?? {};
  const total = asRecord(record.total_token_usage) ?? {};
  const used = number(total.total_tokens) ?? 0;
  const size = number(record.model_context_window) ?? used;
  return {
    used,
    size,
    update: {
      sessionUpdate: "usage_update",
      used,
      size,
      _meta: {
        ...meta("token_count"),
        raw: info,
      },
    },
  };
}

function translateCodexSessionRecord(
  record: CodexSessionRecord,
  context: CodexSessionContext,
): ACPWorkflowEvent[] {
  const payload = asRecord(record.payload);
  const at = timestamp(record);

  if (record.type === "session_meta" && payload) {
    const sessionId = string(payload.session_id) ?? string(payload.id);
    if (!sessionId) return [unknownEvent(record, undefined, undefined)];
    context.sessionId = sessionId;
    return [
      extension(
        sessionId,
        undefined,
        MARLOUES_ACP_EXTENSION_NAMES.sessionInfo,
        payload,
        record.type,
        at,
      ),
    ];
  }

  if (record.type === "token_usage_record" && payload) {
    const sessionId =
      string(payload.session_id) ?? string(payload.thread_id) ?? context.sessionId;
    const turnId =
      string(payload.turn_id) ?? string(payload.root_turn_id) ?? context.turnId;
    if (!sessionId) return [unknownEvent(record, undefined, turnId)];
    const usage = asRecord(payload.usage) ?? {};
    const used = number(usage.total_tokens) ?? 0;
    return [
      sessionUpdateEvent(
        sessionId,
        turnId,
        {
          sessionUpdate: "usage_update",
          used,
          size: number(payload.model_context_window) ?? used,
          _meta: { ...meta(record.type), raw: payload },
        },
        record.type,
        record,
        at,
      ),
    ];
  }

  if (record.type !== "event_msg" || !payload) {
    return [unknownEvent(record, undefined, undefined)];
  }

  const event = asRecord(payload) ?? {};
  const eventType = string(event.type);
  const turnId = string(event.turn_id) ?? context.turnId;
  if (string(event.turn_id)) context.turnId = string(event.turn_id);

  if (eventType === "task_started") {
    const threadId = string(event.thread_id) ?? string(event.session_id);
    const sessionId = threadId ?? context.sessionId ?? turnId;
    if (!sessionId) return [unknownEvent(record, undefined, turnId)];
    const mode = string(event.collaboration_mode_kind) ?? "default";
    return [
      sessionUpdateEvent(
        sessionId,
        turnId,
        {
          sessionUpdate: "current_mode_update",
          currentModeId: mode,
          _meta: {
            ...meta(eventType),
            "com.marloues.mode.label": mode === "plan" ? "Plan" : "Default",
            raw: event,
          },
        },
        eventType,
        event,
        at,
      ),
    ];
  }

  if (eventType === "task_complete") {
    const sessionId =
      string(event.thread_id) ?? string(event.session_id) ?? context.sessionId;
    if (!sessionId || !turnId) return [unknownEvent(record, sessionId, turnId)];
    const response: PromptResponse = {
      stopReason: "end_turn",
      _meta: { ...meta(eventType), raw: event },
    };
    return [
      {
        type: "prompt/response",
        sessionId,
        turnId,
        response,
        source: "codex",
        nativeType: eventType,
        rawEvent: event,
        timestamp: at,
      },
    ];
  }

  if (eventType === "token_count") {
    const info = event.info;
    const usage = usageFromTokenCount(info);
    const sessionId =
      string(event.thread_id) ?? string(event.session_id) ?? context.sessionId ?? turnId;
    if (!sessionId) return [unknownEvent(record, undefined, turnId)];
    return [
      sessionUpdateEvent(sessionId, turnId, usage.update, eventType, event, at),
    ];
  }

  if (
    eventType === "item_started" ||
    eventType === "item_completed" ||
    eventType === "item_updated"
  ) {
    const sessionId =
      string(event.thread_id) ?? string(event.session_id) ?? context.sessionId;
    if (!sessionId) return [unknownEvent(record, undefined, turnId)];
    const item = asRecord(event.item);
    if (!item) return [unknownEvent(record, sessionId, turnId)];
    const itemType = string(item.type);
    const itemId = string(item.id) ?? `${turnId ?? sessionId}-item`;

    if (itemType === "UserMessage") {
      return [
        sessionUpdateEvent(
          sessionId,
          turnId,
          {
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: textFromContent(item.content) },
            messageId: itemId,
            _meta: { ...meta(eventType), raw: item },
          },
          eventType,
          event,
          at,
        ),
      ];
    }

    if (itemType === "Reasoning") {
      return [
        sessionUpdateEvent(
          sessionId,
          turnId,
          {
            sessionUpdate: "agent_thought_chunk",
            content: {
              type: "text",
              text: textFromSummary(item.summary_text),
            },
            messageId: itemId,
            _meta: { ...meta(eventType), raw: item },
          },
          eventType,
          event,
          at,
        ),
      ];
    }

    if (itemType === "AgentMessage") {
      return [
        sessionUpdateEvent(
          sessionId,
          turnId,
          {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: textFromContent(item.content) },
            messageId: itemId,
            _meta: { ...meta(eventType), raw: item },
          },
          eventType,
          event,
          at,
        ),
      ];
    }

    if (itemType === "Plan") {
      const text = string(item.text) ?? "";
      return [
        sessionUpdateEvent(
          sessionId,
          turnId,
          {
            sessionUpdate: "plan",
            entries: planEntriesFromText(text),
            _meta: { ...meta(eventType), raw: item },
          },
          eventType,
          event,
          at,
        ),
      ];
    }

    if (itemType === "CommandExecution") {
      const input = {
        command: commandString(item.command),
        cwd: string(item.cwd),
      };
      const output =
        string(item.aggregated_output) ??
        [string(item.stdout) ?? "", string(item.stderr) ?? ""]
          .filter(Boolean)
          .join("\n");
      const status = toolStatus(item.status);
      const duration = asRecord(item.duration);
      const durationMs =
        duration === null
          ? undefined
          : (number(duration.secs) ?? 0) * 1000 +
            Math.round(number(duration.nanos) ?? 0);
      if (eventType === "item_started") {
        const toolCall: ToolCall = {
          toolCallId: itemId,
          title: commandString(item.command) || "command",
          name: "exec_command",
          kind: "execute",
          status: "in_progress",
          rawInput: input,
          _meta: { ...meta(eventType), raw: item },
        };
        return [
          sessionUpdateEvent(
            sessionId,
            turnId,
            { sessionUpdate: "tool_call", ...toolCall },
            eventType,
            event,
            at,
          ),
        ];
      }
      const update: ToolCallUpdate = {
        toolCallId: itemId,
        title: commandString(item.command) || "command",
        name: "exec_command",
        kind: "execute",
        status,
        rawOutput: output,
        _meta: {
          ...meta(eventType),
          exitCode: number(item.exit_code),
          durationMs,
          raw: item,
        },
      };
      return [
        sessionUpdateEvent(
          sessionId,
          turnId,
          { sessionUpdate: "tool_call_update", ...update },
          eventType,
          event,
          at,
        ),
      ];
    }

    return [
      {
        type: "unknown",
        sessionId,
        turnId,
        source: "codex",
        nativeType: itemType ?? "codex.item.unknown",
        raw: item,
        timestamp: at,
      },
    ];
  }

  return [unknownEvent(record, undefined, turnId)];
}

export function codexSessionRecordsToACPEvents(
  records: CodexSessionRecord[],
): ACPWorkflowEvent[] {
  const context: CodexSessionContext = {};
  return records.flatMap((record) =>
    translateCodexSessionRecord(record, context),
  );
}

export function codexSessionRecordToACPEvents(
  record: CodexSessionRecord,
): ACPWorkflowEvent[] {
  return translateCodexSessionRecord(record, {});
}
