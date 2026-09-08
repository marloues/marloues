import { TextSelectionAction } from "@/components/ui";
import { useRef } from "react";
import { useMarkdownContext } from "../content/MarkdownContext";
import { WorkflowMarkdownContent } from "../content/MarkdownContent";

interface Props {
  text: string;
  hasLeadingContent: boolean;
  plainText?: boolean;
  streaming?: boolean;
}

export function WorkflowAssistantAnswer({
  text,
  hasLeadingContent,
  plainText = false,
  streaming = false,
}: Props) {
  const { onAddSelection } = useMarkdownContext();
  const body = useRef<HTMLElement>(null);
  return (
    <article
      ref={body}
      className={`workflow-assistant-answer ${hasLeadingContent ? "has-leading-content" : ""}`}
      data-kind="assistant-answer"
    >
      {plainText ? (
        <div
          className="workflow-assistant-plain-text"
          data-render-mode={streaming ? "streaming-text" : "plain-text"}
        >
          {text}
        </div>
      ) : (
        <>
          <WorkflowMarkdownContent content={text} streaming={streaming} />
        </>
      )}
      {!streaming && onAddSelection ? (
        <TextSelectionAction
          containerRef={body}
          label="添加到对话"
          onSelect={onAddSelection}
        />
      ) : null}
    </article>
  );
}
