import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanModeCard } from "../../../../../../../client/renderer/src/components/workflow-chat/activity/PlanModeCard";
import { WorkflowModeUpdateMarker } from "../../../../../../../client/renderer/src/components/workflow-chat/activity/MarkerRows";
import { AskUserQuestionCard } from "../../../../../../../client/renderer/src/components/workflow-chat/activity/AskUserQuestionCard";
import { QuestionAskPanel } from "../../../../../../../client/renderer/src/components/workflow-chat/activity/QuestionAskPanel";
import { QuestionQaCard } from "../../../../../../../client/renderer/src/components/workflow-chat/activity/QuestionQaCard";
import type { ConversationInputRequest } from "@shared/conversation-input";

const planModeText =
  "Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.\n\nIn plan mode, you should:\n1. Thoroughly explore the codebase to understand existing patterns\n2. Identify similar features and architectural approaches\n3. Consider multiple approaches and their trade-offs\n4. Use AskUserQuestion if you need to clarify the approach\n5. Design a concrete implementation strategy\n6. When ready, use ExitPlanMode to present your plan for approval\n\nRemember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.";

const planModeItem = {
  type: "dynamicToolCall" as const,
  id: "plan-1",
  tool: "EnterPlanMode",
  status: "completed" as const,
  success: true,
  output: { text: planModeText, truncated: false },
};

const askAnsweredItem = {
  type: "dynamicToolCall" as const,
  id: "ask-answered",
  tool: "AskUserQuestion",
  status: "completed" as const,
  success: true,
  arguments: {
    questions: [
      {
        header: "计划模式用途",
        question: "这次进入计划模式，你希望我规划什么？",
      },
    ],
  },
  output: { text: "升级演示目录为可运行示例", truncated: false },
};

const askDisabledItem = {
  type: "dynamicToolCall" as const,
  id: "ask-disabled",
  tool: "AskUserQuestion",
  status: "error" as const,
  success: false,
  output: {
    text: "<tool_use_error>Error: No such tool available: AskUserQuestion. AskUserQuestion exists but is not enabled in this context. Use one of the available tools instead.</tool_use_error>",
    truncated: false,
  },
};

const qaRequest: ConversationInputRequest = {
  sessionId: "s1",
  turnId: "t1",
  requestId: "r1",
  kind: "question",
  title: "需要你的回答",
  source: "AskUserQuestion",
  status: "answered",
  fields: [
    {
      id: "q1",
      label: "这次进入计划模式，你希望我规划什么？",
      type: "string",
      options: ["仅演练计划模式流程", "升级演示目录为可运行示例"],
      required: true,
    },
    {
      id: "__custom",
      label: "自定义回答（可选）",
      type: "string",
      required: false,
    },
  ],
  answers: { q1: "升级演示目录为可运行示例" },
};

const askPendingRequest: ConversationInputRequest = {
  sessionId: "s1",
  turnId: "t1",
  requestId: "r1",
  kind: "question",
  title: "计划模式用途",
  source: "AskUserQuestion",
  status: "pending",
  fields: [
    {
      id: "q1",
      label: "这次进入计划模式，你希望我规划什么？",
      type: "string",
      options: ["仅演练计划模式流程", "升级演示目录为可运行示例"],
      required: true,
    },
    {
      id: "__custom",
      label: "自定义回答（可选）",
      type: "string",
      required: false,
    },
  ],
};

describe("EnterPlanMode / PlanModeCard", () => {
  it("shows icon + title + LLM original rendered as markdown", () => {
    const html = renderToStaticMarkup(
      <PlanModeCard item={planModeItem} />,
    ) as string;
    expect(html).toContain("已进入计划模式");
    expect(html).toContain('data-kind="plan-mode-card"');
    expect(html).toContain("Thoroughly explore the codebase");
    expect(html).toContain(
      "This is a read-only exploration and planning phase.",
    );
  });

  it("shows entering state when running", () => {
    const html = renderToStaticMarkup(
      <PlanModeCard item={{ ...planModeItem, status: "running" as const }} />,
    ) as string;
    expect(html).toContain("进入计划模式中");
  });
});

describe("WorkflowModeUpdateMarker", () => {
  it("prefers semantic plan/default labels over provider labels", () => {
    const planItem = {
      type: "modeUpdate" as const,
      id: "mode-plan",
      modeId: "plan",
      modeKind: "plan" as const,
      label: "Plan",
      raw: {},
      settled: true,
    };
    const defaultItem = {
      type: "modeUpdate" as const,
      id: "mode-default",
      modeId: "default",
      modeKind: "default" as const,
      label: "Default",
      raw: {},
      settled: true,
    };

    const planHtml = renderToStaticMarkup(
      <WorkflowModeUpdateMarker item={planItem} />,
    ) as string;
    const defaultHtml = renderToStaticMarkup(
      <WorkflowModeUpdateMarker item={defaultItem} />,
    ) as string;

    expect(planHtml).toContain("已进入计划模式");
    expect(defaultHtml).toContain("已退出计划模式");
    expect(planHtml).not.toContain(">Plan<");
    expect(defaultHtml).not.toContain(">Default<");
  });
});

describe("AskUserQuestion / AskUserQuestionCard", () => {
  it("renders a QA card (question line, answer line) when answered", () => {
    const html = renderToStaticMarkup(
      <AskUserQuestionCard item={askAnsweredItem} />,
    ) as string;
    expect(html).toContain("这次进入计划模式，你希望我规划什么？");
    expect(html).toContain("升级演示目录为可运行示例");
    expect(html).toContain("已回答");
    expect(html).toContain('data-phase="display"');
  });

  it("renders an unavailable card on tool_use_error", () => {
    const html = renderToStaticMarkup(
      <AskUserQuestionCard item={askDisabledItem} />,
    ) as string;
    expect(html).toContain("该工具在当前上下文不可用");
    expect(html).toContain("No such tool available: AskUserQuestion");
    expect(html).toContain("已被禁用");
    expect(html).toContain('data-phase="unavailable"');
  });
});

describe("QuestionAskPanel (ask phase, floating panel)", () => {
  it("renders numbered options + custom answer box + actions", () => {
    const html = renderToStaticMarkup(
      <QuestionAskPanel request={askPendingRequest} />,
    ) as string;
    expect(html).toContain("待回答");
    expect(html).toContain("这次进入计划模式，你希望我规划什么？");
    // 编号选项一行一个
    expect(html).toContain("1.");
    expect(html).toContain("仅演练计划模式流程");
    expect(html).toContain("2.");
    expect(html).toContain("升级演示目录为可运行示例");
    // 自定义回答文本框 + 动作
    expect(html).toContain("自定义回答（可选）");
    expect(html).toContain("提交回答");
    expect(html).toContain("跳过");
    expect(html).toContain("取消");
  });
});

describe("QuestionQaCard (resolved question in conversation)", () => {
  it("renders question on first line and answer on second", () => {
    const html = renderToStaticMarkup(
      <QuestionQaCard request={qaRequest} />,
    ) as string;
    expect(html).toContain("这次进入计划模式，你希望我规划什么？");
    expect(html).toContain("升级演示目录为可运行示例");
    expect(html).toContain("已回答");
  });
});
