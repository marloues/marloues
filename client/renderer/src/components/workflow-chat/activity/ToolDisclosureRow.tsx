import type { ReactNode } from "react";
import {
  DisclosureRow,
  StateDot,
  type DisclosureRowProps,
} from "@/components/ui";
import { toolIconFor } from "../disclosure/tool-icon";
import { toolDisplayName } from "./ToolCallRowDetails/labels";

interface Props {
  name: string;
  summary: string;
  failed: boolean;
  running: boolean;
  errorSummary?: string;
  detail?: ReactNode;
  activityKind?: string;
}

type DisclosureProps = Pick<DisclosureRowProps, "open" | "onOpenChange">;

export function WorkflowToolDisclosureRow({
  name,
  summary,
  failed,
  running,
  errorSummary,
  detail,
  activityKind,
  ...disclosure
}: Props & DisclosureProps) {
  const summaryText = failed && errorSummary ? errorSummary : summary;
  return (
    <DisclosureRow
      {...disclosure}
      icon={failed ? <StateDot state="error" /> : toolIconFor(name)}
      title={toolDisplayName(name)}
      summary={summaryText || undefined}
      summaryTone={failed ? "danger" : "subtle"}
      state={failed ? "error" : running ? "running" : "ok"}
      data-tool={name}
      data-activity-kind={activityKind}
      expandable={Boolean(detail)}
    >
      {detail}
    </DisclosureRow>
  );
}
