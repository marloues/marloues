import type { ConversationInputRequest } from "@shared/conversation-input";
import styles from "./QuestionQaCard.module.css";

/** 已解决提问的问答卡：第一行问题，第二行答案。 */
export function QuestionQaCard({
  request,
}: {
  request: ConversationInputRequest;
}) {
  const label =
    request.status === "answered"
      ? "已回答"
      : request.status === "skipped"
        ? "已跳过"
        : "已取消";
  const firstField = request.fields[0];
  const question = firstField?.label ?? request.title;
  const answerValue = firstField?.id ? request.answers?.[firstField.id] : null;
  const answer = Array.isArray(answerValue)
    ? answerValue.join("、")
    : String(answerValue ?? "");

  return (
    <section
      className={styles.card}
      data-kind="question-qa-card"
      data-phase="display"
    >
      <div className={styles.question}>{question}</div>
      <div className={styles.answer}>{answer || "未回答"}</div>
      <small className={styles.meta}>Codex · {label}</small>
    </section>
  );
}
