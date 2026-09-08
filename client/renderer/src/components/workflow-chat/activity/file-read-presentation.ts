import type { WorkflowTurnItem } from "@shared/adapters/workflow-messages-to-read-thread";
import { workflowStatusIsRunning } from "../adapter/item-status";
import { isReadToolName, toolFileTargets } from "./ToolCallRowDetails/helpers";

export interface FileReadTarget {
  label: string;
  path: string | null;
  line?: number;
}

export interface FileReadPresentation {
  targets: FileReadTarget[];
  status: "running" | "failed" | "cancelled" | "completed";
}

/** Only explicit file arguments or a small set of literal read commands become links. */
export function fileReadPresentation(
  item: WorkflowTurnItem,
  cwd?: string | null,
): FileReadPresentation | null {
  let paths: string[];
  let line: number | undefined;
  if (item.type === "dynamicToolCall" || item.type === "mcpToolCall") {
    if (!isReadToolName(item.tool)) return null;
    paths = toolFileTargets(item.arguments);
    let args = item.arguments;
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        /* A plain path has no line hint. */
      }
    }
    if (args && typeof args === "object" && !Array.isArray(args)) {
      const record = args as Record<string, unknown>;
      line = positiveLine(
        record.start_line ?? record.startLine ?? record.offset ?? record.line,
      );
    }
  } else if (item.type === "commandExecution") {
    const read = readCommandTargets(item.command, item.cwd ?? cwd);
    if (!read) return null;
    ({ paths, line, cwd } = read);
  } else return null;

  const targets = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
    .filter(
      (path) =>
        ![...path].some((character) => character.charCodeAt(0) < 32) &&
        !/^[a-z][a-z\d+.-]*:/i.test(path.replace(/^[a-z]:[\\/]/i, "/")),
    )
    .map((label) => ({ label, path: absoluteFilePath(label, cwd), line }));
  if (!targets.length) return null;
  const status = String(item.status ?? "completed").toLowerCase();
  const running = workflowStatusIsRunning(status);
  const cancelled = [
    "cancelled",
    "canceled",
    "stopped",
    "interrupted",
    "aborted",
  ].includes(status);
  const failed =
    ["error", "failed"].includes(status) ||
    ("success" in item && item.success === false) ||
    ("result" in item && item.result?.isError === true) ||
    (item.type === "commandExecution" &&
      !running &&
      !cancelled &&
      item.exitCode != null &&
      item.exitCode !== 0);
  return {
    targets,
    status: cancelled
      ? "cancelled"
      : failed
        ? "failed"
        : running
          ? "running"
          : "completed",
  };
}

function positiveLine(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function absoluteFilePath(path: string, cwd?: string | null): string | null {
  if (/^(?:\/|\\\\|[a-z]:[\\/])/i.test(path)) return path;
  if (!cwd || !/^(?:\/|\\\\|[a-z]:[\\/])/i.test(cwd) || path.startsWith("~"))
    return null;
  return `${cwd.replace(/[\\/]$/, "")}/${path}`;
}

function readCommandTargets(
  command: string,
  cwd?: string | null,
): {
  paths: string[];
  line?: number;
  cwd?: string | null;
} | null {
  let source = command.trim();
  // Preserve an explicit directory prefix. Never evaluate shell substitutions.
  const cd = source.match(
    /^cd\s+(?:--\s+)?('[^'\r\n]*'|"[^"$`\r\n]*"|[^\s;&|<>"'`$()]+)\s*&&\s*/,
  );
  if (cd) {
    cwd = absoluteFilePath(unquote(cd[1]), cwd);
    if (!cwd) return null;
    source = source.slice(cd[0].length);
  }
  const tokens: string[] = [];
  const pattern = /'[^'\r\n]*'|"[^"$`\r\n]*"|[^\s"'`$;&|<>()]+/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const gap = source.slice(cursor, match.index);
    if (cursor === 0 ? gap !== "" : !/^[ \t]+$/.test(gap)) return null;
    tokens.push(unquote(match[0]));
    cursor = match.index + match[0].length;
  }
  if (source.slice(cursor).trim() || tokens.length < 2) return null;
  const verb = tokens.shift()!.toLowerCase();
  const paths: string[] = [];
  let line: number | undefined;
  if (verb === "sed") {
    if (tokens.shift() !== "-n") return null;
    const range = tokens.shift()?.match(/^(\d+)(?:,(\d+|\$))?p$/);
    if (!range) return null;
    line = positiveLine(Number(range[1]));
  } else if (!["cat", "head", "tail", "get-content", "gc"].includes(verb))
    return null;
  let literal = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!literal && token === "--") {
      literal = true;
      continue;
    }
    if (!literal && token.startsWith("-")) {
      if (verb === "cat" && /^-[AbenstuvET]+$/.test(token)) continue;
      if (["head", "tail"].includes(verb) && /^-\d+$/.test(token)) continue;
      if (
        ["head", "tail"].includes(verb) &&
        token === "-n" &&
        /^\d+$/.test(tokens[i + 1] ?? "")
      ) {
        i++;
        continue;
      }
      if (["get-content", "gc"].includes(verb)) {
        if (/^-(?:LiteralPath|Path|Raw)$/i.test(token)) continue;
        if (
          /^-(?:TotalCount|Head|Tail)$/i.test(token) &&
          /^\d+$/.test(tokens[i + 1] ?? "")
        ) {
          i++;
          continue;
        }
      }
      return null;
    }
    // Unknown globs, variables, redirects and compound commands remain ordinary tools.
    if (token === "-" || token.endsWith("\\") || /[*?[\]$`]/.test(token))
      return null;
    if (["get-content", "gc"].includes(verb) && token.includes("%"))
      return null;
    paths.push(token);
  }
  return paths.length ? { paths, line, cwd } : null;
}

function unquote(value: string): string {
  return /^["']/.test(value) ? value.slice(1, -1) : value;
}
