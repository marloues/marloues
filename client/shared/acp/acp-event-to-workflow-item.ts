import type {
  ContentBlock,
  PlanEntry,
  RequestPermissionRequest,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import { workflowToolResult } from "../workflow-tool-result";
import { isWorkflowCanonicalTurnItemType } from "../workflow-read-thread-contract";
import type {
  WorkflowAgentMessageItem,
  WorkflowDynamicToolCallItem,
  WorkflowItemStatus,
  WorkflowModeUpdateItem,
  WorkflowPermissionRequestItem,
  WorkflowPlanItem,
  WorkflowReasoningItem,
  WorkflowTurnItem,
  WorkflowUserMessageItem,
} from "../workflow-read-thread-contract";
import type { AgentInputPart } from "../agent-input";
import { normalizeAgentInputParts } from "../agent-input";
import { textOutputFromUnknown } from "../adapters/runtime-event-to-turn-item";
import {
  MARLOUES_ACP_EXTENSION_NAMES,
  MARLOUES_ACP_META_KEYS,
} from "./acp-extensions";
import type { ACPWorkflowEvent } from "./acp-types";

export interface ACPWorkflowItemIngestResult {
  item: WorkflowTurnItem;
  prevItem?: WorkflowTurnItem;
  changed: boolean;
}

export interface ACPWorkflowItemAdapter {
  ingest(event: ACPWorkflowEvent): ACPWorkflowItemIngestResult[];
  getItem(id: string): WorkflowTurnItem | undefined;
  items(): WorkflowTurnItem[];
  finalizeStreamingItems(): Array<{
    item: WorkflowTurnItem;
    prevItem: WorkflowTurnItem;
  }>;
}

const PLAN_META = {
  blockType: "com.marloues.plan.blockType",
  level: "com.marloues.plan.level",
  language: "com.marloues.plan.language",
} as const;

type PlanBlockType = "heading" | "paragraph" | "code" | "table" | "list";

interface ParsedPlanBlock {
  type: PlanBlockType;
  content: string;
  status?: "pending" | "in_progress" | "completed";
  level?: number;
  language?: string;
}

function textFromContent(content: ContentBlock): string | undefined {
  return content.type === "text" ? content.text : undefined;
}

function userContentFromContent(
  content: ContentBlock,
): AgentInputPart | undefined {
  if (content.type === "text") return { type: "text", text: content.text };
  if (content.type === "image") {
    return {
      type: "image",
      url: content.uri ?? `data:${content.mimeType};base64,${content.data}`,
      mimeType: content.mimeType,
    };
  }
  return undefined;
}

function userContentFromUpdate(
  update: Extract<SessionUpdate, { sessionUpdate: "user_message_chunk" }>,
): AgentInputPart[] {
  const rawUserContent =
    update._meta?.[MARLOUES_ACP_META_KEYS.userContent];
  const parts = Array.isArray(rawUserContent)
    ? normalizeAgentInputParts(rawUserContent)
    : [];
  if (parts.length > 0) return parts;

  const part = userContentFromContent(update.content);
  return part ? [part] : [];
}

function planStatus(line: string): "pending" | "in_progress" | "completed" {
  const checkbox = /^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X|~)\]/.exec(line);
  if (!checkbox) return "pending";
  const marker = checkbox[1];
  if (marker === "x" || marker === "X") return "completed";
  if (marker === "~") return "in_progress";
  return "pending";
}

function planEntryContent(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[( |x|X|~)\]\s*/, "")
    .trim();
}

function planBlocksFromText(text: string): ParsedPlanBlock[] {
  const blocks: ParsedPlanBlock[] = [];
  const lines = text.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: "heading",
        content: heading[2].trim(),
        level: heading[1].length,
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", content: codeLines.join("\n"), language });
      continue;
    }

    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      blocks.push({
        type: "list",
        content: planEntryContent(line),
        status: planStatus(line),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      blocks.push({ type: "table", content: tableLines.join("\n") });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index].trim()) &&
      !lines[index].trim().startsWith("```") &&
      !lines[index].trim().startsWith("|") &&
      !/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", content: paragraphLines.join("\n") });
    }
  }

  return blocks;
}

export function planEntriesFromText(text: string): PlanEntry[] {
  return planBlocksFromText(text).map((block) => ({
    content: block.content,
    priority: "medium" as const,
    status: block.status ?? "pending",
    _meta: {
      [PLAN_META.blockType]: block.type,
      ...(block.level === undefined ? {} : { [PLAN_META.level]: block.level }),
      ...(block.language === undefined
        ? {}
        : { [PLAN_META.language]: block.language }),
    },
  }));
}

