/**
 * 消息区渲染组件。
 *
 * 消息区渲染结构：
 *   - 用户消息：右对齐 22px 圆角气泡 + hover 时间戳/复制
 *   - assistant 内容：按 items 顺序渲染（agentMessage→markdown、reasoning→思考、
 *     tool→单行工具行），16px/28px 文字流
 *   - 工具行：按工具类型的图标 + 工具名 + · + 摘要，错误红，展开 OUT 卡，
 *     running 扫光，hover 图标→chevron
 *   - turn 尾：复制/分支 + 时间 · Ran for · tok/s（hover 显示）
 *
 * 配色跟随 mar loues 主题变量（深色/亮色主题自动适配）。
 */

import { memo, useEffect, useState } from "react";
import { Brain, Check, Copy } from "lucide-react";
import type { WorkflowTurnItem } from "@shared/adapters/workflow-messages-to-read-thread";
import type { TokenUsage } from "@shared/types";
import { WorkflowMarkdownContent } from "./content/MarkdownContent";
import { ToolDetail } from "./activity/ToolCallRowDetails";
import { toolDisplayName } from "./activity/ToolCallRowDetails/labels";
import { DisclosureRow, DisclosureStateDot } from "./disclosure/DisclosureRow";
import { IoCard } from "./disclosure/IoCard";
import { toolIconFor } from "./disclosure/tool-icon";
import { itemInputText, itemOutputText } from "./adapter/item-text";
import "./message-view.css";

// —— 状态点（共享原语别名，保持既有导出面） ——

export { DisclosureStateDot as MessageStateDot };

