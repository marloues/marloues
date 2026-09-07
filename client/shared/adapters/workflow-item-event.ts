import type { TokenUsage } from "../types";
import type { WorkflowTurnItem } from "../workflow-read-thread-contract";
import type { MessageItem } from "../workflow-types";
import { messageItemToWorkflowTurnItem } from "./message-item-to-workflow-turn-item";

export interface WorkflowItemEvent {
  type: string;
  sessionId: string;
  turnId: string;
  startedAt?: number;
  completedAt?: number;
  final?: boolean;
  result?: string;
  error?: string;
  usage?: TokenUsage;
  modelId?: string;
  modelName?: string;
  item?: WorkflowTurnItem;
  items?: WorkflowTurnItem[];
  prevItem?: WorkflowTurnItem;
}

type LegacyItemEvent = Omit<
  WorkflowItemEvent,
  "item" | "items" | "prevItem"
> & {
  schemaVersion?: 1;
  item?: MessageItem;
  items?: MessageItem[];
  prevItem?: MessageItem;
};
export type WorkflowItemWireEvent =
  (WorkflowItemEvent & { schemaVersion: 2 }) | LegacyItemEvent;

export function decodeWorkflowItemEvent(
  event: WorkflowItemWireEvent,
): WorkflowItemEvent {
  if (event.schemaVersion === 2) return event;
  return {
    ...event,
    item: event.item ? messageItemToWorkflowTurnItem(event.item) : undefined,
    items: event.items?.map(messageItemToWorkflowTurnItem),
    prevItem: event.prevItem
      ? messageItemToWorkflowTurnItem(event.prevItem)
      : undefined,
  };
}
