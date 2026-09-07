import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./QuestionCard.module.css";
import { useRef, useState } from "react";
import {
  validateConversationInput,
  type ConversationInputRequest,
  type ConversationInputResponse,
} from "@shared/conversation-input";
import { useConversationStateValue } from "../content/conversation-ui-state";
import { WorkflowMarkdownLink } from "../content/MarkdownLink";
const EMPTY: Record<string, unknown> = {};
export function WorkflowQuestionCard({
  request,
}: {
  request: ConversationInputRequest;
}) {
  const [answers, setAnswers] = useConversationStateValue(
    `question:${request.sessionId}:${request.turnId}:${request.requestId}`,
    EMPTY,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pending = request.status === "pending";
  async function submit(action: ConversationInputResponse["action"]) {
    if (lock.current || !pending) return;
    const response = {
      sessionId: request.sessionId,
      turnId: request.turnId,
      requestId: request.requestId,
      action,
      content:
        action === "accept"
          ? {
              ...Object.fromEntries(
                request.fields
                  .filter((field) => field.type === "boolean")
                  .map((field) => [field.id, false]),
              ),
              ...answers,
            }
          : undefined,
    };
    const invalid = validateConversationInput(request, response);
    if (invalid) {
      setError(invalid);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await window.marloues.chat.respondToQuestion(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className={`workflow-question-card ${styles.card}`}
      data-kind="question-card"
      data-request-id={request.requestId}
    >
      <small className={styles.meta}>
        {request.source} ·{" "}
        {pending
          ? "等待回答"
          : request.status === "answered"
            ? "已回答"
            : request.status === "skipped"
              ? "已跳过"
              : "已取消"}
      </small>
      <h3 className={styles.title}>{request.title}</h3>
      {request.url ? (
        <p>
          <WorkflowMarkdownLink href={request.url}>
            {request.url}
          </WorkflowMarkdownLink>
        </p>
      ) : null}
      {pending ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit("accept");
          }}
        >
          {request.fields.map((field) => (
            <fieldset
              key={field.id}
              className={`workflow-question-field ${styles.field}`}
            >
              <legend>
                {field.label}
                {field.required ? " *" : ""}
              </legend>
              {field.description ? <small>{field.description}</small> : null}
              {field.type === "boolean" ? (
                <input
                  aria-label={field.label}
                  type="checkbox"
                  className={styles.checkbox}
                  checked={answers[field.id] === true}
                  onChange={(event) =>
                    setAnswers((value) => ({
                      ...value,
                      [field.id]: event.target.checked,
                    }))
                  }
                />
              ) : field.type === "enum" ? (
                <select
                  className={styles.select}
                  aria-label={field.label}
                  value={String(answers[field.id] ?? "")}
                  onChange={(event) =>
                    setAnswers((value) => ({
                      ...value,
                      [field.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">请选择</option>
                  {field.options?.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : field.type === "multi" ? (
                <select
                  className={styles.select}
                  aria-label={field.label}
                  multiple
                  value={(answers[field.id] as string[]) ?? []}
                  onChange={(event) => {
                    const selected = Array.from(
                      event.target.selectedOptions,
                      (option) => option.value,
                    );
                    setAnswers((value) => ({ ...value, [field.id]: selected }));
                  }}
                >
                  {field.options?.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <>
                  {field.options ? (
                    <div
                      className={`workflow-question-options ${styles.actions}`}
                    >
                      {field.options.map((option) => (
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          key={option}
                          className={styles.choice}
                          aria-pressed={answers[field.id] === option}
                          onClick={() =>
                            setAnswers((value) => ({
                              ...value,
                              [field.id]: option,
                            }))
                          }
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <Input
                    aria-label={field.label}
                    type={
                      field.type === "number" || field.type === "integer"
                        ? "number"
                        : "text"
                    }
                    step={field.type === "integer" ? 1 : "any"}
                    value={String(answers[field.id] ?? "")}
                    onChange={(event) => {
                      const value = event.target.value;
                      setAnswers((current) => ({
                        ...current,
                        [field.id]:
                          field.type === "number" || field.type === "integer"
                            ? value === ""
                              ? ""
                              : Number(value)
                            : value,
                      }));
                    }}
                  />
                </>
              )}
            </fieldset>
          ))}
          {request.unsupported ? (
            <p role="alert" className={styles.notice}>
              {request.unsupported}
            </p>
          ) : null}
          <div className={`workflow-question-actions ${styles.actions}`}>
            <Button
              size="sm"
              className="primary"
              type="submit"
              disabled={busy || Boolean(request.unsupported)}
            >
              {busy
                ? "提交中…"
                : request.kind === "url" || request.kind === "auth"
                  ? "我已完成"
                  : "提交回答"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => void submit("decline")}
            >
              跳过
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => void submit("cancel")}
            >
              取消
            </Button>
          </div>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <dl className={styles.answers}>
          {request.fields.map((field) => {
            const value = request.answers?.[field.id];
            return (
              <div key={field.id}>
                <dt>{field.label}</dt>
                <dd>
                  {value == null
                    ? "未回答"
                    : Array.isArray(value)
                      ? value.join("、")
                      : String(value)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
