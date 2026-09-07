import { itemInputText } from "../../adapter/item-text";
import {
  basename,
  compactCommand,
  compactCommandTarget,
  isEditToolName,
  isListToolName,
  isReadToolName,
  isSearchToolName,
  itemStatus,
  toolName,
  toolTargetCount,
  toolFileTargets,
  toolArgumentText,
} from "./helpers";
import { workflowStatusIsRunning } from "../../adapter/item-status";
import type { ToolCallRowItem } from "./types";

export function toolLabel(item: ToolCallRowItem): string {
  const label = readableToolLabel(item);
  const status = itemStatus(item);
  if (
    ["cancelled", "canceled", "interrupted", "aborted", "stopped"].includes(
      status,
    )
  )
    return label.replace(/^已/, "已停止");
  if (workflowStatusIsRunning(status))
    return label.startsWith("已") ? label.replace(/^已/, "正在") : label;
  if (status === "error" || status === "failed")
    return label.startsWith("已")
      ? label.replace(/^已/, "失败：")
      : `失败：${label}`;
  return label;
}

function readableToolLabel(item: ToolCallRowItem): string {
  const name = toolName(item);
  const input = itemInputText(item);
  const firstLine =
    input
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim() ?? "";

  if (isReadToolName(name)) {
    const paths = toolFileTargets("arguments" in item ? item.arguments : "");
    const count = paths.length || toolTargetCount(input);
    return paths.length === 1
      ? `已读取 ${basename(paths[0])}`
      : count > 1
        ? `已读取 ${count} 个文件`
        : "已读取文件";
  }
  if (isListToolName(name)) {
    const pattern = toolArgumentText(item, "pattern", "glob");
    return pattern ? `已查找文件 ${pattern}` : "已列出文件";
  }
  if (name === "grep" || name.endsWith(".grep")) {
    const query = toolArgumentText(item, "pattern", "query");
    return query ? `已搜索 ${query}` : "已搜索工作区";
  }
  if (name.includes("tool_search")) return "已搜索工具";
  if (item.type === "webSearch")
    return input.includes('"type": "open_page"') ? "已打开页面" : "已搜索网页";
  if (item.type === "imageGeneration")
    return itemStatus(item) === "running" ? "正在生成图片" : "已生成图片";
  if (name === "token_count") return "已更新用量";
  if (name === "turn_aborted") return "已中断";
  if (name === "thread_rolled_back") return "已回滚";
  if (name === "update_plan" || name === "plan_snapshot") return "已更新计划";
  if (name === "js") return "已使用浏览器";
  if (isSearchToolName(name) || firstLine.startsWith("rg "))
    return firstLine.startsWith("rg --files")
      ? "已列出项目文件"
      : "已搜索工作区";

  if (
    name.includes("shell") ||
    name.includes("command") ||
    name === "commands"
  ) {
    if (/^Get-Content\b/i.test(firstLine))
      return `已读取 ${compactCommandTarget(firstLine, "Get-Content")}`;
    if (/^Get-ChildItem\b/i.test(firstLine)) return "已列出目录";
    if (/^Select-String\b/i.test(firstLine)) return "已搜索工作区";
    if (/^Get-NetTCPConnection\b/i.test(firstLine)) return "已检查开发服务";
    if (/^\$snapshot\s*=/i.test(firstLine)) return "已读取会话日志";
    if (/^\$listener\s*=/i.test(firstLine)) return "已重启开发服务";
    if (/^git status\b/i.test(firstLine)) return "已检查 Git 状态";
    if (/^npm run\b/i.test(firstLine)) return `已运行 ${firstLine}`;
    if (/^Start-Process\b/i.test(firstLine)) return "已启动开发服务";
    if (/^Stop-Process\b/i.test(firstLine)) return "已重启开发服务";
    if (/^Invoke-RestMethod\b/i.test(firstLine)) return "已调用本地 API";
    return firstLine ? `已运行 ${compactCommand(firstLine)}` : "已运行命令";
  }

  if (isEditToolName(name)) return "已编辑文件";
  if (name.includes("todo")) return "已更新待办";
  return `已运行 ${"tool" in item ? item.tool : name || item.type}`;
}
