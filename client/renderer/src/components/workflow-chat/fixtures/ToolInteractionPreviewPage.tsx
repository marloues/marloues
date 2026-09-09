import { useState, type CSSProperties } from "react";
import { CircleHelp, TriangleAlert } from "lucide-react";
import type { WorkflowTurnItem } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import { AskUserQuestionCard } from "../activity/AskUserQuestionCard";
import { PlanModeCard } from "../activity/PlanModeCard";
import { WorkflowMarkdownProvider } from "../content/MarkdownContext";
import styles from "./ToolInteractionPreviewPage.module.css";

type DynamicToolItem = Extract<WorkflowTurnItem, { type: "dynamicToolCall" }>;

const planModeItem: DynamicToolItem = {
  type: "dynamicToolCall",
  id: "preview-plan-mode",
  tool: "EnterPlanMode",
  status: "completed",
  success: true,
  output: {
    text: "Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.\n\nIn plan mode, you should:\n1. Thoroughly explore the codebase to understand existing patterns\n2. Identify similar features and architectural approaches\n3. Consider multiple approaches and their trade-offs\n4. Use AskUserQuestion if you need to clarify the approach\n5. Design a concrete implementation strategy\n6. When ready, use ExitPlanMode to present your plan for approval\n\nRemember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.",
    truncated: false,
  },
};

const askOptions = [
  {
    label: "仅演练计划模式流程",
    description: "不绑定真实业务需求，做一次最小可行的演练。",
  },
  {
    label: "升级演示目录为可运行示例",
    description: "把 interaction-experience 升级为可独立运行示例。",
  },
  {
    label: "在 Marloues 项目里做个改动",
    description: "某个工作流聊天 / Codex 任务的代码改动或重构。",
  },
];

const questionText = "这次进入计划模式，你希望我规划什么？";
const questionHeader = "计划模式用途";

const askAnsweredItem: DynamicToolItem = {
  type: "dynamicToolCall",
  id: "preview-ask-answered",
  tool: "AskUserQuestion",
  status: "completed",
  success: true,
  arguments: {
    questions: [{ header: questionHeader, question: questionText }],
  },
  output: { text: "升级演示目录为可运行示例", truncated: false },
};

const askDisabledItem: DynamicToolItem = {
  type: "dynamicToolCall",
  id: "preview-ask-disabled",
  tool: "AskUserQuestion",
  status: "error",
  success: false,
  output: {
    text: "<tool_use_error>Error: No such tool available: AskUserQuestion. AskUserQuestion exists but is not enabled in this context. Use one of the available tools instead.</tool_use_error>",
    truncated: false,
  },
};

export function ToolInteractionPreviewPage() {
  return (
    <WorkflowMarkdownProvider value={{ cwd: null }}>
      <main
        style={{ height: "100vh", overflow: "auto", padding: "var(--space-8)" }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            display: "grid",
            gap: "var(--space-6)",
          }}
        >
          <section>
            <h2 style={sectionTitle}>EnterPlanMode — 图标 + 标题 + LLM 原文</h2>
            <PlanModeCard item={planModeItem} />
          </section>

          <section>
            <h2 style={sectionTitle}>
              AskUserQuestion — 问阶段（悬浮面板，编号选项 + 自定义回答）
            </h2>
            <AskPhasePanel
              header={questionHeader}
              question={questionText}
              options={askOptions}
            />
          </section>

          <section>
            <h2 style={sectionTitle}>
              AskUserQuestion — 显示阶段（对话区问答卡片）
            </h2>
            <AskUserQuestionCard item={askAnsweredItem} />
          </section>

          <section>
            <h2 style={sectionTitle}>AskUserQuestion — 不可用（工具被禁用）</h2>
            <AskUserQuestionCard item={askDisabledItem} />
          </section>
        </div>
      </main>
    </WorkflowMarkdownProvider>
  );
}