export function planTextFromEntries(entries: PlanEntry[]): string {
  return entries
    .map((entry) => {
      const meta = (entry._meta ?? {}) as Record<string, unknown>;
      const blockType = meta[PLAN_META.blockType];
      if (blockType === "heading") {
        const level = Math.min(
          6,
          Math.max(1, Number(meta[PLAN_META.level] ?? 1) || 1),
        );
        return `${"#".repeat(level)} ${entry.content}`;
      }
      if (blockType === "code") {
        const language =
          typeof meta[PLAN_META.language] === "string"
            ? meta[PLAN_META.language]
            : "";
        return `\`\`\`${language}\n${entry.content}\n\`\`\``;
      }
      if (blockType === "table" || blockType === "paragraph") {
        return entry.content;
      }
      const marker =
        entry.status === "completed"
          ? "[x]"
          : entry.status === "in_progress"
            ? "[~]"
            : "[ ]";
      return `- ${marker} ${entry.content}`;
    })
    .join("\n");
}

function toolStatus(status: string | undefined | null): WorkflowItemStatus {
  switch (status) {
    case "pending":
      return "pending";
    case "in_progress":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "running";
  }
}

function workflowItemFromRawInput(
  rawInput: unknown,
  id: string,
): WorkflowTurnItem | undefined {
  if (!rawInput || typeof rawInput !== "object") return undefined;
  const record = rawInput as Record<string, unknown>;
  if (
    record.id !== id ||
    typeof record.type !== "string" ||
    !isWorkflowCanonicalTurnItemType(record.type)
  ) {
    return undefined;
  }
  return structuredClone(rawInput) as WorkflowTurnItem;
}

function isTerminalStatus(status: WorkflowItemStatus): boolean {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}

function mergeText(existing: string | undefined, next: string): string {
  if (!existing) return next;
  return next.startsWith(existing) ? next : existing + next;
}

function permissionItemFromRequest(
  request: RequestPermissionRequest,
  requestId: string,
): WorkflowPermissionRequestItem {
  const toolCall = request.toolCall;
  const toolName = toolCall.name ?? toolCall.title ?? "tool";
  const reason =
    request.toolCall._meta?.["com.marloues.reason"] ??
    "Agent requested permission";
  return {
    type: "permissionRequest",
    id: requestId,
    toolName,
    reason: typeof reason === "string" ? reason : "Agent requested permission",
    status: "running",
    settled: false,
  };
}

function modeKindFromModeId(modeId: string): string {
  const normalized = modeId.toLowerCase();
  if (normalized.includes("plan")) return "plan";
  if (normalized.includes("default")) return "default";
  return modeId;
}

function modeLabelFromUpdate(
  update: Extract<SessionUpdate, { sessionUpdate: "current_mode_update" }>,
): string | undefined {
  const label = (update._meta ?? {})["com.marloues.mode.label"];
  return typeof label === "string" ? label : undefined;
}

