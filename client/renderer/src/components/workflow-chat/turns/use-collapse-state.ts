import { useCallback } from "react";
import type { WorkflowMessageBlock } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import {
  workflowTurnDefaultCollapsed,
  workflowTurnIsCompleted,
} from "./turn-collapse-rules";
import { useConversationStateValue } from "../content/conversation-ui-state";
export type WorkflowCollapseMessage = Pick<
  WorkflowMessageBlock,
  "id" | "activity" | "status"
> &
  Partial<Pick<WorkflowMessageBlock, "timing">>;
export type WorkflowCollapseState = {
  isTurnExpanded: (message: WorkflowCollapseMessage) => boolean;
  setTurnExpanded: (messageId: string, expanded: boolean) => void;
};
const EMPTY: Record<string, boolean> = {};
export function useWorkflowCollapseState({
  scope,
  defaultExpandedMessageId,
}: {
  isStreaming: boolean;
  scope: string;
  workflowMessages: WorkflowCollapseMessage[];
  defaultExpandedMessageId?: string;
}): WorkflowCollapseState {
  const [choices, setChoices] = useConversationStateValue(
    `turn-collapse:${scope}`,
    EMPTY,
  );
  const isTurnExpanded = useCallback(
    (message: WorkflowCollapseMessage) => {
      const finalStarted = message.timing?.finalAnswerStartedAt != null;
      if (!workflowTurnIsCompleted(message) && !finalStarted) return true;
      if (choices[message.id] !== undefined) return choices[message.id];
      return (
        message.id === defaultExpandedMessageId ||
        !(finalStarted || workflowTurnDefaultCollapsed(message))
      );
    },
    [choices, defaultExpandedMessageId],
  );
  const setTurnExpanded = useCallback(
    (id: string, expanded: boolean) =>
      setChoices((current) => ({ ...current, [id]: expanded })),
    [setChoices],
  );
  return { isTurnExpanded, setTurnExpanded };
}
