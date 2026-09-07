import { createHash } from "node:crypto";
import {
  WORKFLOW_READ_THREAD_SCHEMA_VERSION,
  type WorkflowReadThreadResponse,
  type WorkflowTurn,
  type WorkflowTurnItem,
} from "../../shared/workflow-read-thread-contract";
import {
  codexRecordedItem,
  codexRecordedTime,
  number,
  record,
  string,
} from "./jsonl-item";

export interface JsonlItemEvidence {
  line: number;
  turnId: string;
  itemId: string;
  rawType: string;
  mappedType: string;
  startedAt?: number;
  completedAt?: number;
  sha256: string;
  retainedInSourceFields: string[];
  unsupportedContent: string[];
}
export interface JsonlReplayAudit {
  strategy: "canonical-items";
  source: string;
  sourceSha256: string;
  throughLine: number;
  eventCounts: Record<string, number>;
  invalidLines: number[];
  items: JsonlItemEvidence[];
  lastCompletedTurnId?: string;
  lastCompletedLine?: number;
  omittedTransportRecords: number;
  missingTerminalItems: string[];
}
export interface JsonlEventSnapshot {
  readThread: WorkflowReadThreadResponse;
  audit: JsonlReplayAudit;
}

// Second-resolution payload times lose up to 999 ms. Use the event timestamp
// when it refines that same second; never substitute a later logging time.
function recordedEventTime(value: unknown, timestamp: unknown) {
  const recorded = codexRecordedTime(value);
  const emitted = codexRecordedTime(timestamp);
  if (recorded == null) return emitted;
  return recorded % 1000 === 0 &&
    emitted != null &&
    Math.floor(emitted / 1000) === recorded / 1000
    ? emitted
    : recorded;
}

const workKinds = new Set([
  "reasoning",
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "webSearch",
  "imageGeneration",
  "collabAgentToolCall",
  "contextCompaction",
]);

