import type {
  ExecutionSubagentRecord,
  ExecutionTaskRecord,
} from "@/stores/unified-chat-store";
import type {
  AgentSecurityMode,
  ScheduledTaskRecord,
  ScheduledTaskRunRecord,
  TokenUsage,
  WorkspaceGitContext,
  WorkspaceInfo,
} from "@shared/types";
import type {
  WorkflowReadThreadResponse,
  WorkflowTurn,
  WorkflowTurnItem,
} from "@shared/workflow-read-thread-contract";
import { describeCron, describeScheduleConfig } from "@shared/schedule";
import {
  firstWorkflowFileChangeTarget,
  summarizeWorkflowFileChanges,
  type ComposerFileChangeTarget,
} from "@/pages/workflow-chat-helpers";

export interface TaskPresentationModel {
  sessionId: string | null;
  hasData: boolean;
  scheduled: Array<{
    id: string;
    name: string;
    enabled: boolean;
    status: string;
    detail?: string;
    nextRunAt?: number;
  }>;
  workspace: (WorkspaceInfo & { git: WorkspaceGitContext | null }) | null;
  changes: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    reviewTarget?: ComposerFileChangeTarget;
  } | null;
  outputContent: Array<{
    id: string;
    label: string;
    detail: string;
    kind: "file-change" | "image" | "web-search" | "link";
    target?: OutputTarget;
  }>;
  plan: {
    id: string;
    text: string;
  } | null;
  modelName?: string;
  securityMode?: AgentSecurityMode;
  tasks: ExecutionTaskRecord[];
  subagents: ExecutionSubagentRecord[];
  usage: TokenUsage | null;
  processes: Array<{
    id: string;
    command: string;
    cwd?: string;
    status: string;
    source: "command" | "terminal";
    terminalSessionId?: string;
  }>;
  browserPages: Array<{
    pageId: string;
    title: string;
    url: string;
  }>;
  sources: Array<{
    id: string;
    kind: "web" | "mcp";
    label: string;
    detail?: string;
    count: number;
  }>;
}

export type OutputTarget =
  | { kind: "review"; path: string; diff: string }
  | { kind: "file"; path: string }
  | { kind: "browser"; url: string }
  | { kind: "outputs" };

export interface TerminalSessionSummary {
  sessionId: string;
  threadId?: string;
  process: string;
  cwd: string;
}

export function buildTaskPresentationModel({
  sessionId,
  readThread,
  workspace,
  gitContext,
  tasks = [],
  subagents = [],
  scheduledTasks = [],
  scheduledRuns = {},
  terminalSessions = [],
  browserPages = [],
  securityMode,
  fallbackModelName,
}: {
  sessionId: string | null;
  readThread?: WorkflowReadThreadResponse;
  workspace?: WorkspaceInfo | null;
  gitContext?: WorkspaceGitContext | null;
  tasks?: ExecutionTaskRecord[];
  subagents?: ExecutionSubagentRecord[];
  scheduledTasks?: ScheduledTaskRecord[];
  scheduledRuns?: Record<string, ScheduledTaskRunRecord[]>;
  terminalSessions?: TerminalSessionSummary[];
  browserPages?: Array<{
    pageId: string;
    title: string;
    url: string;
  }>;
  securityMode?: AgentSecurityMode;
  fallbackModelName?: string;
}): TaskPresentationModel {
  const focusTurn = taskFocusTurn(readThread);
  const scopedTasks = tasks
    .filter(
      (task) => !focusTurn || !task.turnId || task.turnId === focusTurn.id,
    )
    .sort((left, right) => left.ordinal - right.ordinal)
    .slice(0, 5);
  const hasData = Boolean(sessionId);

  return {
    sessionId,
    hasData,
    scheduled: sessionId
      ? scheduledSummaries(sessionId, scheduledTasks, scheduledRuns)
      : [],
    workspace: workspace ? { ...workspace, git: gitContext ?? null } : null,
    changes:
      sessionId && focusTurn ? taskChangeSummary(focusTurn, gitContext) : null,
    outputContent:
      sessionId && focusTurn ? taskOutputContent(focusTurn.items) : [],
    plan: sessionId && focusTurn ? taskPlan(focusTurn.items) : null,
    modelName: focusTurn?.modelName ?? focusTurn?.modelId ?? fallbackModelName,
    securityMode,
    tasks: sessionId ? scopedTasks : [],
    subagents: sessionId
      ? [...subagents]
          .sort((left, right) => left.ordinal - right.ordinal)
          .slice(0, 5)
      : [],
    usage: sessionId ? (focusTurn?.usage ?? null) : null,
    processes: sessionId
      ? mergeProcesses(
          focusTurn ? runningProcesses(focusTurn.items) : [],
          terminalSessions,
          sessionId,
        )
      : [],
    browserPages: sessionId ? browserPages.slice(0, 6) : [],
    sources: sessionId && focusTurn ? taskSources(focusTurn.items) : [],
  };
}

