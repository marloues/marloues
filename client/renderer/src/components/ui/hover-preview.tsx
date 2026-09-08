import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  hoverPreviewPosition,
  type PreviewBounds,
} from "./hover-preview-position";
import styles from "./hover-preview.module.css";

export function HoverPreview({
  anchorRef,
  children,
  label,
  className = "",
  getBoundary,
  openDelay = 0,
  width = 620,
  limitWidthToAnchor = false,
  horizontalBoundary = "clipping-ancestors",
}: {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  label: string;
  className?: string;
  getBoundary?: (anchor: HTMLElement) => PreviewBounds | undefined;
  openDelay?: number;
  width?: number;
  limitWidthToAnchor?: boolean;
  horizontalBoundary?: "viewport" | "clipping-ancestors";
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] =
    useState<ReturnType<typeof hoverPreviewPosition>>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingOpen = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = null;
  }, []);
  const keepOpen = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);
  const close = useCallback(() => {
    cancelPendingOpen();
    keepOpen();
    setOpen(false);
  }, [cancelPendingOpen, keepOpen]);
  const hideSoon = useCallback(() => {
    cancelPendingOpen();
    keepOpen();
    hideTimer.current = setTimeout(() => setOpen(false), 160);
  }, [cancelPendingOpen, keepOpen]);
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const show = () => {
      cancelPendingOpen();
      keepOpen();
      setOpen(true);
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      cancelPendingOpen();
      keepOpen();
      if (popupRef.current) return;
      if (openDelay > 0) showTimer.current = setTimeout(show, openDelay);
      else show();
    };
    const blur = (event: FocusEvent) => {
      if (!popupRef.current?.contains(event.relatedTarget as Node)) hideSoon();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    anchor.addEventListener("pointerenter", enter);
    anchor.addEventListener("pointerleave", hideSoon);
    anchor.addEventListener("focusin", show);
    anchor.addEventListener("focusout", blur);
    anchor.addEventListener("click", close);
    document.addEventListener("keydown", escape);
    return () => {
      cancelPendingOpen();
      keepOpen();
      anchor.removeEventListener("pointerenter", enter);
      anchor.removeEventListener("pointerleave", hideSoon);
      anchor.removeEventListener("focusin", show);
      anchor.removeEventListener("focusout", blur);
      anchor.removeEventListener("click", close);
      document.removeEventListener("keydown", escape);
    };
  }, [anchorRef, close, hideSoon, keepOpen, cancelPendingOpen, openDelay]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const content = contentRef.current;
    if (!open || !anchor || !content) {
      setPosition(null);
      return;
    }
    let frame = 0;
    const sync = () => {
      frame = 0;
      if (
        !anchor.isConnected ||
        anchor.closest('[hidden], [inert], [aria-hidden="true"]')
      ) {
        close();
        return;
      }
      const bounds = {
        left: 0,
        right: window.innerWidth,
        top: 0,
        bottom: window.innerHeight,
      };
      for (
        let parent = anchor.parentElement;
        parent &&
        parent !== document.body &&
        parent !== document.documentElement;
        parent = parent.parentElement
      ) {
        const css = getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
          bounds.top = Math.max(bounds.top, rect.top);
          bounds.bottom = Math.min(bounds.bottom, rect.bottom);
        }
        if (
          horizontalBoundary === "clipping-ancestors" &&
          /(auto|scroll|hidden|clip)/.test(css.overflowX)
        ) {
          bounds.left = Math.max(bounds.left, rect.left);
          bounds.right = Math.min(bounds.right, rect.right);
        }
      }
      const custom = getBoundary?.(anchor);
      if (custom) {
        bounds.left = Math.max(bounds.left, custom.left);
        bounds.right = Math.min(bounds.right, custom.right);
        bounds.top = Math.max(bounds.top, custom.top);
        bounds.bottom = Math.min(bounds.bottom, custom.bottom);
      }
      const anchorBounds = anchor.getBoundingClientRect();
      const next = hoverPreviewPosition(anchorBounds, bounds, {
        width: limitWidthToAnchor ? Math.min(width, anchorBounds.width) : width,
        height: Math.min(360, content.getBoundingClientRect().height + 2),
      });
      if (!next) {
        close();
        return;
      }
      setPosition((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(anchor);
    resize.observe(content);
    const mutations = new MutationObserver(schedule);
    for (
      let parent: HTMLElement | null = anchor;
      parent;
      parent = parent.parentElement
    ) {
      resize.observe(parent);
      mutations.observe(parent, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden"],
      });
    }
    anchor.dataset.hoverPreviewOpen = "true";
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      delete anchor.dataset.hoverPreviewOpen;
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [
    open,
    anchorRef,
    getBoundary,
    close,
    width,
    limitWidthToAnchor,
    horizontalBoundary,
  ]);
  if (!open) return null;
  return createPortal(
    <div
      ref={popupRef}
      role="region"
      aria-label={label}
      className={`${styles.root} ${className}`}
      data-side={position?.side}
      style={
        position
          ? {
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }
          : {
              width: Math.min(width, window.innerWidth - 24),
              visibility: "hidden",
            }
      }
      onPointerEnter={keepOpen}
      onPointerLeave={hideSoon}
      onFocus={keepOpen}
      onBlur={hideSoon}
    >
      <div ref={contentRef}>{children}</div>
    </div>,
    document.body,
  );
}
