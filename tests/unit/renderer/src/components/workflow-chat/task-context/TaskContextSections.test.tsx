import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BackgroundProcessesSection,
  BrowserPagesSection,
  OutputContentSection,
  PlanSection,
  ScheduledSection,
  SubagentsSection,
  UsageSection,
  WorkspaceContextSection,
} from "../../../../../../../client/renderer/src/components/workflow-chat/task-context/TaskContextSections";
import type { TaskPresentationModel } from "../../../../../../../client/renderer/src/components/workflow-chat/task-context/task-presentation-model";

describe("thread summary sections", () => {
  it("shows environment context and change state", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextSection
        sessionId="session-1"
        model={modelFixture()}
        gitLoading={false}
        onOpenWorkspace={vi.fn()}
        onOpenChanges={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    for (const label of ["环境", "变更", "本地", "分支", "模型", "权限"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("main ↑1 ↓2");
    expect(markup).toContain("3 个文件");
  });

  it("hides an empty environment instead of rendering a shell section", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextSection
        sessionId="session-1"
        model={{
          ...modelFixture(),
          workspace: null,
          changes: null,
          modelName: undefined,
          securityMode: undefined,
        }}
        gitLoading={false}
        onOpenWorkspace={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(markup).toBe("");
  });

  it("renders scheduled, plan, usage, terminal, browser, and subagent rows", () => {
    const subagent = {
      id: "subagent-1",
      parentToolId: "tool-1",
      ordinal: 1,
      agentName: "验证代理",
      iconSeed: "seed",
      status: "running" as const,
      createdAt: 1,
      updatedAt: 2,
      events: [],
      timeline: [],
      text: "正在验证",
    };
    const sections = renderToStaticMarkup(
      <>
        <ScheduledSection
          sessionId="session-1"
          scheduled={[
            {
              id: "schedule-1",
              name: "每日摘要",
              enabled: true,
              status: "running",
            },
            {
              id: "schedule-2",
              name: "每周报告",
              enabled: false,
              status: "paused",
            },
          ]}
          onOpenScheduledTask={vi.fn()}
          onToggleScheduledTask={vi.fn()}
          onRemoveScheduledTask={vi.fn()}
        />
        <PlanSection
          sessionId="session-1"
          plan={{ id: "plan-1", text: "完成摘要对齐" }}
        />
        <SubagentsSection
          sessionId="session-1"
          subagents={[subagent]}
          onOpenSubagent={vi.fn()}
        />
        <UsageSection
          sessionId="session-1"
          usage={{
            inputTokens: 1200,
            outputTokens: 300,
            totalTokens: 1500,
          }}
        />
        <BackgroundProcessesSection
          sessionId="session-1"
          processes={[
            {
              id: "terminal:terminal-1",
              command: "zsh",
              status: "running",
              source: "terminal",
              terminalSessionId: "terminal-1",
            },
          ]}
          onOpenTerminal={vi.fn()}
        />
        <BrowserPagesSection
          sessionId="session-1"
          browserPages={[
            {
              pageId: "page-1",
              title: "报告",
              url: "https://example.com/report",
            },
          ]}
          onOpenBrowserPage={vi.fn()}
        />
      </>,
    );

    for (const label of [
      "定时任务",
      "每日摘要",
      "计划",
      "子代理",
      "验证代理",
      "用量",
      "后台进程",
      "浏览器",
      "报告",
    ]) {
      expect(sections).toContain(label);
    }
    expect(sections).toContain('aria-label="暂停 每日摘要"');
    expect(sections).toContain('aria-label="恢复 每周报告"');
    expect(sections).toContain('aria-label="删除 每日摘要"');
  });

  it("renders artifact output rows with Codex section wording", () => {
    const markup = renderToStaticMarkup(
      <OutputContentSection
        sessionId="session-1"
        outputContent={[
          {
            id: "change-1",
            label: "文件变更",
            detail: "src/app.ts",
            kind: "file-change",
            target: {
              kind: "review",
              path: "src/app.ts",
              diff: "+fixture",
            },
          },
        ]}
        onOpenOutput={vi.fn()}
      />,
    );

    expect(markup).toContain('data-section-key="outputs"');
    expect(markup).toContain("产出");
    expect(markup).toContain("文件变更");
    expect(markup).toContain("src/app.ts");
    expect(markup).not.toContain("最终回复");
  });
});

function modelFixture(): TaskPresentationModel {
  return {
    sessionId: "session-1",
    hasData: true,
    scheduled: [],
    workspace: {
      id: "workspace-1",
      name: "marloues",
      path: "C:/workspace/marloues",
      lastOpenedAt: 1,
      git: {
        isRepository: true,
        branch: "main",
        upstream: "origin/main",
        ahead: 1,
        behind: 2,
        changedFiles: 3,
        insertions: 10,
        deletions: 4,
      },
    },
    changes: {
      filesChanged: 3,
      insertions: 10,
      deletions: 4,
      reviewTarget: { path: "src/app.ts", diff: "+fixture" },
    },
    outputContent: [],
    plan: null,
    modelName: "Marloues 5",
    securityMode: "request",
    tasks: [],
    subagents: [],
    usage: null,
    processes: [],
    browserPages: [],
    sources: [],
  };
}
