import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
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
  const [selection, setSelection] = useState("");
  return (
    <article
      ref={body}
      onMouseUp={() => {
        const current = window.getSelection();
        setSelection(
          !streaming &&
            current &&
            body.current?.contains(current.anchorNode) &&
            body.current.contains(current.focusNode)
            ? current.toString().trim()
            : "",
        );
      }}
      onKeyUp={() => {
        const current = window.getSelection();
        setSelection(
          !streaming &&
            current &&
            body.current?.contains(current.anchorNode) &&
            body.current.contains(current.focusNode)
            ? current.toString().trim()
            : "",
        );
      }}
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
      {!streaming && selection && onAddSelection ? (
        <Button
          size="sm"
          variant="outline"
          type="button"
          className="workflow-selection-action"
          data-copy-exclude
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onAddSelection(selection);
            setSelection("");
          }}
        >
          添加选区到输入框
        </Button>
      ) : null}
    </article>
  );
}
