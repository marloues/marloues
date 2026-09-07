import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowThreadStore } from "../../client/main/core/runtime/workflow-thread-store";
import { ConversationInputBroker } from "../../client/main/core/runtime/conversation-input";
import { normalizeSdkMessage } from "../../client/main/core/runtime/claude-runtime";
import { storedMessagesForRuntimeTurn } from "../../client/main/core/runtime/workflow-turn-persistence";
import { workflowTurnToWorkflowMessage } from "@shared/adapters/workflow-messages-to-read-thread";
import { buildTurnPresentationModel } from "../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model";
import { WorkflowTurnView } from "../../client/renderer/src/components/workflow-chat/turns/TurnView";
import { WorkflowQuestionCard } from "../../client/renderer/src/components/workflow-chat/activity/QuestionCard";
import { WorkflowMarkdownContent } from "../../client/renderer/src/components/workflow-chat/content/MarkdownContent";
import { WorkflowMarkdownProvider } from "../../client/renderer/src/components/workflow-chat/content/MarkdownContext";
import {
  inputFieldsFromSchema,
  validateConversationInput,
  type ConversationInputRequest,
  type ConversationInputResponse,
} from "@shared/conversation-input";
import type { RuntimeEvent } from "@shared/agent-runtime";

function setup() {
  const store = new WorkflowThreadStore();
  store.startTurn({
    threadId: "s",
    turnId: "t",
    content: "测试",
    userMessageId: "u",
    startedAt: 0,
  });
  return store;
}
function projection(store: WorkflowThreadStore) {
  return workflowTurnToWorkflowMessage(
    store.readThread({ threadId: "s" }).turns[0],
  );
}
const options = { isLastStreaming: true, modelName: "Test" };
const question: ConversationInputRequest = {
  sessionId: "s",
  turnId: "t",
  requestId: "q",
  kind: "form",
  title: "提供信息",
  source: "server",
  fields: [{ id: "name", type: "string", label: "姓名", required: true }],
  status: "pending",
};

