/** 统一展开行。业务层提供内容和受控状态，原生按钮负责键盘语义。 */
import { useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./disclosure-row.module.css";

export interface DisclosureRowProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title" | "children"
> {
  icon: ReactNode;
  title: ReactNode;
  /** 标题后的摘要，带分隔点，自动截断省略。 */
  summary?: ReactNode;
  /** 展开后隐藏摘要及分隔点，避免与正文重复。 */
  hideSummaryWhenOpen?: boolean;
  /** 摘要色调：subtle（默认）/ danger（失败摘要）。 */
  summaryTone?: "subtle" | "danger";
  /** 行状态：running 驱动扫光动画，error 标记供样式钩子。 */
  state?: "running" | "error" | "ok";
  /** 右侧元信息，例如 diff 统计。 */
  meta?: ReactNode;
  iconTone?: "subtle" | "danger" | "accent";
  /** 无展开内容时不可展开。 */
  expandable?: boolean;
  /** 受控展开状态；与 onOpenChange 成对传入。 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 非受控模式的初始展开。 */
  defaultOpen?: boolean;
  children?: ReactNode;
  /** 业务语义类/测试入口；布局与交互仍由公共组件管理。 */
  classNames?: Partial<
    Record<"trigger" | "icon" | "title" | "meta" | "content", string>
  >;
}

export function DisclosureRow({
  icon,
  title,
  summary,
  hideSummaryWhenOpen = false,
  summaryTone = "subtle",
  state,
  meta,
  iconTone = "subtle",
  expandable = true,
  open,
  onOpenChange,
  defaultOpen = false,
  children,
  className,
  classNames,
  ...props
}: DisclosureRowProps) {
  const contentId = useId();
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const expanded = open ?? innerOpen;
  const interactive = expandable && Boolean(onOpenChange || open === undefined);
  const toggle = () => {
    if (!interactive) return;
    if (open === undefined) setInnerOpen(!expanded);
    onOpenChange?.(!expanded);
  };
  const content = (
    <>
      <span className={styles.leading} data-tone={iconTone}>
        <span
          className={cn(
            classNames?.icon,
            "message-row-leading-icon",
            styles.leadingIcon,
          )}
        >
          {icon}
        </span>
        {interactive ? (
          <span className={`message-row-leading-chevron ${styles.chevron}`}>
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </span>
        ) : null}
      </span>
      <span className={cn(classNames?.title, styles.title)}>{title}</span>
      {summary && (!hideSummaryWhenOpen || !expanded) ? (
        <>
          <span aria-hidden className={styles.separator} />
          <span className={styles.summary} data-tone={summaryTone}>
            {summary}
          </span>
        </>
      ) : null}
      {meta != null ? (
        <span className={cn(classNames?.meta, styles.meta)}>{meta}</span>
      ) : null}
    </>
  );
  const triggerClassName = cn(
    classNames?.trigger,
    "message-disclosure-row",
    styles.row,
  );
  return (
    <div
      {...props}
      className={cn(className, "message-disclosure", styles.root)}
      data-state={state ?? "ok"}
      data-open={expanded ? "true" : "false"}
    >
      {interactive ? (
        <button
          type="button"
          className={triggerClassName}
          aria-expanded={expanded}
          aria-controls={children != null ? contentId : undefined}
          onClick={toggle}
          data-disclosure-row
        >
          {content}
        </button>
      ) : (
        <div className={cn(triggerClassName, "is-static")} data-disclosure-row>
          {content}
        </div>
      )}
      {expandable && expanded && children != null ? (
        <div id={contentId} className={cn(classNames?.content, styles.content)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** 状态点：running 呼吸 / error 红 / success 绿，色值走语义 token。 */
export function StateDot({
  state,
}: {
  state: "success" | "error" | "running";
}) {
  return <span className={styles.stateDot} data-state={state} />;
}
