import { useEffect, useRef, useState } from "react";
import { AssistantTurnHeader } from "./AssistantTurnHeader";
import type { ReactNode } from "react";
import { WorkflowTurnFooterView } from "./TurnFooterView";
import { WorkflowTurnShell } from "./TurnShell";
import { TurnPresentationBlocks } from "./TurnPresentationBlocks";
import type { TurnPresentationModel } from "./turn-presentation-model";

interface Props {
  model: TurnPresentationModel;
  duration: ReactNode;
  expanded: boolean;
  sessionId?: string;
  plainTextAnswers?: boolean;
  showFooterMetadata?: boolean;
  onToggle: () => void;
  onCopy?: (text: string) => void | Promise<void>;
  onFork?: () => void | Promise<void>;
  onDelete?: (id: string) => void;
}

export function WorkflowAssistantTurn({
  model,
  duration,
  expanded,
  sessionId,
  plainTextAnswers = false,
  showFooterMetadata = true,
  onToggle,
  onCopy,
  onFork,
  onDelete,
}: Props) {
  const wasRunning = useRef(model.runtime.running);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (wasRunning.current && !model.runtime.running)
      setAnnouncement(
        model.runtime.status === "cancelled"
          ? "任务已停止"
          : model.runtime.status === "failed"
            ? "任务执行失败"
            : "答复已完成",
      );
    wasRunning.current = model.runtime.running;
  }, [model.runtime.running, model.runtime.status]);
  const processExpanded = expanded || !model.process.canCollapse;
  const headerModelName =
    showFooterMetadata &&
    model.metadata.modelName &&
    model.metadata.modelName !== "Marloues"
      ? model.metadata.modelName
      : undefined;

  const deferHeader =
    model.chrome.presentation.showHeader &&
    !model.process.canCollapse &&
    processExpanded &&
    model.runtime.timingPlacement === "before-answer" &&
    model.blocks.some((block) => block.kind === "document");
  const answerHeader = deferHeader ? (
    <AssistantTurnHeader
      activity={model.runtime.activity}
      duration={duration}
      expanded={processExpanded}
      hasActivityItems={model.process.hasActivityItems}
      canToggle={model.process.canCollapse && model.process.hasActivityItems}
      label={model.chrome.label}
      tone={model.chrome.tone}
      onToggle={onToggle}
      modelName={headerModelName}
    />
  ) : null;
  return (
    <WorkflowTurnShell
      duration={duration}
      deferHeader={deferHeader}
      expanded={processExpanded}
      model={model}
      onToggle={onToggle}
      modelName={headerModelName}
    >
      <TurnPresentationBlocks
        model={model}
        beforeAnswer={answerHeader}
        expanded={processExpanded}
        plainTextAnswers={plainTextAnswers}
        sessionId={sessionId}
      />

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <WorkflowTurnFooterView
        finalText={model.documentText}
        isRunning={model.runtime.running}
        messageId={model.id}
        createdAt={model.metadata.createdAt}
        showFooterMetadata={showFooterMetadata}
        onCopy={onCopy}
        onFork={onFork}
        onDelete={onDelete}
      />
    </WorkflowTurnShell>
  );
}
