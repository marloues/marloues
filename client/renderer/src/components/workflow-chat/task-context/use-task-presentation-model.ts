import { useCallback, useEffect, useMemo, useState } from "react";
import { useScheduleStore } from "@/stores/schedule-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUnifiedChatStore } from "@/stores/unified-chat-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type {
  ChatSessionRecord,
  WorkspaceGitContext,
  WorkspaceInfo,
  WorkspaceSettings,
} from "@shared/types";
import {
  normalizeWorkspacePathForCompare,
  workspacePathsEqual,
} from "@shared/workspace-path";
import {
  buildTaskPresentationModel,
  type TerminalSessionSummary,
  taskFocusTurn,
} from "./task-presentation-model";

export function useTaskPresentationModel() {
  const activeSessionId = useUnifiedChatStore((state) => state.activeSessionId);
  const activeSession = useUnifiedChatStore((state) => {
    const sessionId = state.activeSessionId;
    if (!sessionId) return undefined;
    return (
      state.sessions.find((session) => session.id === sessionId) ??
      state.allSessions.find((session) => session.id === sessionId)
    );
  });
  const readThread = useUnifiedChatStore((state) =>
    state.activeSessionId
      ? state.readThreads[state.activeSessionId]
      : undefined,
  );
  const execution = useUnifiedChatStore((state) =>
    state.activeSessionId
      ? state.executionBySession[state.activeSessionId]
      : undefined,
  );
  const workspaceSettings = useWorkspaceStore((state) => state.settings);
  const currentWorkspace = useWorkspaceStore((state) => state.current);
  const settings = useSettingsStore((state) => state.settings);
  const scheduleTasks = useScheduleStore((state) => state.tasks);
  const scheduleRuns = useScheduleStore((state) => state.runs);
  const scheduleLoaded = useScheduleStore((state) => state.loaded);
  const scheduleLoad = useScheduleStore((state) => state.load);
  const scheduleSubscribe = useScheduleStore((state) => state.subscribeChanged);
  const scheduleLoadAllRuns = useScheduleStore((state) => state.loadAllRuns);
  const workspace = resolveTaskWorkspace({
    activeSession,
    workspaceSettings,
    currentWorkspace,
  });
  const focusTurn = taskFocusTurn(readThread);
  const refreshKey = `${workspace?.id ?? "none"}:${workspace?.path ?? "none"}:${focusTurn?.id ?? "none"}:${focusTurn?.status ?? "none"}:${focusTurn?.completedAt ?? ""}`;
  const [gitState, setGitState] = useState<{
    workspaceId?: string;
    context: WorkspaceGitContext | null;
    loading: boolean;
  }>({ context: null, loading: false });
  const [terminalSessions, setTerminalSessions] = useState<
    TerminalSessionSummary[]
  >([]);
  const [browserPages, setBrowserPages] = useState<
    Array<{ pageId: string; title: string; url: string }>
  >([]);

  useEffect(() => {
    if (scheduleLoaded) return;
    void scheduleLoad().catch(() => undefined);
  }, [scheduleLoaded, scheduleLoad]);

  useEffect(() => scheduleSubscribe(), [scheduleSubscribe]);

  const scheduleTaskIdsKey = scheduleTasks.map((task) => task.id).join("|");
  useEffect(() => {
    if (!scheduleLoaded) return;
    void scheduleLoadAllRuns().catch(() => undefined);
  }, [scheduleLoaded, scheduleTaskIdsKey, scheduleLoadAllRuns]);

  useEffect(() => {
    if (!activeSessionId) {
      setTerminalSessions([]);
      setBrowserPages([]);
      return undefined;
    }
    let cancelled = false;
    setTerminalSessions([]);
    setBrowserPages([]);
    const loadTerminalSessions = async () => {
      try {
        const sessions = (await window.marloues.terminal?.list()) ?? [];
        if (cancelled) return;
        setTerminalSessions(
          sessions
            .filter((session) => session.threadId === activeSessionId)
            .map((session) => ({
              sessionId: session.sessionId,
              threadId: session.threadId,
              process: session.process,
              cwd: session.cwd,
            })),
        );
      } catch {
        if (!cancelled) setTerminalSessions([]);
      }
    };
    const loadBrowserPages = async () => {
      try {
        const pages =
          (await window.marloues.browser?.listPages(activeSessionId)) ?? [];
        if (cancelled) return;
        setBrowserPages(
          pages.map((page) => ({
            pageId: page.pageId,
            title: page.title || page.url,
            url: page.url,
          })),
        );
      } catch {
        if (!cancelled) setBrowserPages([]);
      }
    };
    void loadTerminalSessions();
    void loadBrowserPages();
    const timer = window.setInterval(() => {
      void loadTerminalSessions();
      void loadBrowserPages();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeSessionId, refreshKey]);

  const refreshGitContext = useCallback(async () => {
    if (!workspace?.id) {
      setGitState({ context: null, loading: false });
      return;
    }
    const workspaceId = workspace.id;
    setGitState((current) => ({
      workspaceId,
      context: current.workspaceId === workspaceId ? current.context : null,
      loading: true,
    }));
    try {
      const context = await window.marloues.workspace.getGitContext(
        workspaceId,
        workspace.path,
      );
      setGitState({ workspaceId, context, loading: false });
    } catch {
      setGitState({ workspaceId, context: null, loading: false });
    }
  }, [workspace?.id, workspace?.path]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshGitContext(), 180);
    return () => window.clearTimeout(timer);
  }, [refreshGitContext, refreshKey]);

  const model = useMemo(
    () =>
      buildTaskPresentationModel({
        sessionId: activeSessionId,
        readThread,
        workspace,
        gitContext:
          gitState.workspaceId === workspace?.id ? gitState.context : null,
        tasks: Object.values(execution?.tasks ?? {}),
        subagents: Object.values(execution?.subagents ?? {}),
        scheduledTasks: scheduleTasks,
        scheduledRuns: scheduleRuns,
        terminalSessions,
        browserPages,
        securityMode: settings?.securityMode,
        fallbackModelName: settings?.defaultModel.modelId,
      }),
    [
      activeSessionId,
      execution?.tasks,
      execution?.subagents,
      gitState,
      readThread,
      scheduleRuns,
      scheduleTasks,
      settings?.defaultModel.modelId,
      settings?.securityMode,
      browserPages,
      terminalSessions,
      workspace,
    ],
  );

  return {
    model,
    gitLoading: gitState.loading,
    refreshGitContext,
  };
}

export function resolveTaskWorkspace({
  activeSession,
  workspaceSettings,
  currentWorkspace,
}: {
  activeSession?: ChatSessionRecord;
  workspaceSettings: WorkspaceSettings;
  currentWorkspace: WorkspaceInfo | null;
}): WorkspaceInfo | null {
  const session = activeSession;
  const sessionWorkspacePath = session?.workspacePath?.trim();
  if (session && sessionWorkspacePath) {
    const configured = workspaceSettings.workspaces.find((item) =>
      workspacePathsEqual(item.path, sessionWorkspacePath),
    );
    if (configured) return configured;
    return {
      id: `session-workspace:${normalizeWorkspacePathForCompare(
        sessionWorkspacePath,
      )}`,
      name:
        session.workspaceName || workspaceNameFromPath(sessionWorkspacePath),
      path: sessionWorkspacePath,
      lastOpenedAt: session.updatedAt,
    };
  }
  return currentWorkspace;
}

function workspaceNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").filter(Boolean).at(-1) || "工作区";
}
