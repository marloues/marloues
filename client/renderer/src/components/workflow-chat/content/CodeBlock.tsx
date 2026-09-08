import styles from "./CodeBlock.module.css";
import { useMarkdownContext } from "./MarkdownContext";
import type { ReactElement, ReactNode } from "react";
import { WorkflowDetailCopyButton } from "../activity/DetailCopyButton";
import { WrapText } from "lucide-react";
import { useCodePreferences } from "./code-preferences";
import { WorkflowMermaidBlock } from "./MermaidBlock";
import { Button, FloatingActions } from "@/components/ui";

export function WorkflowCodeBlock({
  children,
  fenceOpen = false,
}: {
  children?: ReactNode;
  fenceOpen?: boolean;
}) {
  const codeElement = Array.isArray(children)
    ? children.find(isCodeElement)
    : isCodeElement(children)
      ? children
      : null;
  const language = languageFromClass(codeElement?.props?.className);
  const text = textFromNode(codeElement?.props?.children ?? children);
  const { writingBlockMode } = useMarkdownContext();
  const wrap = useCodePreferences((state) => state.wrap);
  const toggleWrap = useCodePreferences((state) => state.toggleWrap);
  if (
    language.toLowerCase() === "mermaid" ||
    (fenceOpen &&
      language.length >= 2 &&
      "mermaid".startsWith(language.toLowerCase()))
  ) {
    return <WorkflowMermaidBlock code={text} fenceOpen={fenceOpen} />;
  }

  if (
    writingBlockMode &&
    (!language || language === "markdown" || language === "md")
  )
    return (
      <section
        className={`workflow-writing-block ${styles.writing}`}
        data-kind="writing-block"
        data-floating-actions-host
      >
        <div className={styles.header} data-copy-exclude>
          <span>写作</span>
        </div>
        {!fenceOpen ? (
          <FloatingActions>
            <WorkflowDetailCopyButton value={text} label="复制写作内容" />
          </FloatingActions>
        ) : null}
        <pre className={styles.body}>{text}</pre>
      </section>
    );
  return (
    <div
      className={`workflow-code-block ${styles.root}`}
      data-kind="workflow-code-block"
      data-floating-actions-host
    >
      <div className="workflow-code-block-header" data-copy-exclude>
        <span className="workflow-code-block-language">
          {language || "text"}
        </span>
      </div>
      <FloatingActions>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={styles.wrap}
          aria-label="代码自动换行"
          title="代码自动换行"
          aria-pressed={wrap}
          onClick={toggleWrap}
        >
          <WrapText size={14} />
        </Button>
        {!fenceOpen ? (
          <WorkflowDetailCopyButton value={text} label="复制代码" />
        ) : null}
      </FloatingActions>
      <pre className="workflow-code-block-body" data-wrap={wrap}>
        {children}
      </pre>
    </div>
  );
}

function isCodeElement(
  value: ReactNode,
): value is ReactElement<{ className?: string; children?: ReactNode }> {
  return Boolean(
    value &&
    typeof value === "object" &&
    "props" in value &&
    ((value as { type?: unknown }).type === "code" ||
      (value as ReactElement<{ node?: { tagName?: string } }>).props.node
        ?.tagName === "code"),
  );
}

function languageFromClass(className?: string): string {
  const match = className?.match(/language-([\w-]+)/);
  return match?.[1] ?? "";
}

function textFromNode(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(textFromNode).join("");
  if (value && typeof value === "object" && "props" in value) {
    return textFromNode(
      (value as { props?: { children?: ReactNode } }).props?.children,
    );
  }
  return "";
}
