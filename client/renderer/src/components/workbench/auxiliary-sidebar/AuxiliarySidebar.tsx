import type { WorkflowReadThreadResponse } from "@shared/workflow-read-thread-contract";
import type { InspectorFileSystem } from "./panels/FileExplorer";
import {
  type SetStateAction,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  Brain,
  FileText,
  Terminal,
  UserRoundCog,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FileExplorer, MemoryPanel, OutputsPanel, ReviewPanel } from "./panels";
import { TerminalPanel } from "./panels/TerminalPanel";
import { BrowserPanel } from "./panels/BrowserPanel";
import { workflowItemsToTimeline } from "./panels/workflow-items-to-timeline";
import { SubagentWorkspace } from "@/components/workflow-chat";
import type { TimelineItem } from "@shared/types";
import { useUnifiedChatStore } from "@/stores/unified-chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  type ReviewTarget,
  type FileTarget,
  useInspectorStore,
} from "@/stores/inspector-store";
import type { ExecutionSubagentRecord } from "@/stores/unified-chat-store";
import {
  AUXILIARY_VIEW_ICONS,
  AUXILIARY_VIEW_LABELS,
  AUXILIARY_VIEW_OPTIONS,
} from "./catalog";
import {
  useAuxiliaryTabIntentStore,
  type AuxiliaryTabIntent,
} from "@/stores/auxiliary-tab-intent-store";
import { AuxiliaryHeader } from "./AuxiliaryHeader";
import {
  AuxiliaryEmptyLauncher,
  AuxiliaryViewHost,
  AuxiliaryViewPanel,
} from "./AuxiliaryViewHost";
import {
  auxiliaryTabDomId,
  type AuxiliaryHeaderTab,
  type AuxiliaryStaticViewType,
} from "./types";

interface TabState {
  id: string;
  type: AuxiliaryStaticViewType | "subagent";
  subagentId?: string;
  reviewTarget?: ReviewTarget;
  fileTarget?: FileTarget;
  sessionId?: string;
  pageId?: string;
  browserTitle?: string;
}

interface SessionAuxiliaryState {
  tabs: TabState[];
  activeTabId: string | null;
  closedSubagentTabs: Set<string>;
}

const EMPTY_SESSION_AUXILIARY_STATE: SessionAuxiliaryState = {
  tabs: [],
  activeTabId: null,
  closedSubagentTabs: new Set(),
};
const NO_SESSION_SCOPE = "__no-session__";

function resolveStateAction<T>(action: SetStateAction<T>, previous: T): T {
  return typeof action === "function"
    ? (action as (value: T) => T)(previous)
    : action;
}

const SUBAGENT_ICONS: LucideIcon[] = [
  Bot,
  Brain,
  UserRoundCog,
  Terminal,
  FileText,
  Wrench,
];

let nextTabId = 0;
function makeTabId(): string {
  return `tab-${++nextTabId}`;
}

function browserTabId(pageId: string): string {
  return `browser-tab:${pageId}`;
}

export interface AuxiliarySource {
  sessionId: string;
  readThread: WorkflowReadThreadResponse;
  workspacePath: string;
  fileSystem: InspectorFileSystem;
}

function subagentTabId(subagentId: string): string {
  return `subagent-tab:${subagentId}`;
}

function iconFromSeed(seed: string): LucideIcon {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SUBAGENT_ICONS[hash % SUBAGENT_ICONS.length];
}

