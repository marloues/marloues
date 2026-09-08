import type { ReactNode } from "react";
import { DisclosureRow } from "@/components/ui";
import styles from "./ActivityRow.module.css";
import { cn } from "@/lib/utils";

interface WorkflowActivityRowProps {
  activityKind: string;
  icon: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  detail?: ReactNode;
  hasDetail?: boolean;
  open?: boolean;
  onToggle?: () => void;
  iconTone?: "muted" | "danger" | "accent";
  activityState?: string;
  activitySource?: string;
  className?: string;
  detailVariant?: "default" | "plain";
}

export function WorkflowActivityRow({
  activityKind,
  icon,
  label,
  meta,
  detail,
  hasDetail = Boolean(detail),
  open = false,
  onToggle,
  iconTone = "muted",
  activityState,
  activitySource,
  className,
  detailVariant = "default",
}: WorkflowActivityRowProps) {
  return (
    <DisclosureRow
      className={cn("workflow-activity-row", className)}
      data-kind="activity-row"
      data-activity-kind={activityKind}
      data-activity-state={activityState}
      data-activity-source={activitySource}
      icon={icon}
      iconTone={iconTone === "muted" ? "subtle" : iconTone}
      title={label}
      meta={meta}
      expandable={hasDetail}
      open={open}
      onOpenChange={onToggle ? () => onToggle() : undefined}
      classNames={{
        trigger: "workflow-activity-row-button",
        icon: `workflow-activity-row-icon is-${iconTone}`,
        title: "workflow-activity-row-label",
        meta: "workflow-activity-row-meta",
        content: cn(
          "workflow-activity-detail",
          detailVariant === "default" && styles.detail,
        ),
      }}
    >
      {detail}
    </DisclosureRow>
  );
}

export function WorkflowActivityStatusBadge({ failed }: { failed?: boolean }) {
  if (!failed) return null;
  return <span className="workflow-activity-status is-error">失败</span>;
}

export function WorkflowInlineDots() {
  return (
    <span className="workflow-activity-inline-dots" aria-label="进行中">
      <span />
      <span />
      <span />
    </span>
  );
}
