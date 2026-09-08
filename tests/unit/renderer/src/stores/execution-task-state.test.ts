import { describe, expect, it } from "vitest";
import type { UIEvent } from "@shared/ui-protocol";
import {
  upsertExecutionTask,
  restoreExecutionStateFromReadThread,
} from "../../../../../client/renderer/src/stores/workflow-message-builders";
import type {
  WorkflowReadThreadResponse,
  WorkflowTurnItem,
} from "@shared/workflow-read-thread-contract";

type TaskUpdate = Extract<UIEvent, { type: "execution.task.update" }>;

function taskUpdate(overrides: Partial<TaskUpdate> = {}): TaskUpdate {
  return {
    type: "execution.task.update",
    sessionId: "session-1",
    turnId: "turn-1",
    taskId: "task-1",
    title: "Analyze the project",
    detail: "Read the core source and summarize the architecture.",
    status: "creating",
    timestamp: 1,
    ...overrides,
  };
}

describe("upsertExecutionTask", () => {
  it("keeps creation-time copy while runtime events only change status", () => {
    const created = upsertExecutionTask({}, taskUpdate());
    const running = upsertExecutionTask(
      created,
      taskUpdate({
        title: "Reading docs\\implementation\\README.md",
        detail: "Last tool: Read",
        status: "running",
        timestamp: 2,
      }),
    );
    const completed = upsertExecutionTask(
      running,
      taskUpdate({
        title: "Task completed",
        detail: "output.txt",
        status: "completed",
        timestamp: 3,
      }),
    );

    expect(completed["session-1"]?.tasks["task-1"]).toMatchObject({
      title: "Analyze the project",
      detail: "Read the core source and summarize the architecture.",
      status: "completed",
      createdAt: 1,
      updatedAt: 3,
    });
  });
});

describe("SDK task history recovery", () => {
  const tool = (
    id: string,
    name: string,
    args: Record<string, unknown>,
    output = "",
    status = "completed",
  ): WorkflowTurnItem => ({
    type: "mcpToolCall",
    id,
    tool: name,
    arguments: args,
    status,
    output: { text: output, truncated: false },
  });
  const create = tool(
    "create",
    "TaskCreate",
    { subject: "检查样式", description: "核对共享 token" },
    "Task #1 created successfully: 检查样式",
  );
  const snapshot = (items: WorkflowTurnItem[]): WorkflowReadThreadResponse => ({
    schemaVersion: 2,
    thread: {
      id: "session-1",
      title: "体验",
      preview: "",
      status: { type: "active" },
    },
    page: {
      order: "newest_first",
      limit: 100,
      nextCursor: null,
      hasMore: false,
    },
    turns: [
      {
        id: "turn-1",
        zone: "workspace",
        status: "running",
        startedAt: 100,
        error: null,
        items,
      },
    ],
  });
  it("restores live and completed tasks from persisted SDK records without execution events", () => {
    const running = snapshot([
      create,
      tool("run", "TaskUpdate", { taskId: "1", status: "in_progress" }),
    ]);
    const state = restoreExecutionStateFromReadThread({}, running);
    expect(state["session-1"]?.tasks["sdk-task:1"]).toMatchObject({
      title: "检查样式",
      detail: "核对共享 token",
      status: "running",
      turnId: "turn-1",
    });
    const done = snapshot([
      ...running.turns[0].items,
      tool("done", "TaskUpdate", { taskId: "1", status: "completed" }),
    ]);
    const restored = restoreExecutionStateFromReadThread(state, done);
    expect(Object.values(restored["session-1"]!.tasks)).toHaveLength(1);
    expect(restored["session-1"]?.tasks["sdk-task:1"].status).toBe("completed");
    expect(restoreExecutionStateFromReadThread({}, done)).toEqual(restored);
  });
  it("ignores failed and partial task operations", () => {
    const state = restoreExecutionStateFromReadThread(
      {},
      snapshot([
        create,
        tool(
          "failed",
          "TaskUpdate",
          { taskId: "1", status: "completed" },
          "",
          "failed",
        ),
        tool("partial", "TaskCreate", { raw: '{"subject":' }, "", "running"),
      ]),
    );
    expect(Object.values(state["session-1"]!.tasks)).toHaveLength(1);
    expect(state["session-1"]?.tasks["sdk-task:1"].status).toBe("creating");
  });
  it("uses structured execution events without duplicating recovered SDK tasks", () => {
    const history = snapshot([create]);
    const previous = restoreExecutionStateFromReadThread({}, history);
    history.execution = {
      events: [{ timestamp: 2, event: taskUpdate({ status: "running" }) }],
    };
    const state = restoreExecutionStateFromReadThread(previous, history);
    expect(Object.keys(state["session-1"]!.tasks)).toEqual(["task-1"]);
    expect(state["session-1"]?.tasks["task-1"].status).toBe("running");
  });
});
