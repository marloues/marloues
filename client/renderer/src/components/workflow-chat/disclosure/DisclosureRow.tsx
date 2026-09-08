/**
 * 披露行共享外壳：过程区 / 消息区各类行组件的统一行原语。
 *
 * 视觉契约（由简化渲染验证品固化）：
 *   - 16px 固定图标槽：hover 时图标 → chevron（纯 CSS，见 disclosure.css）
 *   - title + 分隔点 + 摘要（摘要 flex-1 truncate，就地省略）
 *   - 状态：running 扫光（CSS data-state 驱动）、失败 icon 槽传红点
 *   - 宽度约束：min-w-0 max-w-full，防 grid 容器被内容撑宽
 *   - 键盘可达：Enter / Space 展开，aria-expanded
 *
 * 展开状态两种模式：
 *   - 受控：父组件传 open + onToggle（专用行组件用 useItemDisclosure 持久记忆）
 *   - 非受控：内部局部 useState（fixture / 简单场景）
 *
 * DOM 契约标记：data-activity-kind（组件化路由）与 data-tool（工具名）同时携带，
 * 两套测试断言都由此满足。配色统一走主题语义 token。
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import "./disclosure.css";

export interface DisclosureRowProps {
  icon: ReactNode;
  title: ReactNode;
  /** 折叠态摘要：title 后跟分隔点，自动截断省略。 */
  summary?: ReactNode;
  /** 摘要色调：subtle（默认）/ danger（失败摘要）。 */
  summaryTone?: "subtle" | "danger";
  /** 行状态：running 驱动扫光动画，error 标记供样式钩子。 */
  state?: "running" | "error" | "ok";
  /** data-activity-kind：活动区组件化契约（传 item.type）。 */
  activityKind?: string;
  /** data-tool：工具名标记（验证路径契约）。 */
  toolName?: string;
  /** 无展开内容时不可展开。 */
  expandable?: boolean;
  /** 受控展开状态；与 onToggle 成对传入。 */
  open?: boolean;
  onToggle?: () => void;
  /** 非受控模式的初始展开。 */
  defaultOpen?: boolean;
  children?: ReactNode;
}

export function DisclosureRow({
  icon,
  title,
  summary,
  summaryTone = "subtle",
  state,
  activityKind,
  toolName,
  expandable = true,
  open,
  onToggle,
  defaultOpen = false,
  children,
}: DisclosureRowProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const expanded = open ?? innerOpen;
  const interactive = expandable && Boolean(onToggle || open === undefined);
  const toggle = () => {
    if (!interactive) return;
    if (onToggle) onToggle();
    else setInnerOpen((value) => !value);
  };

  return (
    <div
      className="message-disclosure relative flex min-w-0 max-w-full flex-col"
      data-state={state ?? "ok"}
      data-tool={toolName}
      data-activity-kind={activityKind}
    >
      <div
        className="message-disclosure-row relative flex min-h-6 items-center gap-2 overflow-hidden rounded-md py-0.5 hover:bg-muted/30"
        role="button"
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={interactive ? expanded : undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (interactive && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            toggle();
          }
        }}
        data-disclosure-row
      >
        {/* leading：16px 固定槽，可展开时 hover 图标 → chevron（纯 CSS） */}
        <span className="relative grid h-4 w-4 shrink-0 place-items-center text-text-subtle">
          <span className="message-row-leading-icon grid">{icon}</span>
          {interactive ? (
            <span className="message-row-leading-chevron absolute inset-0 grid place-items-center">
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </span>
        <span className="text-sm leading-6 text-text-normal">{title}</span>
        {summary ? (
          <>
            <span
              aria-hidden
              className="h-0.5 w-0.5 shrink-0 rounded-full bg-text-subtle/60"
            />
            <span
              className={`min-w-0 flex-1 truncate text-sm leading-6 ${
                summaryTone === "danger" ? "text-danger" : "text-text-subtle"
              }`}
            >
              {summary}
            </span>
          </>
        ) : null}
        {interactive && expanded ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-text-subtle" />
        ) : null}
      </div>
      {interactive && expanded ? children : null}
    </div>
  );
}

/** 状态点：running 呼吸 / error 红 / success 绿，色值走语义 token。 */
export function DisclosureStateDot({
  state,
}: {
  state: "success" | "error" | "running";
}) {
  if (state === "running") {
    return (
      <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
    );
  }
  if (state === "error") {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger" />;
  }
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-success" />;
}
