import type { ReactNode } from "react";
import { WorkflowResultCards } from "../activity/ResultCards";
import { WorkflowAssistantAnswer } from "./AssistantAnswer";
import { WorkflowTurnErrorCard } from "./TurnErrorCard";
import { WorkflowTurnFlowSection } from "./TurnFlowSection";
import { WorkflowTurnPlanCard } from "./TurnPlanCard";
import type {
  TurnPresentationBlock,
  TurnPresentationModel,
} from "./turn-presentation-model";

interface Props {
  model: TurnPresentationModel;
  expanded: boolean;
  plainTextAnswers?: boolean;
  sessionId?: string;
  beforeAnswer?: ReactNode;
}

export function TurnPresentationBlocks({
  model,
  expanded,
  plainTextAnswers = false,
  sessionId,
  beforeAnswer,
}: Props) {
  return (
    <div className="workflow-turn-body" data-kind="turn-body">
      {model.blocks.map((block, index) => (
        <div
          key={block.id}
          className="turn-presentation-block"
          data-kind="turn-presentation-block"
          data-block-kind={block.kind}
        >
          {index ===
          model.blocks.findIndex((entry) => entry.kind === "document")
            ? beforeAnswer
            : null}
          <TurnPresentationBlockView
            block={block}
            expanded={expanded || !model.process.canCollapse}
            isLastStreaming={model.runtime.isLastStreaming}
            plainTextAnswers={plainTextAnswers}
            sessionId={sessionId}
            userMessageId={model.userMessageId}
          />
        </div>
      ))}
    </div>
  );
}

function TurnPresentationBlockView({
  block,
  expanded,
  isLastStreaming,
  plainTextAnswers,
  sessionId,
  userMessageId,
}: {
  block: TurnPresentationBlock;
  expanded: boolean;
  isLastStreaming: boolean;
  plainTextAnswers: boolean;
  sessionId?: string;
  userMessageId?: string;
}) {
  if (block.kind === "process") {
    return (
      <WorkflowTurnFlowSection
        entries={block.entries}
        expanded={expanded}
        isLastStreaming={isLastStreaming}
        renderAssistantMessage={(item) => (
          <WorkflowAssistantAnswer
            key={item.id}
            text={item.text}
            hasLeadingContent={false}
            plainText={plainTextAnswers}
            streaming={isLastStreaming && item.settled !== true}
          />
        )}
      />
    );
  }

  if (block.kind === "document") {
    return block.tone === "error" ? (
      <WorkflowTurnErrorCard
        message={block.text}
        additionalDetails={block.additionalDetails}
      />
    ) : (
      <WorkflowAssistantAnswer
        text={block.text}
        hasLeadingContent={false}
        plainText={plainTextAnswers}
        streaming={block.streaming}
      />
    );
  }

  if (block.kind === "plan") {
    return (
      <WorkflowTurnPlanCard text={block.text} streaming={block.streaming} />
    );
  }

  return (
    <WorkflowResultCards
      items={block.items}
      sessionId={sessionId}
      showFileChanges={block.showFileChanges}
      userMessageId={userMessageId}
    />
  );
}
