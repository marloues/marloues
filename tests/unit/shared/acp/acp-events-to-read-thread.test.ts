import { describe, expect, it } from "vitest";
import { projectACPEventsToReadThread } from "../../../../client/shared/acp/acp-events-to-read-thread";
import { createUIEventToACPAdapter } from "../../../../client/shared/acp/provider-event-to-acp";
import { workflowTurnItemToACPEvents } from "../../../../client/shared/acp/workflow-turn-item-to-acp";
import type { ACPWorkflowEvent } from "../../../../client/shared/acp/acp-types";
import type {
  WorkflowCommandExecutionItem,
  WorkflowReadThreadResponse,
  WorkflowThreadExecutionEvent,
  WorkflowTurn,
  WorkflowTurnItem,
} from "../../../../client/shared/workflow-read-thread-contract";
import type { UIEvent } from "../../../../client/shared/ui-protocol";

const SESSION_ID = "session-1";
const TURN_ID = "turn-1";

function acpEvents(events: UIEvent[]): ACPWorkflowEvent[] {
  const adapter = createUIEventToACPAdapter({ source: "codex" });
  return events.flatMap((event) => adapter.translate(event));
}

function executionEvents(events: ACPWorkflowEvent[]) {
  return events.map((event, index) => ({
    timestamp: index + 1,
    event,
  }));
}

function makeSnapshot(
  items: WorkflowTurnItem[],
  events: WorkflowThreadExecutionEvent[],
  truncated?: boolean,
): WorkflowReadThreadResponse {
  const turn: WorkflowTurn = {
    id: TURN_ID,
    zone: "workspace",
    status: "completed",
    error: null,
    items,
  };
  return {
    schemaVersion: 2,
    thread: {
      id: SESSION_ID,
      title: "Thread",
      preview: "done",
      status: { type: "idle" },
      cwd: null,
      createdAt: 1,
      updatedAt: 2,
    },
    page: {
      order: "newest_first",
      limit: 100,
      nextCursor: null,
      hasMore: false,
    },
    execution: { events, truncated },
    turns: [turn],
  };
}

describe("ACP read-thread projection", () => {
  it("projects content, reasoning, tools, plan, mode, permission, and compaction", () => {
    const events = acpEvents([
      {
        type: "user.message",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        messageId: "user-1",
        content: "请实现",
        timestamp: 1,
      },
      {
        type: "thinking.chunk",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        content: "先读上下文",
      },
      {
        type: "text.chunk",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        content: "已完成",
        index: 1,
      },
      {
        type: "mode.update",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        modeId: "plan",
        label: "Plan",
      },
      {
        type: "plan.item",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        itemId: "plan-1",
        content: "- [x] 调研\n- [ ] 实施",
      },
      {
        type: "tool.start",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        toolId: "tool-1",
        toolName: "Read",
        input: { path: "/tmp/a.ts" },
      },
      {
        type: "tool.complete",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        toolId: "tool-1",
        output: "ok",
        isError: false,
      },
      {
        type: "approval.request",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        requestId: "request-1",
        toolName: "bash",
        reason: "执行命令",
        timeout: 30_000,
        allowSession: false,
      },
      {
        type: "context.compaction",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        phase: "completed",
        reason: "turn_end",
      },
      {
        type: "turn.complete",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        result: "success",
        timestamp: 10,
      },
    ]);
    const fallback: WorkflowTurnItem = {
      type: "unknown",
      id: "fallback",
      raw: "fallback",
    };

    const projected = projectACPEventsToReadThread(
      makeSnapshot([fallback], executionEvents(events)),
    );
    const items = projected.turns[0].items;

    expect(items.map((item) => item.type)).toEqual([
      "userMessage",
      "reasoning",
      "agentMessage",
      "modeUpdate",
      "plan",
      "dynamicToolCall",
      "permissionRequest",
      "contextCompaction",
    ]);
    expect(items[4]).toMatchObject({
      type: "plan",
      text: "- [x] 调研\n- [ ] 实施",
      settled: true,
    });
    expect(items[5]).toMatchObject({
      type: "dynamicToolCall",
      tool: "Read",
      status: "completed",
      settled: true,
    });
    expect(items[6]).toMatchObject({
      type: "permissionRequest",
      toolName: "bash",
      reason: "执行命令",
      settled: true,
    });
  });

  it("projects plan-mode transitions as mode and plan items, not tool rows", () => {
    const events = acpEvents([
      {
        type: "tool.start",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        toolId: "plan-enter",
        toolName: "EnterPlanMode",
        input: {},
      },
      {
        type: "mode.update",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        modeId: "plan",
        label: "Plan",
      },
      {
        type: "plan.item",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        itemId: "plan-1",
        content: "- [ ] 调研",
      },
      {
        type: "tool.complete",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        toolId: "plan-enter",
        output: "entered",
        isError: false,
      },
    ]);
    const fallback: WorkflowTurnItem = {
      type: "unknown",
      id: "fallback",
      raw: "fallback",
    };

    const projected = projectACPEventsToReadThread(
      makeSnapshot([fallback], executionEvents(events)),
    );
    const items = projected.turns[0].items;

    expect(items.map((item) => item.type)).toEqual(["modeUpdate", "plan"]);
    expect(items[0]).toMatchObject({
      type: "modeUpdate",
      modeId: "plan",
      modeKind: "plan",
      label: "Plan",
      settled: true,
    });
    expect(items[1]).toMatchObject({
      type: "plan",
      text: "- [ ] 调研",
      settled: true,
    });
  });

  it("keeps host item snapshots when the event log is bounded", () => {
    const fallback: WorkflowTurnItem = {
      type: "unknown",
      id: "fallback",
      raw: "fallback",
    };
    const events = acpEvents([
      {
        type: "text.chunk",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        content: "partial",
        index: 1,
      },
    ]);

    const projected = projectACPEventsToReadThread(
      makeSnapshot([fallback], executionEvents(events), true),
    );

    expect(projected.turns[0].items).toEqual([fallback]);
  });

  it("round-trips specialized item-updated snapshots without degrading to generic tools", () => {
    const command: WorkflowCommandExecutionItem = {
      type: "commandExecution",
      id: "command-1",
      command: "npm test",
      status: "completed",
      exitCode: 0,
      output: { text: "passed", truncated: false },
      settled: true,
    };
    const events = workflowTurnItemToACPEvents(command, {
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      source: "local",
    });

    const projected = projectACPEventsToReadThread(
      makeSnapshot(
        [{ type: "unknown", id: "fallback", raw: "fallback" }],
        executionEvents(events),
      ),
    );

    expect(projected.turns[0].items).toEqual([command]);
  });
});
