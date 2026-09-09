import { useMemo, useState } from "react";
import { CircleHelp } from "lucide-react";
import type { ConversationInputRequest } from "@shared/conversation-input";
import { Button } from "@/components/ui/button";
import styles from "./QuestionAskPanel.module.css";

/**
 * 问阶段悬浮面板：编号选项（一行一个）+ 自定义回答文本框。
 * 读取宿主 broker 转出的 ConversationInputRequest，经 respondToQuestion 提交。
 * 只处理 pending；同一请求已解决后由对话区问答卡呈现。
 */
export function QuestionAskPanel({
  request,
}: {
  request: ConversationInputRequest;
}) {
  const optionField = useMemo(
    () => request.fields.find((field) => field.options?.length),
    [request.fields],
  );
  const customField = useMemo(
    () => request.fields.find((field) => !field.options?.length),
    [request.fields],
  );
  const optionList = optionField?.options ?? [];
  const multiSelect = optionField?.type === "multi";
  const question = optionField?.label || request.title;
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (option: string) => {
    if (multiSelect) {
      setSelected((prev) =>
        prev.includes(option)
          ? prev.filter((entry) => entry !== option)
          : [...prev, option],
      );
    } else {
      setSelected([option]);
    }
  };

  const respond = async (action: "accept" | "decline" | "cancel") => {
    if (busy) return;
    setBusy(true);
    const content =
      action === "accept"
        ? {
            ...(optionField && selected.length
              ? {
                  [optionField.id]: multiSelect
                    ? selected
                    : selected.join("、"),
                }
              : {}),
            ...(customField && custom.trim()
              ? { [customField.id]: custom.trim() }
              : {}),
          }
        : undefined;
    try {
      await window.marloues.chat.respondToQuestion({
        sessionId: request.sessionId,
        turnId: request.turnId,
        requestId: request.requestId,
        action,
        content,
      });
    } catch (error) {
      console.error("[QuestionAskPanel] respond failed", error);
      setBusy(false);
    }
  };

  return (
    <section
      className={styles.panel}
      role="dialog"
      aria-label="待回答"
      aria-busy={busy}
    >
      <div className={styles.kicker}>
        <CircleHelp size={14} strokeWidth={1.8} aria-hidden />
        待回答
      </div>
      <h3 className={styles.title}>{question}</h3>
      <div className={styles.options}>
        {optionList.map((option, index) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={`${styles.option} ${active ? styles.optionActive : ""}`}
              aria-pressed={active}
              onClick={() => toggle(option)}
            >
              <span className={styles.number}>{index + 1}.</span>
              <span className={styles.label}>{option}</span>
            </button>
          );
        })}
      </div>
      {customField ? (
        <>
          <label className={styles.customLabel}>{customField.label}</label>
          <input
            type="text"
            className={styles.customInput}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="输入你的回答…"
          />
        </>
      ) : null}
      <div className={styles.actions}>
        <Button
          size="sm"
          className="primary"
          type="button"
          disabled={busy}
          onClick={() => respond("accept")}
        >
          提交回答
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={busy}
          onClick={() => respond("decline")}
        >
          跳过
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={busy}
          onClick={() => respond("cancel")}
        >
          取消
        </Button>
      </div>
    </section>
  );
}
