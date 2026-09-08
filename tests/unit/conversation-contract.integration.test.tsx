import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeCodexItem } from "../../client/main/codex/normalize";
import { createBinaryEventAdapter } from "../../client/main/core/runtime/binary-event-adapter";
import { workflowThreadStore } from "../../client/main/core/runtime/workflow-thread-store";
import { storedMessagesForRuntimeTurn } from "../../client/main/core/runtime/workflow-turn-persistence";
import { decodeWorkflowItemEvent } from "@shared/adapters/workflow-item-event";
import {
  workflowTurnToWorkflowMessage,
  type WorkflowMessageBlock,
} from "@shared/adapters/workflow-messages-to-read-thread";
import type { WorkflowTurnItem } from "@shared/workflow-read-thread-contract";
import { normalizeReadThreadMessageForPresentation } from "../../client/renderer/src/components/workflow-chat/turns/ReadThreadTurnList";
import { buildTurnPresentationModel } from "../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model";
import { WorkflowTurnView } from "../../client/renderer/src/components/workflow-chat/turns/TurnView";
import { compactItems } from "../../client/renderer/src/components/workflow-chat/adapter/workflow-message-adapter/streaming";

const threadId = "conversation-contract-live";
const replayId = "conversation-contract-replay";
afterEach(() => {
  workflowThreadStore.deleteThread(threadId);
  workflowThreadStore.deleteThread(replayId);
});

function turn(
  items: WorkflowTurnItem[],
  patch: Partial<WorkflowMessageBlock> = {},
): WorkflowMessageBlock {
  return {
    id: "turn",
    user: "检查项目",
    activity: "done",
    status: "completed",
    durationMs: 1000,
    items,
    ...patch,
  };
}
function render(
  message: WorkflowMessageBlock,
  expanded = false,
  streaming = false,
) {
  return renderToStaticMarkup(
    <WorkflowTurnView
      message={message}
      expanded={expanded}
      isLastStreaming={streaming}
      disableResponseTimer
      plainTextAnswers
      onToggle={() => undefined}
    />,
  );
}

