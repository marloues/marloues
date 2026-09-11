import type { ConversationTiming } from "@shared/conversation-timing";
import {
  WORKFLOW_THREAD_EXECUTION_SNAPSHOT_LIMIT,
  WORKFLOW_READ_THREAD_SCHEMA_VERSION,
  type WorkflowReadThreadResponse,
  type WorkflowThreadInfo,
  type WorkflowThreadExecutionSnapshot,
  type WorkflowThreadExecutionEvent,
  type WorkflowTurn,
  type WorkflowTurnError,
  type WorkflowTurnItem,
  type WorkflowTurnStatus,
} from "../../../shared/workflow-read-thread-contract";
import type { WorkflowReadThreadInput } from "../../../shared/workflow-thread-data-source";
import type { TokenUsage } from "../../../shared/types";
import {
  MARLOUES_ACP_EXTENSION_NAMES,
  MARLOUES_ACP_EXTENSION_NAMESPACE,
} from "../../../shared/acp/acp-extensions";

export interface WorkflowThreadStoreItem {
  item: WorkflowTurnItem;
}

export interface WorkflowThreadStoreTurn {
  timing?: ConversationTiming;
  id: string;
  status: WorkflowTurnStatus;
  error: WorkflowTurnError | null;
  startedAt?: number | string | null;
  completedAt?: number | string | null;
  durationMs?: number | null;
  modelId?: string | null;
  modelName?: string | null;
  usage?: TokenUsage;
  /** This slice has later output in the same visual turn. */
  continuationFragment?: boolean;
  /** This slice continues the visual turn started by a previous slice. */
  continuesPreviousTurn?: boolean;
  /** Set on an applied-steer segment until the follow-up SDK turn starts. */
  appliedInterruptPending?: boolean;
  itemOrder: string[];
  items: Map<string, WorkflowThreadStoreItem>;
}

export interface WorkflowThreadStoreThread {
  id: string;
  title: string;
  preview: string;
  status: WorkflowThreadInfo["status"];
  cwd?: string | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  turnOrder: string[];
  turns: Map<string, WorkflowThreadStoreTurn>;
  /** Runtime turn id -> currently rendered conversation segment id. */
  displayTurnIds: Map<string, string>;
  /** Bounded canonical ACP event log used to restore execution state. */
  executionEvents?: WorkflowThreadExecutionEvent[];
}

export const WORKFLOW_THREAD_EXECUTION_EVENT_LIMIT = 500;

function isExecutionStateEvent(event: WorkflowThreadExecutionEvent["event"]): boolean {
  return (
    event.type === "extension" &&
    event.namespace === MARLOUES_ACP_EXTENSION_NAMESPACE &&
    (event.name === MARLOUES_ACP_EXTENSION_NAMES.taskUpdate ||
      event.name === MARLOUES_ACP_EXTENSION_NAMES.subagentStart ||
      event.name === MARLOUES_ACP_EXTENSION_NAMES.subagentEvent ||
      event.name === MARLOUES_ACP_EXTENSION_NAMES.subagentComplete)
  );
}

export function compactExecutionEvents(
  events: readonly WorkflowThreadExecutionEvent[],
  limit: number,
): WorkflowThreadExecutionEvent[] {
  if (events.length <= limit) return [...events];

  const rankedEvents = events.map((entry, index) => ({ entry, index }));
  const stateEvents = rankedEvents.filter(({ entry }) =>
    isExecutionStateEvent(entry.event),
  );
  const regularEvents = rankedEvents.filter(
    ({ entry }) => !isExecutionStateEvent(entry.event),
  );
  const keptStateEvents =
    stateEvents.length > limit ? stateEvents.slice(-limit) : stateEvents;
  const keptRegularEvents = regularEvents.slice(
    -Math.max(0, limit - keptStateEvents.length),
  );

  return [...keptStateEvents, ...keptRegularEvents]
    .sort((left, right) => left.index - right.index)
    .map(({ entry }) => entry);
}

export function serializeWorkflowThread(
  thread: WorkflowThreadStoreThread,
  input: WorkflowReadThreadInput = {},
): WorkflowReadThreadResponse {
  const limit = Math.max(1, input.limit ?? 100);
  const offset = parseCursor(input.cursor);
  const newestFirstTurns = [...thread.turnOrder]
    .reverse()
    .map((turnId) => thread.turns.get(turnId))
    .filter((turn): turn is WorkflowThreadStoreTurn => Boolean(turn));
  const pageTurns = newestFirstTurns.slice(offset, offset + limit);
  const nextOffset = offset + pageTurns.length;

  return {
    schemaVersion: WORKFLOW_READ_THREAD_SCHEMA_VERSION,
    thread: {
      id: thread.id,
      title: thread.title,
      preview: thread.preview,
      status: thread.status,
      cwd: thread.cwd ?? null,
      createdAt: thread.createdAt ?? null,
      updatedAt: thread.updatedAt ?? null,
    },
    page: {
      order: "newest_first",
      limit,
      nextCursor:
        nextOffset < newestFirstTurns.length ? String(nextOffset) : null,
      hasMore: nextOffset < newestFirstTurns.length,
    },
    execution: serializeExecutionEvents(thread.executionEvents ?? []),
    turns: pageTurns.map(serializeTurn),
  };
}

function serializeTurn(turn: WorkflowThreadStoreTurn): WorkflowTurn {
  return {
    id: turn.id,
    zone: "workspace",
    status: turn.status,
    error: turn.error,
    startedAt: turn.startedAt ?? null,
    completedAt: turn.completedAt ?? null,
    durationMs: turn.durationMs ?? null,
    timing: turn.timing,
    modelId: turn.modelId ?? null,
    modelName: turn.modelName ?? null,
    usage: turn.usage,
    continuationFragment: turn.continuationFragment,
    continuesPreviousTurn: turn.continuesPreviousTurn,
    items: turn.itemOrder
      .map((itemId) => turn.items.get(itemId)?.item)
      .filter((item): item is WorkflowTurnItem => Boolean(item)),
  };
}

function serializeExecutionEvents(
  events: readonly WorkflowThreadExecutionEvent[],
): Pick<WorkflowThreadExecutionSnapshot, "events" | "truncated"> {
  const compacted = compactExecutionEvents(
    events,
    WORKFLOW_THREAD_EXECUTION_SNAPSHOT_LIMIT,
  );
  return {
    events: compacted,
    truncated: compacted.length < events.length,
  };
}

function parseCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
