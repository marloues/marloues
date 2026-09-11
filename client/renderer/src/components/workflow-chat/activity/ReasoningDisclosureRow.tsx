import { Brain } from "lucide-react";
import { DisclosureRow, type DisclosureRowProps } from "@/components/ui";
import styles from "./ReasoningDisclosureRow.module.css";

interface Props {
  text: string;
}

type DisclosureProps = Pick<
  DisclosureRowProps,
  "open" | "defaultOpen" | "onOpenChange"
>;

export function WorkflowReasoningDisclosureRow({
  text,
  ...disclosure
}: Props & DisclosureProps) {
  if (!text.trim()) return null;
  const summary = text.replace(/\s+/g, " ").trim();
  const clipped =
    summary.length > 80 ? `${summary.slice(0, 79).trimEnd()}…` : summary;
  return (
    <DisclosureRow
      {...disclosure}
      icon={<Brain />}
      title="思考"
      summary={clipped}
      hideSummaryWhenOpen
      data-activity-kind="reasoning"
    >
      <div className={styles.body} data-kind="message-think-body">
        {text}
      </div>
    </DisclosureRow>
  );
}
