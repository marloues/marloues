import type {
  PromptResponse,
  RequestPermissionRequest,
  SessionNotification,
  SessionUpdate,
  StopReason,
  ToolCall,
  ToolCallUpdate,
  ToolKind,
  Usage,
  UsageUpdate,
} from "@agentclientprotocol/sdk";
import type { UIEvent } from "../ui-protocol";
import type { TokenUsage } from "../types";
import {
  MARLOUES_ACP_EXTENSION_NAMES,
  MARLOUES_ACP_EXTENSION_NAMESPACE,
  MARLOUES_ACP_META_KEYS,
} from "./acp-extensions";
import type { ACPWorkflowEvent, ACPWorkflowEventSource } from "./acp-types";
import { planEntriesFromText } from "./acp-event-to-workflow-item";

export { planEntriesFromText };

export interface UIEventToACPAdapterOptions {
  source?: ACPWorkflowEventSource;
  /** Used only by legacy events that do not carry a session id. */
  fallbackSessionId?: string;
}

export interface UIEventToACPAdapter {
  translate(event: UIEvent): ACPWorkflowEvent[];
}

export interface UIEventToACPState {
  readonly planText: ReadonlyMap<string, string>;
  readonly toolStates: ReadonlyMap<string, ToolState>;
  readonly usageByTurn: ReadonlyMap<string, Usage>;
}

export interface UIEventToACPResult {
  events: ACPWorkflowEvent[];
  state: UIEventToACPState;
}

interface ToolState {
  title: string;
  name?: string;
  kind?: ToolKind;
}

function eventSessionId(event: UIEvent): string | undefined {
  return "sessionId" in event ? event.sessionId : undefined;
}

function eventTurnId(event: UIEvent): string | undefined {
  return "turnId" in event ? event.turnId : undefined;
}

function eventTimestamp(event: UIEvent): number | undefined {
  return "timestamp" in event ? event.timestamp : undefined;
}

function stateKey(
  event: { sessionId?: string; turnId?: string },
  id: string,
): string {
  return `${event.sessionId ?? "session"}:${event.turnId ?? "turn"}:${id}`;
}

export function createUIEventToACPState(): UIEventToACPState {
  return {
    planText: new Map(),
    toolStates: new Map(),
    usageByTurn: new Map(),
  };
}

function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): Map<K, V> {
  const next = new Map(map);
  next.set(key, value);
  return next;
}

function withoutEntry<K, V>(map: ReadonlyMap<K, V>, key: K): Map<K, V> {
  if (!map.has(key)) return new Map(map);
  const next = new Map(map);
  next.delete(key);
  return next;
}

function meta(nativeType: string, source: ACPWorkflowEventSource) {
  return {
    [MARLOUES_ACP_META_KEYS.source]: source,
    [MARLOUES_ACP_META_KEYS.nativeType]: nativeType,
  };
}

function sessionUpdate(
  event: UIEvent,
  update: SessionUpdate,
  source: ACPWorkflowEventSource,
): ACPWorkflowEvent {
  const sessionId = eventSessionId(event);
  const turnId = eventTurnId(event);
  if (!sessionId) {
    return unknownEvent(event, source);
  }

  const notification: SessionNotification = {
    sessionId,
    update,
    _meta: meta(event.type, source),
  };
  return {
    type: "session/update",
    sessionId,
    turnId,
    notification,
    source,
    nativeType: event.type,
    rawEvent: event,
    timestamp: eventTimestamp(event),
  };
}

function extensionEvent(
  event: UIEvent,
  name: string,
  source: ACPWorkflowEventSource,
): ACPWorkflowEvent {
  return {
    type: "extension",
    namespace: MARLOUES_ACP_EXTENSION_NAMESPACE,
    name,
    sessionId: eventSessionId(event),
    turnId: eventTurnId(event),
    data: event,
    source,
    nativeType: event.type,
    rawEvent: event,
    timestamp: eventTimestamp(event),
  };
}

function unknownEvent(
  event: UIEvent,
  source: ACPWorkflowEventSource,
): ACPWorkflowEvent {
  return {
    type: "unknown",
    sessionId: eventSessionId(event),
    turnId: eventTurnId(event),
    source,
    nativeType: event.type,
    raw: event,
    timestamp: eventTimestamp(event),
  };
}

