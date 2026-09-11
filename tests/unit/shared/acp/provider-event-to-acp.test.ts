import { describe, expect, it } from "vitest";
import {
  createUIEventToACPAdapter,
  createUIEventToACPState,
  providerEventToACPEvents,
  planEntriesFromText,
} from "../../../../client/shared/acp/provider-event-to-acp";
import { MARLOUES_ACP_META_KEYS } from "../../../../client/shared/acp/acp-extensions";
import type { UIEvent } from "../../../../client/shared/ui-protocol";

const SESSION_ID = "session-1";
const TURN_ID = "turn-1";

function withIds<T extends object>(
  event: T,
): T & {
  sessionId: string;
  turnId: string;
} {
  return { ...event, sessionId: SESSION_ID, turnId: TURN_ID };
}

describe("UIEvent 到 ACP canonical 事件", () => {
  it("把文本和思考流映射为 content chunk", () => {
    const adapter = createUIEventToACPAdapter({ source: "codex" });
    const text = adapter.translate(
      withIds({
        type: "text.chunk",
        content: "Hello",
        index: 1,
      }) as UIEvent,
    );
    const thinking = adapter.translate(
      withIds({ type: "thinking.chunk", content: "Thinking" }) as UIEvent,
    );

    expect(text).toHaveLength(1);
    expect(text[0]).toMatchObject({
      type: "session/update",
      source: "codex",
      nativeType: "text.chunk",
    });
    expect(
      text[0].type === "session/update" && text[0].notification.update,
    ).toMatchObject({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello" },
      messageId: `agent-${TURN_ID}`,
    });
    expect(
      thinking[0].type === "session/update" && thinking[0].notification.update,
    ).toMatchObject({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Thinking" },
      messageId: `reasoning-${TURN_ID}`,
    });
  });

  it("在私有 metadata 中保留用户 rich input", () => {
    const userContent = [
      { type: "text", text: "继续执行" },
      { type: "skill", name: "project-e2e", displayName: "Project E2E" },
    ] as const;
    const adapter = createUIEventToACPAdapter({ source: "codex" });
    const [event] = adapter.translate({
      type: "user.message",
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      messageId: "user-1",
      content: "继续执行",
      userContent,
      timestamp: 1,
    });

    expect(
      event.type === "session/update" && event.notification.update,
    ).toMatchObject({
      sessionUpdate: "user_message_chunk",
      content: { type: "text", text: "继续执行" },
      messageId: "user-1",
    });
    expect(
      event.type === "session/update" &&
        event.notification.update._meta?.[MARLOUES_ACP_META_KEYS.userContent],
    ).toEqual(userContent);
  });

  it("把工具生命周期映射为 tool_call 和 tool_call_update", () => {
    const adapter = createUIEventToACPAdapter({ source: "claude" });
    const start = adapter.translate(
      withIds({
        type: "tool.start",
        toolId: "tool-1",
        toolName: "Read",
        input: { path: "/tmp/a.ts" },
      }) as UIEvent,
    );
    const complete = adapter.translate(
      withIds({
        type: "tool.complete",
        toolId: "tool-1",
        output: "ok",
        isError: false,
      }) as UIEvent,
    );

    expect(
      start[0].type === "session/update" && start[0].notification.update,
    ).toMatchObject({
      sessionUpdate: "tool_call",
      toolCallId: "tool-1",
      title: "Read",
      kind: "read",
      status: "in_progress",
      rawInput: { path: "/tmp/a.ts" },
    });
    expect(
      complete[0].type === "session/update" && complete[0].notification.update,
    ).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "tool-1",
      status: "completed",
      rawOutput: "ok",
    });
  });

  it("累积 plan delta 并输出完整 ACP plan", () => {
    const adapter = createUIEventToACPAdapter({ source: "codex" });
    adapter.translate(
      withIds({
        type: "plan.delta",
        itemId: "plan-1",
        content: "1. [ ] 调研\n",
      }) as UIEvent,
    );
    const events = adapter.translate(
      withIds({
        type: "plan.delta",
        itemId: "plan-1",
        content: "1. [ ] 调研\n2. [~] 实施",
      }) as UIEvent,
    );

    expect(events).toHaveLength(1);
    expect(
      events[0].type === "session/update" && events[0].notification.update,
    ).toMatchObject({
      sessionUpdate: "plan",
      entries: [
        { content: "调研", status: "pending", priority: "medium" },
        { content: "实施", status: "in_progress", priority: "medium" },
      ],
    });
    expect(planEntriesFromText("1. [x] 完成")).toEqual([
      {
        content: "完成",
        status: "completed",
        priority: "medium",
        _meta: { "com.marloues.plan.blockType": "list" },
      },
    ]);
  });

  it("按 turn 隔离同名 plan item 的累积状态", () => {
    const adapter = createUIEventToACPAdapter({ source: "codex" });
    adapter.translate({
      type: "plan.delta",
      sessionId: SESSION_ID,
      turnId: "turn-1",
      itemId: "plan-1",
      content: "1. [ ] 第一轮",
    } as UIEvent);
    const [event] = adapter.translate({
      type: "plan.delta",
      sessionId: SESSION_ID,
      turnId: "turn-2",
      itemId: "plan-1",
      content: "1. [ ] 第二轮",
    } as UIEvent);

    expect(
      event.type === "session/update" && event.notification.update,
    ).toMatchObject({
      sessionUpdate: "plan",
      entries: [{ content: "第二轮", status: "pending" }],
    });
  });

  it("按 turn 隔离 tool 状态和 usage 状态", () => {
    const adapter = createUIEventToACPAdapter({ source: "claude" });
    adapter.translate({
      type: "tool.start",
      sessionId: SESSION_ID,
      turnId: "turn-1",
      toolId: "tool-1",
      toolName: "Read",
      input: { path: "/tmp/a.ts" },
    } as UIEvent);
    adapter.translate({
      type: "usage",
      sessionId: SESSION_ID,
      turnId: "turn-1",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    } as UIEvent);
    const [firstTurn] = adapter.translate({
      type: "turn.complete",
      sessionId: SESSION_ID,
      turnId: "turn-1",
      result: "success",
      final: true,
      timestamp: 1,
    } as UIEvent);

    const [nextTool] = adapter.translate({
      type: "tool.start",
      sessionId: SESSION_ID,
      turnId: "turn-2",
      toolId: "tool-1",
      toolName: "Read",
      input: { path: "/tmp/b.ts" },
    } as UIEvent);
    const [secondTurn] = adapter.translate({
      type: "turn.complete",
      sessionId: SESSION_ID,
      turnId: "turn-2",
      result: "success",
      final: true,
      timestamp: 2,
    } as UIEvent);

    expect(
      firstTurn.type === "prompt/response" && firstTurn.response.usage,
    ).toMatchObject({ totalTokens: 3 });
    expect(
      nextTool.type === "session/update" && nextTool.notification.update,
    ).toMatchObject({
      sessionUpdate: "tool_call",
      toolCallId: "tool-1",
      status: "in_progress",
      rawInput: { path: "/tmp/b.ts" },
    });
    expect(
      secondTurn.type === "prompt/response" && secondTurn.response.usage,
    ).toBeUndefined();
  });

  it("把审批映射为 ACP permission request", () => {
    const adapter = createUIEventToACPAdapter({ source: "local" });
    const [event] = adapter.translate({
      type: "approval.request",
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      requestId: "request-1",
      toolName: "bash",
      reason: "需要执行命令",
      timeout: 30_000,
      allowSession: true,
    });

    expect(event).toMatchObject({
      type: "permission/request",
      requestId: "request-1",
      sessionId: SESSION_ID,
    });
    expect(event.type === "permission/request" && event.request).toMatchObject({
      sessionId: SESSION_ID,
      toolCall: {
        toolCallId: "request-1",
        kind: "execute",
        status: "in_progress",
      },
      options: [
        { optionId: "allow_once", kind: "allow_once" },
        { optionId: "reject_once", kind: "reject_once" },
        { optionId: "allow_always", kind: "allow_always" },
      ],
    });
  });

  it("把子 agent、任务和 compaction 放入 com.marloues 扩展", () => {
    const adapter = createUIEventToACPAdapter({ source: "claude" });
    const [subagent] = adapter.translate(
      withIds({
        type: "execution.subagent.start",
        parentToolId: "tool-1",
        subagentId: "sub-1",
        status: "running",
        timestamp: 1,
      }) as UIEvent,
    );
    const [task] = adapter.translate(
      withIds({
        type: "execution.task.update",
        taskId: "task-1",
        title: "调研",
        status: "running",
        timestamp: 2,
      }) as UIEvent,
    );
    const [compaction] = adapter.translate(
      withIds({
        type: "context.compaction",
        phase: "started",
        reason: "mid_turn",
      }) as UIEvent,
    );

    expect(subagent).toMatchObject({
      type: "extension",
      namespace: "com.marloues",
      name: "execution.subagent.start",
    });
    expect(task).toMatchObject({
      type: "extension",
      name: "execution.task.update",
    });
    expect(compaction).toMatchObject({
      type: "extension",
      name: "context.compaction",
    });
  });

  it("父工具内的输出不走顶层 agent 内容，而是保留子 agent 扩展", () => {
    const adapter = createUIEventToACPAdapter({ source: "claude" });
    const [event] = adapter.translate(
      withIds({
        type: "text.chunk",
        content: "subagent output",
        index: 1,
        parentToolId: "tool-1",
      }) as UIEvent,
    );

    expect(event).toMatchObject({
      type: "extension",
      namespace: "com.marloues",
      name: "execution.subagent.event",
      nativeType: "text.chunk",
    });
  });

  it("未覆盖事件保留 unknown raw fallback", () => {
    const adapter = createUIEventToACPAdapter({ source: "openai" });
    const original = withIds({
      type: "prompt.suggestion",
      suggestion: "next",
    }) as UIEvent;
    const [event] = adapter.translate(original);

    expect(event).toMatchObject({
      type: "unknown",
      source: "openai",
      nativeType: "prompt.suggestion",
      raw: original,
    });
    expect(
      event.type === "unknown" &&
        event.sessionId === SESSION_ID &&
        event.turnId === TURN_ID,
    ).toBe(true);
  });

  it("metadata 使用反向 DNS 命名空间", () => {
    const adapter = createUIEventToACPAdapter({ source: "codex" });
    const [event] = adapter.translate({
      type: "session.titleUpdated",
      sessionId: SESSION_ID,
      title: "New title",
    } as UIEvent);

    expect(event.type === "session/update").toBe(true);
    expect(
      event.type === "session/update" &&
        event.notification._meta?.[MARLOUES_ACP_META_KEYS.source],
    ).toBe("codex");
    expect(
      event.type === "session/update" &&
        event.notification._meta?.[MARLOUES_ACP_META_KEYS.nativeType],
    ).toBe("session.titleUpdated");
  });

  it("转换是纯函数且不隐藏会话状态", () => {
    const initial = createUIEventToACPState();
    const event = withIds({
      type: "plan.delta",
      itemId: "plan-1",
      content: "1. [ ] 调研",
    }) as UIEvent;

    const first = providerEventToACPEvents(event, { source: "codex" }, initial);
    const second = providerEventToACPEvents(
      event,
      { source: "codex" },
      initial,
    );

    expect(first).toEqual(second);
    expect(initial).toEqual(createUIEventToACPState());
    expect(first.state).not.toBe(initial);
    expect(first.state.planText).not.toBe(initial.planText);

    const nextEvent = withIds({
      type: "plan.delta",
      itemId: "plan-1",
      content: "\n2. [x] 实施",
    }) as UIEvent;
    const withoutState = providerEventToACPEvents(
      nextEvent,
      { source: "codex" },
      initial,
    );
    const withState = providerEventToACPEvents(
      nextEvent,
      { source: "codex" },
      first.state,
    );

    expect(
      withoutState.events[0].type === "session/update" &&
        withoutState.events[0].notification.update,
    ).toMatchObject({
      entries: [{ content: "实施", status: "completed" }],
    });
    expect(
      withState.events[0].type === "session/update" &&
        withState.events[0].notification.update,
    ).toMatchObject({
      entries: [
        { content: "调研", status: "pending" },
        { content: "实施", status: "completed" },
      ],
    });
  });
});
