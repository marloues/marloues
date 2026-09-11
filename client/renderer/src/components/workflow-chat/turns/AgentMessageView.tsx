import type { WorkflowTurnItem } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import { WorkflowMarkdownContent } from "../content/MarkdownContent";
import styles from "./AgentMessageView.module.css";

type AgentMessageItem = Extract<WorkflowTurnItem, { type: "agentMessage" }>;

interface Props {
  item: AgentMessageItem;
}

export function WorkflowAgentMessageView({ item }: Props) {
  return (
    <div className={styles.assistant} data-kind="message-assistant-md">
      <WorkflowMarkdownContent
        content={item.text}
        streaming={item.settled === false}
      />
    </div>
  );
}