function toolNameToKind(name: string): ToolKind {
  const normalized = name.toLowerCase();
  if (/(^|[/_.-])(read|cat|view|show)([/_.-]|$)/.test(normalized)) {
    return "read";
  }
  if (
    /(^|[/_.-])(edit|write|patch|apply)([/_.-]|$)/.test(normalized) ||
    normalized.includes("apply_patch")
  ) {
    return "edit";
  }
  if (/(^|[/_.-])(rm|delete|remove)([/_.-]|$)/.test(normalized)) {
    return "delete";
  }
  if (/(^|[/_.-])(move|rename)([/_.-]|$)/.test(normalized)) {
    return "move";
  }
  if (/(^|[/_.-])(search|find|glob)([/_.-]|$)/.test(normalized)) {
    return "search";
  }
  if (
    /(^|[/_.-])(exec|execute|command|terminal|bash|shell)([/_.-]|$)/.test(
      normalized,
    )
  ) {
    return "execute";
  }
  if (/(^|[/_.-])(think|reason|plan)([/_.-]|$)/.test(normalized)) {
    return "think";
  }
  if (
    /(^|[/_.-])(fetch|browser|web|curl|download)([/_.-]|$)/.test(normalized)
  ) {
    return "fetch";
  }
  if (normalized.includes("mode")) return "switch_mode";
  return "other";
}

function tokenUsageToACPUsage(usage: TokenUsage): Usage {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return {
    totalTokens: usage.totalTokens ?? input + output,
    inputTokens: input,
    outputTokens: output,
    thoughtTokens: undefined,
    cachedReadTokens: usage.cacheReadInputTokens,
    cachedWriteTokens: usage.cacheCreationInputTokens,
    _meta: {
      [MARLOUES_ACP_META_KEYS.nativeType]: "TokenUsage",
      raw: usage.raw ?? usage,
    },
  };
}

function usageUpdateFromContext(
  event: Extract<UIEvent, { type: "context.usage" }>,
): UsageUpdate {
  const usage = event.usage;
  const total = usage?.totalTokens;
  const used =
    total ??
    (typeof event.percentage === "number" && typeof event.limit === "number"
      ? Math.round((event.limit * event.percentage) / 100)
      : 0);
  return {
    used,
    size: usage?.maxTokens ?? event.limit ?? used,
    _meta: {
      [MARLOUES_ACP_META_KEYS.nativeType]: event.type,
      raw: event,
    },
  };
}

function stopReasonFromTurnComplete(
  event: Extract<UIEvent, { type: "turn.complete" }>,
): StopReason {
  if (event.result === "aborted" || event.result === "interrupted") {
    return "cancelled";
  }
  return "end_turn";
}

function permissionRequest(
  event: Extract<UIEvent, { type: "approval.request" }>,
  source: ACPWorkflowEventSource,
  fallbackSessionId: string | undefined,
): ACPWorkflowEvent {
  const sessionId = event.sessionId ?? fallbackSessionId ?? event.requestId;
  const toolCall: ToolCallUpdate = {
    toolCallId: event.requestId,
    title: event.toolName,
    kind: toolNameToKind(event.toolName),
    status: "in_progress",
    _meta: {
      [MARLOUES_ACP_META_KEYS.reason]: event.reason,
      [MARLOUES_ACP_META_KEYS.timeout]: event.timeout,
    },
  };
  const options: RequestPermissionRequest["options"] = [
    { optionId: "allow_once", name: "允许一次", kind: "allow_once" },
    { optionId: "reject_once", name: "拒绝一次", kind: "reject_once" },
  ];
  if (event.allowSession) {
    options.push({
      optionId: "allow_always",
      name: "本次会话允许",
      kind: "allow_always",
    });
  }

  const request: RequestPermissionRequest = {
    sessionId,
    toolCall,
    options,
    _meta: meta(event.type, source),
  };
  return {
    type: "permission/request",
    sessionId,
    turnId: event.turnId,
    requestId: event.requestId,
    request,
    source,
    nativeType: event.type,
    rawEvent: event,
  };
}

