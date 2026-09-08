import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkflowMessageBlock } from "@shared/adapters/workflow-messages-to-read-thread";
import { WorkflowTurnItemRenderer } from "@/components/workflow-chat/activity/TurnItemRenderer";
import { buildTurnPresentationModel } from "@/components/workflow-chat/turns/turn-presentation-model";
import {
  workflowShouldShowProcessItem,
  type WorkflowProcessItem,
} from "@/components/workflow-chat/turns/turn-collapse-rules";

const hiddenItems: WorkflowProcessItem[] = [
  ...[
    "TaskCreate",
    "TaskUpdate",
    "TaskGet",
    "TaskList",
    "TaskStop",
    "sdk.task_create",
    "sdk.task_update",
  ].map((tool) => ({
    type: "mcpToolCall" as const,
    id: tool,
    tool,
    status: "completed",
  })),
  { type: "plan", id: "plan", text: "- [ ] 检查组件", settled: true },
  ...["pending", "approved", "denied", "timed_out"].map((status) => ({
    type: "permissionRequest" as const,
    id: status,
    toolName: "shell_command",
    reason: "运行测试",
    status,
  })),
  {
    type: "dynamicToolCall",
    id: "update",
    tool: "functions.update_plan",
    arguments: {},
    status: "completed",
  },
  {
    type: "mcpToolCall",
    id: "snapshot",
    tool: "plan_snapshot",
    server: "agent",
    status: "completed",
  },
  {
    type: "dynamicToolCall",
    id: "todo",
    tool: "TodoWrite",
    arguments: {},
    status: "running",
  },
];
const turn = (
  items: WorkflowMessageBlock["items"],
  running: boolean,
): WorkflowMessageBlock => ({
  id: "turn",
  user: "检查组件",
  userMessageId: "user",
  userContent: [{ type: "text", text: "检查组件" }],
  status: running ? "running" : "completed",
  activity: running ? "running" : "done",
  items,
});

describe("conversation activity visibility", () => {
  it.each(hiddenItems)("omits $type/$id from direct message rows", (item) => {
    expect(workflowShouldShowProcessItem(item)).toBe(false);
    expect(renderToStaticMarkup(<WorkflowTurnItemRenderer item={item} />)).toBe(
      "",
    );
  });
  it.each([true, false])(
    "omits hidden-only process blocks and step counts (streaming=%s)",
    (running) => {
      const message = turn(hiddenItems, running);
      const model = buildTurnPresentationModel(message, {
        isLastStreaming: running,
      });
      expect(model.blocks).toEqual([]);
      expect(model.process).toMatchObject({
        hasActivityItems: false,
        stepCount: 0,
      });
      expect(message.items).toBe(hiddenItems);
    },
  );
  it("groups visible work without empty approval groups and keeps the final answer", () => {
    const model = buildTurnPresentationModel(
      turn(
        [
          ...hiddenItems,
          {
            type: "commandExecution",
            id: "command",
            command: "npm test",
            status: "completed",
          },
          {
            type: "agentMessage",
            id: "answer",
            phase: "final_answer",
            text: "检查完成。",
          },
        ],
        false,
      ),
      { isLastStreaming: false },
    );
    expect(model.process).toMatchObject({
      stepCount: 1,
      hasActivityItems: true,
      canCollapse: true,
    });
    expect(model.documentText).toBe("检查完成。");
    expect(model.blocks.map((block) => block.kind)).toEqual([
      "process",
      "document",
    ]);
    const process = model.blocks[0];
    expect(process).toMatchObject({
      entries: [{ kind: "activityItem", item: { id: "command" } }],
    });
  });
  it("retains interactive questions that share the permissionRequest protocol type", () => {
    const item: WorkflowProcessItem = {
      type: "permissionRequest",
      id: "question",
      toolName: "request_user_input",
      reason: "需要补充信息",
      status: "pending",
      question: {
        sessionId: "session",
        turnId: "turn",
        requestId: "question",
        kind: "form",
        title: "提供信息",
        source: "server",
        status: "pending",
        fields: [{ id: "name", type: "string", label: "姓名", required: true }],
      },
    };
    expect(workflowShouldShowProcessItem(item)).toBe(true);
    expect(
      renderToStaticMarkup(<WorkflowTurnItemRenderer item={item} />),
    ).toContain("提供信息");
    const model = buildTurnPresentationModel(turn([item], true), {
      isLastStreaming: true,
    });
    expect(model.process.stepCount).toBe(1);
    expect(model.blocks[0]).toMatchObject({ kind: "process" });
  });
  it("retains delegation tools separately from task management", () => {
    expect(
      workflowShouldShowProcessItem({
        type: "mcpToolCall",
        id: "delegate",
        tool: "Task",
        status: "running",
      }),
    ).toBe(true);
  });
  it("does not promote pre-approval legacy commentary to a final answer", () => {
    const model = buildTurnPresentationModel(
      turn(
        [
          { type: "agentMessage", id: "comment", text: "接下来运行测试。" },
          hiddenItems.find((item) => item.type === "permissionRequest")!,
        ],
        true,
      ),
      { isLastStreaming: true },
    );
    expect(model.documentText).toBe("");
    expect(JSON.stringify(model.blocks)).toContain("接下来运行测试。");
  });
});
