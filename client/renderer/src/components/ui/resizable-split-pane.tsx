import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import styles from "./resizable-split-pane.module.css";

const MIN_CONTENT = 160;
const MIN_ASIDE = 156;
const COLLAPSE_DISTANCE = 40;
const DIVIDER = 1;

/** A trailing pane that can be resized, then dragged past its minimum to close. */
export function ResizableSplitPane({
  children,
  aside,
  asideOpen,
  onAsideOpenChange,
  label,
}: {
  children: ReactNode;
  aside: ReactNode;
  asideOpen: boolean;
  onAsideOpenChange: (open: boolean) => void;
  label: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const asideId = useId();
  const [containerWidth, setContainerWidth] = useState(0);
  const [preferredWidth, setPreferredWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    width: number;
    target: HTMLDivElement;
    cursor: string;
    userSelect: string;
  } | null>(null);
  const maxWidth = Math.max(0, containerWidth - MIN_CONTENT - DIVIDER);
  // Only a physically smaller container may reduce the tree below its minimum.
  const minWidth = Math.min(MIN_ASIDE, maxWidth);
  const asideWidth = Math.max(
    minWidth,
    Math.min(maxWidth, preferredWidth ?? containerWidth * 0.34),
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const width = root.getBoundingClientRect().width;
      // Hidden tabs keep their last width until they become visible again.
      if (width > 0) setContainerWidth(width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const releaseDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const body = drag.target.ownerDocument.body;
    body.style.cursor = drag.cursor;
    body.style.userSelect = drag.userSelect;
    if (drag.target.hasPointerCapture(drag.pointerId))
      drag.target.releasePointerCapture(drag.pointerId);
  }, []);
  useEffect(() => () => releaseDrag(), [releaseDrag]);
  useEffect(() => {
    if (!asideOpen) {
      releaseDrag();
      setResizing(false);
    }
  }, [asideOpen, releaseDrag]);

  const finish = () => {
    releaseDrag();
    setResizing(false);
  };
  const collapse = () => {
    finish();
    onAsideOpenChange(false);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rawWidth = drag.width - (event.clientX - drag.x);
    if (rawWidth < minWidth - COLLAPSE_DISTANCE) {
      collapse();
      return;
    }
    setPreferredWidth(Math.max(minWidth, Math.min(maxWidth, rawWidth)));
  };

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-split-pane
      data-tree-hidden={!asideOpen}
      data-resizing={resizing}
      style={{
        gridTemplateColumns: asideOpen
          ? `minmax(0, 1fr) ${DIVIDER}px ${asideWidth}px`
          : "minmax(0, 1fr)",
      }}
    >
      <div className={styles.pane} data-split-pane-content>
        {children}
      </div>
      {asideOpen ? (
        <>
          <div
            className={styles.separator}
            role="separator"
            tabIndex={0}
            aria-label={label}
            aria-orientation="vertical"
            aria-controls={asideId}
            aria-valuemin={Math.round(minWidth)}
            aria-valuemax={Math.round(maxWidth)}
            aria-valuenow={Math.round(asideWidth)}
            aria-valuetext={`目录宽度 ${Math.round(asideWidth)} 像素`}
            onPointerDown={(event) => {
              if (event.button !== 0 || dragRef.current) return;
              event.preventDefault();
              const target = event.currentTarget;
              const body = target.ownerDocument.body;
              target.focus({ preventScroll: true });
              target.setPointerCapture(event.pointerId);
              dragRef.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                width: asideWidth,
                target,
                cursor: body.style.cursor,
                userSelect: body.style.userSelect,
              };
              body.style.cursor = getComputedStyle(target).cursor;
              body.style.userSelect = "none";
              setResizing(true);
            }}
            onPointerMove={move}
            onPointerUp={(event) => {
              move(event);
              finish();
            }}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
            onKeyDown={(event) => {
              if (event.key === "Escape" && dragRef.current) {
                event.preventDefault();
                setPreferredWidth(dragRef.current.width);
                finish();
              } else if (event.key === "Enter") {
                event.preventDefault();
                collapse();
              } else if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                if (event.key === "ArrowRight" && asideWidth <= minWidth)
                  collapse();
                else
                  setPreferredWidth(
                    event.key === "Home"
                      ? minWidth
                      : event.key === "End"
                        ? maxWidth
                        : Math.max(
                            minWidth,
                            Math.min(
                              maxWidth,
                              asideWidth +
                                (event.key === "ArrowLeft" ? 16 : -16),
                            ),
                          ),
                  );
              }
            }}
          />
          <div id={asideId} className={styles.pane} data-split-pane-aside>
            {aside}
          </div>
        </>
      ) : null}
    </div>
  );
}