function AskPhasePanel({
  header,
  question,
  options,
}: {
  header: string;
  question: string;
  options: { label: string; description?: string }[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [outcome, setOutcome] = useState<
    null | "answered" | "skipped" | "cancelled"
  >(null);

  if (outcome) {
    const answer =
      selected != null ? options[selected].label : custom.trim() || "未回答";
    return <QaCard question={question} answer={answer} status={outcome} />;
  }

  return (
    <section
      style={panelStyle}
      role="dialog"
      aria-label="待回答"
      data-preview-kind="ask-panel"
    >
      <div style={panelKicker}>
        <CircleHelp size={14} strokeWidth={1.8} aria-hidden />
        待回答
      </div>
      <h3 style={panelTitle}>{header}</h3>
      <p style={panelPrompt}>{question}</p>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {options.map((option, index) => {
          const active = selected === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => setSelected(index)}
              aria-pressed={active}
              className={`${styles.option} ${active ? styles.optionActive : ""}`}
            >
              <span
                style={{
                  minWidth: "1.2em",
                  color: "var(--text-3)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {index + 1}.
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontWeight: 500 }}>
                  {option.label}
                </span>
                {option.description ? (
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--text-3)",
                    }}
                  >
                    {option.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <label style={customLabel}>自定义回答（可选）</label>
      <input
        type="text"
        value={custom}
        onChange={(event) => setCustom(event.target.value)}
        style={customInput}
        placeholder="输入你的回答…"
      />
      <div style={panelActions}>
        <button
          type="button"
          style={primaryButton}
          onClick={() => setOutcome("answered")}
        >
          提交回答
        </button>
        <button
          type="button"
          style={ghostButton}
          onClick={() => setOutcome("skipped")}
        >
          跳过
        </button>
        <button
          type="button"
          style={ghostButton}
          onClick={() => setOutcome("cancelled")}
        >
          取消
        </button>
      </div>
    </section>
  );
}

function QaCard({
  question,
  answer,
  status,
}: {
  question: string;
  answer: string;
  status: "answered" | "skipped" | "cancelled";
}) {
  const label =
    status === "answered"
      ? "已回答"
      : status === "skipped"
        ? "已跳过"
        : "已取消";
  return (
    <section style={cardStyle} data-preview-kind="qa-card" data-phase="display">
      <div style={qaQuestion}>{question}</div>
      <div style={qaAnswer}>{answer}</div>
      <small
        style={{
          marginTop: "var(--space-3)",
          color: "var(--text-3)",
          fontSize: "var(--text-sm)",
        }}
      >
        Codex · {label}
      </small>
    </section>
  );
}

const sectionTitle: CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--text-3)",
  marginBottom: "var(--space-2)",
};

const panelStyle: CSSProperties = {
  padding: "var(--space-4) var(--space-5)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--card-radius)",
  background: "var(--raised-1)",
  boxShadow: "var(--shadow-md)",
};
const panelKicker: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-1)",
  color: "var(--text-3)",
  fontSize: "var(--text-sm)",
  marginBottom: "var(--space-2)",
};
const panelTitle: CSSProperties = {
  margin: "0 0 var(--space-1)",
  fontSize: "var(--text-md)",
  fontWeight: 500,
};
const panelPrompt: CSSProperties = {
  margin: 0,
  color: "var(--text-2)",
};
const customLabel: CSSProperties = {
  display: "block",
  margin: "var(--space-3) 0 var(--space-1)",
  color: "var(--text-2)",
  fontSize: "var(--text-sm)",
};
const customInput: CSSProperties = {
  width: "100%",
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--panel-2)",
  color: "var(--text-1)",
  fontSize: "var(--text-sm)",
};
const panelActions: CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  marginTop: "var(--space-3)",
};
const primaryButton: CSSProperties = {
  padding: "var(--space-1) var(--space-3)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-md)",
  background: "var(--primary-fill)",
  color: "var(--primary-ink)",
  cursor: "pointer",
};
const ghostButton: CSSProperties = {
  padding: "var(--space-1) var(--space-3)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "transparent",
  color: "var(--text-1)",
  cursor: "pointer",
};
const cardStyle: CSSProperties = {
  padding: "var(--space-4) var(--space-5)",
  border: "1px solid var(--border)",
  borderRadius: "var(--card-radius)",
  background: "var(--raised-1)",
  color: "var(--text-1)",
  font: "var(--text-base)/1.5 var(--font-ui)",
};
const qaQuestion: CSSProperties = {
  fontWeight: 500,
};
const qaAnswer: CSSProperties = {
  marginTop: "var(--space-1)",
  color: "var(--text-2)",
};
