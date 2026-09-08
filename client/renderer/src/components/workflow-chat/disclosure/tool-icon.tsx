/**
 * 工具图标映射：按工具名（小写）选择行首图标。
 * 与 ToolCallRowDetails.ToolIcon 保持同一套语义（此处以"名字"为输入，
 * 供披露行外壳消费；ToolIcon 以 item 为输入，供详情卡消费）。
 */

import {
  Clipboard,
  FilePenLine,
  FileText,
  FolderTree,
  Gauge,
  ListChecks,
  Search,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

export function isReadToolName(name: string): boolean {
  return (
    name === "read" ||
    name.endsWith(".read") ||
    name === "read_file" ||
    name === "read_files" ||
    name.endsWith(".read_file") ||
    name.endsWith(".read_files")
  );
}

export function isListToolName(name: string): boolean {
  return (
    name === "list" ||
    name === "ls" ||
    name.endsWith(".ls") ||
    name === "glob" ||
    name.endsWith(".glob") ||
    name === "list_files" ||
    name === "get_directory_tree" ||
    name.endsWith(".list_files")
  );
}

export function isSearchToolName(name: string): boolean {
  return name.includes("search") || name === "grep" || name.endsWith(".grep");
}

export function isEditToolName(name: string): boolean {
  return (
    name.includes("apply_patch") ||
    name.includes("patch") ||
    name.includes("edit") ||
    name.includes("write")
  );
}

export function toolIconFor(name: string): ReactNode {
  const n = name.toLowerCase();
  if (n === "update_plan" || n.includes("todo"))
    return <ListChecks className="h-4 w-4" />;
  if (n === "token_count") return <Gauge className="h-4 w-4" />;
  if (isReadToolName(n)) return <FileText className="h-4 w-4" />;
  if (isListToolName(n)) return <FolderTree className="h-4 w-4" />;
  if (isEditToolName(n)) return <FilePenLine className="h-4 w-4" />;
  if (n === "js" || n.includes("web") || isSearchToolName(n))
    return <Search className="h-4 w-4" />;
  if (n.includes("shell") || n.includes("command") || n === "commands")
    return <SquareTerminal className="h-4 w-4" />;
  if (n.includes("clipboard")) return <Clipboard className="h-4 w-4" />;
  return <Wrench className="h-4 w-4" />;
}
