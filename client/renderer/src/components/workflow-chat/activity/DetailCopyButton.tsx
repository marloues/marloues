import { Check, Copy } from "lucide-react";
import { copyConversationContent } from "../content/clipboard";
import { useCopyFeedback } from "../content/use-copy-feedback";

export function WorkflowDetailCopyButton({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const { copied, copy } = useCopyFeedback(value);

  const copyValue = async () => {
    if (!value) return;
    await copy(() => copyConversationContent({ text: value }));
  };

  return (
    <button
      type="button"
      className="workflow-detail-copy-button"
      onClick={(event) => {
        event.stopPropagation();
        void copyValue();
      }}
      title={copied ? "已复制" : label}
      aria-label={copied ? "已复制" : label}
    >
      {copied ? <Check /> : <Copy />}
    </button>
  );
}
