import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Button, Card } from "@/components/ui";
import {
  messageNavigationLayout,
  type MessageNavigationEntry,
} from "./message-navigation";
import styles from "./MessageNavigation.module.css";

type Layout = NonNullable<ReturnType<typeof messageNavigationLayout>>;

export function MessageNavigation({
  entries,
  scrollParent,
  contentRef,
  onNavigate,
}: {
  entries: MessageNavigationEntry[];
  scrollParent: HTMLDivElement;
  contentRef: RefObject<HTMLDivElement>;
  onNavigate: (index: number) => void;
}) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [activeId, setActiveId] = useState(entries.at(-1)?.id);
  const [previewId, setPreviewId] = useState<string>();
  const [focusedId, setFocusedId] = useState<string>();
  const [hoveredId, setHoveredId] = useState<string>();
  const [keyboardWaveId, setKeyboardWaveId] = useState<string>();
  const [previewTop, setPreviewTop] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const tooltipId = useId();
  const currentEntries = useRef(entries);
  currentEntries.current = entries;
  const activeIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === activeId),
  );
  const selectedId = entries[activeIndex]?.id;
  const waveIndex = entries.findIndex(
    (entry) => entry.id === (hoveredId ?? keyboardWaveId),
  );
  const preview = entries.find((entry) => entry.id === previewId);
  const visible = layout !== null;

  const revealMarker = useCallback((id?: string) => {
    const button = id ? buttons.current.get(id) : undefined;
    const list = listRef.current;
    if (!button || !list) return;
    const bounds = button.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (bounds.top < viewport.top) list.scrollTop -= viewport.top - bounds.top;
    else if (bounds.bottom > viewport.bottom)
      list.scrollTop +=
        bounds.bottom - viewport.bottom + button.offsetHeight * 3;
  }, []);

  useLayoutEffect(() => {
    let frame = 0;
    let observedContent: HTMLDivElement | null = null;
    const sync = () => {
      frame = 0;
      const content = contentRef.current;
      if (!content) return;
      if (observedContent !== content) {
        if (observedContent) resize.unobserve(observedContent);
        observedContent = content;
        resize.observe(content);
        mutations.observe(content, { childList: true, subtree: true });
      }
      const bounds = scrollParent.getBoundingClientRect();
      const bottomInset =
        Number.parseFloat(
          getComputedStyle(scrollParent).getPropertyValue(
            "--interaction-dock-safe-area",
          ),
        ) || 0;
      const obscured = scrollParent.closest(
        '[hidden], [inert], [aria-hidden="true"]',
      );
      const next = obscured
        ? null
        : messageNavigationLayout(
            bounds,
            content.getBoundingClientRect().left,
            window.innerHeight,
            bottomInset,
          );
      setLayout((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      // Use visible DOM geometry, not Virtuoso's overscan range, to mark the turn being read.
      const anchor =
        Math.max(bounds.top, 0) + Math.min(80, bounds.height * 0.15);
      const turns = content.querySelectorAll<HTMLElement>(
        ".workflow-turn-frame[data-message-id]",
      );
      let current: string | undefined;
      for (const turn of turns) {
        const rect = turn.getBoundingClientRect();
        if (rect.bottom > anchor && rect.top < bounds.bottom) {
          current = turn.dataset.messageId;
          break;
        }
      }
      if (
        current &&
        currentEntries.current.some((entry) => entry.id === current)
      )
        setActiveId(current);
      if (!next) {
        setPreviewId(undefined);
        setFocusedId(undefined);
        setHoveredId(undefined);
        setKeyboardWaveId(undefined);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(scrollParent);
    const mutations = new MutationObserver(schedule);
    // Portals must honor the host's hidden/inert state when another page or
    // an expanded auxiliary panel obscures the preserved conversation tree.
    for (
      let host: HTMLElement | null = scrollParent;
      host;
      host = host.parentElement
    ) {
      mutations.observe(host, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden"],
      });
    }
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    scrollParent.addEventListener("transitionend", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      scrollParent.removeEventListener("transitionend", schedule);
    };
  }, [scrollParent, contentRef]);

  useLayoutEffect(() => {
    revealMarker(focusedId ?? activeId);
  }, [activeId, focusedId, entries.length, visible, revealMarker]);

  const showPreview = (
    entry: MessageNavigationEntry,
    button: HTMLButtonElement,
  ) => {
    if (!layout) return;
    const center = button.getBoundingClientRect().top + button.offsetHeight / 2;
    setPreviewTop(
      Math.max(
        layout.viewportTop + 8,
        Math.min(center - 60, layout.viewportBottom - 140),
      ),
    );
    setPreviewId(entry.id);
  };

  if (!layout || entries.length < 2) return null;
  return createPortal(
    <div
      ref={railRef}
      className={styles.rail}
      style={{
        left: layout.left,
        top:
          layout.top - Math.min(entries.length * 10 + 8, layout.maxHeight) / 2,
      }}
      onMouseLeave={() => {
        setHoveredId(undefined);
        if (!railRef.current?.contains(document.activeElement))
          setPreviewId(undefined);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPreviewId(undefined);
          setFocusedId(undefined);
          setKeyboardWaveId(undefined);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setPreviewId(undefined);
          setHoveredId(undefined);
          setKeyboardWaveId(undefined);
          event.stopPropagation();
        }
      }}
    >
      <nav aria-label="消息导航" className="workflow-message-navigation">
        <div
          ref={listRef}
          className={styles.markers}
          style={{ maxHeight: layout.maxHeight }}
          onScroll={() => {
            setHoveredId(undefined);
            const entry = entries.find((item) => item.id === focusedId);
            const button = entry && buttons.current.get(entry.id);
            if (entry && button) showPreview(entry, button);
            else setPreviewId(undefined);
          }}
        >
          {entries.map((entry, index) => (
            <Button
              key={entry.id}
              ref={(node) => {
                if (node) buttons.current.set(entry.id, node);
                else buttons.current.delete(entry.id);
              }}
              variant="ghost"
              size="sm"
              className={styles.marker}
              tabIndex={entry.id === (focusedId ?? selectedId) ? 0 : -1}
              aria-label={`第 ${index + 1} 条消息：${entry.title}`}
              aria-current={entry.id === selectedId ? "location" : undefined}
              aria-describedby={previewId === entry.id ? tooltipId : undefined}
              onMouseMove={(event) => {
                setHoveredId(entry.id);
                setKeyboardWaveId(undefined);
                showPreview(entry, event.currentTarget);
              }}
              onFocus={(event) => {
                const keyboard = event.currentTarget.matches(":focus-visible");
                setFocusedId(entry.id);
                if (keyboard) setHoveredId(undefined);
                setKeyboardWaveId(keyboard ? entry.id : undefined);
                showPreview(entry, event.currentTarget);
              }}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowDown"
                    ? Math.min(entries.length - 1, index + 1)
                    : event.key === "ArrowUp"
                      ? Math.max(0, index - 1)
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? entries.length - 1
                          : undefined;
                if (next !== undefined) {
                  event.preventDefault();
                  event.stopPropagation();
                  revealMarker(entries[next].id);
                  buttons.current
                    .get(entries[next].id)
                    ?.focus({ preventScroll: true });
                }
              }}
              onClick={() => {
                setPreviewId(undefined);
                setActiveId(entry.id);
                onNavigate(entry.index);
              }}
            >
              <span
                aria-hidden="true"
                className={styles.tick}
                style={{
                  width:
                    waveIndex < 0
                      ? 8
                      : 8 +
                        12 *
                          (1 +
                            Math.cos(
                              (Math.min(4, Math.abs(index - waveIndex)) *
                                Math.PI) /
                                4,
                            )),
                }}
              />
            </Button>
          ))}
        </div>
      </nav>
      {preview ? (
        <div
          className={styles.previewHost}
          style={{ top: previewTop, left: layout.left + 40 }}
        >
          <Card id={tooltipId} role="tooltip" className={styles.preview}>
            <strong>{preview.title}</strong>
            <p>{preview.preview}</p>
          </Card>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
