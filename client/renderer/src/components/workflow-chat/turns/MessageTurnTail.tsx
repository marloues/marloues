import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import type { TokenUsage } from "@shared/types";
import {
  formatMessageClock,
  messageDurationChinese,
} from "./message-view-format";
import styles from "./MessageTurnTail.module.css";
import "./MessageTurnTail.css";

interface Props {
  start?: number;
  end?: number;
  model?: string;
  usage?: TokenUsage;
  timeLabel?: string;
  onCopy?: () => void | Promise<void>;
  onFork?: () => void | Promise<void>;
}

export function WorkflowMessageTurnTail({
  start,
  end,
  model,
  usage,
  timeLabel,
  onCopy,
  onFork,
}: Props) {
  const readings: string[] = [];
  if (start) readings.push(timeLabel ?? formatMessageClock(start));
  if (end && start) readings.push(messageDurationChinese(end - start));
  if (usage) {
    const input = usage.inputTokens ?? usage.totalTokens;
    const output = usage.outputTokens;
    if (input !== undefined || output !== undefined)
      readings.push(`${input ?? 0} tok`);
  }
  return (
    <div
      className={styles.actions}
      data-time-hover-root
      data-kind="message-tail"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title="复制回复"
        aria-label="复制回复"
        onClick={onCopy}
      >
        <Copy />
      </Button>
      {onFork ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="创建对话分支"
          aria-label="创建对话分支"
          onClick={onFork}
        >
          <Check />
        </Button>
      ) : null}
      {readings.length > 0 ? (
        <span data-time-hover-label className={styles.readings}>
          {readings.map((reading, index) => (
            <span key={index} className={styles.reading}>
              {index > 0 ? <span aria-hidden>·</span> : null}
              {reading}
            </span>
          ))}
          {model ? (
            <span className={styles.reading}>
              <span aria-hidden>·</span>
              {model}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