describe("runtime snapshots → host contract → conversation presentation", () => {
  it("round-trips real tool failures, retries, and an applied steer through durable host segments", () => {
    workflowThreadStore.startTurn({
      threadId,
      turnId: "turn",
      content: "inspect",
      userMessageId: "user",
      startedAt: 1000,
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "tool-start",
      payload: {
        turnId: "turn",
        toolId: "failed-read",
        toolName: "Bash",
        input: { command: "find src 2>/dev/null" },
      },
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "tool-complete",
      payload: {
        turnId: "turn",
        toolId: "failed-read",
        output: "Command redirects output to an operating-system path.",
        isError: true,
      },
    });
    // Observed in a real SDK run: the completed assistant tool block arrives
    // after a fast error. Both live presentation and replay must keep the error.
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "tool-start",
      payload: {
        turnId: "turn",
        toolId: "failed-read",
        toolName: "Bash",
        input: { command: "find src 2>/dev/null" },
      },
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "tool-start",
      payload: {
        turnId: "turn",
        toolId: "retry",
        toolName: "Bash",
        input: { command: "rg --files src" },
      },
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "tool-complete",
      payload: {
        turnId: "turn",
        toolId: "retry",
        output: [{ type: "text", text: "src/app.ts\nsrc/store.ts" }],
        isError: false,
      },
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "steer-message",
      payload: {
        turnId: "turn",
        messageId: "steer-user",
        text: "also check recovery",
        content: [{ type: "text", text: "also check recovery" }],
        status: "applied",
        timestamp: 2000,
      },
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "turn-complete",
      payload: { turnId: "turn", result: "interrupted", final: false },
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "text-chunk",
      payload: { turnId: "turn", content: "Recovery checked." },
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "turn-complete",
      payload: { turnId: "turn", result: "success" },
    });
    workflowThreadStore.startTurn({
      threadId,
      turnId: "unrelated",
      content: "another task",
      userMessageId: "other-user",
      startedAt: 3000,
    });
    const snapshot = workflowThreadStore.readRuntimeTurnSegments(
      threadId,
      "turn",
    );
    expect(snapshot.turns).toHaveLength(2);
    const messages = storedMessagesForRuntimeTurn(snapshot, "turn");
    expect(
      messages
        .filter((message) => message.role === "user")
        .map((message) => message.content),
    ).toEqual(["inspect", "also check recovery"]);
    const storedTool = messages
      .flatMap((message) => message.items)
      .find((item) => item.id === "retry");
    expect(storedTool).toMatchObject({
      output: { text: "src/app.ts\nsrc/store.ts" },
    });
    workflowThreadStore.rehydrateFromStoredMessages(replayId, messages);
    const restored = workflowThreadStore.readThread({ threadId: replayId });
    const shape = (response: typeof snapshot) =>
      response.turns.map(
        ({
          id,
          status,
          items,
          continuationFragment,
          continuesPreviousTurn,
        }) => ({
          id,
          status,
          items,
          continuationFragment,
          continuesPreviousTurn,
        }),
      );
    expect(shape(restored)).toEqual(shape(snapshot));
    const predecessor = restored.turns.find(
      (turn) => turn.continuationFragment,
    )!;
    const model = buildTurnPresentationModel(
      workflowTurnToWorkflowMessage(predecessor),
      { isLastStreaming: false },
    );
    expect(model.process.canCollapse).toBe(true);
    expect(model.blocks.some((block) => block.kind === "process")).toBe(true);
  });

  it("lets a successful answer collapse a process containing a recovered command failure", () => {
    const message = turn([
      {
        id: "failed",
        type: "commandExecution",
        command: "read missing",
        status: "failed",
        settled: true,
      },
      {
        id: "retry",
        type: "commandExecution",
        command: "read actual",
        status: "completed",
        settled: true,
      },
      {
        id: "answer",
        type: "agentMessage",
        phase: "final_answer",
        text: "Checked successfully",
        settled: true,
      },
    ]);
    expect(
      buildTurnPresentationModel(message, { isLastStreaming: false }).process
        .canCollapse,
    ).toBe(true);
    expect(
      buildTurnPresentationModel(
        { ...message, status: "failed", activity: "failed" },
        { isLastStreaming: false },
      ).process.canCollapse,
    ).toBe(false);
  });
  it("displays a turn-level runtime failure even when only commentary preceded it", () => {
    workflowThreadStore.startTurn({
      threadId,
      turnId: "turn",
      content: "执行任务",
      userMessageId: "user",
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "item-updated",
      payload: {
        turnId: "turn",
        item: {
          id: "progress",
          type: "agentMessage",
          phase: "commentary",
          text: "正在执行",
          settled: true,
        },
      },
    });
    workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
      kind: "turn-complete",
      payload: {
        turnId: "turn",
        result: "error",
        error: "Runtime connection lost",
      },
    });
    const message = normalizeReadThreadMessageForPresentation(
      workflowTurnToWorkflowMessage(
        workflowThreadStore.readThread({ threadId }).turns[0],
      ),
    );
    expect(
      buildTurnPresentationModel(message, { isLastStreaming: false })
        .documentText,
    ).toBe("");
    const html = render(message);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Runtime connection lost");
    workflowThreadStore.rehydrateFromStoredMessages(replayId, [
      {
        id: "failed",
        role: "assistant",
        status: "failed",
        error: "Runtime connection lost",
        content: "正在执行",
        timestamp: 1000,
        items: message.items,
      },
    ]);
    const replay = workflowThreadStore.readThread({ threadId: replayId })
      .turns[0];
    expect(replay.error?.message).toBe("Runtime connection lost");
    expect(render(workflowTurnToWorkflowMessage(replay))).toContain(
      'role="alert"',
    );
  });
  it("keeps failed edits visible as process and preserves failed history status", () => {
    const message = turn(
      [
        {
          id: "edit",
          type: "fileChange",
          status: "failed",
          settled: true,
          changes: [{ path: "src/app.ts", kind: "update" }],
        },
        {
          id: "other",
          type: "commandExecution",
          command: "echo complete",
          status: "completed",
          settled: true,
        },
        {
          id: "answer",
          type: "agentMessage",
          text: "编辑失败",
          phase: "final_answer",
          settled: true,
        },
      ],
      { status: "failed", activity: "failed" },
    );
    expect(render(message)).toContain('data-tool="apply_patch"');
    workflowThreadStore.rehydrateFromStoredMessages(replayId, [
      {
        id: "failed-history",
        role: "assistant",
        status: "failed",
        content: "编辑失败",
        timestamp: 1000,
        items: message.items,
      },
    ]);
    expect(
      workflowThreadStore.readThread({ threadId: replayId }).turns[0].status,
    ).toBe("failed");
  });
  it("appends repeated literal deltas from runtimes without native item snapshots", () => {
    workflowThreadStore.startTurn({
      threadId,
      turnId: "turn",
      content: "hello",
      userMessageId: "user",
    });
    for (const content of ["哈", "哈", "哈"])
      workflowThreadStore.applyRuntimeEvent(threadId, "turn", {
        kind: "text-chunk",
        payload: { turnId: "turn", content },
      });
    const items = workflowThreadStore.readThread({ threadId }).turns[0].items;
    expect(items.find((item) => item.type === "agentMessage")).toMatchObject({
      text: "哈哈哈",
      settled: false,
    });
  });
  it("retains identity and message role across live updates, completion, IPC and replay", () => {
    const adapter = createBinaryEventAdapter("turn");
    workflowThreadStore.startTurn({
      threadId,
      turnId: "turn",
      content: "检查项目",
      userMessageId: "user",
      startedAt: 1000,
    });
    const publish = (
      raw: Record<string, unknown>,
      phase: "started" | "updated" | "completed",
    ) => {
      const item = normalizeCodexItem(raw, {}, phase)!;
      const events = adapter({ type: `item.${phase}`, item });
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("item-updated");
      for (const event of events)
        workflowThreadStore.applyRuntimeEvent(threadId, "turn", event);
    };
    publish(
      {
        id: "progress",
        type: "agentMessage",
        phase: "commentary",
        text: "检查完成",
      },
      "completed",
    );
    publish(
      {
        id: "command",
        type: "commandExecution",
        command: "npm test",
        status: "completed",
        aggregatedOutput: "passed",
      },
      "completed",
    );
    publish(
      { id: "answer", type: "agentMessage", phase: "final_answer", text: "" },
      "started",
    );
    publish({ id: "answer", type: "agentMessage", text: "检查" }, "updated");
    publish(
      { id: "answer", type: "agentMessage", text: "检查完成" },
      "updated",
    );
    publish(
      { id: "answer", type: "agentMessage", text: "检查完成" },
      "updated",
    );
    const live = workflowThreadStore.readThread({ threadId }).turns[0];
    expect(live.items.filter((item) => item.id === "answer")).toEqual([
      {
        id: "answer",
        type: "agentMessage",
        text: "检查完成",
        phase: "final_answer",
        settled: false,
      },
    ]);
    for (const event of adapter({ type: "turn.completed" }))
      workflowThreadStore.applyRuntimeEvent(threadId, "turn", event);
    const completed = workflowThreadStore.readThread({ threadId }).turns[0];
    const answer = completed.items.find((item) => item.id === "answer")!;
    expect(answer).toMatchObject({ phase: "final_answer", settled: true });
    const decoded = decodeWorkflowItemEvent({
      schemaVersion: 2,
      type: "item.updated",
      sessionId: threadId,
      turnId: "turn",
      item: answer,
      modelId: "runtime-model",
      usage: { inputTokens: 10, outputTokens: 4 },
    });
    expect(decoded.item).toBe(answer);
    expect(decoded.modelId).toBe("runtime-model");
    expect(decoded.usage?.outputTokens).toBe(4);
    const message = normalizeReadThreadMessageForPresentation(
      workflowTurnToWorkflowMessage(completed),
    );
    const model = buildTurnPresentationModel(message, {
      isLastStreaming: false,
    });
    expect(model.documentText).toBe("检查完成");
    expect(
      message.items
        .filter((item) => item.type === "agentMessage")
        .map((item) => item.id),
    ).toEqual(["progress", "answer"]);
    const html = render(message);
    expect(html).toContain('data-block-kind="document"');
    expect(html).not.toContain('data-kind="agent-flow-section"');
    expect(html.match(/data-kind="assistant-answer"/g)).toHaveLength(1);
    workflowThreadStore.rehydrateFromStoredMessages(replayId, [
      {
        id: "user",
        role: "user",
        content: "检查项目",
        timestamp: 1000,
        items: [],
      },
      {
        id: "assistant-turn",
        role: "assistant",
        content: model.documentText,
        timestamp: 1000,
        completedAt: 2000,
        items: completed.items.filter((item) => item.type !== "userMessage"),
      },
    ]);
    const replay = workflowThreadStore.readThread({ threadId: replayId })
      .turns[0];
    const replayModel = buildTurnPresentationModel(
      normalizeReadThreadMessageForPresentation(
        workflowTurnToWorkflowMessage(replay),
      ),
      { isLastStreaming: false },
    );
    expect(replayModel.documentText).toBe(model.documentText);
    expect(replay.items.filter((item) => item.type === "agentMessage")).toEqual(
      completed.items.filter((item) => item.type === "agentMessage"),
    );
  });

  it("keeps distinct equal/prefix messages and only replaces snapshots with the same id", () => {
    const commentary: WorkflowTurnItem = {
      id: "p",
      type: "agentMessage",
      phase: "commentary",
      text: "完成",
    };
    const final: WorkflowTurnItem = {
      id: "a",
      type: "agentMessage",
      phase: "final_answer",
      text: "完成测试",
    };
    expect(compactItems([commentary, final])).toEqual([commentary, final]);
    expect(compactItems([commentary, { ...final, text: "完成" }])).toHaveLength(
      2,
    );
    expect(
      compactItems([commentary, final, { ...final, text: "完成全部测试" }]),
    ).toEqual([commentary, { ...final, text: "完成全部测试" }]);
    expect(compactItems([commentary])[0]).toBe(commentary);
  });

  it("does not mistake a completed tool's preceding commentary for a final answer", () => {
    const message = turn([
      { id: "p", type: "agentMessage", text: "开始检查" },
      {
        id: "t",
        type: "commandExecution",
        command: "npm test",
        status: "completed",
        settled: true,
      },
    ]);
    const model = buildTurnPresentationModel(message, {
      isLastStreaming: false,
    });
    expect(model.documentText).toBe("");
    expect(model.process.canCollapse).toBe(false);
    expect(render(message)).toContain("开始检查");
    expect(render(message)).not.toContain(
      'data-kind="agent-flow-section" hidden=""',
    );
  });

  it.each(["pending", "failed"])(
    "does not promote %s approvals into the process area before a final answer",
    (status) => {
      // Under the unified contract a permissionRequest without a question form
      // is carried by the dedicated approval surface, not the process area, so
      // a final answer stays collapsible regardless of the approval state.
      const message = turn([
        {
          id: "p",
          type: "permissionRequest",
          toolName: "shell",
          reason: "执行测试",
          status,
          settled: status === "failed",
        },
        {
          id: "a",
          type: "agentMessage",
          text: "准备好了",
          phase: "final_answer",
          settled: true,
        },
      ]);
      expect(
        buildTurnPresentationModel(message, { isLastStreaming: false }).process
          .canCollapse,
      ).toBe(true);
      expect(render(message)).toContain("准备好了");
      expect(render(message)).not.toContain(
        'data-activity-kind="permissionRequest"',
      );
    },
  );

  it("renders contract markers and images through the actual turn entry", () => {
    const message = turn([
      { id: "plan", type: "plan", text: "验证架构契约" },
      { id: "review", type: "enteredReviewMode", review: {} },
      { id: "exit", type: "exitedReviewMode", review: {} },
      { id: "hook", type: "hookPrompt", fragmentCount: 2 },
      { id: "compact", type: "contextCompaction" },
      {
        id: "unknown",
        type: "unknown",
        rawType: "future-runtime-item",
        raw: {},
      },
      { id: "image", type: "imageView", path: "/tmp/result.png" },
      {
        id: "final",
        type: "agentMessage",
        phase: "final_answer",
        text: "验证完成",
      },
    ]);
    const html = render(message, true);
    for (const kind of [
      "enteredReviewMode",
      "exitedReviewMode",
      "hookPrompt",
      "contextCompaction",
      "unknown",
    ])
      expect(html).toContain(`data-activity-kind="${kind}"`);
    expect(html).not.toContain('data-block-kind="results"');
    expect(html).toContain('data-activity-kind="imageView"');
    // Under the unified contract a plan is task progress, not an activity row.
    expect(html).not.toContain('data-activity-kind="plan"');
    expect(html).toContain("已查看 1 张图像");
    expect(html).not.toContain("result.png"); // Thumbnail is inside the closed disclosure.
  });

  it("retains failure, result and final items outside a live trace window", () => {
    const message = turn(
      [
        {
          id: "approval",
          type: "permissionRequest",
          toolName: "shell",
          reason: "approve",
          status: "pending",
          settled: false,
        },
        {
          id: "failure",
          type: "commandExecution",
          command: "failed command",
          status: "failed",
          settled: true,
        },
        { id: "image", type: "imageView", path: "/tmp/retained.png" },
        {
          id: "final",
          type: "agentMessage",
          text: "中间结果",
          phase: "final_answer",
        },
        ...Array.from({ length: 300 }, (_, index): WorkflowTurnItem => ({
          id: `cmd-${index}`,
          type: "commandExecution",
          command: `echo ${index}`,
          status: "completed",
          settled: true,
        })),
      ],
      { activity: "running", status: "running" },
    );
    const model = buildTurnPresentationModel(message, {
      isLastStreaming: true,
    });
    expect(model.documentText).toBe("中间结果");
    const html = render(message, false, true);
    // A plain approval is carried by the dedicated approval surface and is not
    // re-rendered as a process row, so it is excluded from the live window too.
    expect(html).not.toContain('data-activity-kind="permissionRequest"');
    expect(html).toContain('data-activity-kind="imageView"');
    expect(JSON.stringify(model.blocks)).toContain("/tmp/retained.png");
    expect(html).toContain("failed command");
    expect(html).not.toContain("echo 0");
  });

  it("keeps process events after a semantic final document in order", () => {
    const model = buildTurnPresentationModel(
      turn([
        { id: "a", type: "agentMessage", phase: "final_answer", text: "正文" },
        {
          id: "p",
          type: "agentMessage",
          phase: "commentary",
          text: "后续动作",
        },
      ]),
      { isLastStreaming: false },
    );
    expect(model.blocks.map((block) => block.kind)).toEqual([
      "document",
      "process",
    ]);
    expect(model.documentText).toBe("正文");
  });
});
