import styles from "./ContentDialog.module.css";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function WorkflowContentDialog({
  title,
  onClose,
  children,
  presentation = "panel",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  presentation?: "panel" | "lightbox";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={ref}
      className={`workflow-content-dialog ${styles.dialog}${presentation === "lightbox" ? ` ${styles.lightbox}` : ""}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const elements = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ];
        const first = elements[0],
          last = elements.at(-1);
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      <section className={`workflow-content-dialog-panel ${styles.panel}`}>
        <header className={styles.header}>
          <strong id={titleId} className={styles.title}>
            {title}
          </strong>
          <button
            className={`icon-button ${styles.close}`}
            type="button"
            aria-label={`关闭${title}`}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className={`workflow-content-dialog-body ${styles.body}`}>
          {children}
        </div>
      </section>
    </dialog>,
    document.body,
  );
}
