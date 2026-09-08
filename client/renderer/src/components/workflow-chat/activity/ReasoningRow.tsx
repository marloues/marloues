import { useItemDisclosure } from "../content/conversation-ui-state";
import { Brain } from "lucide-react";
import { DisclosureRow, StateDot } from "@/components/ui";
import { MessageThinkRow } from "../message-view";
import type { WorkflowTurnItem } from "../../../../../shared/adapters/workflow-messages-to-read-thread";

type ReasoningItemModel = Extract<WorkflowTurnItem, { type: "reasoning" }>;

interface Props {
  item: ReasoningItemModel;
  defaultOpen?: boolean;
}

export function WorkflowReasoningRow({ item, defaultOpen = false }: Props) {
  const [open, setOpen] = useItemDisclosure(item.id, defaultOpen);
  const text =
    item.content
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n\n") ||
    item.summary ||
    "";
  if (text.trim()) {
    return <MessageThinkRow text={text} open={open} onOpenChange={setOpen} />;
  }
  const thinking = !item.encrypted && !item.settled;
  return (
    <DisclosureRow
      icon={thinking ? <StateDot state="running" /> : <Brain />}
      title={
        item.encrypted ? "思考内容已隐藏" : thinking ? "正在思考…" : "思考完成"
      }
      expandable={false}
      data-kind="think-row"
      data-activity-kind="reasoning"
    />
  );
}
