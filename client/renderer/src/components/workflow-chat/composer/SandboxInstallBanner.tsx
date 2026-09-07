import { FileLock2, Globe2, SquareTerminal, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface FullAccessConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  returnFocusTo?: HTMLElement | null;
}

export function FullAccessConfirmDialog({
  onConfirm,
  onCancel,
  returnFocusTo,
}: FullAccessConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = returnFocusTo ?? document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [returnFocusTo]);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="full-access-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="full-access-dialog-title"
      aria-describedby="full-access-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons =
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="full-access-header">
        <TriangleAlert size={19} aria-hidden="true" />
        <div>
          <h2 id="full-access-dialog-title">要开启完全访问权限吗？</h2>
          <p id="full-access-dialog-description">
            Marloues
            将能够在未经你许可的情况下运行命令、访问互联网，以及创建和编辑文件。
          </p>
        </div>
      </header>
      <div className="full-access-capabilities">
        <div>
          <FileLock2 size={18} aria-hidden="true" />
          <span>
            <strong>文件和文件夹</strong>
            <small>读取、创建、修改或删除此计算机任意位置的文件</small>
          </span>
        </div>
        <div>
          <SquareTerminal size={18} aria-hidden="true" />
          <span>
            <strong>终端命令</strong>
            <small>运行命令、安装软件和更改系统设置</small>
          </span>
        </div>
        <div>
          <Globe2 size={18} aria-hidden="true" />
          <span>
            <strong>互联网和已连接的应用</strong>
            <small>访问网站、发送数据并使用已启用的连接</small>
          </span>
        </div>
      </div>
      <p className="full-access-warning">
        这可能带来敏感数据丢失或泄露、提示注入等风险。你可以随时切回请求批准。
      </p>
      <footer className="full-access-actions">
        <button type="button" className="full-access-cancel" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="full-access-confirm"
          onClick={onConfirm}
        >
          <TriangleAlert size={14} aria-hidden="true" />
          确认
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
