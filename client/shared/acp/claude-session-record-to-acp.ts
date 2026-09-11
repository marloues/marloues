import type {
  PlanEntry,
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

export interface ClaudeSessionRecord {
  type?: string;
  timestamp?: string | number;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  message?: unknown;
  content?: unknown;
  [key: string]: unknown;
}

interface ToolUseRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  turnId: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function timestamp(record: ClaudeSessionRecord): number | undefined {
  if (typeof record.timestamp === "number") return record.timestamp;
  if (typeof record.timestamp === "string") {
    const parsed = Date.parse(record.timestamp);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function meta(nativeType: string) {
  return {
    [MARLOUES_ACP_META_KEYS.source]: "claude",
    [MARLOUES_ACP_META_KEYS.nativeType]: nativeType,
  };
}

function toolKind(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("bash") || normalized.includes("command")) {
    return "execute" as const;
  }
  if (normalized.includes("read")) return "read" as const;
  if (
    normalized.includes("write") ||
    normalized.includes("edit") ||
    normalized.includes("notebook")
  ) {
    return "edit" as const;
  }
  if (normalized.includes("search") || normalized.includes("glob")) {
    return "search" as const;
  }
  if (normalized.includes("agent")) return "other" as const;
  return "other" as const;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const record = asRecord(block);
        return record ? (string(record.text) ?? "") : "";
      })
      .join("");
  }
  return "";
}

function sessionUpdateEvent(
  sessionId: string,
  turnId: string,
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
    source: "claude",
    nativeType,
    rawEvent: raw,
    timestamp: at,
  };
}

function extensionEvent(
  sessionId: string,
  turnId: string,
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
    source: "claude",
    nativeType,
    rawEvent: data,
    timestamp: at,
  };
}

function unknownEvent(
  record: ClaudeSessionRecord,
  sessionId: string | undefined,
  turnId: string | undefined,
): ACPWorkflowEvent {
  return {
    type: "unknown",
    sessionId,
    turnId,
    source: "claude",
    nativeType: record.type ?? "claude.unknown",
    raw: record,
    timestamp: timestamp(record),
  };
}

function statusFromClaudeTask(status: unknown) {
  switch (status) {
    case "completed":
      return "completed";
    case "in_progress":
      return "running";
    case "pending":
      return "pending";
    default:
      return "running";
  }
}

export interface ClaudeSessionRecordToACPAdapter {
  translate(record: ClaudeSessionRecord): ACPWorkflowEvent[];
}

export function claudeSessionRecordsToACPEvents(
  records: ClaudeSessionRecord[],
): ACPWorkflowEvent[] {
  const adapter = createClaudeSessionRecordToACPAdapter();
  return records.flatMap((record) => adapter.translate(record));
}

