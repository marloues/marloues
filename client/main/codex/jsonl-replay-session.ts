import type { StoredSession } from "../store";
import type { WorkflowReadThreadInput } from "../../shared/workflow-thread-data-source";
import type { WorkflowReadThreadResponse } from "../../shared/workflow-read-thread-contract";
import { parseSessionLog } from "./session-log";

/** Imported logs are frozen, read-only data sources on the normal chat route. */
export function readStoredJsonlReplay(
  session: StoredSession,
  input: WorkflowReadThreadInput = {},
): WorkflowReadThreadResponse {
  const source = session.codexReplay;
  if (!source) throw new Error("This session is not a Codex replay");
  const parsed = parseSessionLog(source.source, {
    throughLine: source.throughLine,
  });
  if (!parsed.audit || parsed.audit.sourceSha256 !== source.sourceSha256)
    throw new Error("回放源文件已变化，请重新导入后再对照");
  const selected = parsed.readThread.turns.filter(
    (turn) =>
      !source.turnId ||
      turn.id === source.turnId ||
      turn.id.startsWith(source.turnId + ":steer:"),
  );
  const offset = Math.max(
    0,
    Number(input.cursor?.replace(/^offset:/, "")) || 0,
  );
  const limit = Math.max(1, Math.min(10000, input.limit ?? 100));
  const turns = selected.slice(offset, offset + limit);
  return {
    ...parsed.readThread,
    thread: {
      ...parsed.readThread.thread,
      id: session.id,
      title: session.title,
      status: {
        type: selected.some((turn) => turn.status === "running")
          ? "active"
          : "idle",
      },
    },
    page: {
      order: "newest_first",
      limit,
      hasMore: offset + turns.length < selected.length,
      nextCursor:
        offset + turns.length < selected.length
          ? String(offset + turns.length)
          : null,
    },
    turns,
    replay: {
      sourceThreadId: parsed.sessionId,
      sourceSha256: source.sourceSha256,
      throughLine: source.throughLine,
      clockAt: source.clockAt,
    },
  };
}

export function assertMutableSession(session: StoredSession | undefined): void {
  if (session?.codexReplay)
    throw new Error("这是只读会话回放，不能发送消息或执行历史操作");
}
