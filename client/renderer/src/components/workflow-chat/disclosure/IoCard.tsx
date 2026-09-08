/**
 * IN/OUT 简化卡：commandExecution / fileChange 行的展开内容（混合方案的
 * "命令/文件行用 IN/OUT 卡" 一侧）。两段网格（标签列 + 内容列），各段独立
 * 限高滚动；配色走语义 token。
 */

import styles from "./IoCard.module.css";
import { Card, Divider, FloatingActions } from "@/components/ui";
import { WorkflowDetailCopyButton } from "../activity/DetailCopyButton";

export function IoCard({
  input,
  output,
  failed,
}: {
  input: string;
  output: string;
  failed?: boolean;
}) {
  return (
    <Card className={styles.card} data-kind="message-tool-io">
      {input ? (
        <div className={styles.section} data-floating-actions-host>
          <div className={styles.scroll}>
            <span className={styles.label}>输入</span>
            <span className={styles.content}>{input}</span>
          </div>
          <FloatingActions>
            <WorkflowDetailCopyButton value={input} label="复制输入" />
          </FloatingActions>
        </div>
      ) : null}
      {input && output ? <Divider /> : null}
      {output ? (
        <div className={styles.section} data-floating-actions-host>
          <div className={styles.scroll}>
            <span className={styles.label}>输出</span>
            <span className={styles.content} data-error={failed || undefined}>
              {output}
            </span>
          </div>
          <FloatingActions>
            <WorkflowDetailCopyButton value={output} label="复制输出" />
          </FloatingActions>
        </div>
      ) : null}
    </Card>
  );
}
