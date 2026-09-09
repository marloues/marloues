import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import type { WorkflowTurnItem } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import styles from "./AskUserQuestionCard.module.css";

/**
 * AskUserQuestion 的对话区呈现。
 * 问阶段（可交互表单）不走这里：pending 问题由宿主转成 ConversationInputRequest，
 * 走权限审批那类悬浮面板。这个组件负责已解决后的“问答卡片”（显示阶段）与不可用态。
 */
export function AskUserQuestionCard({
  item,
}: {
  item: Extract<WorkflowTurnItem, { type: "dynamicToolCall" }>;
}) {
  const questions = useMemo(
    () => parseQuestions(item.arguments),
    [item.arguments],
  );
  if (isUnavailable(item)) {
    return <UnavailableCard reason={toolUnavailableReason(item)} />;
  }
  return (
    <DisplayPhase
      question={questions[0]?.question || questions[0]?.header || ""}
      answer={item.output?.text?.trim() || ""}
      status={displayStatus(item)}
    />
  );
}

function isUnavailable(
  item: Extract<WorkflowTurnItem, { type: "dynamicToolCall" }>,
): boolean {
  return (
    item.status === "error" ||
    item.status === "failed" ||
    item.success === false ||
    /<tool_use_error>[\s\S]*<\/tool_use_error>/.test(item.output?.text ?? "")
  );
}

function DisplayPhase({
  question,
  answer,
  status,
}: {
  question: string;
  answer: string;
  status: "answered" | "skipped" | "cancelled";
}) {
  const label =
    status === "answered"
      ? "已回答"
      : status === "skipped"
        ? "已跳过"
        : "已取消";
  return (
    <section
      className={styles.card}
      data-kind="ask-question-card"
      data-phase="display"
    >
      <div className={styles.qaQuestion}>{question || "问题"}</div>
      <div className={styles.qaAnswer}>{answer || "未回答"}</div>
      <small className={styles.meta}>Codex · {label}</small>
    </section>
  );
}

function UnavailableCard({ reason }: { reason: string }) {
  return (
    <section
      className={`${styles.card} ${styles.unavailable}`}
      data-kind="ask-question-card"
      data-phase="unavailable"
    >
      <div className={styles.unavailableHeader}>
        <TriangleAlert className={styles.warningIcon} aria-hidden />
        <h3 className={styles.title}>该工具在当前上下文不可用</h3>
      </div>
      <p className={styles.prompt}>{reason}</p>
      <div className={styles.metaInline}>AskUserQuestion · 已被禁用</div>
    </section>
  );
}

function displayStatus(
  item: Extract<WorkflowTurnItem, { type: "dynamicToolCall" }>,
): "answered" | "skipped" | "cancelled" {
  return item.status === "skipped"
    ? "skipped"
    : item.status === "cancelled"
      ? "cancelled"
      : "answered";
}

function parseQuestions(
  value: unknown,
): { header?: string; question?: string }[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const raw = record.questions;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const question = entry as Record<string, unknown>;
    return [
      {
        header:
          typeof question.header === "string" ? question.header : undefined,
        question:
          typeof question.question === "string" ? question.question : undefined,
      },
    ];
  });
}

function toolUnavailableReason(
  item: Extract<WorkflowTurnItem, { type: "dynamicToolCall" }>,
): string {
  const output = item.output?.text ?? "";
  const match = output.match(/<tool_use_error>([\s\S]*?)<\/tool_use_error>/);
  const body = match?.[1]?.trim() ?? "";
  return (
    body.replace(/^Error:\s*/i, "").trim() ||
    "AskUserQuestion 已被禁用，无法向你提问。"
  );
}
