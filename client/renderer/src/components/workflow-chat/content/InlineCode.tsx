import styles from "./InlineCode.module.css";
import type { ReactNode } from "react";
import { WorkflowMarkdownLink } from "./MarkdownLink";
import { useCopyFeedback } from "./use-copy-feedback";
import { copyConversationContent } from "./clipboard";
export function WorkflowInlineCode({ children }: { children?: ReactNode }) {
  const text =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? children.join("")
        : "";
  const { copy, copied } = useCopyFeedback(text);
  const path =
    /^(?:\.{0,2}\/|[A-Za-z]:[\\/])[^\n]+$/.test(text) ||
    /^[\w.-]+\.[a-zA-Z0-9]{1,8}(?::\d+(?::\d+)?)?$/.test(text);
  return path ? (
    <code>
      <WorkflowMarkdownLink href={text}>{children}</WorkflowMarkdownLink>
    </code>
  ) : (
    <code>
      <button
        type="button"
        className={`workflow-inline-code-copy ${styles.copy}`}
        title={copied ? "已复制" : "复制代码"}
        aria-label={copied ? "已复制" : `复制 ${text}`}
        onClick={() => void copy(() => copyConversationContent({ text }))}
      >
        {children}
      </button>
    </code>
  );
}
