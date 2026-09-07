import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCopyFeedback } from "../content/use-copy-feedback";
import { GitFork, Trash2 } from "lucide-react";
import {
  ConversationCheckIcon,
  ConversationCopyIcon,
} from "../conversation-icons";
import { formatConversationTime } from "@shared/conversation-time";

/**
 * 回合 footer：复制/分支/删除操作 + 时间戳。
 * 从 AssistantTurn 提取（Phase 4），copied 状态内聚于此。
 */
interface Props {
  finalText: string;
  isRunning?: boolean;
  messageId: string;
  createdAt?: number;
  showFooterMetadata?: boolean;
  onCopy?: (text: string) => void | Promise<void>;
  onFork?: () => void | Promise<void>;
  onDelete?: (id: string) => void;
}

export function WorkflowTurnFooterView({
  finalText,
  isRunning = false,
  messageId,
  createdAt,
  showFooterMetadata = true,
  onCopy,
  onFork,
  onDelete,
}: Props) {
  const { copied, copy } = useCopyFeedback(messageId);
  const forkLock = useRef(false);
  const generation = useRef(0);
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState("");
  useEffect(() => {
    generation.current += 1;
    forkLock.current = false;
    setForking(false);
    setForkError("");
    return () => {
      generation.current += 1;
    };
  }, [messageId]);
  const footerTimestamp =
    showFooterMetadata &&
    typeof createdAt === "number" &&
    Number.isFinite(createdAt)
      ? createdAt
      : undefined;

  const hasActions = Boolean(finalText && (onCopy || onFork || onDelete));
  if (isRunning || (!hasActions && footerTimestamp === undefined)) return null;

  const handleFork = async () => {
    if (!onFork || forkLock.current) return;
    const version = generation.current;
    forkLock.current = true;
    setForking(true);
    setForkError("");
    try {
      await onFork();
    } catch (error) {
      if (generation.current === version)
        setForkError(
          error instanceof Error ? error.message : "创建分支失败，请重试",
        );
    } finally {
      if (generation.current === version) {
        forkLock.current = false;
        setForking(false);
      }
    }
  };

  return (
    <div
      className="message-footer"
      data-feedback={Boolean(copied || forking || forkError)}
    >
      {hasActions ? (
        <div className="assistant-actions">
          {finalText && onCopy ? (
            <IconAction
              title={copied ? "已复制" : "复制回复"}
              label={copied ? "已复制" : "复制"}
              onClick={() => void copy(() => onCopy!(finalText))}
              icon={
                copied ? <ConversationCheckIcon /> : <ConversationCopyIcon />
              }
            />
          ) : null}
          {finalText && onFork ? (
            <IconAction
              title={forking ? "正在创建分支" : "创建对话分支"}
              label={forking ? "创建中…" : "分支"}
              disabled={forking}
              onClick={() => void handleFork()}
              icon={<GitFork className="h-3.5 w-3.5" />}
            />
          ) : null}
          {finalText && onDelete ? (
            <IconAction
              title="删除"
              label="删除"
              onClick={() => onDelete(messageId)}
              danger
              icon={<Trash2 className="h-3.5 w-3.5" />}
            />
          ) : null}
        </div>
      ) : null}
      {forkError ? <span role="alert">{forkError}</span> : null}
      {footerTimestamp !== undefined ? (
        <time dateTime={new Date(footerTimestamp).toISOString()}>
          {formatAssistantMessageTime(footerTimestamp)}
        </time>
      ) : null}
    </div>
  );
}

export function formatAssistantMessageTime(timestamp: number): string {
  return formatConversationTime(timestamp);
}

function IconAction({
  title,
  label,
  icon,
  danger,
  disabled,
  onClick,
}: {
  title: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`assistant-action ${danger ? "is-danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