export function providerEventToACPEvents(
  event: UIEvent,
  options: UIEventToACPAdapterOptions = {},
  state: UIEventToACPState = createUIEventToACPState(),
): UIEventToACPResult {
  const source = options.source ?? "local";

  const translateToolEvent = (
    event: Extract<
      UIEvent,
      { type: "tool.start" | "tool.progress" | "tool.complete" }
    >,
  ): UIEventToACPResult => {
    if (event.parentToolId) {
      return {
        events: [
          extensionEvent(
            event,
            MARLOUES_ACP_EXTENSION_NAMES.subagentEvent,
            source,
          ),
        ],
        state,
      };
    }

    const toolStateKey = stateKey(event, event.toolId);
    const existing = state.toolStates.get(toolStateKey);
    const title = "toolName" in event ? event.toolName : existing?.title;
    const name = "toolName" in event ? event.toolName : existing?.name;
    const kind = name ? toolNameToKind(name) : existing?.kind;
    let nextToolStates = state.toolStates;
    if (title) {
      nextToolStates = withEntry(nextToolStates, toolStateKey, {
        title,
        name,
        kind,
      });
    } else if (!existing) {
      nextToolStates = withEntry(nextToolStates, toolStateKey, {
        title: "tool",
        kind,
      });
    }
    const nextState = { ...state, toolStates: nextToolStates };

    if (!existing) {
      const toolCall: ToolCall = {
        toolCallId: event.toolId,
        title: title ?? "tool",
        name,
        kind,
        status:
          event.type === "tool.start" && event.isReady === false
            ? "pending"
            : event.type === "tool.complete"
              ? event.status === "cancelled" || event.isError
                ? "failed"
                : "completed"
              : "in_progress",
        rawInput:
          event.type === "tool.complete" ? undefined : (event.input ?? {}),
        rawOutput: event.type === "tool.complete" ? event.output : undefined,
        _meta: meta(event.type, source),
      };
      return {
        events: [
          sessionUpdate(
            event,
            { sessionUpdate: "tool_call", ...toolCall },
            source,
          ),
        ],
        state: nextState,
      };
    }

    const update: ToolCallUpdate = {
      toolCallId: event.toolId,
      title,
      name,
      kind,
      status:
        event.type === "tool.complete"
          ? event.status === "cancelled" || event.isError
            ? "failed"
            : "completed"
          : event.type === "tool.start" && event.isReady === false
            ? "pending"
            : "in_progress",
      rawInput:
        event.type === "tool.complete" ? undefined : (event.input ?? undefined),
      rawOutput: event.type === "tool.complete" ? event.output : undefined,
      _meta: meta(event.type, source),
    };
    return {
      events: [
        sessionUpdate(
          event,
          { sessionUpdate: "tool_call_update", ...update },
          source,
        ),
      ],
      state: nextState,
    };
  };

  switch (event.type) {
    case "user.message":
      return {
        events: [
          sessionUpdate(
            event,
            {
              sessionUpdate: "user_message_chunk",
              content: { type: "text", text: event.content },
              messageId: event.messageId,
              _meta: {
                ...meta(event.type, source),
                [MARLOUES_ACP_META_KEYS.userContent]: event.userContent,
              },
            },
            source,
          ),
        ],
        state,
      };

    case "text.chunk":
    case "thinking.chunk": {
      if (event.parentToolId) {
        return {
          events: [
            extensionEvent(
              event,
              MARLOUES_ACP_EXTENSION_NAMES.subagentEvent,
              source,
            ),
          ],
          state,
        };
      }
      const messageId =
        event.type === "text.chunk"
          ? `agent-${event.turnId}`
          : `reasoning-${event.turnId}`;
      return {
        events: [
          sessionUpdate(
            event,
            {
              sessionUpdate:
                event.type === "text.chunk"
                  ? "agent_message_chunk"
                  : "agent_thought_chunk",
              content: { type: "text", text: event.content },
              messageId,
              _meta: meta(event.type, source),
            },
            source,
          ),
        ],
        state,
      };
    }

    case "tool.start":
    case "tool.progress":
    case "tool.complete":
      return translateToolEvent(event);

    case "mode.update":
      return {
        events: [
          sessionUpdate(
            event,
            {
              sessionUpdate: "current_mode_update",
              currentModeId: event.modeId,
              _meta: {
                ...meta(event.type, source),
                [MARLOUES_ACP_META_KEYS.modeLabel]: event.label,
              },
            },
            source,
          ),
        ],
        state,
      };

    case "plan.delta": {
      const planStateKey = stateKey(event, event.itemId);
      const existing = state.planText.get(planStateKey) ?? "";
      const nextText =
        existing && event.content.startsWith(existing)
          ? event.content
          : existing + event.content;
      const nextState = {
        ...state,
        planText: withEntry(state.planText, planStateKey, nextText),
      };
      return {
        events: [
          sessionUpdate(
            event,
            {
              sessionUpdate: "plan",
              entries: planEntriesFromText(nextText),
              _meta: meta(event.type, source),
            },
            source,
          ),
        ],
        state: nextState,
      };
    }

    case "plan.item": {
      const planStateKey = stateKey(event, event.itemId);
      return {
        events: [
          sessionUpdate(
            event,
            {
              sessionUpdate: "plan",
              entries: planEntriesFromText(event.content),
              _meta: meta(event.type, source),
            },
            source,
          ),
        ],
        state: {
          ...state,
          planText: withEntry(state.planText, planStateKey, event.content),
        },
      };
    }

    case "approval.request":
      return {
        events: [permissionRequest(event, source, options.fallbackSessionId)],
        state,
      };

    case "usage": {
      const usage = tokenUsageToACPUsage(event.usage);
      return {
        events: [
          sessionUpdate(
            event,
            {
              sessionUpdate: "usage_update",
              used: usage.totalTokens,
              size:
                event.usage.limitTokens ??
                event.usage.modelContextWindowTokens ??
                usage.totalTokens,
              _meta: meta(event.type, source),
            },
            source,
          ),
        ],
        state: {
          ...state,
          usageByTurn: withEntry(
            state.usageByTurn,
            stateKey(event, "usage"),
            usage,
          ),
        },
      };
    }

    case "context.usage":
      return {
        events: [
          sessionUpdate(
            event,
            {
              sessionUpdate: "usage_update",
              ...usageUpdateFromContext(event),
              _meta: meta(event.type, source),
            },
            source,
          ),
        ],
        state,
      };

    case "session.titleUpdated":
      return {
        events: [
          sessionUpdate(
            event,
            {
              sessionUpdate: "session_info_update",
              title: event.title,
              _meta: meta(event.type, source),
            },
            source,
          ),
        ],
        state,
      };

    case "turn.complete": {
      if (!event.final) return { events: [], state };
      const usageKey = stateKey(event, "usage");
      const usage = state.usageByTurn.get(usageKey);
      const response: PromptResponse = {
        stopReason: stopReasonFromTurnComplete(event),
        usage,
        _meta: {
          ...meta(event.type, source),
          result: event.result,
          error: event.error,
        },
      };
      return {
        events: [
          {
            type: "prompt/response",
            sessionId: event.sessionId,
            turnId: event.turnId,
            response,
            source,
            nativeType: event.type,
            rawEvent: event,
            timestamp: event.timestamp,
          },
        ],
        state: {
          ...state,
          usageByTurn: withoutEntry(state.usageByTurn, usageKey),
        },
      };
    }

    case "context.compaction":
      return {
        events: [
          extensionEvent(
            event,
            MARLOUES_ACP_EXTENSION_NAMES.contextCompaction,
            source,
          ),
        ],
        state,
      };

    case "execution.subagent.start":
      return {
        events: [
          extensionEvent(
            event,
            MARLOUES_ACP_EXTENSION_NAMES.subagentStart,
            source,
          ),
        ],
        state,
      };

    case "execution.subagent.event":
      return {
        events: [
          extensionEvent(
            event,
            MARLOUES_ACP_EXTENSION_NAMES.subagentEvent,
            source,
          ),
        ],
        state,
      };

    case "execution.subagent.complete":
      return {
        events: [
          extensionEvent(
            event,
            MARLOUES_ACP_EXTENSION_NAMES.subagentComplete,
            source,
          ),
        ],
        state,
      };

    case "execution.task.update":
      return {
        events: [
          extensionEvent(
            event,
            MARLOUES_ACP_EXTENSION_NAMES.taskUpdate,
            source,
          ),
        ],
        state,
      };

    case "session.info":
      return {
        events: [
          extensionEvent(
            event,
            MARLOUES_ACP_EXTENSION_NAMES.sessionInfo,
            source,
          ),
        ],
        state,
      };

    default:
      return { events: [unknownEvent(event, source)], state };
  }
}

export function createUIEventToACPAdapter(
  options: UIEventToACPAdapterOptions = {},
): UIEventToACPAdapter {
  let state = createUIEventToACPState();
  return {
    translate(event) {
      const result = providerEventToACPEvents(event, options, state);
      state = result.state;
      return result.events;
    },
  };
}
