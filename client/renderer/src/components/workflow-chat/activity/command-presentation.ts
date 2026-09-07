import type { WorkflowTurnItem as WorkflowStreamItem } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import { workflowStatusIsRunning } from "../adapter/item-status";
import { commandDisplayText, commandSummaryKind } from "./command-display";

export type CommandItemModel = Extract<
  WorkflowStreamItem,
  { type: "commandExecution" }
>;

export type CommandDisplayKind = "command" | "list" | "read" | "search";
export type CommandStatusKind = "running" | "failed" | "stopped" | "success";

export interface CommandPresentation {
  detailOutput: string;
  durationMs?: number;
  exitCode?: number;
  truncated?: boolean;
  failed: boolean;
  hasDetail: boolean;
  input: string;
  kind: CommandDisplayKind;
  label: string;
  meta: string;
  running: boolean;
  shell: string;
  statusKind: CommandStatusKind;
  statusText: string;
}

export function commandPresentation(
  item: CommandItemModel,
): CommandPresentation {
  const input = item.command || "";
  const output = item.output?.text || "";
  const status = item.status || "completed";
  const running = workflowStatusIsRunning(status);
  const failed =
    status === "error" ||
    status === "failed" ||
    (!running &&
      typeof item.exitCode === "number" &&
      item.exitCode !== 0 &&
      !commandStopped(status));
  const stopped = commandStopped(status);
  const statusKind: CommandStatusKind = running
    ? "running"
    : failed
      ? "failed"
      : stopped
        ? "stopped"
        : "success";

  return {
    detailOutput: cleanCommandOutput(output),
    durationMs: item.durationMs ?? undefined,
    exitCode: item.exitCode ?? undefined,
    truncated: item.output?.truncated,
    failed,
    hasDetail: Boolean(input || output),
    input,
    kind: commandDisplayKind(item.command),
    label: commandLabel(item, failed ? "failed" : status),
    meta:
      status === "pending" ||
      readableCommandLabel(input) === `已运行 ${commandDisplayText(input)}`
        ? ""
        : commandDisplayText(input),
    running,
    shell: commandShellLabel(item),
    statusKind,
    statusText:
      statusKind === "running"
        ? "运行中"
        : statusKind === "failed"
          ? "失败"
          : statusKind === "stopped"
            ? "已停止"
            : "成功",
  };
}

export function commandLabel(item: CommandItemModel, status: string): string {
  if (status === "pending") return "正在准备命令";
  const commandCount = item.command.split(/\n\n+/).filter(Boolean).length;
  const label =
    commandCount > 1
      ? `已运行 ${commandCount} 条命令`
      : readableCommandLabel(item.command);
  if (commandStopped(status))
    return label.startsWith("已")
      ? label.replace(/^已/, "已停止")
      : `已停止: ${label}`;
  if (workflowStatusIsRunning(status))
    return label.startsWith("已") ? label.replace(/^已/, "正在") : label;
  return label;
}

export function readableCommandLabel(command: string): string {
  const firstLine = commandDisplayText(command);
  if (!firstLine) return "已运行命令";
  if (firstLine.startsWith("git status")) return "已检查 Git 状态";
  if (/^(npm|pnpm|yarn|npm\.cmd|pnpm\.cmd|yarn\.cmd)\b/i.test(firstLine))
    return `已运行 ${firstLine}`;
  if (firstLine.startsWith("rg --files")) return "已列出文件";
  if (firstLine.startsWith("rg ")) return "已搜索工作区";
  if (/^(Get-Content|gc|cat)\b/i.test(firstLine))
    return `已读取 ${compactReadCommandTarget(firstLine)}`;
  if (/^(Get-ChildItem|ls|dir)\b/i.test(firstLine)) return "已列出文件";
  if (commandSummaryKind(command) === "folder") return "已创建文件夹";
  if (/^Select-String\b/i.test(firstLine)) return "已搜索工作区";
  if (/^Get-NetTCPConnection\b/i.test(firstLine)) return "已检查开发服务";
  if (/^\$snapshot\s*=/i.test(firstLine)) return "已读取会话日志";
  if (/^\$listener\s*=/i.test(firstLine)) return "已重启开发服务";
  if (/^Start-Process\b/i.test(firstLine)) return "已启动开发服务";
  if (/^Stop-Process\b/i.test(firstLine)) return "已重启开发服务";
  if (/^Invoke-RestMethod\b/i.test(firstLine)) return "已调用本地 API";
  return `已运行 ${firstLine}`;
}

