/** Legacy single-item entry kept for the frozen comparison fixture. */

import { memo } from "react";
import { Brain } from "lucide-react";
import type { WorkflowTurnItem } from "@shared/adapters/workflow-messages-to-read-thread";
import { DisclosureRow } from "@/components/ui";
import { WorkflowAgentMessageView } from "./turns/AgentMessageView";
import { WorkflowMessageStatusRow } from "./turns/MessageStatusRow";
import { WorkflowMessageTurnTail } from "./turns/MessageTurnTail";
import { WorkflowMessageUserRow } from "./turns/MessageUserRow";
import { WorkflowReasoningDisclosureRow } from "./activity/ReasoningDisclosureRow";
import { WorkflowToolDisclosureRow } from "./activity/ToolDisclosureRow";
import { ToolDetail } from "./activity/ToolCallRowDetails";
import { useMarkdownContext } from "./content/MarkdownContext";
import { fileReadPresentation } from "./activity/file-read-presentation";
import { WorkflowFileReadRow } from "./activity/FileReadRow";
import { useItemDisclosure } from "./content/conversation-ui-state";
import { AskUserQuestionCard } from "./activity/AskUserQuestionCard";
import { PlanModeCard } from "./activity/PlanModeCard";
import { IoCard } from "./disclosure/IoCard";
import { itemInputText, itemOutputText } from "./adapter/item-text";

export { StateDot as MessageStateDot } from "@/components/ui";
export {
  formatMessageDuration as formatDuration,
  formatMessageClock as formatClock,
} from "./turns/message-view-format";
export { WorkflowMessageUserRow as MessageUserRow };
export { WorkflowReasoningDisclosureRow as MessageThinkRow };
export { WorkflowToolDisclosureRow as MessageToolRow };
export { WorkflowMessageTurnTail as MessageTurnTail };
export { WorkflowMessageStatusRow as MessageStatusRow };

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

/** @deprecated Production rendering routes through WorkflowTurnItemRenderer. */
export const MessageItemView = memo(function MessageItemView({
  item,
}: {
  item: WorkflowTurnItem;
}) {
  const [open, setOpen] = useItemDisclosure(item.id);
  const { cwd } = useMarkdownContext();
  const fileRead = fileReadPresentation(item, cwd);
  if (fileRead)
    return (
      <WorkflowFileReadRow
        presentation={fileRead}
        name={itemName(item)}
        activityKind={item.type}
      />
    );
  if (item.type === "agentMessage") {
    // Keep empty streaming text mounted so MarkdownContent does not remount
    // when the first buffered chunk arrives.
    return <WorkflowAgentMessageView item={item} />;
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
      return (
        <DisclosureRow
          icon={<Brain />}
          title="思考内容已隐藏"
          expandable={false}
          data-kind="message-think-hidden"
          data-activity-kind="reasoning"
        />
      );
    }
    return (
      <WorkflowReasoningDisclosureRow
        text={text}
        open={open}
        onOpenChange={setOpen}
      />
    );
  }
  if (
    item.type === "dynamicToolCall" ||
    item.type === "mcpToolCall" ||
    item.type === "webSearch"
  ) {
    if (item.type === "dynamicToolCall") {
      if (item.tool === "EnterPlanMode") return <PlanModeCard item={item} />;
      if (item.tool === "AskUserQuestion") {
        return <AskUserQuestionCard item={item} />;
      }
    }
    const failed = itemFailed(item);
    const running = itemRunning(item);
    const detailItem = item as ToolDetailItem;
    const detail = (
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
    );
    return (
      <WorkflowToolDisclosureRow
        open={open}
        onOpenChange={setOpen}
        activityKind={item.type}
        name={itemName(item)}
        summary={itemInputText(detailItem)}
        failed={failed}
        running={running}
        errorSummary={
          failed
            ? itemOutputText(detailItem).split("\n")[0] || "执行失败"
            : undefined
        }
        detail={detail}
      />
    );
  }
  if (item.type === "commandExecution" || item.type === "fileChange") {
    const failed = itemFailed(item);
    const input = itemInputText(item);
    const output = itemOutputText(item);
    return (
      <WorkflowToolDisclosureRow
        open={open}
        onOpenChange={setOpen}
        activityKind={item.type}
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
