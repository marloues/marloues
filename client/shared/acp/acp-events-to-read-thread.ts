import type {
  WorkflowReadThreadResponse,
} from "../workflow-read-thread-contract";
import { WORKFLOW_THREAD_EXECUTION_SNAPSHOT_LIMIT } from "../workflow-read-thread-contract";
import { createACPWorkflowItemAdapter } from "./acp-event-to-workflow-item";
import type { ACPWorkflowEvent } from "./acp-types";

const FALLBACK_EVENT_LIMIT = WORKFLOW_THREAD_EXECUTION_SNAPSHOT_LIMIT;

/**
 * Project canonical ACP events onto the read-thread turn model.
 *
 * A bounded event log must not replace the host's turn-item snapshots: the
 * first event available for a turn may be in the middle of that turn. The
 * serializer therefore marks truncation explicitly, while older snapshots are
 * treated conservatively when they reach the snapshot limit.
 */
export function projectACPEventsToReadThread(
  snapshot: WorkflowReadThreadResponse,
): WorkflowReadThreadResponse {
  const execution = snapshot.execution;
  const events = execution?.events ?? [];
  if (!events.length) return snapshot;
  if (execution?.truncated === true) return snapshot;
  if (
    execution?.truncated === undefined &&
    events.length >= FALLBACK_EVENT_LIMIT
  ) {
    return snapshot;
  }

  const adapters = new Map<
    string,
    ReturnType<typeof createACPWorkflowItemAdapter>
  >();
  for (const entry of events) {
    const event = entry.event;
    const turnId = eventTurnId(event);
    if (!turnId) continue;
    let adapter = adapters.get(turnId);
    if (!adapter) {
      adapter = createACPWorkflowItemAdapter();
      adapters.set(turnId, adapter);
    }
    adapter.ingest(event);
  }

  return {
    ...snapshot,
    turns: snapshot.turns.map((turn) => {
      const adapter = adapters.get(turn.id);
      if (!adapter) return turn;
      if (turn.status !== "running") adapter.finalizeStreamingItems();
      const items = adapter.items();
      return items.length ? { ...turn, items } : turn;
    }),
  };
}

function eventTurnId(event: ACPWorkflowEvent): string | undefined {
  if (event.turnId) return event.turnId;
  if (!("rawEvent" in event) || !event.rawEvent) return undefined;
  const rawEvent = event.rawEvent as { turnId?: unknown };
  return typeof rawEvent.turnId === "string" ? rawEvent.turnId : undefined;
}
