import { useRef, type ReactNode } from "react";
import type {
  WorkflowActivityGroup,
  WorkflowFlowEntry,
} from "../turns/turn-layout";
import type { WorkflowTurnItem } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import { codexActivityHeaderState } from "./codex-activity-contract";

type AgentMessageItem = Extract<WorkflowTurnItem, { type: "agentMessage" }>;
type ProcessItem = Exclude<
  WorkflowTurnItem,
  { type: "agentMessage" | "userMessage" }
>;

interface Props {
  entries: WorkflowFlowEntry[];
  expanded: boolean;
  isStreaming?: boolean;
  renderActivityGroup: (
    group: WorkflowActivityGroup,
    defaultDetailExpanded: boolean,
    active: boolean,
    thinking: boolean,
  ) => ReactNode;
  renderActivityItem: (item: ProcessItem) => ReactNode;
  renderAssistantMessage: (item: AgentMessageItem) => ReactNode;
}

export function WorkflowAgentFlowSection({
  entries,
  expanded,
  isStreaming = false,
  renderActivityGroup,
  renderActivityItem,
  renderAssistantMessage,
}: Props) {
  // Closed historical turns are lazy. After first expansion, keep the last
  // visible snapshot mounted so collapsing preserves local detail state and
  // does not mount an entire newly-completed long trace behind hidden content.
  const mountedEntries = useRef<WorkflowFlowEntry[] | null>(null);
  if (expanded) mountedEntries.current = entries;
  const displayedEntries = expanded ? entries : mountedEntries.current;

  const semanticMarkers = expanded
    ? []
    : entries.filter(
        (entry): entry is Extract<WorkflowFlowEntry, { kind: "activityItem" }> =>
          entry.kind === "activityItem" && isPlanModeMarker(entry.item),
      );

  return (
    <>
      {semanticMarkers.map((entry) => renderActivityItem(entry.item))}
      {displayedEntries?.length ? (
        <div
          className="workflow-agent-flow-section"
          data-kind="agent-flow-section"
          hidden={!expanded}
        >
          {displayedEntries.map((entry, index) => {
            if (entry.kind === "assistantMessage")
              return renderAssistantMessage(entry.item);
            if (entry.kind === "activityItem")
              return renderActivityItem(entry.item);
            const headerState = codexActivityHeaderState(entry.group.items, {
              isLatestGroup: index === displayedEntries.length - 1,
              isTurnInProgress: isStreaming,
            });
            return renderActivityGroup(
              entry.group,
              false,
              headerState.kind === "active",
              headerState.kind === "thinking",
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function isPlanModeMarker(item: ProcessItem): boolean {
  return (
    item.type === "modeUpdate" &&
    (item.modeKind === "plan" || item.modeKind === "default")
  );
}
