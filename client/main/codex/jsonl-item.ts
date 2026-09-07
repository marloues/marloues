import type {
  WorkflowTurnItem,
  WorkflowUserMessageContent,
} from "../../shared/workflow-read-thread-contract";
import { workflowToolResult } from "../../shared/workflow-tool-result";

type Raw = Record<string, unknown>;
export const record = (value: unknown): Raw =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : {};
export const string = (value: unknown): string =>
  typeof value === "string" ? value : "";
export const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const output = (value: unknown) => ({
  text: typeof value === "string" ? value : JSON.stringify(value ?? ""),
  truncated: false as const,
});
const key = (value: unknown) =>
  string(value).replace(/[_-]/g, "").toLowerCase();
const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];

function contentAsDiff(content: string, prefix: "+" | "-"): string {
  if (!content) return "";
  // A terminating newline ends the last line; it is not another changed line.
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

export function codexRecordedTime(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value)
      ? value < 100_000_000_000
        ? value * 1000
        : value
      : undefined;
  if (typeof value !== "string" || !value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function codexRecordedDuration(value: unknown): number | undefined {
  const duration = record(value);
  const secs = number(duration.secs);
  return secs === undefined
    ? undefined
    : secs * 1000 + (number(duration.nanos) ?? 0) / 1_000_000;
}

export function codexMessageText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((part) => {
      if (typeof part === "string") return [part];
      const item = record(part);
      return ["text", "inputtext", "outputtext"].includes(key(item.type))
        ? [string(item.text)]
        : [];
    })
    .join("");
}

/** Preserve protocol ordering and duplicate attachments. Presentation owns envelope removal. */
export function codexUserContent(value: unknown): {
  content: WorkflowUserMessageContent[];
  unsupported: string[];
} {
  const content: WorkflowUserMessageContent[] = [],
    unsupported: string[] = [];
  for (const part of Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : []) {
    if (typeof part === "string") {
      content.push({ type: "text", text: part });
      continue;
    }
    const item = record(part),
      type = key(item.type);
    if (["text", "inputtext"].includes(type)) {
      content.push({
        type: "text",
        text: string(item.text),
        ...(Array.isArray(item.text_elements)
          ? { text_elements: item.text_elements }
          : {}),
      });
    } else if (
      type === "localimage" ||
      (["image", "inputimage"].includes(type) && typeof item.path === "string")
    ) {
      content.push({
        type: "localImage",
        path: string(item.path),
        detail: string(item.detail) || undefined,
      });
    } else if (["image", "inputimage"].includes(type)) {
      const url =
        string(item.url) ||
        string(item.image_url) ||
        string(record(item.image_url).url);
      if (url)
        content.push({
          type: "image",
          url,
          detail: string(item.detail) || undefined,
        });
      else unsupported.push(string(item.type) + ":missing-url");
    } else if (type === "file") {
      content.push({
        type: "file",
        name: string(item.name),
        path: string(item.path) || undefined,
        mimeType: string(item.mimeType ?? item.mime_type),
        text: string(item.text),
      });
    } else if (type === "url") {
      content.push({
        type: "url",
        url: string(item.url),
        title: string(item.title) || undefined,
      });
    } else if (type === "skill" || type === "mention") {
      content.push({
        ...item,
        type,
        name: string(item.name),
        path: string(item.path) || undefined,
      });
    } else {
      unsupported.push(string(item.type) || "untyped");
    }
  }
  return { content, unsupported };
}

export interface RecordedItem {
  item: WorkflowTurnItem;
  mappedFields: string[];
  unsupportedContent: string[];
}

/** Read completed UI items, not the wrapper function calls used to invoke tools. */
export function codexRecordedItem(raw: Raw, fallbackId: string): RecordedItem {
  const base = { id: string(raw.id) || fallbackId, settled: true };
  const status = ["in_progress", "inProgress"].includes(string(raw.status))
    ? "running"
    : string(raw.status) || "completed";
  const durationMs =
    number(raw.durationMs) ?? codexRecordedDuration(raw.duration);
  const result = (
    item: WorkflowTurnItem,
    fields: string[],
    unsupportedContent: string[] = [],
  ): RecordedItem => ({
    item,
    mappedFields: ["id", "type", ...fields],
    unsupportedContent,
  });
  switch (key(raw.type)) {
    case "usermessage": {
      const { content, unsupported } = codexUserContent(raw.content);
      if (string(raw.client_id ?? raw.clientId)) {
        for (const part of content) {
          if (part.type === "text") part.displayFormat = "markdown";
        }
      }
      return result(
        {
          ...base,
          type: "userMessage",
          clientId: string(raw.client_id ?? raw.clientId) || undefined,
          content,
        },
        ["client_id", "clientId", "content"],
        unsupported,
      );
    }
    case "agentmessage":
      return result(
        {
          ...base,
          type: "agentMessage",
          text: codexMessageText(raw.content) || string(raw.text),
          phase: string(raw.phase) || undefined,
        },
        ["content", "text", "phase"],
      );
    case "reasoning":
      // Only the visible summary is a display field. Raw/encrypted reasoning is
      // retained in the source file, never exposed in the replay UI.
      return result(
        {
          ...base,
          type: "reasoning",
          summary: strings(raw.summary_text ?? raw.summary).join("\n"),
        },
        ["summary_text", "summary"],
      );
    case "plan":
      return result({ ...base, type: "plan", text: string(raw.text) }, [
        "text",
      ]);
    case "commandexecution": {
      const argv = strings(raw.command);
      const shellCall = argv.length >= 3 && /^-.*c$/.test(argv[1]);
      const command = shellCall
        ? argv[2]
        : typeof raw.command === "string"
          ? raw.command
          : argv
              .map((arg) =>
                /^[\w./:=+-]+$/.test(arg)
                  ? arg
                  : "'" + arg.replaceAll("'", "'\\''") + "'",
              )
              .join(" ");
      return result(
        {
          ...base,
          type: "commandExecution",
          command,
          shell: shellCall ? argv[0] : undefined,
          cwd: string(raw.cwd) || undefined,
          status,
          exitCode: number(raw.exit_code ?? raw.exitCode),
          durationMs,
          output: output(
            raw.aggregated_output ??
              raw.aggregatedOutput ??
              raw.formatted_output ??
              [string(raw.stdout), string(raw.stderr)]
                .filter(Boolean)
                .join("\n"),
          ),
        },
        [
          "command",
          "cwd",
          "status",
          "exit_code",
          "exitCode",
          "duration",
          "durationMs",
          "aggregated_output",
          "aggregatedOutput",
          "formatted_output",
        ],
      );
    }
    case "filechange": {
      const changes: Raw[] = Array.isArray(raw.changes)
        ? raw.changes.map(record)
        : Object.entries(record(raw.changes)).map(([path, value]) => ({
            ...record(value),
            path,
          }));
      return result(
        {
          ...base,
          type: "fileChange",
          status,
          changes: changes.map((change) => {
            const kind =
              string(change.type) ||
              string(change.kind) ||
              string(record(change.kind).type) ||
              "update";
            const content = string(change.content);
            const diff =
              change.unified_diff ??
              change.diff ??
              (kind === "add"
                ? contentAsDiff(content, "+")
                : kind === "delete"
                  ? contentAsDiff(content, "-")
                  : undefined);
            return {
              path: string(change.path),
              kind,
              ...(diff !== undefined ? { diff: output(diff) } : {}),
            };
          }),
        },
        ["status", "changes"],
      );
    }
    case "mcptoolcall":
      return result(
        {
          ...base,
          type: "mcpToolCall",
          server: string(raw.server),
          tool: string(raw.tool),
          arguments: raw.arguments,
          status,
          durationMs,
          output: output(raw.result ?? raw.output),
          result: workflowToolResult(raw.result ?? raw.output),
        },
        [
          "server",
          "tool",
          "arguments",
          "status",
          "duration",
          "durationMs",
          "result",
          "output",
        ],
      );
    case "dynamictoolcall":
      return result(
        {
          ...base,
          type: "dynamicToolCall",
          tool: string(raw.tool),
          arguments: raw.arguments,
          status,
          durationMs,
          output: output(raw.output),
          result: workflowToolResult(raw.output),
          success: typeof raw.success === "boolean" ? raw.success : undefined,
        },
        [
          "tool",
          "arguments",
          "status",
          "duration",
          "durationMs",
          "output",
          "success",
        ],
      );
    case "extension":
      if (raw.kind !== "web.search") break;
      return result(
        {
          ...base,
          type: "webSearch",
          query: string(raw.query),
          action: { ...record(raw.action), results: raw.results },
        },
        ["kind", "query", "action", "results"],
      );
    case "websearch":
      return result(
        {
          ...base,
          type: "webSearch",
          query: string(raw.query),
          action: raw.action,
        },
        ["query", "action"],
      );
    case "imageview":
      return result({ ...base, type: "imageView", path: string(raw.path) }, [
        "path",
      ]);
    case "imagegeneration":
      return result(
        {
          ...base,
          type: "imageGeneration",
          status,
          result: raw.result,
          savedPath: string(raw.saved_path ?? raw.savedPath) || undefined,
          revisedPrompt:
            string(raw.revised_prompt ?? raw.revisedPrompt) || undefined,
        },
        [
          "status",
          "result",
          "saved_path",
          "savedPath",
          "revised_prompt",
          "revisedPrompt",
        ],
      );
    case "collabagenttoolcall":
      return result(
        {
          ...base,
          type: "collabAgentToolCall",
          tool: string(raw.tool),
          status,
          senderThreadId:
            string(raw.sender_thread_id ?? raw.senderThreadId) || undefined,
          receiverThreadIds: strings(
            raw.receiver_thread_ids ?? raw.receiverThreadIds,
          ),
          prompt: string(raw.prompt) || undefined,
          model: string(raw.model) || undefined,
        },
        [
          "tool",
          "status",
          "sender_thread_id",
          "senderThreadId",
          "receiver_thread_ids",
          "receiverThreadIds",
          "prompt",
          "model",
        ],
      );
    case "contextcompaction":
      return result({ ...base, type: "contextCompaction" }, []);
    case "enteredreviewmode":
    case "exitedreviewmode":
      return result(
        {
          ...base,
          type:
            key(raw.type) === "enteredreviewmode"
              ? "enteredReviewMode"
              : "exitedReviewMode",
          review: raw.review,
        },
        ["review"],
      );
  }
  return result(
    { ...base, type: "unknown", rawType: string(raw.type), raw },
    [],
  );
}