export function createACPWorkflowItemAdapter(): ACPWorkflowItemAdapter {
  const items = new Map<string, WorkflowTurnItem>();
  let unknownSequence = 0;

  const snapshot = (id: string): WorkflowTurnItem | undefined => {
    const current = items.get(id);
    return current ? structuredClone(current) : undefined;
  };

  const upsert = (
    id: string,
    next: WorkflowTurnItem,
  ): ACPWorkflowItemIngestResult => {
    const prevItem = snapshot(id);
    items.set(id, next);
    return { item: next, prevItem, changed: true };
  };

  const upsertAgentMessage = (
    id: string,
    text: string,
  ): ACPWorkflowItemIngestResult => {
    const existing = items.get(id) as WorkflowAgentMessageItem | undefined;
    if (!existing) {
      return upsert(id, { type: "agentMessage", id, text, settled: false });
    }
    const nextText = mergeText(existing.text, text);
    if (nextText === existing.text) {
      return { item: existing, changed: false };
    }
    return upsert(id, { ...existing, text: nextText, settled: false });
  };

  const upsertReasoning = (
    id: string,
    text: string,
  ): ACPWorkflowItemIngestResult => {
    const existing = items.get(id) as WorkflowReasoningItem | undefined;
    if (!existing) {
      return upsert(id, {
        type: "reasoning",
        id,
        summary: text,
        settled: false,
      });
    }
    const nextSummary = mergeText(existing.summary, text);
    if (nextSummary === existing.summary) {
      return { item: existing, changed: false };
    }
    return upsert(id, { ...existing, summary: nextSummary, settled: false });
  };

  const upsertToolCall = (
    id: string,
    patch: {
      name?: string | null;
      title?: string | null;
      rawInput?: unknown;
      rawOutput?: unknown;
      status?: string | null;
    },
  ): ACPWorkflowItemIngestResult => {
    const rawItem = workflowItemFromRawInput(patch.rawInput, id);
    if (rawItem) return upsert(id, rawItem);
    const existing = items.get(id) as WorkflowDynamicToolCallItem | undefined;
    const status = toolStatus(patch.status ?? existing?.status);
    const next: WorkflowDynamicToolCallItem = {
      type: "dynamicToolCall",
      id,
      tool: patch.name ?? patch.title ?? existing?.tool ?? "tool",
      arguments: patch.rawInput ?? existing?.arguments,
      status,
      output:
        patch.rawOutput === undefined
          ? existing?.output
          : textOutputFromUnknown(patch.rawOutput),
      result:
        patch.rawOutput === undefined
          ? existing?.result
          : workflowToolResult(patch.rawOutput),
      success:
        status === "completed"
          ? true
          : status === "failed"
            ? false
            : existing?.success,
      settled: isTerminalStatus(status),
    };
    return upsert(id, next);
  };

  const ingestSessionUpdate = (
    sessionId: string,
    turnId: string | undefined,
    update: SessionUpdate,
    raw: ACPWorkflowEvent,
  ): ACPWorkflowItemIngestResult[] => {
    switch (update.sessionUpdate) {
      case "user_message_chunk": {
        const content = userContentFromUpdate(update);
        if (content.length === 0) return [];
        return [
          upsert(
            update.messageId ?? `user-${turnId ?? sessionId}`,
            {
              type: "userMessage",
              id: update.messageId ?? `user-${turnId ?? sessionId}`,
              content,
              settled: false,
            } satisfies WorkflowUserMessageItem,
          ),
        ];
      }
      case "agent_message_chunk": {
        const text = textFromContent(update.content);
        if (text === undefined) return [];
        return [
          upsertAgentMessage(
            update.messageId ?? `agent-${turnId ?? sessionId}`,
            text,
          ),
        ];
      }
      case "agent_thought_chunk": {
        const text = textFromContent(update.content);
        if (text === undefined) return [];
        return [
          upsertReasoning(
            update.messageId ?? `reasoning-${turnId ?? sessionId}`,
            text,
          ),
        ];
      }
      case "tool_call":
      case "tool_call_update":
        return [
          upsertToolCall(update.toolCallId, {
            name: update.name,
            title: update.title,
            rawInput: update.rawInput,
            rawOutput: update.rawOutput,
            status: update.status,
          }),
        ];
      case "plan":
        return [
          upsert(`plan-${turnId ?? sessionId}`, {
            type: "plan",
            id: `plan-${turnId ?? sessionId}`,
            text: planTextFromEntries(update.entries),
            settled: false,
          } satisfies WorkflowPlanItem),
        ];
      case "current_mode_update": {
        const modeKind = modeKindFromModeId(update.currentModeId);
        const label = modeLabelFromUpdate(update);
        const item: WorkflowModeUpdateItem = {
          type: "modeUpdate",
          id: `mode-${turnId ?? sessionId}-${update.currentModeId}`,
          modeId: update.currentModeId,
          modeKind,
          label,
          raw: { sessionId, turnId, update, event: raw },
          settled: true,
        };
        return [upsert(item.id, item)];
      }
      default:
        // Session-level updates (usage, session info, commands, config) are
        // consumed outside the turn-item projection and remain in the event log.
        return [];
    }
  };

  return {
    ingest(event) {
      switch (event.type) {
        case "session/update":
          return ingestSessionUpdate(
            event.sessionId,
            event.turnId,
            event.notification.update,
            event,
          );

        case "permission/request":
          return [
            upsert(
              event.requestId,
              permissionItemFromRequest(event.request, event.requestId),
            ),
          ];

        case "prompt/response":
          return this.finalizeStreamingItems().map(({ item, prevItem }) => ({
            item,
            prevItem,
            changed: true,
          }));

        case "extension":
          if (event.name === MARLOUES_ACP_EXTENSION_NAMES.contextCompaction) {
            return [
              upsert(`compaction-${event.turnId ?? "session"}`, {
                type: "contextCompaction",
                id: `compaction-${event.turnId ?? "session"}`,
                settled: true,
              }),
            ];
          }
          return [];

        case "unknown": {
          unknownSequence += 1;
          return [
            upsert(
              `unknown-${event.sessionId ?? "session"}-${unknownSequence}`,
              {
                type: "unknown",
                id: `unknown-${event.sessionId ?? "session"}-${unknownSequence}`,
                rawType: event.nativeType,
                raw: event.raw,
                settled: true,
              },
            ),
          ];
        }
      }
    },

    getItem(id) {
      return items.get(id);
    },

    items() {
      return Array.from(items.values());
    },

    finalizeStreamingItems() {
      const finalized: Array<{
        item: WorkflowTurnItem;
        prevItem: WorkflowTurnItem;
      }> = [];
      for (const [id, current] of items) {
        if (current.settled === false) {
          const next = { ...current, settled: true } as WorkflowTurnItem;
          items.set(id, next);
          finalized.push({ item: next, prevItem: current });
        }
      }
      return finalized;
    },
  };
}