// —— 工具函数 ——

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function formatClock(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// —— 用户消息 ——

export function MessageUserRow({
  text,
  startedAt,
}: {
  text: string;
  startedAt?: number;
}) {
  if (!text.trim()) return null;
  return (
    <div
      className="flex flex-col items-end gap-1.5"
      data-time-hover-root
      data-kind="message-user-row"
    >
      <div
        className="flex flex-col items-end gap-2"
        style={{ maxWidth: "min(525px, 82%)" }}
      >
        <div
          className="whitespace-pre-wrap break-words rounded-[22px] bg-muted px-4 py-2.5 text-[16px] leading-6 text-text-normal"
          data-kind="message-user-bubble"
        >
          {text}
        </div>
      </div>
      <div
        className="flex h-7 items-center gap-2.5"
        data-kind="message-user-actions"
      >
        {startedAt ? (
          <span
            data-time-hover-label
            className="whitespace-nowrap pr-3 text-[14px] leading-6 text-text-subtle"
          >
            {formatClock(startedAt)}
          </span>
        ) : null}
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-full text-text-subtle hover:bg-muted hover:text-text-normal"
          aria-label="复制"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// —— 思考行 ——

/** 思考行（Think 折叠行）：Brain 图标 + 摘要，展开全文。内容有就显示，不依赖 settled。 */
export function MessageThinkRow({ text }: { text: string }) {
  if (!text.trim()) return null;
  const summary = text.replace(/\s+/g, " ").trim();
  const clipped =
    summary.length > 80 ? `${summary.slice(0, 79).trimEnd()}…` : summary;
  return (
    <DisclosureRow
      icon={<Brain className="h-4 w-4" />}
      title="思考"
      summary={clipped}
    >
      <div
        className="ml-2 whitespace-pre-wrap break-words border-l border-border py-1 pl-4 pr-2 text-[14px] leading-6 text-text-muted"
        data-kind="message-think-body"
      >
        {text}
      </div>
    </DisclosureRow>
  );
}

// —— 工具行 ——

export function MessageToolRow({
  name,
  summary,
  failed,
  running,
  errorSummary,
  detail,
}: {
  name: string;
  summary: string;
  failed: boolean;
  running: boolean;
  errorSummary?: string;
  /** 展开内容：接入 mar loues 现有渲染（ToolDetail / IN-OUT 卡）。无内容则不可展开。 */
  detail?: React.ReactNode;
}) {
  const summaryText = failed && errorSummary ? errorSummary : summary;
  return (
    <DisclosureRow
      icon={failed ? <DisclosureStateDot state="error" /> : toolIconFor(name)}
      title={toolDisplayName(name)}
      summary={summaryText || undefined}
      summaryTone={failed ? "danger" : "subtle"}
      state={failed ? "error" : running ? "running" : "ok"}
      toolName={name}
      expandable={Boolean(detail)}
    >
      {detail}
    </DisclosureRow>
  );
}

// —— WorkflowTurnItem → 渲染元素 ——

function itemName(item: WorkflowTurnItem): string {
  switch (item.type) {
    case "dynamicToolCall":
      return item.tool;
    case "mcpToolCall":
      return item.tool;
    case "commandExecution":
      return "exec_command";
    case "fileChange":
      return "apply_patch";
    case "webSearch":
      return "web_search";
    default:
      return item.type;
  }
}

function itemFailed(item: WorkflowTurnItem): boolean {
  if (item.type === "dynamicToolCall")
    return item.status === "error" || item.success === false;
  if (
    item.type === "mcpToolCall" ||
    item.type === "commandExecution" ||
    item.type === "fileChange"
  )
    return item.status === "error";
  return false;
}

function itemRunning(item: WorkflowTurnItem): boolean {
  return (
    "status" in item && (item.status === "running" || item.status === "pending")
  );
}

/** ToolCallRowDetails 支持的类型（展开接 ToolDetail）。 */
type ToolDetailItem = Extract<
  WorkflowTurnItem,
  {
    type:
      | "plan"
      | "mcpToolCall"
      | "dynamicToolCall"
      | "webSearch"
      | "imageGeneration";
  }
>;

/** 单条 item 渲染：item 引用稳定时跳过重渲染（防止 markdown 组件反复挂载）。 */
export const MessageItemView = memo(function MessageItemView({
  item,
}: {
  item: WorkflowTurnItem;
}) {
  if (item.type === "agentMessage") {
    // 不要用 item.text?.trim() 跳过空文本：流式早期 text 为空，若据此不渲染，
    // text 一旦非空会从其他分支切换回来，MarkdownContent 反复 remount（流式
    // 缓冲 timer 被 unmount 清理），文本不渐进显示。
    return (
      <div
        className="text-[16px] leading-[28px]"
        data-kind="message-assistant-md"
      >
        <WorkflowMarkdownContent
          content={item.text}
          streaming={item.settled === false}
        />
      </div>
    );
  }
  if (item.type === "reasoning") {
    const text =
      item.content
        ?.map((part) => ("text" in part ? (part.text ?? "") : ""))
        .filter(Boolean)
        .join("\n\n") ||
      item.summary ||
      "";
    if (item.encrypted && !text.trim()) {
      // 加密且无内容：静态一行（dsh 风格）
      return (
        <div
          className="flex items-center gap-2 py-0.5 text-[14px] leading-6 text-text-subtle"
          data-kind="message-think-hidden"
        >
          <Brain className="h-4 w-4 text-text-subtle" />
          <span>思考内容已隐藏</span>
        </div>
      );
    }
    return <MessageThinkRow text={text} />;
  }
  if (
    item.type === "dynamicToolCall" ||
    item.type === "mcpToolCall" ||
    item.type === "webSearch"
  ) {
    const failed = itemFailed(item);
    const running = itemRunning(item);
    const detailItem = item as ToolDetailItem;
    return (
      <MessageToolRow
        name={itemName(item)}
        summary={itemInputText(detailItem)}
        failed={failed}
        running={running}
        errorSummary={
          failed
            ? itemOutputText(detailItem).split("\n")[0] || "执行失败"
            : undefined
        }
        detail={
          <ToolDetail
            item={detailItem}
            failed={failed}
            cancellable={running}
            isCancelling={false}
            onCancel={() => {
              if ("id" in detailItem)
                void window.marloues.chat.cancelTool(detailItem.id);
            }}
          />
        }
      />
    );
  }
  if (item.type === "commandExecution" || item.type === "fileChange") {
    const failed = itemFailed(item);
    const input = itemInputText(item);
    const output = itemOutputText(item);
    return (
      <MessageToolRow
        name={itemName(item)}
        summary={input}
        failed={failed}
        running={itemRunning(item)}
        errorSummary={failed ? output.split("\n")[0] || "执行失败" : undefined}
        detail={
          input || output ? (
            <IoCard input={input} output={output} failed={failed} />
          ) : undefined
        }
      />
    );
  }
  return null;
});

// —— turn 尾 ——

/** 中文耗时（与分支耗时格式一致：N秒 / N分钟 M秒 / N分钟）。 */
function chineseDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining > 0 ? `${minutes}分钟 ${remaining}秒` : `${minutes}分钟`;
}

export function MessageTurnTail({
  start,
  end,
  model,
  usage,
  timeLabel,
  onCopy,
  onFork,
}: {
  start?: number;
  end?: number;
  model?: string;
  usage?: TokenUsage;
  /** 外部传入的时间标签（如 formatAssistantMessageTime）；缺省用 HH:MM。 */
  timeLabel?: string;
  onCopy?: () => void | Promise<void>;
  onFork?: () => void | Promise<void>;
}) {
  const readings: string[] = [];
  if (start) readings.push(timeLabel ?? formatClock(start));
  if (end && start) readings.push(chineseDuration(end - start));
  if (usage) {
    const input = usage.inputTokens ?? usage.totalTokens;
    const output = usage.outputTokens;
    if (input !== undefined || output !== undefined)
      readings.push(`${input ?? 0} tok`);
  }
  return (
    <div
      className="flex h-7 items-center gap-2.5"
      data-time-hover-root
      data-kind="message-tail"
    >
      <button
        type="button"
        title="复制回复"
        aria-label="复制回复"
        onClick={onCopy}
        className="grid h-7 w-7 place-items-center rounded-full text-text-subtle hover:bg-muted hover:text-text-normal"
      >
        <Copy className="h-4 w-4" />
      </button>
      {onFork ? (
        <button
          type="button"
          title="创建对话分支"
          aria-label="创建对话分支"
          onClick={onFork}
          className="grid h-7 w-7 place-items-center rounded-full text-text-subtle hover:bg-muted hover:text-text-normal"
        >
          <Check className="h-4 w-4" />
        </button>
      ) : null}
      {readings.length > 0 ? (
        <span
          data-time-hover-label
          className="flex items-center gap-2 whitespace-nowrap pl-3 text-[14px] leading-6 text-text-subtle"
        >
          {readings.map((r, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden>·</span> : null}
              {r}
            </span>
          ))}
          {model ? (
            <span className="flex items-center gap-2">
              <span aria-hidden>·</span>
              {model}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

// —— 流式状态行 ——

export function MessageStatusRow({
  startedAt,
  extra,
}: {
  /** 状态开始时间戳；提供时显示动态经过时间（每秒更新）。 */
  startedAt?: number;
  extra?: string;
}) {
  // tick 只作为「重渲染信号」；elapsed 在渲染时用 Date.now() 实时计算，
  // 这样即使 interval 回调被主线程（流式解析/高亮）延迟，恢复渲染时显示的
  // 就是当前准确值，不会出现"时间停住然后跳一大截"。
  const [, setTick] = useState(0);
  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const elapsed =
    startedAt === undefined
      ? null
      : chineseDuration(Math.max(0, Date.now() - startedAt));
  return (
    <div
      className="flex items-center gap-2 text-[13px] text-text-subtle"
      role="status"
      aria-live="polite"
      data-kind="message-status"
    >
      <DisclosureStateDot state="running" />
      <span className="message-status-shimmer font-medium">正在思考</span>
      {elapsed ? (
        <span className="whitespace-nowrap text-[12px]">{elapsed}</span>
      ) : null}
      {extra ? <span className="font-mono text-[12px]">{extra}</span> : null}
    </div>
  );
}