/** Replay only recorded state. No fabricated token deltas or execution of calls. */
export function parseCodexRecordedSession(
  text: string,
  options: { source: string; throughLine?: number },
): JsonlEventSnapshot | null {
  const sourceLines = text.split(/\r?\n/);
  const limit = Math.min(
    options.throughLine ?? sourceLines.length,
    sourceLines.length,
  );
  const rows: {
    line: number;
    raw: string;
    type: string;
    timestamp?: unknown;
    payload: Record<string, unknown>;
  }[] = [];
  const audit: JsonlReplayAudit = {
    strategy: "canonical-items",
    source: options.source,
    sourceSha256: createHash("sha256").update(text).digest("hex"),
    throughLine: limit,
    eventCounts: {},
    invalidLines: [],
    items: [],
    omittedTransportRecords: 0,
    missingTerminalItems: [],
  };
  for (let i = 0; i < limit; i++) {
    if (!sourceLines[i].trim()) continue;
    try {
      const row = record(JSON.parse(sourceLines[i]));
      rows.push({
        line: i + 1,
        raw: sourceLines[i],
        type: string(row.type),
        timestamp: row.timestamp,
        payload: record(row.payload),
      });
    } catch {
      audit.invalidLines.push(i + 1);
    }
  }
  // Older CLI logs lack completed UI items; their legacy decoder remains explicit.
  if (
    !rows.some(
      (row) =>
        row.type === "event_msg" &&
        row.payload.type === "item_completed" &&
        /^(UserMessage|AgentMessage|CommandExecution)$/i.test(
          string(record(row.payload.item).type),
        ),
    )
  )
    return null;
  const meta = rows.find((row) => row.type === "session_meta")?.payload ?? {};
  const threadId = string(meta.id ?? meta.session_id) || "jsonl-replay";
  const turns = new Map<string, WorkflowTurn>();
  const itemPositions = new Map<string, number>();
  let activeTurn = "";
  const ensure = (id: string): WorkflowTurn => {
    const turnId = id || activeTurn || "unattributed";
    let turn = turns.get(turnId);
    if (!turn) {
      turn = {
        id: turnId,
        zone: "workspace",
        status: "running",
        error: null,
        timing: {
          basis: "codex-recorded",
          workStartedAt: null,
          finalAnswerStartedAt: null,
        },
        items: [],
      };
      turns.set(turnId, turn);
    }
    return turn;
  };
  for (const row of rows) {
    const p = row.payload,
      type = string(p.type),
      eventType = row.type + (type ? ":" + type : "");
    audit.eventCounts[eventType] = (audit.eventCounts[eventType] ?? 0) + 1;
    if (row.type === "event_msg" && type === "task_started") {
      activeTurn = string(p.turn_id);
      const turn = ensure(activeTurn);
      turn.startedAt = recordedEventTime(p.started_at, row.timestamp);
    } else if (row.type === "turn_context") {
      const id = string(p.turn_id) || activeTurn;
      if (id) ensure(id).modelId = string(p.model) || undefined;
    } else if (row.type === "event_msg" && type === "item_completed") {
      const raw = record(p.item),
        turn = ensure(string(p.turn_id));
      const decoded = codexRecordedItem(raw, "jsonl-line-" + row.line);
      const item = decoded.item;
      const identity = turn.id + ":" + item.id;
      const existing = itemPositions.get(identity);
      if (existing === undefined) {
        itemPositions.set(identity, turn.items.length);
        turn.items.push(item);
      } else turn.items[existing] = item;
      const startedAt = number(p.started_at_ms),
        completedAt = number(p.completed_at_ms);
      if (
        startedAt !== undefined &&
        (workKinds.has(item.type) ||
          (item.type === "agentMessage" &&
            item.phase === "commentary" &&
            item.text.trim()))
      )
        turn.timing!.workStartedAt = Math.min(
          turn.timing!.workStartedAt ?? Number(turn.startedAt ?? startedAt),
          Number(turn.startedAt ?? startedAt),
        );
      if (
        item.type === "agentMessage" &&
        item.phase === "final_answer" &&
        startedAt !== undefined
      )
        turn.timing!.finalAnswerStartedAt = Math.min(
          turn.timing!.finalAnswerStartedAt ?? startedAt,
          startedAt,
        );
      audit.items.push({
        line: row.line,
        turnId: turn.id,
        itemId: item.id,
        rawType: string(raw.type),
        mappedType: item.type,
        startedAt,
        completedAt,
        sha256: createHash("sha256").update(row.raw).digest("hex"),
        retainedInSourceFields: Object.keys(raw).filter(
          (field) => !decoded.mappedFields.includes(field),
        ),
        unsupportedContent: decoded.unsupportedContent,
      });
    } else if (
      row.type === "event_msg" &&
      ["task_complete", "turn_aborted", "error"].includes(type)
    ) {
      const turn = ensure(string(p.turn_id));
      turn.status =
        type === "task_complete"
          ? "completed"
          : type === "turn_aborted"
            ? "cancelled"
            : "failed";
      turn.completedAt = recordedEventTime(p.completed_at, row.timestamp);
      turn.durationMs =
        number(p.duration_ms) ??
        (typeof turn.startedAt === "number" &&
        typeof turn.completedAt === "number"
          ? turn.completedAt - turn.startedAt
          : null);
      if (type === "error")
        turn.error = {
          message:
            string(p.message) ||
            string(record(p.error).message) ||
            "Codex 任务失败",
          additionalDetails: p.error,
        };
      if (type === "task_complete") {
        audit.lastCompletedTurnId = turn.id;
        audit.lastCompletedLine = row.line;
        // Missing completed items are reported, never silently replaced by the
        // transport copy (which would hide a broken canonical mapping).
        if (
          string(p.last_agent_message) &&
          !turn.items.some(
            (item) =>
              item.type === "agentMessage" && item.phase === "final_answer",
          )
        )
          audit.missingTerminalItems.push(turn.id);
      }
    } else if (row.type === "response_item") {
      audit.omittedTransportRecords++;
    }
  }
  const chronological = [...turns.values()]
    .filter((turn) => turn.items.length)
    .flatMap((turn) => splitUserSegments(turn, audit.items));
  const latest = chronological.at(-1),
    first = chronological[0];
  const prompt = first?.items.find((item) => item.type === "userMessage");
  const title =
    prompt?.type === "userMessage"
      ? prompt.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(" ")
          .slice(0, 80)
      : threadId;
  return {
    audit,
    readThread: {
      schemaVersion: WORKFLOW_READ_THREAD_SCHEMA_VERSION,
      thread: {
        id: threadId,
        title,
        preview: title,
        cwd: string(meta.cwd),
        status: {
          type: chronological.some((turn) => turn.status === "running")
            ? "active"
            : "idle",
        },
        createdAt: first?.startedAt,
        updatedAt: latest?.completedAt ?? latest?.startedAt,
      },
      page: {
        order: "newest_first",
        limit: chronological.length,
        nextCursor: null,
        hasMore: false,
      },
      turns: chronological.reverse(),
    },
  };
}

function splitUserSegments(
  turn: WorkflowTurn,
  evidence: JsonlItemEvidence[],
): WorkflowTurn[] {
  const groups: WorkflowTurnItem[][] = [[]];
  for (const item of turn.items) {
    if (
      item.type === "userMessage" &&
      groups.at(-1)!.some((previous) => previous.type === "userMessage")
    )
      groups.push([]);
    groups.at(-1)!.push(item);
  }
  return groups.map((items, index) => {
    const user = items.find((item) => item.type === "userMessage");
    return {
      ...turn,
      id: index ? turn.id + ":steer:" + user!.id : turn.id,
      items,
      continuationFragment: index < groups.length - 1 || undefined,
      continuesPreviousTurn: index > 0 || undefined,
      startedAt: index
        ? (evidence.find(
            (entry) => entry.turnId === turn.id && entry.itemId === user?.id,
          )?.startedAt ?? turn.startedAt)
        : turn.startedAt,
    };
  });
}
