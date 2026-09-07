import { useState } from "react";
import type { WorkflowMessageBlock } from "@shared/adapters/workflow-messages-to-read-thread";
import { WorkflowTurnView } from "../turns/TurnView";
import { BeforeContractTurnView } from "./BeforeContractTurnView";
import "./conversation-comparison.css";

const completed = {
  status: "completed",
  activity: "done",
  startedAt: 1788591600000,
  completedAt: 1788591604200,
  durationMs: 4200,
} as const;

const scenarios: Array<{
  name: string;
  instruction: string;
  message: WorkflowMessageBlock;
}> = [
  {
    name: "最终答复与过程",
    instruction:
      "先看折叠状态：右侧应保留“修改完成，测试通过”，而不是最后一条过程说明。展开可看工具过程；点“复制回复”后，下方会显示实际复制内容。",
    message: {
      id: "comparison-final",
      user: "检查配置并给出结论",
      userContent: [{ type: "text", text: "检查配置并给出结论" }],
      ...completed,
      items: [
        {
          type: "agentMessage",
          id: "progress",
          phase: "commentary",
          text: "我先检查配置和相关测试。",
          settled: true,
        },
        {
          type: "commandExecution",
          id: "command",
          command: "npm test",
          status: "completed",
          output: { text: "24 tests passed", truncated: false },
          settled: true,
        },
        {
          type: "agentMessage",
          id: "answer",
          phase: "final_answer",
          text: "修改完成，测试通过。\n\n配置现在符合预期。",
          settled: true,
        },
        {
          type: "agentMessage",
          id: "later-progress",
          phase: "commentary",
          text: "正在整理执行记录。",
          settled: true,
        },
      ],
    },
  },
  {
    name: "结果卡片",
    instruction:
      "折叠时，右侧正文下仍应显示文件变更卡片。展开后可看执行过程，文件结果继续独立显示。",
    message: {
      id: "comparison-results",
      user: "修改配置文件",
      userContent: [{ type: "text", text: "修改配置文件" }],
      ...completed,
      items: [
        {
          type: "commandExecution",
          id: "read",
          command: "cat app.config.ts",
          status: "completed",
          settled: true,
        },
        {
          type: "fileChange",
          id: "change",
          status: "completed",
          settled: true,
          changes: [
            {
              path: "src/app.config.ts",
              kind: "update",
              diff: {
                text: "@@ -1 +1 @@\n-export const retries = 0;\n+export const retries = 3;",
                truncated: false,
              },
            },
          ],
        },
        {
          type: "agentMessage",
          id: "answer",
          phase: "final_answer",
          text: "已将重试次数设为 3。",
          settled: true,
        },
      ],
    },
  },
  {
    name: "等待审批",
    instruction:
      "这条回合还在运行。右侧会保留审批提示；左侧旧入口不支持这个条目类型。此处是展示数据，不会执行命令。",
    message: {
      id: "comparison-approval",
      user: "运行项目测试",
      userContent: [{ type: "text", text: "运行项目测试" }],
      status: "running",
      activity: "running",
      durationMs: null,
      items: [
        {
          type: "agentMessage",
          id: "progress",
          phase: "commentary",
          text: "运行测试需要你的批准。",
          settled: true,
        },
        {
          type: "permissionRequest",
          id: "approval",
          toolName: "shell_command",
          reason: "运行 npm test",
          status: "pending",
          settled: false,
        },
      ],
    },
  },
  {
    name: "执行失败",
    instruction:
      "只有过程说明、没有最终答复时，右侧仍保留过程和独立错误卡片。点击折叠也不会把失败原因隐藏。",
    message: {
      id: "comparison-error",
      user: "执行测试并汇报",
      userContent: [{ type: "text", text: "执行测试并汇报" }],
      ...completed,
      status: "failed",
      activity: "failed",
      error: { message: "Runtime connection lost：执行过程中连接断开。" },
      items: [
        {
          type: "agentMessage",
          id: "progress",
          phase: "commentary",
          text: "正在执行项目测试。",
          settled: true,
        },
      ],
    },
  },
  {
    name: "计划与标记",
    instruction:
      "点“展开过程”：右侧可见计划、审查和上下文压缩条目，左侧旧入口会跳过这些类型。计划条目可继续点开查看内容。",
    message: {
      id: "comparison-types",
      user: "按计划审查项目",
      userContent: [{ type: "text", text: "按计划审查项目" }],
      ...completed,
      items: [
        {
          type: "plan",
          id: "plan",
          text: "- [x] 检查能力接口\n- [x] 检查消息展示\n- [x] 汇总架构问题",
          settled: true,
        },
        {
          type: "enteredReviewMode",
          id: "review",
          review: { target: "current changes" },
          settled: true,
        },
        { type: "contextCompaction", id: "compact", settled: true },
        {
          type: "exitedReviewMode",
          id: "review-end",
          review: { completed: true },
          settled: true,
        },
        {
          type: "agentMessage",
          id: "answer",
          phase: "final_answer",
          text: "审查完成，计划中的三个步骤均已完成。",
          settled: true,
        },
      ],
    },
  },
];

export function ConversationComparisonPage() {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<{ side: string; text: string } | null>(
    null,
  );
  const scenario = scenarios[index];
  const onCopy = (side: string) => async (text: string) => {
    setCopied({ side, text });
    await navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  return (
    <main className="conversation-comparison">
      <header className="conversation-comparison-intro">
        <span className="conversation-comparison-eyebrow">
          对话渲染 · 前后对照
        </span>
        <h1>这轮改动，具体看这里</h1>
        <p>
          同一份示例消息，分别经过修改前和当前的真实 TurnView
          组件。示例不调用模型，不写入你的对话。
        </p>
        <nav aria-label="验收场景">
          {scenarios.map((item, itemIndex) => (
            <button
              type="button"
              key={item.name}
              aria-pressed={index === itemIndex}
              onClick={() => {
                setIndex(itemIndex);
                setExpanded(item.message.status === "running");
                setCopied(null);
              }}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <div className="conversation-comparison-instruction">
          <p>{scenario.instruction}</p>
          <button type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "折叠过程" : "展开过程"}
          </button>
        </div>
      </header>
      <div className="conversation-comparison-columns">
        <section className="conversation-comparison-panel">
          <h2>
            修改前 <small>固定基线 edebdae</small>
          </h2>
          <BeforeContractTurnView
            key={scenario.message.id}
            message={scenario.message}
            expanded={expanded}
            isLastStreaming={scenario.message.status === "running"}
            disableResponseTimer
            onToggle={() => setExpanded((value) => !value)}
            onCopy={onCopy("修改前")}
          />
        </section>
        <section className="conversation-comparison-panel">
          <h2>
            修改后 <small>当前 worktree</small>
          </h2>
          <WorkflowTurnView
            key={scenario.message.id}
            message={scenario.message}
            expanded={expanded}
            isLastStreaming={scenario.message.status === "running"}
            disableResponseTimer
            onToggle={() => setExpanded((value) => !value)}
            onCopy={onCopy("修改后")}
          />
        </section>
      </div>
      {copied ? (
        <aside className="conversation-comparison-copy">
          <strong>{copied.side} · 实际复制内容</strong>
          <pre>{copied.text}</pre>
        </aside>
      ) : null}
    </main>
  );
}
