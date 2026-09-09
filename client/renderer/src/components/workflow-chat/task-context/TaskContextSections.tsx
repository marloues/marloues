import type {
  OutputTarget,
  TaskPresentationModel,
} from "./task-presentation-model";
import { Pause, Play, Trash2 } from "lucide-react";
import { CONVERSATION_ICONS } from "../conversation-icon-contract";
import {
  ThreadSummaryExpandableList,
  ThreadSummarySection,
} from "./ThreadSummaryPrimitives";

const SUMMARY_ICONS = CONVERSATION_ICONS.summary;

export function ScheduledSection({
  sessionId,
  scheduled,
  onOpenScheduledTask,
  onToggleScheduledTask,
  onRemoveScheduledTask,
}: {
  sessionId: string | null;
  scheduled: TaskPresentationModel["scheduled"];
  onOpenScheduledTask?: (taskId: string) => void;
  onToggleScheduledTask?: (taskId: string) => void;
  onRemoveScheduledTask?: (taskId: string) => void;
}) {
  if (!scheduled.length) return null;
  return (
    <ThreadSummarySection
      sectionKey="scheduled"
      sessionId={sessionId}
      title="定时任务"
      count={scheduled.length}
    >
      <ThreadSummaryExpandableList
        items={scheduled}
        scopeKey={`${sessionId ?? "none"}:scheduled`}
        ariaLabel="定时任务"
        getKey={(task) => task.id}
        renderItem={(task) => (
          <div className="task-context-scheduled-row">
            <button
              type="button"
              className="task-context-row task-context-scheduled-main"
              onClick={() => onOpenScheduledTask?.(task.id)}
              disabled={!onOpenScheduledTask}
              title={scheduledTooltip(task, scheduled.length)}
            >
              <SUMMARY_ICONS.scheduled
                size={15}
                data-icon-contract="summary-scheduled"
              />
              <span>{task.name}</span>
              <small className="task-context-row-detail">
                {scheduledStatus(task, scheduled.length)}
              </small>
            </button>
            <div
              className="task-context-scheduled-actions"
              role="group"
              aria-label={`${task.name} 操作`}
            >
              <button
                type="button"
                className="thread-summary-icon-button"
                onClick={() => onToggleScheduledTask?.(task.id)}
                disabled={!onToggleScheduledTask}
                aria-label={
                  task.enabled ? `暂停 ${task.name}` : `恢复 ${task.name}`
                }
                title={task.enabled ? "暂停任务" : "恢复任务"}
              >
                {task.enabled ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                type="button"
                className="thread-summary-icon-button"
                onClick={() => onRemoveScheduledTask?.(task.id)}
                disabled={!onRemoveScheduledTask}
                aria-label={`删除 ${task.name}`}
                title="删除任务"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      />
    </ThreadSummarySection>
  );
}

export function WorkspaceContextSection({
  sessionId,
  model,
  gitLoading,
  onOpenWorkspace,
  onOpenChanges,
  onRefresh,
}: {
  sessionId: string | null;
  model: TaskPresentationModel;
  gitLoading: boolean;
  onOpenWorkspace: () => void;
  onOpenChanges?: () => void;
  onRefresh: () => void;
}) {
  const workspace = model.workspace;
  const git = workspace?.git;
  const showGitRow = gitLoading || Boolean(git);
  const gitRowLabel = git?.isRepository ? "分支" : "Git";
  const gitDetail = gitLoading
    ? "检测中"
    : git?.isRepository
      ? git.branch || "未检测到分支"
      : "未初始化";
  const branchSyncDetail =
    git?.isRepository && (git.ahead || git.behind)
      ? `${git.ahead ? `↑${git.ahead}` : ""}${
          git.ahead && git.behind ? " " : ""
        }${git.behind ? `↓${git.behind}` : ""}`
      : undefined;
  const showChanges = Boolean(model.changes || git?.isRepository);
  const hasEnvironmentRows = Boolean(
    workspace || showChanges || model.modelName || model.securityMode,
  );
  if (!hasEnvironmentRows) return null;

  return (
    <ThreadSummarySection
      sectionKey="environment"
      sessionId={sessionId}
      title="环境"
      after={
        <button
          type="button"
          className="thread-summary-icon-button"
          onClick={onRefresh}
          aria-label="刷新工作区状态"
          title="刷新工作区状态"
        >
          <SUMMARY_ICONS.refresh
            className={gitLoading ? "is-spinning" : ""}
            size={14}
            data-icon-contract="summary-refresh"
          />
        </button>
      }
    >
      {showChanges ? (
        <button
          type="button"
          className="task-context-row task-context-change-row"
          onClick={onOpenChanges}
          disabled={!model.changes?.reviewTarget || !onOpenChanges}
        >
          <SUMMARY_ICONS.changes
            size={15}
            data-icon-contract="summary-changes"
          />
          <span>变更</span>
          {model.changes ? (
            <ChangeStats changes={model.changes} />
          ) : (
            <small className="task-context-row-detail">无变更</small>
          )}
        </button>
      ) : null}
      {workspace ? (
        <button
          type="button"
          className="task-context-row"
          onClick={onOpenWorkspace}
          title={workspace.path}
        >
          <SUMMARY_ICONS.workspace
            size={15}
            data-icon-contract="summary-workspace"
          />
          <span>本地</span>
          <small className="task-context-row-detail">{workspace.path}</small>
        </button>
      ) : null}
      {showGitRow ? (
        <div className="task-context-row" title={git?.upstream}>
          <SUMMARY_ICONS.branch size={15} data-icon-contract="summary-branch" />
          <span>{gitRowLabel}</span>
          <small className="task-context-row-detail">
            {gitDetail}
            {branchSyncDetail ? ` ${branchSyncDetail}` : ""}
          </small>
        </div>
      ) : null}
      {model.modelName ? (
        <div className="task-context-row">
          <SUMMARY_ICONS.model size={15} data-icon-contract="summary-model" />
          <span>模型</span>
          <small className="task-context-row-detail">{model.modelName}</small>
        </div>
      ) : null}
      {model.securityMode ? (
        <div className="task-context-row">
          <SUMMARY_ICONS.permission
            size={15}
            data-icon-contract="summary-permission"
          />
          <span>权限</span>
          <small className="task-context-row-detail">
            {permissionModeLabel(model.securityMode)}
          </small>
        </div>
      ) : null}
    </ThreadSummarySection>
  );
}

export function PlanSection({
  sessionId,
  plan,
}: {
  sessionId: string | null;
  plan: TaskPresentationModel["plan"];
}) {
  if (!plan) return null;
  return (
    <ThreadSummarySection sectionKey="plan" sessionId={sessionId} title="计划">
      <div className="task-context-row" title={plan.text}>
        <SUMMARY_ICONS.plan size={15} data-icon-contract="summary-plan" />
        <span>当前计划</span>
        <small className="task-context-row-detail">
          {compactSummaryText(plan.text)}
        </small>
      </div>
    </ThreadSummarySection>
  );
}

export function OutputContentSection({
  sessionId,
  outputContent,
  onOpenOutput,
}: {
  sessionId: string | null;
  outputContent: TaskPresentationModel["outputContent"];
  onOpenOutput?: (target: OutputTarget) => void;
}) {
  if (!outputContent.length) return null;
  return (
    <ThreadSummarySection
      sectionKey="outputs"
      sessionId={sessionId}
      title="产出"
      count={outputContent.length}
    >
      <ThreadSummaryExpandableList
        items={outputContent}
        scopeKey={`${sessionId ?? "none"}:outputs`}
        ariaLabel="产出"
        getKey={(item) => item.id}
        renderItem={(item) => {
          const Icon =
            item.kind === "image"
              ? SUMMARY_ICONS.imageOutput
              : item.kind === "link"
                ? SUMMARY_ICONS.linkOutput
                : SUMMARY_ICONS.outputContent;
          return (
            <button
              type="button"
              className="task-context-row"
              title={item.detail}
              onClick={() => onOpenOutput?.(item.target ?? { kind: "outputs" })}
              disabled={!item.target || !onOpenOutput}
            >
              <Icon
                size={15}
                data-icon-contract={`summary-output-${item.kind}`}
              />
              <span>{item.label}</span>
              <small className="task-context-row-detail">{item.detail}</small>
            </button>
          );
        }}
      />
    </ThreadSummarySection>
  );
}

export function TaskProgressSection({
  sessionId,
  tasks,
}: {
  sessionId: string | null;
  tasks: TaskPresentationModel["tasks"];
}) {
  if (!tasks.length) return null;
  const complete = tasks.every((task) => task.status === "completed");
  return (
    <ThreadSummarySection
      sectionKey="created-tasks"
      sessionId={sessionId}
      title="已创建任务"
      count={tasks.length}
      autoCollapse={complete}
    >
      <ThreadSummaryExpandableList
        items={tasks}
        scopeKey={`${sessionId ?? "none"}:created-tasks`}
        ariaLabel="已创建任务"
        getKey={(task) => task.id}
        renderItem={(task) => {
          const completed = task.status === "completed";
          const Icon = completed
            ? SUMMARY_ICONS.taskCompleted
            : SUMMARY_ICONS.taskPending;
          return (
            <div className={`task-context-row task-status-${task.status}`}>
              <Icon
                className={task.status === "running" ? "is-spinning" : ""}
                size={15}
                data-icon-contract={
                  completed ? "summary-task-completed" : "summary-task-pending"
                }
              />
              <span title={task.detail ?? task.title}>{task.title}</span>
            </div>
          );
        }}
      />
    </ThreadSummarySection>
  );
}

export function SubagentsSection({
  sessionId,
  subagents,
  onOpenSubagent,
}: {
  sessionId: string | null;
  subagents: TaskPresentationModel["subagents"];
  onOpenSubagent?: (subagentId: string) => void;
}) {
  if (!subagents.length) return null;
  return (
    <ThreadSummarySection
      sectionKey="subagents"
      sessionId={sessionId}
      title="子代理"
      count={subagents.length}
    >
      <ThreadSummaryExpandableList
        items={subagents}
        scopeKey={`${sessionId ?? "none"}:subagents`}
        ariaLabel="子代理"
        getKey={(subagent) => subagent.id}
        renderItem={(subagent) => (
          <button
            type="button"
            className={`task-context-row task-status-${subagent.status}`}
            onClick={() => onOpenSubagent?.(subagent.id)}
            disabled={!onOpenSubagent}
            title={subagent.description ?? subagent.prompt}
          >
            <SUMMARY_ICONS.subagent
              size={15}
              data-icon-contract="summary-subagent"
            />
            <span>
              {subagent.agentName ??
                subagent.agentType ??
                subagent.description ??
                `#${subagent.ordinal}`}
            </span>
          </button>
        )}
      />
    </ThreadSummarySection>
  );
}

export function UsageSection({
  sessionId,
  usage,
}: {
  sessionId: string | null;
  usage: TaskPresentationModel["usage"];
}) {
  if (!usage) return null;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const total = usage.totalTokens ?? input + output;
  if (!input && !output && !total && !usage.cacheReadInputTokens) return null;
  return (
    <ThreadSummarySection sectionKey="usage" sessionId={sessionId} title="用量">
      <div className="task-context-row" title="本轮 token 用量">
        <SUMMARY_ICONS.usage size={15} data-icon-contract="summary-usage" />
        <span>Token</span>
        <small className="task-context-row-detail">
          输入 {formatToken(input)} · 输出 {formatToken(output)} · 总计{" "}
          {formatToken(total)}
        </small>
      </div>
    </ThreadSummarySection>
  );
}

export function BackgroundProcessesSection({
  sessionId,
  processes,
  onOpenTerminal,
}: {
  sessionId: string | null;
  processes: TaskPresentationModel["processes"];
  onOpenTerminal?: (terminalSessionId?: string) => void;
}) {
  if (!processes.length) return null;
  return (
    <ThreadSummarySection
      sectionKey="background-processes"
      sessionId={sessionId}
      title="后台进程"
      count={processes.length}
    >
      <ThreadSummaryExpandableList
        items={processes}
        scopeKey={`${sessionId ?? "none"}:background-processes`}
        ariaLabel="后台进程"
        getKey={(process) => process.id}
        renderItem={(process) =>
          process.source === "terminal" ? (
            <button
              type="button"
              className="task-context-row is-running"
              title={process.cwd ?? process.command}
              onClick={() => onOpenTerminal?.(process.terminalSessionId)}
              disabled={!onOpenTerminal}
            >
              <SUMMARY_ICONS.process
                size={15}
                data-icon-contract="summary-process"
              />
              <span>{process.command}</span>
              <small className="task-context-row-detail">终端</small>
            </button>
          ) : (
            <div
              className="task-context-row is-running"
              title={process.command}
            >
              <SUMMARY_ICONS.process
                size={15}
                data-icon-contract="summary-process"
              />
              <span>{process.command}</span>
            </div>
          )
        }
      />
    </ThreadSummarySection>
  );
}

export function BrowserPagesSection({
  sessionId,
  browserPages,
  onOpenBrowserPage,
}: {
  sessionId: string | null;
  browserPages: TaskPresentationModel["browserPages"];
  onOpenBrowserPage?: (pageId: string) => void;
}) {
  if (!browserPages.length) return null;
  return (
    <ThreadSummarySection
      sectionKey="browser"
      sessionId={sessionId}
      title="浏览器"
      count={browserPages.length}
    >
      <ThreadSummaryExpandableList
        items={browserPages}
        scopeKey={`${sessionId ?? "none"}:browser`}
        ariaLabel="浏览器页面"
        getKey={(page) => page.pageId}
        renderItem={(page) => (
          <button
            type="button"
            className="task-context-row"
            title={page.url}
            onClick={() => onOpenBrowserPage?.(page.pageId)}
            disabled={!onOpenBrowserPage}
          >
            <SUMMARY_ICONS.browser
              size={15}
              data-icon-contract="summary-browser"
            />
            <span>{page.title || page.url}</span>
          </button>
        )}
      />
    </ThreadSummarySection>
  );
}

export function SourcesSection({
  sessionId,
  sources,
}: {
  sessionId: string | null;
  sources: TaskPresentationModel["sources"];
}) {
  if (!sources.length) return null;
  return (
    <ThreadSummarySection
      sectionKey="sources"
      sessionId={sessionId}
      title="来源"
      count={sources.length}
    >
      <ThreadSummaryExpandableList
        items={sources}
        scopeKey={`${sessionId ?? "none"}:sources`}
        ariaLabel="来源"
        getKey={(source) => source.id}
        renderItem={(source) => {
          const Icon =
            source.kind === "web"
              ? SUMMARY_ICONS.webSource
              : SUMMARY_ICONS.mcpSource;
          return (
            <div className="task-context-row" title={source.detail}>
              <Icon
                size={15}
                data-icon-contract={
                  source.kind === "web"
                    ? "summary-web-source"
                    : "summary-mcp-source"
                }
              />
              <span>{source.label}</span>
              {source.count > 1 ? (
                <small className="task-context-row-detail">
                  {source.count} 次
                </small>
              ) : null}
            </div>
          );
        }}
      />
    </ThreadSummarySection>
  );
}

function scheduledStatus(
  task: TaskPresentationModel["scheduled"][number],
  count: number,
): string {
  if (count > 1) return scheduledStatusLabel(task.status);
  if (task.nextRunAt) return `下次 ${formatTimestamp(task.nextRunAt)}`;
  return scheduledStatusLabel(task.status);
}

function scheduledTooltip(
  task: TaskPresentationModel["scheduled"][number],
  count: number,
): string {
  const lines = [task.name, task.detail, scheduledStatus(task, count)];
  return lines.filter(Boolean).join("\n");
}

function scheduledStatusLabel(status: string): string {
  if (status === "running") return "运行中";
  if (status === "success") return "已完成";
  if (status === "failed") return "失败";
  if (status === "missed") return "已错过";
  if (status === "no_window") return "无窗口";
  if (status === "paused" || status === "disabled") return "已暂停";
  return "已启用";
}

function compactSummaryText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 96 ? `${normalized.slice(0, 95)}…` : normalized;
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatToken(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function ChangeStats({
  changes,
}: {
  changes: NonNullable<TaskPresentationModel["changes"]>;
}) {
  return (
    <small className="task-context-change-stats">
      <span>{changes.filesChanged} 个文件</span>
      {changes.insertions ? (
        <b className="is-addition">+{changes.insertions}</b>
      ) : null}
      {changes.deletions ? (
        <b className="is-deletion">-{changes.deletions}</b>
      ) : null}
    </small>
  );
}

function permissionModeLabel(mode: string): string {
  if (mode === "full-access") return "完全访问";
  if (mode === "auto-review") return "帮我批准";
  return "请求批准";
}