export function AuxiliarySidebar({
  open,
  primary,
  onTogglePrimary,
  onEnsureOpen,
  onLastTabClose,
  source,
}: {
  open: boolean;
  primary: boolean;
  onTogglePrimary: () => void;
  onEnsureOpen: () => void;
  onLastTabClose: () => void;
  source?: AuxiliarySource;
}) {
  const embedded = Boolean(source);
  const viewOptions = useMemo(
    () =>
      embedded
        ? AUXILIARY_VIEW_OPTIONS.filter(
            (option) => option.type === "files" || option.type === "review",
          )
        : AUXILIARY_VIEW_OPTIONS,
    [embedded],
  );
  const storeSessionId = useUnifiedChatStore((state) => state.activeSessionId);
  const activeSessionId = source?.sessionId ?? storeSessionId;
  const sessionScope = activeSessionId ?? NO_SESSION_SCOPE;
  const [auxiliaryStateBySession, setAuxiliaryStateBySession] = useState<
    Record<string, SessionAuxiliaryState>
  >({});
  const auxiliaryState =
    auxiliaryStateBySession[sessionScope] ?? EMPTY_SESSION_AUXILIARY_STATE;
  const { tabs, activeTabId, closedSubagentTabs } = auxiliaryState;

  const updateAuxiliaryState = useCallback(
    (update: (state: SessionAuxiliaryState) => SessionAuxiliaryState) => {
      setAuxiliaryStateBySession((current) => {
        const previous = current[sessionScope] ?? EMPTY_SESSION_AUXILIARY_STATE;
        const next = update(previous);
        return next === previous
          ? current
          : { ...current, [sessionScope]: next };
      });
    },
    [sessionScope],
  );
  const setTabs = useCallback(
    (action: SetStateAction<TabState[]>) => {
      updateAuxiliaryState((previous) => {
        const next = resolveStateAction(action, previous.tabs);
        return next === previous.tabs ? previous : { ...previous, tabs: next };
      });
    },
    [updateAuxiliaryState],
  );
  const setActiveTabId = useCallback(
    (action: SetStateAction<string | null>) => {
      updateAuxiliaryState((previous) => {
        const next = resolveStateAction(action, previous.activeTabId);
        return next === previous.activeTabId
          ? previous
          : { ...previous, activeTabId: next };
      });
    },
    [updateAuxiliaryState],
  );
  const setClosedSubagentTabs = useCallback(
    (action: SetStateAction<Set<string>>) => {
      updateAuxiliaryState((previous) => {
        const next = resolveStateAction(action, previous.closedSubagentTabs);
        return next === previous.closedSubagentTabs
          ? previous
          : { ...previous, closedSubagentTabs: next };
      });
    },
    [updateAuxiliaryState],
  );

  const launcherFirstActionRef = useRef<HTMLButtonElement>(null);
  const handledRevealBySessionRef = useRef(new Map<string, number>());
  const handledInspectorSeqRef = useRef(new Set<number>());
  const dismissedEmptySessionsRef = useRef(new Set<string>());

  // An explicit reopen clears the dismissal. Empty launchers are allowed to
  // stay open; closing the last tab is the action that collapses the region.
  useEffect(() => {
    if (open) dismissedEmptySessionsRef.current.delete(sessionScope);
  }, [open, sessionScope]);

  const storeReadThread = useUnifiedChatStore((state) =>
    activeSessionId ? state.readThreads[activeSessionId] : undefined,
  );
  const workspace = useWorkspaceStore((state) => state.current);
  const readThread = source?.readThread ?? storeReadThread;
  const workspacePath =
    source?.workspacePath ?? readThread?.thread.cwd ?? workspace?.path;
  const executionState = useUnifiedChatStore((state) =>
    activeSessionId
      ? (state.executionBySession[activeSessionId] ?? null)
      : null,
  );
  const subagents = useMemo(
    () =>
      Object.values(executionState?.subagents ?? {}).sort(
        (a, b) => a.ordinal - b.ordinal,
      ),
    [executionState?.subagents],
  );
  const subagentById = useMemo(() => {
    const map = new Map<string, ExecutionSubagentRecord>();
    for (const subagent of subagents) map.set(subagent.id, subagent);
    return map;
  }, [subagents]);
  const subagentIdsKey = subagents.map((subagent) => subagent.id).join("|");
  const selectExecutionSubagent = useUnifiedChatStore(
    (state) => state.selectExecutionSubagent,
  );
  const { timeline, sessionTimeline } = useMemo(() => {
    if (!readThread) {
      return {
        timeline: [] as TimelineItem[],
        sessionTimeline: [] as TimelineItem[],
      };
    }
    const sessionTimeline = workflowItemsToTimeline(readThread.turns);
    const runningTurn = readThread.turns.find(
      (turn) => turn.status === "running",
    );
    const focusTurn = runningTurn ?? readThread.turns[0];
    const timeline = focusTurn ? workflowItemsToTimeline([focusTurn]) : [];
    return { timeline, sessionTimeline };
  }, [readThread]);

  const reviewTarget = useInspectorStore((state) => state.reviewTarget);
  const fileTarget = useInspectorStore((state) => state.fileTarget);

  useEffect(() => {
    if (embedded) return;
    return window.marloues?.browser?.onPageRevealRequested?.(
      (threadId, pageId, _url, title) => {
        setAuxiliaryStateBySession((current) => {
          const previous = current[threadId] ?? EMPTY_SESSION_AUXILIARY_STATE;
          const existing = previous.tabs.find(
            (tab) => tab.type === "browser" && tab.pageId === pageId,
          );
          const id = existing?.id ?? browserTabId(pageId);
          const tabs = existing
            ? previous.tabs.map((tab) =>
                tab.id === id
                  ? { ...tab, browserTitle: title || tab.browserTitle }
                  : tab,
              )
            : [
                ...previous.tabs,
                {
                  id,
                  type: "browser" as const,
                  pageId,
                  browserTitle: title,
                },
              ];
          return {
            ...current,
            [threadId]: { ...previous, tabs, activeTabId: id },
          };
        });
        if (
          threadId === activeSessionId &&
          !dismissedEmptySessionsRef.current.has(sessionScope)
        )
          onEnsureOpen();
      },
    );
  }, [activeSessionId, sessionScope, onEnsureOpen, embedded]);

  useEffect(() => {
    setTabs((prev) => {
      const openSubagentIds = new Set(
        subagents
          .map((subagent) => subagent.id)
          .filter((id) => !closedSubagentTabs.has(id)),
      );
      const existingSubagentIds = new Set(
        prev
          .filter((tab) => tab.type === "subagent" && tab.subagentId)
          .map((tab) => tab.subagentId as string),
      );
      const next = prev.filter(
        (tab) =>
          tab.type !== "subagent" ||
          (tab.subagentId ? openSubagentIds.has(tab.subagentId) : false),
      );
      for (const subagent of subagents) {
        if (
          closedSubagentTabs.has(subagent.id) ||
          existingSubagentIds.has(subagent.id)
        ) {
          continue;
        }
        next.push({
          id: subagentTabId(subagent.id),
          type: "subagent",
          subagentId: subagent.id,
        });
      }
      return next;
    });
  }, [closedSubagentTabs, setTabs, subagentIdsKey, subagents]);

  useEffect(() => {
    const selectedId = executionState?.selectedSubagentId;
    const revealSeq = executionState?.revealSubagentSeq;
    if (
      !activeSessionId ||
      !selectedId ||
      !revealSeq ||
      !subagentById.has(selectedId) ||
      handledRevealBySessionRef.current.get(activeSessionId) === revealSeq
    ) {
      return;
    }
    handledRevealBySessionRef.current.set(activeSessionId, revealSeq);
    setClosedSubagentTabs((prev) => {
      if (!prev.has(selectedId)) return prev;
      const next = new Set(prev);
      next.delete(selectedId);
      return next;
    });
    setActiveTabId(subagentTabId(selectedId));
    onEnsureOpen();
  }, [
    activeSessionId,
    executionState?.revealSubagentSeq,
    executionState?.selectedSubagentId,
    setActiveTabId,
    setClosedSubagentTabs,
    subagentById,
    onEnsureOpen,
  ]);

  useEffect(() => {
    const intents = [
      reviewTarget && { type: "review" as const, target: reviewTarget },
      fileTarget && { type: "files" as const, target: fileTarget },
    ]
      .filter(
        (intent) =>
          intent &&
          !handledInspectorSeqRef.current.has(intent.target.seq) &&
          (!intent.target.sessionId ||
            intent.target.sessionId === activeSessionId),
      )
      .sort((a, b) => a!.target.seq - b!.target.seq);
    if (!intents.length) return;
    for (const intent of intents)
      if (intent) handledInspectorSeqRef.current.add(intent.target.seq);
    updateAuxiliaryState((previous) => {
      let tabs = previous.tabs;
      let activeTabId = previous.activeTabId;
      for (const intent of intents) {
        if (!intent) continue;
        const existing = tabs.find((tab) => tab.type === intent.type);
        const id = existing?.id ?? makeTabId();
        const next: TabState = {
          ...existing,
          id,
          type: intent.type,
          ...(intent.type === "review"
            ? { reviewTarget: intent.target as ReviewTarget }
            : { fileTarget: intent.target as FileTarget }),
        };
        tabs = existing
          ? tabs.map((tab) => (tab.id === id ? next : tab))
          : [...tabs, next];
        activeTabId = id;
      }
      return { ...previous, tabs, activeTabId };
    });
    onEnsureOpen();
  }, [
    reviewTarget,
    fileTarget,
    activeSessionId,
    updateAuxiliaryState,
    onEnsureOpen,
  ]);

  const addTab = useCallback(
    (type: AuxiliaryStaticViewType) => {
      const existing = tabs.find((tab) => tab.type === type);
      const id = existing?.id ?? makeTabId();
      if (!existing) setTabs((prev) => [...prev, { id, type }]);
      setActiveTabId(id);
    },
    [setActiveTabId, setTabs, tabs],
  );
  // Terminal and browser tabs always create a new tab (not singleton).
  // The session/page is spawned via IPC first, then the tab is added.
  const handleOpenView = useCallback(
    (type: AuxiliaryStaticViewType) => {
      if (type === "terminal") {
        const id = makeTabId();
        setTabs((prev) => [...prev, { id, type }]);
        setActiveTabId(id);
        void window.marloues?.terminal
          ?.spawn(workspace?.path ?? "")
          .then((sessionId) => {
            setTabs((prev) =>
              prev.map((tab) => (tab.id === id ? { ...tab, sessionId } : tab)),
            );
          })
          .catch(() => {
            setTabs((prev) => prev.filter((tab) => tab.id !== id));
          });
        return;
      }
      if (type === "browser") {
        const id = makeTabId();
        setTabs((prev) => [...prev, { id, type }]);
        setActiveTabId(id);
        void window.marloues?.browser
          ?.newPage("about:blank", activeSessionId ?? undefined)
          .then((pageId) => {
            setTabs((prev) =>
              prev.map((tab) => (tab.id === id ? { ...tab, pageId } : tab)),
            );
          })
          .catch(() => {
            setTabs((prev) => prev.filter((tab) => tab.id !== id));
          });
        return;
      }
      addTab(type);
    },
    [activeSessionId, addTab, setActiveTabId, setTabs, workspace?.path],
  );

  const auxiliaryIntent = useAuxiliaryTabIntentStore((state) => state.intent);
  const auxiliaryIntentSeq = useAuxiliaryTabIntentStore((state) => state.seq);
  const clearAuxiliaryIntent = useAuxiliaryTabIntentStore(
    (state) => state.clear,
  );
  const handledAuxiliaryIntentSeqRef = useRef(0);

  useEffect(() => {
    if (
      !auxiliaryIntent ||
      auxiliaryIntent.sessionId !== activeSessionId ||
      handledAuxiliaryIntentSeqRef.current === auxiliaryIntentSeq
    ) {
      return;
    }
    handledAuxiliaryIntentSeqRef.current = auxiliaryIntentSeq;
    clearAuxiliaryIntent(auxiliaryIntentSeq);
    if (auxiliaryIntent.type === "review") {
      useInspectorStore
        .getState()
        .openReview(auxiliaryIntent.path, auxiliaryIntent.diff, {
          sessionId: activeSessionId ?? undefined,
        });
      return;
    }
    if (auxiliaryIntent.type === "file") {
      useInspectorStore.getState().openFile(auxiliaryIntent.path, {
        sessionId: activeSessionId ?? undefined,
      });
      return;
    }

    if (auxiliaryIntent.type === "outputs") {
      addTab("outputs");
      onEnsureOpen();
      return;
    }

    if (auxiliaryIntent.type === "terminal") {
      const terminalSessionId = auxiliaryIntent.terminalSessionId;
      if (!terminalSessionId) {
        handleOpenView("terminal");
        return;
      }
      const existing = tabs.find(
        (tab) => tab.type === "terminal" && tab.sessionId === terminalSessionId,
      );
      const id = existing?.id ?? makeTabId();
      setTabs((previous) => [
        ...previous,
        ...(existing
          ? []
          : [{ id, type: "terminal" as const, sessionId: terminalSessionId }]),
      ]);
      setActiveTabId(id);
      onEnsureOpen();
      return;
    }

    if (auxiliaryIntent.type === "browser") {
      const pageId = auxiliaryIntent.pageId;
      if (!pageId && !auxiliaryIntent.url) {
        handleOpenView("browser");
        return;
      }
      if (pageId) {
        const existing = tabs.find(
          (tab) => tab.type === "browser" && tab.pageId === pageId,
        );
        const id = existing?.id ?? browserTabId(pageId);
        setTabs((previous) => [
          ...previous,
          ...(existing
            ? []
            : [
                {
                  id,
                  type: "browser" as const,
                  pageId,
                },
              ]),
        ]);
        setActiveTabId(id);
        onEnsureOpen();
        return;
      }

      const url = auxiliaryIntent.url ?? "about:blank";
      const id = makeTabId();
      setTabs((previous) => [...previous, { id, type: "browser" as const }]);
      setActiveTabId(id);
      void window.marloues.browser
        ?.newPage(url, activeSessionId ?? undefined)
        .then((createdPageId) => {
          setTabs((previous) =>
            previous.map((tab) =>
              tab.id === id ? { ...tab, pageId: createdPageId } : tab,
            ),
          );
        })
        .catch(() => {
          setTabs((previous) => previous.filter((tab) => tab.id !== id));
        });
      onEnsureOpen();
      return;
    }

    const intent: Extract<AuxiliaryTabIntent, { type: "subagent" }> =
      auxiliaryIntent;
    const subagent = subagentById.get(intent.subagentId);
    if (!subagent) return;
    setClosedSubagentTabs((previous) => {
      if (!previous.has(intent.subagentId)) return previous;
      const next = new Set(previous);
      next.delete(intent.subagentId);
      return next;
    });
    const existing = tabs.find(
      (tab) => tab.type === "subagent" && tab.subagentId === intent.subagentId,
    );
    const id = existing?.id ?? subagentTabId(intent.subagentId);
    setTabs((previous) => [
      ...previous,
      ...(existing
        ? []
        : [
            {
              id,
              type: "subagent" as const,
              subagentId: intent.subagentId,
            },
          ]),
    ]);
    setActiveTabId(id);
    selectExecutionSubagent(intent.sessionId, intent.subagentId);
    onEnsureOpen();
  }, [
    activeSessionId,
    addTab,
    auxiliaryIntent,
    auxiliaryIntentSeq,
    clearAuxiliaryIntent,
    handleOpenView,
    onEnsureOpen,
    selectExecutionSubagent,
    setActiveTabId,
    setClosedSubagentTabs,
    setTabs,
    subagentById,
    tabs,
  ]);

  const focusTabAfterUpdate = useCallback((id: string | null) => {
    window.setTimeout(() => {
      if (id) document.getElementById(auxiliaryTabDomId(id))?.focus();
      else launcherFirstActionRef.current?.focus();
    }, 0);
  }, []);

  const removeTab = useCallback(
    (id: string) => {
      const index = tabs.findIndex((item) => item.id === id);
      if (index < 0) return;
      const tab = tabs[index];
      const next = tabs.filter((item) => item.id !== id);
      const nextActiveId =
        activeTabId === id
          ? (next[Math.min(index, next.length - 1)]?.id ?? null)
          : activeTabId;
      updateAuxiliaryState((previous) => ({
        ...previous,
        tabs: next,
        activeTabId: next.length ? nextActiveId : null,
        closedSubagentTabs:
          tab.type === "subagent" && tab.subagentId
            ? new Set(previous.closedSubagentTabs).add(tab.subagentId)
            : previous.closedSubagentTabs,
      }));
      // Clean up terminal/browser sessions when tab is closed
      if (tab?.type === "terminal" && tab.sessionId) {
        void window.marloues?.terminal?.kill(tab.sessionId);
      }
      if (tab?.type === "browser" && tab.pageId) {
        void window.marloues?.browser?.closePage(tab.pageId);
      }
      if (next.length === 0) {
        dismissedEmptySessionsRef.current.add(sessionScope);
        onLastTabClose();
      } else {
        focusTabAfterUpdate(nextActiveId ?? next[0].id);
      }
    },
    [
      activeTabId,
      focusTabAfterUpdate,
      updateAuxiliaryState,
      sessionScope,
      onLastTabClose,
      tabs,
    ],
  );

  // Keep the selected tab session-specific, but defer mounting its potentially
  // large body until after the session switch has painted. This avoids showing
  // stale content without turning session isolation into a destructive reset.
  const deferredSessionScope = useDeferredValue(sessionScope);
  const deferredActiveTabId = useDeferredValue(activeTabId);
  const activeTab =
    deferredSessionScope === sessionScope
      ? (tabs.find((tab) => tab.id === deferredActiveTabId) ?? null)
      : null;

  const auxiliaryPanelOwnerId = useId();
  const setAuxiliaryPanelSession = useInspectorStore(
    (state) => state.setAuxiliaryPanelSession,
  );
  const visibleAuxiliarySession = open ? activeSessionId : null;
  useLayoutEffect(() => {
    setAuxiliaryPanelSession(auxiliaryPanelOwnerId, visibleAuxiliarySession);
    return () => setAuxiliaryPanelSession(auxiliaryPanelOwnerId, null);
  }, [
    auxiliaryPanelOwnerId,
    visibleAuxiliarySession,
    setAuxiliaryPanelSession,
  ]);

  useEffect(() => {
    if (!activeTabId) return;
    const el = document.getElementById(auxiliaryTabDomId(activeTabId));
    el?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeTabId]);

  const moveTab = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      setTabs((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
    },
    [setTabs],
  );

  const activateTab = useCallback(
    (id: string) => {
      const tab = tabs.find((item) => item.id === id);
      setActiveTabId(id);
      if (activeSessionId && tab?.type === "subagent" && tab.subagentId) {
        selectExecutionSubagent(activeSessionId, tab.subagentId);
      }
    },
    [activeSessionId, selectExecutionSubagent, setActiveTabId, tabs],
  );

  // Reload recovery: restore terminal tabs from active PTY sessions
  const terminalRecoveryRef = useRef(false);
  useEffect(() => {
    if (embedded || terminalRecoveryRef.current) return;
    terminalRecoveryRef.current = true;
    void window.marloues?.terminal?.list().then((sessions) => {
      if (!sessions || sessions.length === 0) return;
      setTabs((prev) => {
        const existing = new Set(
          prev
            .filter((t) => t.type === "terminal" && t.sessionId)
            .map((t) => t.sessionId),
        );
        const restored = sessions
          .filter((session) => !existing.has(session.sessionId))
          .map((session) => ({
            id: makeTabId(),
            type: "terminal" as const,
            sessionId: session.sessionId,
          }));
        return restored.length > 0 ? [...prev, ...restored] : prev;
      });
    });
  }, [setTabs, embedded]);

  // Reload recovery: restore browser tabs from active `<webview>` tabs
  const browserRecoveryRef = useRef(new Set<string>());
  useEffect(() => {
    if (
      embedded ||
      !activeSessionId ||
      browserRecoveryRef.current.has(sessionScope)
    )
      return;
    browserRecoveryRef.current.add(sessionScope);
    void window.marloues?.browser?.listPages(activeSessionId).then((pages) => {
      if (!pages || pages.length === 0) return;
      setTabs((prev) => {
        const existing = new Set(
          prev
            .filter((t) => t.type === "browser" && t.pageId)
            .map((t) => t.pageId),
        );
        const restored = pages
          .filter((page) => !existing.has(page.pageId))
          .map((page) => ({
            id: browserTabId(page.pageId),
            type: "browser" as const,
            pageId: page.pageId,
            browserTitle: page.title,
          }));
        return restored.length > 0 ? [...prev, ...restored] : prev;
      });
    });
  }, [activeSessionId, sessionScope, setTabs, embedded]);

  // Auto-activate first tab if none is active (e.g., after reload recovery restores tabs)
  useEffect(() => {
    if (!activeTabId && tabs.length > 0) {
      setActiveTabId(tabs[0]!.id);
    }
  }, [activeTabId, tabs, setActiveTabId]);

  const tabLabel = useCallback(
    (tab: TabState): string => {
      if (tab.type === "browser") {
        return compactTabLabel(tab.browserTitle?.trim() || "新标签页");
      }
      if (tab.type !== "subagent") return AUXILIARY_VIEW_LABELS[tab.type];
      const subagent = tab.subagentId ? subagentById.get(tab.subagentId) : null;
      if (!subagent) return "子代理";
      const name = (subagent.agentName ?? subagent.agentType ?? "").trim();
      if (name && name.toLowerCase() !== "agent") return name;
      const description = subagent.description ?? subagent.title;
      if (description?.trim()) return compactTabLabel(description);
      return `#${subagent.ordinal}`;
    },
    [subagentById],
  );

  const headerTabs = useMemo<AuxiliaryHeaderTab[]>(
    () =>
      tabs.map((tab) => ({
        id: tab.id,
        type: tab.type,
        label: tabLabel(tab),
        icon:
          tab.type === "subagent"
            ? iconFromSeed(tab.subagentId ?? tab.id)
            : AUXILIARY_VIEW_ICONS[tab.type],
        selected: tab.id === activeTabId,
      })),
    [activeTabId, tabLabel, tabs],
  );

  // Terminal and browser tabs are always available (multi-tab), others are singleton
  const availableViews = useMemo(
    () =>
      viewOptions.filter(
        (option) =>
          option.type === "terminal" ||
          option.type === "browser" ||
          !tabs.some((tab) => tab.type === option.type),
      ),
    [tabs, viewOptions],
  );

  return (
    <aside className={`inspector ${tabs.length === 0 ? "tabs-empty" : ""}`}>
      <AuxiliaryHeader
        open={open}
        primary={primary}
        tabs={headerTabs}
        availableViews={availableViews}
        onActivate={activateTab}
        onCloseTab={removeTab}
        onMoveTab={moveTab}
        onOpenView={handleOpenView}
        onTogglePrimary={onTogglePrimary}
      />

      <AuxiliaryViewHost>
        {tabs.length === 0 ? (
          <AuxiliaryEmptyLauncher
            options={viewOptions}
            firstActionRef={launcherFirstActionRef}
            onOpenView={handleOpenView}
          />
        ) : null}
        {tabs.map((tab) => (
          <AuxiliaryViewPanel
            key={`${sessionScope}:${tab.id}`}
            tabId={tab.id}
            active={activeTab?.id === tab.id}
            viewType={tab.type}
          >
            {tab.type === "files" ? (
              <FileExplorer
                workspacePath={workspacePath ?? undefined}
                fileTarget={tab.fileTarget}
                sessionId={activeSessionId ?? undefined}
                fileSystem={source?.fileSystem}
              />
            ) : tab.type === "subagent" &&
              tab.subagentId &&
              subagentById.has(tab.subagentId) ? (
              <SubagentWorkspace subagentId={tab.subagentId} />
            ) : tab.type === "outputs" ? (
              <OutputsPanel
                timeline={timeline}
                sessionId={activeSessionId ?? undefined}
                cwd={workspacePath}
              />
            ) : tab.type === "memory" ? (
              <MemoryPanel
                workspacePath={workspace?.path}
                timeline={sessionTimeline}
              />
            ) : tab.type === "review" ? (
              <ReviewPanel
                reviewTarget={tab.reviewTarget ?? null}
                readThread={readThread}
                workspacePath={workspacePath ?? undefined}
                workspaceId={workspace?.id}
              />
            ) : tab.type === "terminal" ? (
              <TerminalPanel sessionId={tab.sessionId} />
            ) : tab.type === "browser" ? (
              <BrowserPanel
                pageId={tab.pageId}
                onTitleChange={(title) => {
                  setTabs((previous) =>
                    previous.map((entry) =>
                      entry.id === tab.id
                        ? { ...entry, browserTitle: title }
                        : entry,
                    ),
                  );
                }}
              />
            ) : null}
          </AuxiliaryViewPanel>
        ))}
      </AuxiliaryViewHost>
    </aside>
  );
}

function compactTabLabel(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= 22) return text;
  return `${text.slice(0, 21).trimEnd()}…`;
}
