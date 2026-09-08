import { FileText } from "lucide-react";
import { DisclosureRow } from "@/components/ui";
import { WorkflowFileLink } from "../content/MarkdownLink";
import type { FileReadPresentation } from "./file-read-presentation";
import styles from "./FileReadRow.module.css";

/** 读取文件只展示静态行，文件链接直接打开查看。 */
export function WorkflowFileReadRow({
  presentation,
  name,
  activityKind,
}: {
  presentation: FileReadPresentation;
  name: string;
  activityKind: string;
}) {
  const { targets, status } = presentation;
  const labels = {
    running: "正在读取文件",
    failed: "读取失败",
    cancelled: "已取消读取",
    completed: "读取文件",
  };
  return (
    <div
      className={styles.root}
      data-kind="file-read-row"
      data-read-status={status}
    >
      {targets.map((target) => (
        <DisclosureRow
          key={target.label}
          data-tool={name}
          data-activity-kind={activityKind}
          icon={<FileText />}
          iconTone={status === "failed" ? "danger" : "subtle"}
          state={
            status === "running"
              ? "running"
              : status === "failed"
                ? "error"
                : "ok"
          }
          title={labels[status]}
          summaryTone={status === "failed" ? "danger" : "subtle"}
          summary={
            target.path ? (
              <WorkflowFileLink
                path={target.path}
                line={target.line}
                className={styles.path}
              />
            ) : (
              <span title="缺少工作目录，暂不能打开相对路径">
                {target.label}
              </span>
            )
          }
          expandable={false}
        />
      ))}
    </div>
  );
}
