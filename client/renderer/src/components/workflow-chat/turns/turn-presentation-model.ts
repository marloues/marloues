import type { WorkflowMessageBlock } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import { workflowShouldShowProcessItem } from "./turn-collapse-rules";
import {
  workflowTurnDurationLabel,
  workflowTurnStatusLabel,
  workflowTurnStatusTone,
} from "./turn-status";
import { workflowTurnLayout } from "./turn-layout";
import { workflowTurnPresentation } from "./turn-presentation";
import {
  appendProcessBlock,
  finalDocumentEntries,
  finiteNumber,
  isProcessItem,
  planItemsForPresentation,
  presentationMessage,
  resultItemsForPresentation,
  runtimeKind,
  turnIsRunning,
  withoutFinalDocument,
} from "./turn-presentation-model-helpers";
import type {
  BuildTurnPresentationModelOptions,
  TurnPresentationBlock,
  TurnPresentationModel,
} from "./turn-presentation-model-types";

export function buildTurnPresentationModel(
  message: WorkflowMessageBlock,
  {
    isLastStreaming,
    modelName,
    liveItemWindow = DEFAULT_LIVE_ITEM_WINDOW,
  }: BuildTurnPresentationModelOptions,
): TurnPresentationModel {
  const renderedMessage = presentationMessage(
    message,
    isLastStreaming,
    liveItemWindow,
  );
  const layout = workflowTurnLayout(renderedMessage);
  const activityItems = [
    ...layout.leadingActivityItems,
    ...layout.trailingActivityItems,
  ];
  const hasActivityItems =
    activityItems.length > 0 ||
    withoutFinalDocument([...layout.leadingFlow, ...layout.trailingFlow])
      .length > 0;
  const running = turnIsRunning(renderedMessage, isLastStreaming);
  const timing = message.timing;
  const recordedStartedAt = finiteNumber(message.startedAt);
  const startedAt = finiteNumber(timing?.workStartedAt);
  const finalStartedAt = finiteNumber(timing?.finalAnswerStartedAt);
  const completedAt = finalStartedAt ?? finiteNumber(message.completedAt);
  const durationMs =
    startedAt != null && completedAt != null
      ? Math.max(0, completedAt - startedAt)
      : !timing
        ? (finiteNumber(message.durationMs) ??
          // 旧记录可能只保存起止时间；用记录本身恢复耗时，不使用挂载时间。
          (recordedStartedAt != null && completedAt != null
            ? Math.max(0, completedAt - recordedStartedAt)
            : null))
        : null;
  const finalStarted = finalStartedAt != null;
  const finalEntries = finalDocumentEntries([
    ...layout.leadingFlow,
    ...layout.trailingFlow,
  ]);
  const showFileChanges = !running;
  const resultItems = resultItemsForPresentation(
    layout.resultItems,
    showFileChanges,
  );
  const planItems = planItemsForPresentation(renderedMessage.items);
  const blocks: TurnPresentationBlock[] = [];

  appendProcessBlock(
    blocks,
    "leading",
    withoutFinalDocument(layout.leadingFlow),
  );
  if (planItems.length > 0) {
    blocks.push({
      kind: "plan",
      id: planItems[0].id,
      text: planItems[0].text,
      streaming: running && isLastStreaming && planItems[0].settled !== true,
    });
  }
  if (layout.finalText.trim()) {
    blocks.push({
      kind: "document",
      id: `${renderedMessage.id}:document`,
      itemIds: finalEntries.map((entry) => entry.item.id),
      text: layout.finalText,
      tone:
        renderedMessage.activity === "failed" &&
        !isLastStreaming &&
        (!renderedMessage.error?.message ||
          renderedMessage.error.message === layout.finalText)
          ? "error"
          : "normal",
      streaming: running && isLastStreaming,
    });
  }
  appendProcessBlock(
    blocks,
    "trailing",
    withoutFinalDocument(layout.trailingFlow),
  );
  const errorText = renderedMessage.error?.message?.trim();
  if (errorText && errorText !== layout.finalText.trim()) {
    blocks.push({
      kind: "document",
      id: `${renderedMessage.id}:error`,
      itemIds: [],
      text: errorText,
      tone: "error",
      additionalDetails: renderedMessage.error?.additionalDetails,
      streaming: false,
    });
  }
  if (resultItems.length > 0) {
    blocks.push({
      kind: "results",
      id: `${renderedMessage.id}:results`,
      items: resultItems,
      showFileChanges,
    });
  }

  return {
    id: renderedMessage.id,
    userMessageId: renderedMessage.userMessageId,
    prompt: {
      text: renderedMessage.user,
      content: renderedMessage.userContent,
      createdAt: renderedMessage.startedAt,
    },
    runtime: {
      activity: renderedMessage.activity,
      status: renderedMessage.status,
      kind: runtimeKind(renderedMessage, layout.finalText, isLastStreaming),
      running,
      isLastStreaming,
      continuesPreviousTurn: Boolean(renderedMessage.continuesPreviousTurn),
      showDuration:
        !renderedMessage.continuesPreviousTurn &&
        (startedAt != null || durationMs != null),
      clockRunning: running && !finalStarted,
      timingPlacement:
        startedAt == null
          ? "hidden"
          : finalStarted
            ? "before-answer"
            : "before-process",
      startedAt,
      completedAt,
      durationMs,
    },
    chrome: {
      presentation: workflowTurnPresentation(
        renderedMessage,
        layout,
        isLastStreaming,
      ),
      label:
        (durationMs == null || durationMs < 1000) &&
        renderedMessage.status === "completed"
          ? "已完成"
          : finalStarted
            ? "处理用时"
            : workflowTurnStatusLabel(renderedMessage, {
                hasActivityItems,
                isLastStreaming,
              }),
      tone: workflowTurnStatusTone(renderedMessage),
    },
    process: {
      hasActivityItems,
      canCollapse:
        (!running || finalStarted) &&
        renderedMessage.status !== "cancelled" &&
        (renderedMessage.activity === "done" || finalStarted) &&
        !renderedMessage.error &&
        Boolean(
          layout.finalText.trim() || renderedMessage.continuationFragment,
        ) &&
        !renderedMessage.items.some(
          (item) =>
            item.type === "permissionRequest" &&
            workflowShouldShowProcessItem(item) &&
            (!item.settled ||
              ["failed", "error", "denied", "timed_out"].includes(
                String(item.status),
              )),
        ),
      stepCount: renderedMessage.items
        .filter(isProcessItem)
        .filter(workflowShouldShowProcessItem).length,
    },
    documentText: layout.finalText,
    blocks,
    metadata: {
      modelName:
        renderedMessage.modelName ?? renderedMessage.modelId ?? modelName,
      createdAt: renderedMessage.completedAt ?? renderedMessage.startedAt,
      usage: renderedMessage.usage,
      contextUsage: renderedMessage.contextUsage,
    },
  };
}

export const DEFAULT_LIVE_ITEM_WINDOW = 256;
export { workflowTurnDurationLabel };
export type {
  BuildTurnPresentationModelOptions,
  TurnPresentationBlock,
  TurnPresentationModel,
} from "./turn-presentation-model-types";
