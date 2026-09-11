import { describe, expect, it } from "vitest";
import { translateRuntimeEventToUIEvent } from "../../../client/shared/runtime-event-adapter";
import type { RuntimeEvent } from "../../../client/shared/agent-runtime";

describe("runtime event adapter", () => {
  it("keeps parented text inside the subagent execution event", () => {
    const event = translateRuntimeEventToUIEvent(
      {
        kind: "text-chunk",
        payload: {
          turnId: "turn-1",
          content: "child output",
          parentToolId: "tool-1",
        },
      },
      "session-1",
      "turn-1",
      { countTextChunks: false },
    );

    expect(event).toMatchObject({
      type: "execution.subagent.event",
      parentToolId: "tool-1",
      subagentId: "tool-1",
      event: {
        type: "text.chunk",
        content: "child output",
        parentToolId: "tool-1",
      },
    });
  });

  it("translates plan and mode runtime events", () => {
    expect(
      translateRuntimeEventToUIEvent(
        {
          kind: "mode-update",
          payload: { turnId: "turn-1", modeId: "plan", label: "Plan" },
        },
        "session-1",
        "turn-1",
      ),
    ).toMatchObject({ type: "mode.update", modeId: "plan", label: "Plan" });

    expect(
      translateRuntimeEventToUIEvent(
        {
          kind: "plan-item",
          payload: {
            turnId: "turn-1",
            itemId: "plan-1",
            content: "1. Explore",
          },
        },
        "session-1",
        "turn-1",
      ),
    ).toMatchObject({
      type: "plan.item",
      itemId: "plan-1",
      content: "1. Explore",
    });
  });

  it("translates task and subagent lifecycle runtime events", () => {
    const task: RuntimeEvent = {
      kind: "execution-task-update",
      payload: {
        turnId: "turn-1",
        taskId: "task-1",
        title: "Explore",
        status: "running",
        timestamp: 1,
      },
    };
    expect(
      translateRuntimeEventToUIEvent(task, "session-1", "turn-1"),
    ).toMatchObject({
      type: "execution.task.update",
      taskId: "task-1",
      status: "running",
    });

    const subagent: RuntimeEvent = {
      kind: "execution-subagent-start",
      payload: {
        turnId: "turn-1",
        parentToolId: "tool-1",
        subagentId: "tool-1",
        description: "Explore",
        status: "running",
        timestamp: 2,
      },
    };
    expect(
      translateRuntimeEventToUIEvent(subagent, "session-1", "turn-1"),
    ).toMatchObject({
      type: "execution.subagent.start",
      subagentId: "tool-1",
      status: "running",
    });
  });
});
