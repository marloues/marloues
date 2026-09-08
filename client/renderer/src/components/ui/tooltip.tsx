import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import styles from "./tooltip.module.css";

export interface TooltipProps {
  /** Text or node shown in the tooltip bubble. */
  content: React.ReactNode;
  /** Preferred side; flips when the opposite side has more room. */
  side?: "top" | "bottom" | "left" | "right";
  /** Delay before showing (ms). */
  delay?: number;
  children: React.ReactNode;
  className?: string;
}

type Side = NonNullable<TooltipProps["side"]>;

const OPPOSITE: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** 统一文字提示：使用主题 token，通过 portal 避免祖先裁切。 */
export function Tooltip({
  content,
  side = "top",
  delay = 100,
  children,
  className,
}: TooltipProps) {
  const id = React.useId();
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const bubbleRef = React.useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [position, setPosition] = React.useState<{
    left: number;
    top: number;
    side: Side;
  } | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const show = React.useCallback(() => {
    cancelPending();
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [cancelPending, delay]);
  const hide = React.useCallback(() => {
    cancelPending();
    setVisible(false);
    setPosition(null);
  }, [cancelPending]);

  React.useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      cancelPending();
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, [cancelPending, hide]);

  React.useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!visible || !anchor || !bubble) return;
    const sync = () => {
      if (
        !anchor.matches(":hover") &&
        !anchor.contains(document.activeElement)
      ) {
        hide();
        return;
      }
      const a = anchor.getBoundingClientRect();
      const b = bubble.getBoundingClientRect();
      const margin = 12;
      const gap = 6;
      const spaces = {
        top: a.top - margin - gap,
        bottom: window.innerHeight - a.bottom - margin - gap,
        left: a.left - margin - gap,
        right: window.innerWidth - a.right - margin - gap,
      };
      const opposite = OPPOSITE[side];
      const size = side === "left" || side === "right" ? b.width : b.height;
      const placedSide =
        spaces[side] < size && spaces[opposite] > spaces[side]
          ? opposite
          : side;
      let left = a.left + (a.width - b.width) / 2;
      let top = a.top + (a.height - b.height) / 2;
      if (placedSide === "top") top = a.top - b.height - gap;
      if (placedSide === "bottom") top = a.bottom + gap;
      if (placedSide === "left") left = a.left - b.width - gap;
      if (placedSide === "right") left = a.right + gap;
      setPosition({
        left: Math.max(
          margin,
          Math.min(left, window.innerWidth - b.width - margin),
        ),
        top: Math.max(
          margin,
          Math.min(top, window.innerHeight - b.height - margin),
        ),
        side: placedSide,
      });
    };
    sync();
    const resize = new ResizeObserver(sync);
    resize.observe(anchor);
    resize.observe(bubble);
    document.addEventListener("scroll", sync, true);
    return () => {
      resize.disconnect();
      document.removeEventListener("scroll", sync, true);
    };
  }, [visible, side, content, hide]);

  const describedChildren = React.Children.map(children, (child) =>
    React.isValidElement<{ "aria-describedby"?: string }>(child) &&
    child.type !== React.Fragment
      ? React.cloneElement(child, {
          "aria-describedby": [child.props["aria-describedby"], id]
            .filter(Boolean)
            .join(" "),
        })
      : child,
  );

  return (
    <span
      ref={anchorRef}
      className={cn(styles.trigger, className)}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") show();
      }}
      onPointerLeave={hide}
      onFocus={() => {
        cancelPending();
        setVisible(true);
      }}
      onBlur={hide}
      onClick={hide}
    >
      {describedChildren}
      {visible && content != null ? (
        createPortal(
          <span
            ref={bubbleRef}
            id={id}
            role="tooltip"
            className={styles.bubble}
            data-side={position?.side}
            style={
              position
                ? { left: position.left, top: position.top }
                : { visibility: "hidden" }
            }
          >
            {content}
          </span>,
          document.body,
        )
      ) : (
        <span id={id} hidden>
          {content}
        </span>
      )}
    </span>
  );
}
Tooltip.displayName = "Tooltip";
