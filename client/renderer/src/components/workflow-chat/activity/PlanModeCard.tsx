import { ClipboardList } from "lucide-react";
import type { WorkflowTurnItem } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import { WorkflowMarkdownContent } from "../content/MarkdownContent";
import styles from "./PlanModeCard.module.css";

/** EnterPlanMode：只展示图标 + “已进入计划模式”，其余按 LLM 返回数据原样渲染
 *  （markdown 走气泡/输入框同款渲染）。 */
export function PlanModeCard({
  item,
}: {
  item: Extract<WorkflowTurnItem, { type: "dynamicToolCall" }>;
}) {
  const running =
    item.status === "running" ||
    item.status === "in_progress" ||
    item.status === "inProgress";

  return (
    <section className={styles.card} data-kind="plan-mode-card">
      <div className={styles.header}>
        <ClipboardList className={styles.icon} aria-hidden />
        <span className={styles.title}>
          {running ? "进入计划模式中…" : "已进入计划模式"}
        </span>
      </div>
      {item.output?.text ? (
        <div className={styles.body}>
          <WorkflowMarkdownContent content={item.output.text} />
        </div>
      ) : null}
    </section>
  );
}