export function taskFocusTurn(
  readThread?: WorkflowReadThreadResponse,
): WorkflowTurn | undefined {
  if (!readThread?.turns.length) return undefined;
  const newestFirst =
    readThread.page.order === "newest_first"
      ? readThread.turns
      : [...readThread.turns].reverse();
  return (
    newestFirst.find((turn) => turn.status === "running") ?? newestFirst[0]
  );
}

function taskChangeSummary(
  turn: WorkflowTurn,
  gitContext?: WorkspaceGitContext | null,
): TaskPresentationModel["changes"] {
  const eventSummary = summarizeWorkflowFileChanges(turn.items);
  const reviewTarget = firstWorkflowFileChangeTarget(turn.items);
  const gitSummary =
    gitContext && gitContext.changedFiles > 0
      ? {
          filesChanged: gitContext.changedFiles,
          insertions: gitContext.insertions,
          deletions: gitContext.deletions,
        }
      : undefined;
  const summary = gitSummary ?? eventSummary;
  return summary ? { ...summary, reviewTarget } : null;
}

function taskOutputContent(
  items: WorkflowTurnItem[],
): TaskPresentationModel["outputContent"] {
  const outputs: TaskPresentationModel["outputContent"] = [];
  for (const item of items) {
    if (outputs.length >= 6) break;
    if (item.type === "fileChange") {
      item.changes.forEach((change, changeIndex) => {
        if (outputs.length >= 6 || !change.path) return;
        outputs.push({
          id: `${item.id}:${changeIndex}`,
          label: "文件变更",
          detail: compactOutputContent(change.path),
          kind: "file-change",
          target: change.diff?.text
            ? {
                kind: "review",
                path: change.path,
                diff: change.diff.text,
              }
            : { kind: "file", path: change.path },
        });
      });
    } else if (item.type === "imageGeneration") {
      const path = item.savedPath;
      outputs.push({
        id: item.id,
        label: "生成图片",
        detail: compactOutputContent(path ?? item.revisedPrompt ?? "图片产物"),
        kind: "image",
        target: path ? { kind: "file", path } : { kind: "outputs" },
      });
    } else if (item.type === "imageView") {
      outputs.push({
        id: item.id,
        label: "图片",
        detail: compactOutputContent(item.path),
        kind: "image",
        target: { kind: "file", path: item.path },
      });
    } else if (item.type === "webSearch" && item.query?.trim()) {
      outputs.push({
        id: item.id,
        label: "网页搜索",
        detail: compactOutputContent(item.query),
        kind: "web-search",
        target: { kind: "outputs" },
      });
    }
  }

  for (const link of agentMessageLinks(items)) {
    if (outputs.length >= 6) break;
    outputs.push({
      id: `link:${link}`,
      label: "外部链接",
      detail: compactOutputContent(link),
      kind: "link",
      target: { kind: "browser", url: link },
    });
  }
  return outputs;
}

function taskPlan(items: WorkflowTurnItem[]): TaskPresentationModel["plan"] {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.type !== "plan") continue;
    const text = item.text.trim();
    if (text) return { id: item.id, text };
  }
  return null;
}

