import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";
import { hoverPreviewPosition } from "./hover-preview-position";
import styles from "./text-selection-action.module.css";

/** 选区操作复用统一按钮，悬浮于选中文字附近，不占内容布局。 */
export function TextSelectionAction({
  containerRef,
  label,
  onSelect,
}: {
  containerRef: RefObject<HTMLElement | null>;
  label: string;
  onSelect: (text: string) => void;
}) {
  const actionRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    text: string;
    range: Range;
  } | null>(null);
  const [position, setPosition] =
    useState<ReturnType<typeof hoverPreviewPosition>>(null);

  useEffect(() => {
    let dragging = false;
    const sync = () => {
      if (dragging) return;
      const current = window.getSelection();
      const container = containerRef.current;
      const text = current?.toString().trim();
      if (
        !text ||
        !current?.rangeCount ||
        !container ||
        !container.contains(current.anchorNode) ||
        !container.contains(current.focusNode)
      ) {
        setSelection(null);
        return;
      }
      setSelection({ text, range: current.getRangeAt(0).cloneRange() });
    };
    const down = (event: PointerEvent) => {
      if (actionRef.current?.contains(event.target as Node)) return;
      dragging = true;
      setSelection(null);
    };
    const up = (event: PointerEvent) => {
      dragging = false;
      if (actionRef.current?.contains(event.target as Node)) return;
      if (containerRef.current?.contains(event.target as Node)) sync();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && (event.shiftKey || event.key === "Shift"))
        sync();
    };
    const cancel = () => {
      dragging = false;
      setSelection(null);
    };
    document.addEventListener("selectionchange", sync);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", keyDown);
    document.addEventListener("keyup", keyUp);
    window.addEventListener("blur", cancel);
    return () => {
      document.removeEventListener("selectionchange", sync);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("keydown", keyDown);
      document.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", cancel);
    };
  }, [containerRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const action = actionRef.current;
    if (!selection || !container || !action) {
      setPosition(null);
      return;
    }
    const sync = () => {
      if (!container.contains(selection.range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const bounds = {
        left: 0,
        right: window.innerWidth,
        top: 0,
        bottom: window.innerHeight,
      };
      for (
        let parent = container.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        const css = getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
          bounds.top = Math.max(bounds.top, rect.top);
          bounds.bottom = Math.min(bounds.bottom, rect.bottom);
        }
        if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) {
          bounds.left = Math.max(bounds.left, rect.left);
          bounds.right = Math.min(bounds.right, rect.right);
        }
        if (parent.matches(".messages-scroll")) {
          const dockHeight =
            parseFloat(css.getPropertyValue("--interaction-dock-safe-area")) ||
            0;
          bounds.bottom = Math.min(bounds.bottom, rect.bottom - dockHeight);
        }
      }
      const rect = selection.range.getBoundingClientRect();
      const size = action.getBoundingClientRect();
      const next = hoverPreviewPosition(rect, bounds, {
        width: size.width,
        height: size.height,
        preferredSide: "top",
      });
      if (!next || next.maxHeight < size.height) {
        setSelection(null);
        return;
      }
      setPosition(next);
    };
    sync();
    const resize = new ResizeObserver(sync);
    resize.observe(container);
    resize.observe(action);
    document.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      resize.disconnect();
      document.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [containerRef, selection]);

  if (!selection) return null;
  return createPortal(
    <div
      ref={actionRef}
      className={styles.root}
      data-selection-action
      data-copy-exclude
      data-side={position?.side}
      style={
        position
          ? { left: position.left, top: position.top }
          : { visibility: "hidden" }
      }
    >
      <Button
        size="sm"
        variant="ghost"
        className={styles.action}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onSelect(selection.text);
          setSelection(null);
          window.getSelection()?.removeAllRanges();
        }}
      >
        {label}
      </Button>
    </div>,
    document.body,
  );
}
