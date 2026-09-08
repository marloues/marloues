import styles from "./MarkdownTable.module.css";
import { useRef, useState, type ReactNode } from "react";
import { Check, Copy, Maximize2 } from "lucide-react";
import { WorkflowContentDialog } from "./ContentDialog";
import { cleanCopiedHtml, copyConversationContent } from "./clipboard";
import { useCopyFeedback } from "./use-copy-feedback";
import { Button, FloatingActions } from "@/components/ui";

export function WorkflowMarkdownTable({
  children,
  source,
}: {
  children?: ReactNode;
  source: string;
}) {
  const table = useRef<HTMLTableElement>(null);
  const [expanded, setExpanded] = useState(false);
  const { copied, copy } = useCopyFeedback(source);
  return (
    <div
      className={`workflow-markdown-table ${styles.root}`}
      data-kind="markdown-table"
      data-floating-actions-host
    >
      <FloatingActions className="workflow-table-actions">
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label="展开表格"
          title="展开表格"
          aria-haspopup="dialog"
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        >
          <Maximize2 size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label={copied ? "已复制表格" : "复制表格"}
          title="复制表格"
          onClick={() =>
            void copy(async () => {
              if (!table.current) throw new Error("表格未就绪");
              await copyConversationContent({
                text: source,
                html: cleanCopiedHtml(table.current),
              });
            })
          }
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
      </FloatingActions>
      <div
        className={`workflow-table-scroll ${styles.scroll}`}
        tabIndex={0}
        role="region"
        aria-label="表格，支持横向滚动"
      >
        <table ref={table}>{children}</table>
      </div>
      {expanded ? (
        <WorkflowContentDialog
          title="表格预览"
          presentation="lightbox"
          onClose={() => setExpanded(false)}
        >
          <div
            className={`workflow-markdown workflow-table-preview ${styles.preview}`}
          >
            <table>{children}</table>
          </div>
        </WorkflowContentDialog>
      ) : null}
    </div>
  );
}
