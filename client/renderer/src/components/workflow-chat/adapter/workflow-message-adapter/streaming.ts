import type { Message } from "./types";
import type { WorkflowTurnItem } from "@shared/adapters/workflow-messages-to-read-thread";
import { stripThinkTags } from "./shared-helpers";

/**
 * 双路径归一化已删除（Phase 2）：message.items 已是 WorkflowTurnItem[]，
 * 直接透传 + compact 去重，不再从 rawEvents 或旧格式派生。
 */
export function itemsFromAssistantMessage(
  message: Message,
): WorkflowTurnItem[] {
  return compactItems(message.items);
}

/** Collapse repeated snapshots by identity; equal text is not equal messages. */
export function compactItems(items: WorkflowTurnItem[]): WorkflowTurnItem[] {
  const byId = new Map<string, WorkflowTurnItem>();
  for (const item of items) {
    if (item.type === "agentMessage") {
      const text = stripThinkTags(item.text);
      byId.set(item.id, text === item.text ? item : { ...item, text });
    } else {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}