describe("conversation runtime contracts", () => {
  it("starts timing after observed work, freezes turn start → final at 6 seconds, and persists it", () => {
    const store = setup();
    expect(
      buildTurnPresentationModel(projection(store), options).runtime
        .showDuration,
    ).toBe(false);
    store.applyRuntimeEvent(
      "s",
      "t",
      {
        kind: "tool-start",
        payload: {
          turnId: "t",
          toolId: "tool",
          toolName: "Read",
          input: {},
          isReady: true,
        },
      },
      1000,
    );
    store.applyRuntimeEvent(
      "s",
      "t",
      {
        kind: "item-updated",
        payload: {
          turnId: "t",
          item: {
            type: "agentMessage",
            id: "answer",
            text: "最终答复",
            phase: "final_answer",
            settled: false,
          },
        },
      },
      6000,
    );
    store.applyRuntimeEvent(
      "s",
      "t",
      {
        kind: "item-updated",
        payload: {
          turnId: "t",
          item: {
            type: "agentMessage",
            id: "answer",
            text: "最终答复继续流式增长",
            phase: "final_answer",
            settled: false,
          },
        },
      },
      10000,
    );
    const message = projection(store),
      model = buildTurnPresentationModel(message, options);
    expect(model.runtime).toMatchObject({
      durationMs: 6000,
      clockRunning: false,
      timingPlacement: "before-answer",
      running: true,
    });
    const expanded = renderToStaticMarkup(
      <WorkflowTurnView
        message={message}
        expanded
        isLastStreaming
        onToggle={() => {}}
        disableResponseTimer
      />,
    );
    expect(expanded.match(/6秒/g)).toHaveLength(1);
    expect(expanded.indexOf("处理用时")).toBeLessThan(
      expanded.indexOf("最终答复继续流式增长"),
    );
    const history = storedMessagesForRuntimeTurn(
      store.readThread({ threadId: "s" }),
      "t",
    );
    const recovered = new WorkflowThreadStore();
    recovered.rehydrateFromStoredMessages("s", history);
    expect(
      buildTurnPresentationModel(projection(recovered), options).runtime
        .durationMs,
    ).toBe(6000);
  });
  it("does not infer a work start or a reliable final from plain text or mounting old history", () => {
    const store = setup();
    store.applyRuntimeEvent(
      "s",
      "t",
      { kind: "text-chunk", payload: { turnId: "t", content: "直接答复" } },
      5000,
    );
    expect(
      buildTurnPresentationModel(projection(store), options).runtime,
    ).toMatchObject({ showDuration: false, startedAt: null });
    const old = {
      ...projection(store),
      startedAt: undefined,
      completedAt: undefined,
      timing: undefined,
      durationMs: null,
    };
    expect(
      renderToStaticMarkup(
        <WorkflowTurnView
          message={old}
          expanded
          isLastStreaming
          onToggle={() => {}}
        />,
      ),
    ).not.toMatch(/\d+秒/);
  });
  it("keeps timing facts when the first work item falls out of the presentation window", () => {
    const store = setup();
    store.applyRuntimeEvent(
      "s",
      "t",
      { kind: "thinking-chunk", payload: { turnId: "t", content: "开始分析" } },
      1000,
    );
    for (let index = 0; index < 300; index++)
      store.applyRuntimeEvent(
        "s",
        "t",
        {
          kind: "item-updated",
          payload: {
            turnId: "t",
            item: {
              type: "dynamicToolCall",
              id: `step-${index}`,
              tool: "Read",
              status: "completed",
              settled: true,
            },
          },
        },
        2000 + index,
      );
    expect(
      buildTurnPresentationModel(projection(store), {
        ...options,
        liveItemWindow: 16,
      }).runtime.startedAt,
    ).toBe(0);
  });
  it("preserves SDK raw MCP envelopes independently of the model text", () => {
    const result = {
      content: [{ type: "resource_link", uri: "ui://app", name: "App" }],
      structuredContent: { value: 1 },
      _meta: { resourceUri: "ui://app" },
    };
    const events = normalizeSdkMessage("s", "t", {
      type: "user",
      tool_use_result: result,
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "mcp",
            content: "flattened model text",
          },
        ],
      },
    });
    expect(
      events.find((event) => event.kind === "tool-complete"),
    ).toMatchObject({ payload: { output: result } });
    const store = setup();
    events.forEach((event) => store.applyRuntimeEvent("s", "t", event));
    expect(
      store
        .readThread({ threadId: "s" })
        .turns[0].items.find((item) => item.id === "mcp"),
    ).toMatchObject({ result });
  });
  it("answers exactly one pending source request, validates values and rejects stale/cross-task replies", async () => {
    const broker = new ConversationInputBroker(),
      events: RuntimeEvent[] = [];
    const pending = broker.request(question, (event) => events.push(event));
    const first = events[0];
    if (
      first.kind !== "item-updated" ||
      first.payload.item.type !== "permissionRequest"
    )
      throw new Error("No question");
    const requestId = first.payload.item.question!.requestId;
    const answer: ConversationInputResponse = {
      sessionId: "s",
      turnId: "t",
      requestId,
      action: "accept",
      content: { name: "验证者" },
    };
    expect(() => broker.respond({ ...answer, sessionId: "other" })).toThrow();
    expect(() => broker.respond({ ...answer, content: {} })).toThrow(
      "请填写姓名",
    );
    broker.respond(answer);
    expect(await pending).toEqual(answer);
    expect(() => broker.respond(answer)).toThrow("问题已结束");
    expect(events.at(-1)).toMatchObject({
      payload: {
        item: {
          settled: true,
          question: { status: "answered", answers: { name: "验证者" } },
        },
      },
    });
  });
  it("cancels pending questions with the original turn and renders terminal history without submit controls", async () => {
    const broker = new ConversationInputBroker(),
      events: RuntimeEvent[] = [];
    const pending = broker.request(question, (event) => events.push(event));
    broker.cancelTurn("s", "other");
    expect(events).toHaveLength(1);
    broker.cancelTurn("s", "t");
    expect((await pending).action).toBe("cancel");
    expect(
      renderToStaticMarkup(
        <WorkflowQuestionCard
          request={{
            ...question,
            status: "answered",
            answers: { name: "已填写" },
          }}
        />,
      ),
    ).not.toContain("提交回答");
  });
  it("validates schema types, bounds, required values and refuses unknown nested input", () => {
    const schema = inputFieldsFromSchema({
      type: "object",
      required: ["age"],
      properties: {
        age: { type: "integer", minimum: 1, maximum: 99 },
        kind: { type: "string", enum: ["a", "b"] },
      },
    });
    const request = { ...question, ...schema };
    expect(
      validateConversationInput(request, {
        ...question,
        action: "accept",
        content: { age: 1.5 },
      }),
    ).toContain("数值范围");
    expect(
      validateConversationInput(request, {
        ...question,
        action: "accept",
        content: { age: 20, kind: "c" },
      }),
    ).toContain("请选择");
    expect(
      validateConversationInput(request, {
        ...question,
        action: "accept",
        content: { age: 20, kind: "a" },
      }),
    ).toBeNull();
    expect(
      inputFieldsFromSchema({ properties: { nested: { type: "object" } } })
        .unsupported,
    ).toBeTruthy();
    expect(
      inputFieldsFromSchema({ type: "object", oneOf: [{ required: ["age"] }] })
        .unsupported,
    ).toBeTruthy();
    expect(
      inputFieldsFromSchema({
        properties: { count: { type: "integer", multipleOf: 2 } },
      }).unsupported,
    ).toBeTruthy();
    expect(
      inputFieldsFromSchema({ properties: { malformed: null } }).unsupported,
    ).toBeTruthy();
    expect(
      validateConversationInput(
        {
          ...question,
          fields: [
            { id: "value", label: "选项", type: "enum", options: ["1"] },
          ],
        },
        { ...question, action: "accept", content: { value: 1 } },
      ),
    ).toContain("请选择");
  });
  it("retains cancelled question wording and never labels a stopped sub-second turn completed", () => {
    const html = renderToStaticMarkup(
      <WorkflowQuestionCard request={{ ...question, status: "cancelled" }} />,
    );
    expect(html).toContain("姓名");
    expect(html).toContain("未回答");
    expect(html).not.toContain("提交回答");
    const store = setup();
    store.applyRuntimeEvent(
      "s",
      "t",
      { kind: "thinking-chunk", payload: { turnId: "t", content: "分析" } },
      1000,
    );
    store.applyRuntimeEvent(
      "s",
      "t",
      { kind: "turn-complete", payload: { turnId: "t", result: "aborted" } },
      1500,
    );
    expect(
      buildTurnPresentationModel(projection(store), { isLastStreaming: false })
        .chrome.label,
    ).toBe("已取消");
  });
  it("uses explicit writing mode and decorates only inline code with the right action", () => {
    const content =
      "标识符 `itemId` 与路径 `./src/index.ts:4`。\n\n```markdown\n写作内容\n```";
    const normal = renderToStaticMarkup(
      <WorkflowMarkdownContent content={content} />,
    );
    const writing = renderToStaticMarkup(
      <WorkflowMarkdownProvider
        value={{ writingBlockMode: true, cwd: "/workspace" }}
      >
        <WorkflowMarkdownContent content={content} />
      </WorkflowMarkdownProvider>,
    );
    expect(normal).not.toContain('data-kind="writing-block"');
    expect(writing).toContain('data-kind="writing-block"');
    expect(writing).toContain("复制 itemId");
    expect(writing).toContain("workflow-file-link");
  });
});
