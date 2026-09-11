import { describe, expect, it } from "vitest";
import {
  createACPWorkflowItemAdapter,
  planTextFromEntries,
} from "../../../../client/shared/acp/acp-event-to-workflow-item";
import { createUIEventToACPAdapter } from "../../../../client/shared/acp/provider-event-to-acp";
import type { ACPWorkflowEvent } from "../../../../client/shared/acp/acp-types";
import type { UIEvent } from "../../../../client/shared/ui-protocol";

const SESSION_ID = "session-1";
const TURN_ID = "turn-1";

function uiEvent(event: UIEvent): UIEvent {
  return event;
}

function acpEvents(event: UIEvent): ACPWorkflowEvent[] {
  return createUIEventToACPAdapter({ source: "codex" }).translate(event);
}

describe("ACP canonical 事件到 WorkflowTurnItem", () => {
  it("还原用户 rich input，且标准文本可 fallback", () => {
    const adapter = createACPWorkflowItemAdapter();
    const richEvent = acpEvents(
      uiEvent({
        type: "user.message",
        sessionId: SESSION_ID,
        turnId: "rich-turn",
        messageId: "rich-user",
        content: "继续执行",
        userContent: [
          { type: "text", text: "继续执行" },
          {
            type: "skill",
            name: "project-e2e",
            displayName: "Project E2E",
          },
        ],
        timestamp: 1,
      }),
    )[0];
    const fallbackEvent = acpEvents(
      uiEvent({
        type: "user.message",
        sessionId: SESSION_ID,
        turnId: "text-turn",
        messageId: "text-user",
        content: "纯文本",
        timestamp: 2,
      }),
    )[0];

    adapter.ingest(richEvent);
    adapter.ingest(fallbackEvent);

    expect(adapter.getItem("rich-user")).toMatchObject({
      type: "userMessage",
      content: [
        { type: "text", text: "继续执行" },
        {
          type: "skill",
          name: "project-e2e",
          displayName: "Project E2E",
        },
      ],
    });
    expect(adapter.getItem("text-user")).toMatchObject({
      type: "userMessage",
      content: [{ type: "text", text: "纯文本" }],
    });
  });

  it("同 messageId 的 content chunk 累积为一个 item", () => {
    const adapter = createACPWorkflowItemAdapter();
    const first = acpEvents(
      uiEvent({
        type: "text.chunk",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        content: "Hello ",
        index: 1,
      }),
    );
    const second = acpEvents(
      uiEvent({
        type: "text.chunk",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        content: "world",
        index: 2,
      }),
    );

    adapter.ingest(first[0]);
    const result = adapter.ingest(second[0]);

    expect(result).toHaveLength(1);
    expect(result[0].item).toMatchObject({
      type: "agentMessage",
      id: `agent-${TURN_ID}`,
      text: "Hello world",
      settled: false,
    });
    expect(result[0].prevItem).toMatchObject({ text: "Hello " });
  });

  it("工具调用合并为终态 dynamicToolCall", () => {
    const adapter = createACPWorkflowItemAdapter();
    const provider = createUIEventToACPAdapter({ source: "codex" });
    const [start] = provider.translate(
      uiEvent({
        type: "tool.start",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        toolId: "tool-1",
        toolName: "Read",
        input: { path: "/tmp/a.ts" },
      }),
    );
    const [complete] = provider.translate(
      uiEvent({
        type: "tool.complete",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        toolId: "tool-1",
        output: "ok",
        isError: false,
      }),
    );
    adapter.ingest(start);
    const result = adapter.ingest(complete);

    expect(result[0].item).toMatchObject({
      type: "dynamicToolCall",
      id: "tool-1",
      tool: "Read",
      arguments: { path: "/tmp/a.ts" },
      status: "completed",
      success: true,
      settled: true,
    });
  });

  it("ACP plan 是替换式完整快照", () => {
    const adapter = createACPWorkflowItemAdapter();
    adapter.ingest(
      acpEvents(
        uiEvent({
          type: "plan.delta",
          sessionId: SESSION_ID,
          turnId: TURN_ID,
          itemId: "plan-1",
          content: "1. [ ] 调研",
        }),
      )[0],
    );
    adapter.ingest(
      acpEvents(
        uiEvent({
          type: "plan.item",
          sessionId: SESSION_ID,
          turnId: TURN_ID,
          itemId: "plan-1",
          content: "1. [x] 调研\n2. [~] 实施",
        }),
      )[0],
    );

    expect(adapter.getItem(`plan-${TURN_ID}`)).toMatchObject({
      type: "plan",
      text: "- [x] 调研\n- [~] 实施",
      settled: false,
    });
    expect(
      planTextFromEntries([
        { content: "调研", priority: "medium", status: "completed" },
      ]),
    ).toBe("- [x] 调研");
  });

  it("prompt response 终态化流式 item", () => {
    const adapter = createACPWorkflowItemAdapter();
    adapter.ingest(
      acpEvents(
        uiEvent({
          type: "text.chunk",
          sessionId: SESSION_ID,
          turnId: TURN_ID,
          content: "done",
          index: 1,
        }),
      )[0],
    );
    const result = adapter.ingest(
      acpEvents(
        uiEvent({
          type: "turn.complete",
          sessionId: SESSION_ID,
          turnId: TURN_ID,
          result: "success",
          timestamp: 123,
          final: true,
        }),
      )[0],
    );

    expect(result).toHaveLength(1);
    expect(result[0].item).toMatchObject({ settled: true });
    expect(result[0].prevItem).toMatchObject({ settled: false });
  });

  it("current_mode_update 投影为 modeUpdate item", () => {
    const adapter = createACPWorkflowItemAdapter();
    const event: ACPWorkflowEvent = {
      type: "session/update",
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      notification: {
        sessionId: SESSION_ID,
        update: {
          sessionUpdate: "current_mode_update",
          currentModeId: "plan",
        },
      },
      source: "codex",
      nativeType: "task_started",
    };

    const [result] = adapter.ingest(event);

    expect(result.item).toMatchObject({
      type: "modeUpdate",
      modeId: "plan",
      modeKind: "plan",
      settled: true,
    });
  });

  it("permission request 投影为 WorkflowPermissionRequestItem", () => {
    const adapter = createACPWorkflowItemAdapter();
    const [event] = acpEvents(
      uiEvent({
        type: "approval.request",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        requestId: "request-1",
        toolName: "bash",
        reason: "需要执行命令",
        timeout: 30_000,
        allowSession: false,
      }),
    );

    const [result] = adapter.ingest(event);

    expect(result.item).toMatchObject({
      type: "permissionRequest",
      id: "request-1",
      toolName: "bash",
      reason: "需要执行命令",
      status: "running",
      settled: false,
    });
  });

  it("compaction 扩展映射为 contextCompaction item", () => {
    const adapter = createACPWorkflowItemAdapter();
    const [event] = acpEvents(
      uiEvent({
        type: "context.compaction",
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        phase: "completed",
        reason: "turn_end",
      }),
    );

    const [result] = adapter.ingest(event);

    expect(result.item).toMatchObject({
      type: "contextCompaction",
      id: `compaction-${TURN_ID}`,
      settled: true,
    });
  });

  it("未知事件保留 raw fallback", () => {
    const adapter = createACPWorkflowItemAdapter();
    const raw = { type: "provider.custom", value: 42 };
    const [result] = adapter.ingest({
      type: "unknown",
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      source: "openai",
      nativeType: "provider.custom",
      raw,
    });

    expect(result.item).toMatchObject({
      type: "unknown",
      rawType: "provider.custom",
      raw,
      settled: true,
    });
  });
});
