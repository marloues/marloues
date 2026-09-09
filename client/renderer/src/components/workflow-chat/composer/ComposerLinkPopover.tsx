import {
  forwardRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
  type Ref,
} from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Link2,
  PencilLine,
  Trash2,
} from "lucide-react";
import { normalizeUrl } from "./composer-attachments";
import type { ComposerLinkSelection } from "./composer-link-tokens";

type LinkEditMode = "text" | "url";

type Props = {
  target: ComposerLinkSelection;
  onClose: () => void;
  onUpdate: (label: string, href: string | null) => void;
};

const POPOVER_WIDTH = 336;

function ComposerLinkPopoverImpl(
  { target, onClose, onUpdate }: Props,
  ref: Ref<HTMLDivElement>,
): ReactElement {
  const [mode, setMode] = useState<LinkEditMode | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const style: CSSProperties = {
    left: Math.max(
      8,
      Math.min(target.rect.left, window.innerWidth - POPOVER_WIDTH - 8),
    ),
    top: Math.min(target.rect.bottom + 6, window.innerHeight - 150),
    width: Math.min(POPOVER_WIDTH, window.innerWidth - 16),
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "text") {
      const label = value.trim();
      if (!label) return;
      onUpdate(label, target.href);
      return;
    }
    if (mode !== "url") return;

    const href = normalizeUrl(value);
    if (!value.trim()) {
      onUpdate(target.label, null);
      return;
    }
    if (!href) {
      setError("请输入 http 或 https 链接");
      return;
    }
    onUpdate(target.label, href);
  };

  return (
    <div
      ref={ref}
      className="composer-link-editor-popover"
      role="dialog"
      aria-label="链接选项"
      style={style}
      onMouseDown={(event) => {
        if (mode === null) event.preventDefault();
      }}
    >
      {mode === null ? (
        <div className="composer-link-actions-row">
          <button
            type="button"
            onClick={() => {
              window.open(target.href, "_blank", "noopener,noreferrer");
              onClose();
            }}
          >
            <ExternalLink size={14} aria-hidden="true" />
            <span>打开链接</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(target.label);
              setError(null);
              setMode("text");
            }}
          >
            <PencilLine size={14} aria-hidden="true" />
            <span>编辑文字</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(target.href);
              setError(null);
              setMode("url");
            }}
          >
            <Link2 size={14} aria-hidden="true" />
            <span>编辑链接</span>
          </button>
          <button
            type="button"
            className="composer-link-remove"
            onClick={() => onUpdate(target.label, null)}
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>移除链接</span>
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <button
            type="button"
            className="composer-link-back"
            aria-label="返回链接选项"
            onClick={() => {
              setMode(null);
              setValue("");
              setError(null);
            }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
          </button>
          <input
            type={mode === "url" ? "text" : "text"}
            aria-label={mode === "url" ? "链接 URL" : "链接文字"}
            placeholder={mode === "url" ? "https://example.com" : "链接文字"}
            value={value}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
          <button
            type="submit"
            aria-label="保存链接"
            disabled={mode === "text" && !value.trim()}
          >
            <Check size={14} aria-hidden="true" />
          </button>
          {error ? (
            <p className="composer-link-editor-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}

export const ComposerLinkPopover = forwardRef(ComposerLinkPopoverImpl);
