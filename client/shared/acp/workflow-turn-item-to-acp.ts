import type {
  ContentBlock,
  RequestPermissionRequest,
  SessionNotification,
  SessionUpdate,
  ToolCallUpdate,
  ToolKind,
} from "@agentclientprotocol/sdk";
import type { AgentInputPart } from "../agent-input";
import type { WorkflowTurnItem } from "../workflow-read-thread-contract";
import {
  MARLOUES_ACP_EXTENSION_NAMES,
  MARLOUES_ACP_EXTENSION_NAMESPACE,
  MARLOUES_ACP_META_KEYS,
} from "./acp-extensions";
import type { ACPWorkflowEvent } from "./acp-types";
import { planEntriesFromText } from "./acp-event-to-workflow-item";

export interface WorkflowTurnItemToACPContext {
  sessionId: string;
  turnId: string;
  source?: ACPWorkflowEvent["source"];
  timestamp?: number;
}

function meta(
  nativeType: string,
  source: ACPWorkflowEvent["source"],
  itemType: WorkflowTurnItem["type"],
) {
  return {
    [MARLOUES_ACP_META_KEYS.source]: source,
    [MARLOUES_ACP_META_KEYS.nativeType]: nativeType,
    [MARLOUES_ACP_META_KEYS.itemType]: itemType,
  };
}

function contentBlockFromInputPart(part: AgentInputPart): ContentBlock {
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.type === "image" || part.type === "url") {
    return {
      type: "resource_link",
      uri: part.url,
      name:
        part.type === "image"
          ? (part.name ?? "image")
          : (part.title ?? part.url),
      ...(part.type === "image" && part.mimeType
        ? { mimeType: part.mimeType }
        : {}),
    };
  }
  if (part.type === "localImage") {
    return {
      type: "resource_link",
      uri: part.path,
      name: part.name ?? "image",
      ...(part.mimeType ? { mimeType: part.mimeType } : {}),
    };
  }
  if (part.type === "skill") {
    return {
      type: "resource_link",
      uri: part.path ?? `skill:${part.id ?? part.name}`,
      name: part.displayName ?? part.name,
      description: part.description,
    };
  }
  if (part.type === "mention") {
    return {
      type: "resource_link",
      uri: part.path ?? `mention:${part.name}`,
      name: part.name,
    };
  }
  if (part.type === "browserComment") {
    return {
      type: "resource_link",
      uri:
        part.screenshotDataUrl ??
        part.pageUrl ??
        `browser-comment:${part.commentId}`,
      name: "Browser comment",
      description: part.comment,
    };
  }
  return {
    type: "resource_link",
    uri: part.path ?? part.name,
    name: part.name,
    ...(part.mimeType ? { mimeType: part.mimeType } : {}),
    ...(part.type === "file" ? { description: part.text } : {}),
  };
}

function toolStatus(
  status: string | undefined,
): "pending" | "in_progress" | "completed" | "failed" {
  switch (status) {
    case "pending":
      return "pending";
    case "running":
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    default:
      return "failed";
  }
}

function toolKindForItem(item: WorkflowTurnItem): ToolKind {
  switch (item.type) {
    case "commandExecution":
      return "execute";
    case "fileChange":
      return "edit";
    case "mcpToolCall":
    case "dynamicToolCall":
      return "other";
    case "webSearch":
      return "fetch";
    case "imageView":
    case "imageGeneration":
      return "read";
    case "collabAgentToolCall":
      return "other";
    default:
      return "other";
  }
}

function toolUpdateFromItem(
  item: WorkflowTurnItem,
  sessionId: string,
  turnId: string,
  source: ACPWorkflowEvent["source"],
): SessionUpdate {
  const title = toolTitleFromItem(item);
  const update: ToolCallUpdate = {
    toolCallId: item.id,
    title,
    name: "tool" in item ? item.tool : item.type,
    kind: toolKindForItem(item),
    status: toolStatus("status" in item ? item.status : "completed"),
    rawInput: item,
    rawOutput:
      "output" in item && item.output !== undefined ? item.output : undefined,
    _meta: meta("item-updated", source, item.type),
  };
  return { sessionUpdate: "tool_call_update", ...update };
}

function toolTitleFromItem(item: WorkflowTurnItem): string {
  switch (item.type) {
    case "commandExecution":
      return item.command;
    case "fileChange":
      return "File changes";
    case "mcpToolCall":
    case "dynamicToolCall":
    case "collabAgentToolCall":
      return item.tool;
    case "webSearch":
      return item.query ? `Search: ${item.query}` : "Web search";
    case "imageView":
      return item.path;
    case "imageGeneration":
      return item.revisedPrompt ?? "Image generation";
    default:
      return item.type;
  }
}