export function cleanCommandOutput(output: string): string {
  if (!output) return "";
  const normalized = output.replace(/\r/g, "").trim();
  const outputIndex = normalized.indexOf("\nOutput:\n");
  if (outputIndex >= 0)
    return normalized.slice(outputIndex + "\nOutput:\n".length).trim();
  return normalized
    .replace(/^Exit code:\s*-?\d+\n/i, "")
    .replace(/^Wall time:\s*.+\n/i, "")
    .replace(/^Output:\n/i, "")
    .trim();
}

function commandStopped(status: string): boolean {
  const normalized = status.toLowerCase();
  return (
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "interrupted" ||
    normalized === "aborted"
  );
}

export function formatShellLabel(
  shell: string | undefined,
): string | undefined {
  const trimmed = shell?.trim();
  const normalized = trimmed?.toLowerCase();
  if (!normalized) return undefined;
  if (
    normalized.includes("powershell") ||
    normalized === "pwsh" ||
    normalized.endsWith("pwsh.exe")
  )
    return "PowerShell";
  if (normalized === "cmd" || normalized.endsWith("cmd.exe")) return "CMD";
  if (normalized.includes("bash")) return "Bash";
  if (normalized.includes("zsh")) return "Zsh";
  if (normalized.includes("fish")) return "Fish";
  if (normalized === "sh" || normalized.endsWith("/sh")) return "sh";
  if (normalized.includes("node")) return "Node";
  return trimmed;
}

export function inferShellLabel(command: string): string | undefined {
  const firstLine = command.trim().split(/\r?\n/)[0] ?? "";
  if (!firstLine) return undefined;
  if (/^(powershell|powershell\.exe|pwsh|pwsh\.exe)\b/i.test(firstLine))
    return "PowerShell";
  if (/^(cmd|cmd\.exe)\b/i.test(firstLine)) return "CMD";
  if (/^(bash|bash\.exe)\b/i.test(firstLine)) return "Bash";
  if (/^(zsh|fish|sh)\b/i.test(firstLine)) return firstLine.split(/\s+/)[0];
  if (
    /^(Get-|Set-|New-|Remove-|Select-|Where-|ForEach-|Write-|Start-|Stop-|Invoke-|\$)/i.test(
      firstLine,
    )
  )
    return "PowerShell";
  if (
    /^(dir|copy|move|type|where)\b/i.test(firstLine) ||
    /^[A-Za-z]:\\/.test(firstLine)
  )
    return "CMD";
  return undefined;
}

function commandShellLabel(item: CommandItemModel): string {
  return (
    formatShellLabel(item.shell) || inferShellLabel(item.command) || "Shell"
  );
}

function commandDisplayKind(command: string): CommandDisplayKind {
  const kind = commandSummaryKind(command);
  return kind === "folder" ? "list" : kind === "web" ? "command" : kind;
}

function compactReadCommandTarget(command: string): string {
  const verb = command.match(/^(Get-Content|gc|cat)\b/i)?.[1] ?? "Get-Content";
  const target = command
    .replace(new RegExp(`^${verb}\\s+(-Path\\s+)?`, "i"), "")
    .replace(/\s+-TotalCount\s+\d+.*/i, "")
    .trim()
    .replace(/^["']|["']$/g, "");
  return basename(target || "file");
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}
