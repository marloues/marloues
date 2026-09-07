import {
  WorkflowMarkdownProvider,
  useMarkdownContext,
} from "../content/MarkdownContext";
import { memo, useEffect, useMemo, useState } from "react";
import { WorkflowAssistantTurn } from "./AssistantTurn";
import { WorkflowUserMessage } from "./UserMessage";
import { workflowTurnDurationLabel } from "./turn-status";
import type { WorkflowMessageBlock as WorkflowMessageBlock } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import { buildTurnPresentationModel } from "./turn-presentation-model";

interface Props {
  message: WorkflowMessageBlock;
  sessionId?: string;
  expanded: boolean;
  isLastStreaming: boolean;
  disableResponseTimer?: boolean;
  replayClockAt?: number;
  modelName?: string;
  plainTextAnswers?: boolean;
  showFooterMetadata?: boolean;
  onToggle: () => void;
  onCopy?: (text: string) => void | Promise<void>;
  onEditUserMessage?: (text: string) => void;
  onFork?: () => void | Promise<void>;
  onDelete?: (id: string) => void;
}

export const WorkflowTurnView = memo(function WorkflowTurnView({
  message,
  sessionId,
  expanded,
  isLastStreaming,
  disableResponseTimer,
  replayClockAt,
  modelName,
  plainTextAnswers,
  showFooterMetadata,
  onToggle,
  onCopy,
  onEditUserMessage,
  onFork,
  onDelete,
}: Props) {
  const markdownContext = useMarkdownContext();
  const presentationModel = useMemo(
    () =>
      buildTurnPresentationModel(message, {
        isLastStreaming,
        modelName,
        liveItemWindow: LIVE_TURN_ITEM_WINDOW,
      }),
    [isLastStreaming, message, modelName],
  );
  const duration = presentationModel.runtime.showDuration ? (
    <WorkflowTurnDuration
      canonicalDurationMs={presentationModel.runtime.durationMs}
      completedAt={presentationModel.runtime.completedAt}
      disableTimer={Boolean(disableResponseTimer)}
      running={presentationModel.runtime.clockRunning}
      startedAt={presentationModel.runtime.startedAt}
      replayClockAt={replayClockAt}
    />
  ) : null;

  return (
    <WorkflowMarkdownProvider
      value={{
        ...markdownContext,
        sessionId: sessionId ?? markdownContext.sessionId,
        turnId: message.id,
      }}
    >
      <section
        className="workflow-turn"
        data-kind="workflow-turn"
        data-turn-expanded={String(expanded)}
      >
        <WorkflowUserMessage
          text={presentationModel.prompt.text}
          content={presentationModel.prompt.content}
          createdAt={presentationModel.prompt.createdAt}
          onCopy={onCopy}
          onEdit={
            onEditUserMessage && presentationModel.prompt.text
              ? () => onEditUserMessage(presentationModel.prompt.text)
              : undefined
          }
        />

        <WorkflowAssistantTurn
          duration={duration}
          expanded={expanded}
          model={presentationModel}
          sessionId={sessionId}
          plainTextAnswers={plainTextAnswers}
          showFooterMetadata={showFooterMetadata}
          onToggle={onToggle}
          onCopy={onCopy}
          onFork={onFork}
          onDelete={onDelete}
        />
      </section>
    </WorkflowMarkdownProvider>
  );
});

const LIVE_TURN_ITEM_WINDOW = 256;

function WorkflowTurnDuration({
  canonicalDurationMs,
  completedAt,
  disableTimer,
  running,
  startedAt,
  replayClockAt,
}: {
  canonicalDurationMs: number | null;
  completedAt: number | null;
  disableTimer: boolean;
  running: boolean;
  startedAt: number | null;
  replayClockAt?: number;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (
      disableTimer ||
      replayClockAt !== undefined ||
      !running ||
      startedAt == null
    )
      return undefined;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [disableTimer, running, startedAt, replayClockAt]);

  // History without timing data has no duration. Mount time is not task time.
  const durationMs =
    !disableTimer && running && startedAt != null
      ? Math.max(0, (replayClockAt ?? now) - startedAt)
      : (canonicalDurationMs ??
        (startedAt != null && completedAt != null
          ? Math.max(0, completedAt - startedAt)
          : null));
  return <>{workflowTurnDurationLabel(durationMs, { running })}</>;
}