export function workflowTurnItemToACPEvents(
  item: WorkflowTurnItem,
  context: WorkflowTurnItemToACPContext,
): ACPWorkflowEvent[] {
  const source = context.source ?? "local";
  const notification = (update: SessionUpdate): SessionNotification => ({
    sessionId: context.sessionId,
    update,
    _meta: meta("item-updated", source, item.type),
  });

  switch (item.type) {
    case "userMessage":
      return item.content.map((part) => ({
        type: "session/update",
        sessionId: context.sessionId,
        turnId: context.turnId,
        notification: notification({
          sessionUpdate: "user_message_chunk",
          content: contentBlockFromInputPart(part),
          messageId: item.id,
          _meta: {
            ...meta("item-updated", source, item.type),
            [MARLOUES_ACP_META_KEYS.userContent]: item.content,
          },
        }),
        source,
        nativeType: "item-updated",
        rawEvent: item,
        timestamp: context.timestamp,
      }));

    case "agentMessage":
    case "reasoning":
      return [
        {
          type: "session/update",
          sessionId: context.sessionId,
          turnId: context.turnId,
          notification: notification({
            sessionUpdate:
              item.type === "agentMessage"
                ? "agent_message_chunk"
                : "agent_thought_chunk",
            content: {
              type: "text",
              text: item.type === "agentMessage" ? item.text : item.summary,
            },
            messageId: item.id,
          }),
          source,
          nativeType: "item-updated",
          rawEvent: item,
          timestamp: context.timestamp,
        },
      ];

    case "plan":
      return [
        {
          type: "session/update",
          sessionId: context.sessionId,
          turnId: context.turnId,
          notification: notification({
            sessionUpdate: "plan",
            entries: planEntriesFromText(item.text),
          }),
          source,
          nativeType: "item-updated",
          rawEvent: item,
          timestamp: context.timestamp,
        },
      ];

    case "modeUpdate":
      return [
        {
          type: "session/update",
          sessionId: context.sessionId,
          turnId: context.turnId,
          notification: notification({
            sessionUpdate: "current_mode_update",
            currentModeId: item.modeId,
            _meta: {
              ...meta("item-updated", source, item.type),
              [MARLOUES_ACP_META_KEYS.modeLabel]: item.label,
            },
          }),
          source,
          nativeType: "item-updated",
          rawEvent: item,
          timestamp: context.timestamp,
        },
      ];

    case "permissionRequest": {
      const request: RequestPermissionRequest = {
        sessionId: context.sessionId,
        toolCall: {
          toolCallId: item.id,
          title: item.toolName,
          kind: "other",
          status: toolStatus(item.status),
          _meta: { [MARLOUES_ACP_META_KEYS.reason]: item.reason },
        },
        options: [
          { optionId: "allow_once", name: "允许一次", kind: "allow_once" },
          { optionId: "reject_once", name: "拒绝一次", kind: "reject_once" },
        ],
        _meta: meta("item-updated", source, item.type),
      };
      return [
        {
          type: "permission/request",
          sessionId: context.sessionId,
          turnId: context.turnId,
          requestId: item.id,
          request,
          source,
          nativeType: "item-updated",
          rawEvent: item,
          timestamp: context.timestamp,
        },
      ];
    }

    case "contextCompaction":
      return [
        {
          type: "extension",
          namespace: MARLOUES_ACP_EXTENSION_NAMESPACE,
          name: MARLOUES_ACP_EXTENSION_NAMES.contextCompaction,
          sessionId: context.sessionId,
          turnId: context.turnId,
          data: item,
          source,
          nativeType: "item-updated",
          rawEvent: item,
          timestamp: context.timestamp,
        },
      ];

    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "dynamicToolCall":
    case "collabAgentToolCall":
    case "webSearch":
    case "imageView":
    case "imageGeneration":
      return [
        {
          type: "session/update",
          sessionId: context.sessionId,
          turnId: context.turnId,
          notification: notification(
            toolUpdateFromItem(item, context.sessionId, context.turnId, source),
          ),
          source,
          nativeType: "item-updated",
          rawEvent: item,
          timestamp: context.timestamp,
        },
      ];

    default:
      return [
        {
          type: "unknown",
          sessionId: context.sessionId,
          turnId: context.turnId,
          source,
          nativeType:
            ("rawType" in item ? item.rawType : item.type) ?? item.type,
          raw: item,
          timestamp: context.timestamp,
        },
      ];
  }
}