export function createClaudeSessionRecordToACPAdapter(): ClaudeSessionRecordToACPAdapter {
  const toolUses = new Map<string, ToolUseRecord>();
  let currentTurnId = "claude-session";

  return {
    translate(record) {
      const sessionId = string(record.sessionId);
      if (!sessionId) return [unknownEvent(record, undefined, currentTurnId)];
      const at = timestamp(record);

      if (record.type === "user") {
        const message = asRecord(record.message);
        const role = message ? string(message.role) : undefined;
        const content = message?.content ?? record.content;
        const blocks = Array.isArray(content) ? content : [];
        const toolResults = blocks.filter((block) => {
          const result = asRecord(block);
          return result?.type === "tool_result";
        });

        if (toolResults.length > 0) {
          const events: ACPWorkflowEvent[] = [];
          for (const block of toolResults) {
            const result = asRecord(block);
            if (!result) continue;
            const toolUseId = string(result.tool_use_id);
            const use = toolUseId ? toolUses.get(toolUseId) : undefined;
            if (!toolUseId || !use) continue;
            const output = result.content;
            const update: ToolCallUpdate = {
              toolCallId: toolUseId,
              title: use.name,
              name: use.name,
              kind: toolKind(use.name),
              status: result.is_error ? "failed" : "completed",
              rawOutput: output,
              _meta: {
                ...meta("tool_result"),
                [MARLOUES_ACP_META_KEYS.parentToolId]: use.id,
                raw: result,
              },
            };
            events.push(
              sessionUpdateEvent(
                sessionId,
                use.turnId,
                { sessionUpdate: "tool_call_update", ...update },
                "tool_result",
                result,
                at,
              ),
            );

            if (use.name === "Agent") {
              events.push(
                extensionEvent(
                  sessionId,
                  use.turnId,
                  MARLOUES_ACP_EXTENSION_NAMES.subagentComplete,
                  {
                    subagentId: use.id,
                    parentToolId: use.id,
                    status: result.is_error ? "failed" : "completed",
                    output,
                    timestamp: at,
                  },
                  "tool_result",
                  at,
                ),
              );
            }
          }
          return events.length > 0
            ? events
            : [unknownEvent(record, sessionId, currentTurnId)];
        }

        if (role === "user") {
          currentTurnId = string(record.uuid) ?? currentTurnId;
          return [
            sessionUpdateEvent(
              sessionId,
              currentTurnId,
              {
                sessionUpdate: "user_message_chunk",
                content: { type: "text", text: contentText(content) },
                messageId: string(record.uuid) ?? currentTurnId,
                _meta: { ...meta(record.type), raw: record },
              },
              record.type,
              record,
              at,
            ),
          ];
        }

        return [unknownEvent(record, sessionId, currentTurnId)];
      }

      if (record.type === "assistant") {
        const message = asRecord(record.message);
        const content = Array.isArray(message?.content) ? message.content : [];
        const events: ACPWorkflowEvent[] = [];
        const recordTurnId = string(record.uuid) ?? currentTurnId;
        currentTurnId = recordTurnId;

        for (const block of content) {
          const item = asRecord(block);
          if (!item) continue;
          if (item.type === "thinking") {
            events.push(
              sessionUpdateEvent(
                sessionId,
                currentTurnId,
                {
                  sessionUpdate: "agent_thought_chunk",
                  content: { type: "text", text: string(item.thinking) ?? "" },
                  messageId: `${currentTurnId}:thought`,
                  _meta: { ...meta("thinking"), raw: item },
                },
                "thinking",
                item,
                at,
              ),
            );
          } else if (item.type === "text") {
            events.push(
              sessionUpdateEvent(
                sessionId,
                currentTurnId,
                {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: string(item.text) ?? "" },
                  messageId: `${currentTurnId}:message`,
                  _meta: { ...meta("text"), raw: item },
                },
                "text",
                item,
                at,
              ),
            );
          } else if (item.type === "tool_use") {
            const id = string(item.id);
            const name = string(item.name) ?? "tool";
            const input = asRecord(item.input) ?? {};
            if (!id) continue;
            toolUses.set(id, {
              id,
              name,
              input,
              turnId: currentTurnId,
            });

            if (name === "EnterPlanMode") {
              events.push(
                sessionUpdateEvent(
                  sessionId,
                  currentTurnId,
                  {
                    sessionUpdate: "current_mode_update",
                    currentModeId: "plan",
                    _meta: {
                      ...meta(name),
                      "com.marloues.mode.label": "Plan",
                      raw: item,
                    },
                  },
                  name,
                  item,
                  at,
                ),
              );
              continue;
            }

            if (name === "ExitPlanMode") {
              events.push(
                sessionUpdateEvent(
                  sessionId,
                  currentTurnId,
                  {
                    sessionUpdate: "current_mode_update",
                    currentModeId: "default",
                    _meta: {
                      ...meta(name),
                      "com.marloues.mode.label": "Default",
                      raw: item,
                    },
                  },
                  name,
                  item,
                  at,
                ),
              );
              const plan = string(input.plan);
              if (plan) {
                const entries: PlanEntry[] = planEntriesFromText(plan);
                events.push(
                  sessionUpdateEvent(
                    sessionId,
                    currentTurnId,
                    {
                      sessionUpdate: "plan",
                      entries,
                      _meta: {
                        ...meta(name),
                        planFilePath: input.planFilePath,
                      },
                    },
                    name,
                    item,
                    at,
                  ),
                );
              }
              continue;
            }

            const toolCall: ToolCall = {
              toolCallId: id,
              title: name,
              name,
              kind: toolKind(name),
              status: "in_progress",
              rawInput: input,
              _meta: { ...meta(name), raw: item },
            };
            events.push(
              sessionUpdateEvent(
                sessionId,
                currentTurnId,
                { sessionUpdate: "tool_call", ...toolCall },
                name,
                item,
                at,
              ),
            );

            if (name === "Agent") {
              events.push(
                extensionEvent(
                  sessionId,
                  currentTurnId,
                  MARLOUES_ACP_EXTENSION_NAMES.subagentStart,
                  {
                    subagentId: id,
                    parentToolId: id,
                    agentType: string(input.subagent_type),
                    description: string(input.description),
                    prompt: string(input.prompt),
                    model: string(input.model),
                    status: "running",
                    timestamp: at,
                  },
                  name,
                  at,
                ),
              );
            }

            if (name === "TaskCreate" || name === "TaskUpdate") {
              const taskId =
                name === "TaskCreate"
                  ? `pending:${id}`
                  : (string(input.taskId) ?? `unknown:${id}`);
              events.push(
                extensionEvent(
                  sessionId,
                  currentTurnId,
                  MARLOUES_ACP_EXTENSION_NAMES.taskUpdate,
                  {
                    taskId,
                    turnId: currentTurnId,
                    title: string(input.subject) ?? string(input.activeForm),
                    detail: string(input.description),
                    status:
                      name === "TaskCreate"
                        ? "pending"
                        : statusFromClaudeTask(input.status),
                    timestamp: at,
                  },
                  name,
                  at,
                ),
              );
            }
          }
        }

        return events.length > 0
          ? events
          : [unknownEvent(record, sessionId, currentTurnId)];
      }

      if (record.type === "last-prompt") {
        return [
          extensionEvent(
            sessionId,
            currentTurnId,
            MARLOUES_ACP_EXTENSION_NAMES.sessionInfo,
            record,
            record.type,
            at,
          ),
        ];
      }

      return [unknownEvent(record, sessionId, currentTurnId)];
    },
  };
}
