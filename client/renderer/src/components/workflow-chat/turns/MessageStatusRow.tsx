import { useEffect, useState } from "react";
import { StateDot } from "@/components/ui";
import { messageDurationChinese } from "./message-view-format";
import styles from "./MessageStatusRow.module.css";
import "./MessageStatusRow.css";

interface Props {
  startedAt?: number;
  extra?: string;
}

export function WorkflowMessageStatusRow({ startedAt, extra }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const elapsed =
    startedAt === undefined
      ? null
      : messageDurationChinese(Math.max(0, Date.now() - startedAt));
  return (
    <div
      className={styles.status}
      role="status"
      aria-live="polite"
      data-kind="message-status"
    >
      <StateDot state="running" />
      <span className={`message-status-shimmer ${styles.label}`}>正在思考</span>
      {elapsed ? <span className={styles.elapsed}>{elapsed}</span> : null}
      {extra ? <span className={styles.extra}>{extra}</span> : null}
    </div>
  );
}