function agentMessageLinks(items: WorkflowTurnItem[]): string[] {
  const links = new Set<string>();
  const pattern = /https?:\/\/[^\s<>"')\]]+/gi;
  for (const item of items) {
    if (item?.type !== "agentMessage") continue;
    for (const match of item.text.matchAll(pattern)) {
      const link = match[0]?.replace(/[.,;:。]+$/, "");
      if (link) links.add(link);
    }
  }
  return [...links].slice(0, 6);
}

function compactOutputContent(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 96 ? `${normalized.slice(0, 95)}…` : normalized;
}

function runningProcesses(
  items: WorkflowTurnItem[],
): TaskPresentationModel["processes"] {
  return items
    .filter(
      (item): item is Extract<WorkflowTurnItem, { type: "commandExecution" }> =>
        item.type === "commandExecution" && isRunning(item.status),
    )
    .slice(-6)
    .map((item) => ({
      id: item.id,
      command: item.command.split(/\r?\n/, 1)[0]?.trim() || "命令",
      cwd: item.cwd,
      status: item.status,
      source: "command" as const,
    }));
}

function mergeProcesses(
  commandProcesses: TaskPresentationModel["processes"],
  terminalSessions: TerminalSessionSummary[],
  sessionId: string,
): TaskPresentationModel["processes"] {
  const terminalProcesses = terminalSessions
    .filter((session) => !session.threadId || session.threadId === sessionId)
    .map((session) => ({
      id: `terminal:${session.sessionId}`,
      command: session.process || "终端",
      cwd: session.cwd,
      status: "running",
      source: "terminal" as const,
      terminalSessionId: session.sessionId,
    }));
  return [...commandProcesses, ...terminalProcesses].slice(0, 6);
}

function scheduledSummaries(
  sessionId: string,
  tasks: ScheduledTaskRecord[],
  runs: Record<string, ScheduledTaskRunRecord[]>,
): TaskPresentationModel["scheduled"] {
  const summaries: TaskPresentationModel["scheduled"] = [];
  for (const task of tasks) {
    const taskRuns = runs[task.id] ?? [];
    const run = taskRuns.find((item) => item.sessionId === sessionId);
    const fallbackSessionId = `scheduled-${task.id}`;
    if (
      task.sourceSessionId !== sessionId &&
      !run &&
      fallbackSessionId !== sessionId
    ) {
      continue;
    }
    summaries.push({
      id: task.id,
      name: task.name,
      enabled: task.enabled,
      status:
        run?.status ??
        task.lastRunStatus ??
        (task.enabled ? "scheduled" : "paused"),
      detail: scheduledSummary(task),
      nextRunAt: task.enabled ? task.nextRunAt : undefined,
    });
  }
  return summaries;
}

function scheduledSummary(task: ScheduledTaskRecord): string {
  if (task.metadata) return describeScheduleConfig(task.metadata.schedule);
  if (task.kind === "once") return "一次性执行";
  return describeCron(task.cronExpr ?? "") || task.instruction;
}

function taskSources(
  items: WorkflowTurnItem[],
): TaskPresentationModel["sources"] {
  const webQueries = items
    .filter(
      (item): item is Extract<WorkflowTurnItem, { type: "webSearch" }> =>
        item.type === "webSearch",
    )
    .map((item) => item.query?.trim())
    .filter((query): query is string => Boolean(query));
  const sources: TaskPresentationModel["sources"] = [];
  if (webQueries.length) {
    sources.push({
      id: "web-search",
      kind: "web",
      label: "网页搜索",
      detail: webQueries.at(-1),
      count: webQueries.length,
    });
  }

  const mcpCounts = new Map<string, number>();
  for (const item of items) {
    if (item.type !== "mcpToolCall") continue;
    const label = item.server?.trim() || item.tool;
    mcpCounts.set(label, (mcpCounts.get(label) ?? 0) + 1);
  }
  for (const [label, count] of mcpCounts) {
    sources.push({ id: `mcp:${label}`, kind: "mcp", label, count });
  }
  return sources.slice(0, 6);
}

function isRunning(status: string): boolean {
  const value = status.toLowerCase();
  return value === "running" || value === "pending" || value === "in_progress";
}
