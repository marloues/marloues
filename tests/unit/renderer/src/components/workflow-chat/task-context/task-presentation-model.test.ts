import { describe, expect, it } from "vitest";
import type { WorkflowReadThreadResponse } from "@shared/workflow-read-thread-contract";
import { buildTaskPresentationModel } from "../../../../../../../client/renderer/src/components/workflow-chat/task-context/task-presentation-model";
import type {
  ExecutionSubagentRecord,
  ExecutionTaskRecord,
} from "../../../../../../../client/renderer/src/stores/unified-chat-store";

const readThread: WorkflowReadThreadResponse = {
  schemaVersion: 2,
  thread: {
    id: "thread-1",
    title: "Build context panel",
    preview: "Build context panel",
    status: { type: "active", activeFlags: {} },
    cwd: "C:/workspace/marloues",
    createdAt: 1,
    updatedAt: 2,
  },
  page: { order: "newest_first", limit: 1, nextCursor: null, hasMore: false },
  turns: [
    {
      id: "turn-1",
      zone: "workspace",
      status: "running",
      error: null,
      startedAt: 1,
      completedAt: null,
      durationMs: null,
      modelName: "Marloues 5",
      usage: {
        inputTokens: 1200,
        outputTokens: 300,
        totalTokens: 1500,
      },
      items: [
        {
          id: "plan",
          type: "plan",
          text: "先扩展模型，再接入辅助栏，最后核验。",
        },
        {
          id: "cmd",
          type: "commandExecution",
          command: "npm test",
          status: "running",
        },
        {
          id: "change",
          type: "fileChange",
          status: "completed",
          changes: [
            {
              path: "src/app.ts",
              kind: "update",
              diff: { text: "+one\n-two" },
            },
          ],
        },
        {
          id: "generated-image",
          type: "imageGeneration",
          status: "completed",
          savedPath: "output/generated.png",
        },
        { id: "viewed-image", type: "imageView", path: "output/viewed.png" },
        { id: "web", type: "webSearch", query: "Codex task context" },
        {
          id: "agent",
          type: "agentMessage",
          text: "产物已生成：https://example.com/report 和 https://example.com/report。",
          phase: "final_answer",
        },
      ],
    },
  ],
};

describe("buildTaskPresentationModel", () => {
  it("projects the current plan, real artifacts, usage, and running work", () => {
    const model = buildTaskPresentationModel({
      sessionId: "session-1",
      readThread,
      workspace: {
        id: "ws",
        name: "marloues",
        path: "C:/workspace/marloues",
        lastOpenedAt: 1,
      },
      securityMode: "request",
    });

    expect(model.plan).toMatchObject({
      id: "plan",
      text: "先扩展模型，再接入辅助栏，最后核验。",
    });
    expect(model.outputContent.map((item) => item.label)).toEqual([
      "文件变更",
      "生成图片",
      "图片",
      "网页搜索",
      "外部链接",
    ]);
    expect(model.outputContent[0]?.target).toEqual({
      kind: "review",
      path: "src/app.ts",
      diff: "+one\n-two",
    });
    expect(model.outputContent[2]?.target).toEqual({
      kind: "file",
      path: "output/viewed.png",
    });
    expect(model.usage).toMatchObject({ totalTokens: 1500 });
    expect(model.changes).toMatchObject({
      filesChanged: 1,
      insertions: 1,
      deletions: 1,
    });
    expect(model.processes).toEqual([
      {
        id: "cmd",
        command: "npm test",
        cwd: undefined,
        status: "running",
        source: "command",
      },
    ]);
    expect(model.sources[0]).toMatchObject({ kind: "web", count: 1 });
  });

  it("joins scheduled tasks, subagents, terminals, and browser pages by session", () => {
    const task: ExecutionTaskRecord = {
      id: "task-1",
      ordinal: 1,
      title: "验证摘要",
      status: "running",
      createdAt: 1,
      updatedAt: 2,
    };
    const subagent: ExecutionSubagentRecord = {
      id: "subagent-1",
      parentToolId: "tool-1",
      ordinal: 1,
      agentName: "验证代理",
      iconSeed: "seed",
      status: "running",
      createdAt: 1,
      updatedAt: 2,
      events: [],
      timeline: [],
      text: "正在验证",
    };

    const model = buildTaskPresentationModel({
      sessionId: "session-1",
      readThread,
      tasks: [task],
      subagents: [subagent],
      scheduledTasks: [
        {
          id: "schedule-1",
          name: "每日摘要",
          instruction: "生成摘要",
          workspacePath: "C:/workspace/marloues",
          sourceSessionId: "session-1",
          kind: "cron",
          enabled: true,
          nextRunAt: 2000,
          metadata: {
            tags: [],
            schedule: {
              mode: "cycle",
              cycleType: "daily",
              time: { hour: 9, minute: 0 },
            },
            notificationChannels: [],
          },
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: "schedule-2",
          name: "运行记录关联任务",
          instruction: "从执行记录关联",
          workspacePath: "C:/workspace/marloues",
          kind: "cron",
          enabled: true,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      scheduledRuns: {
        "schedule-2": [
          {
            id: "run-1",
            taskId: "schedule-2",
            sessionId: "session-1",
            status: "running",
            createdAt: 1,
          },
        ],
      },
      terminalSessions: [
        {
          sessionId: "terminal-1",
          threadId: "session-1",
          process: "zsh",
          cwd: "C:/workspace/marloues",
        },
        {
          sessionId: "terminal-2",
          threadId: "other-session",
          process: "fish",
          cwd: "C:/other",
        },
      ],
      browserPages: [
        {
          pageId: "page-1",
          title: "报告",
          url: "https://example.com/report",
        },
      ],
    });

    expect(model.tasks).toEqual([task]);
    expect(model.subagents).toEqual([subagent]);
    expect(model.scheduled).toEqual([
      {
        id: "schedule-1",
        name: "每日摘要",
        enabled: true,
        status: "scheduled",
        detail: "每天 09:00",
        nextRunAt: 2000,
      },
      {
        id: "schedule-2",
        name: "运行记录关联任务",
        enabled: true,
        status: "running",
        detail: "从执行记录关联",
      },
    ]);
    expect(model.processes).toHaveLength(2);
    expect(model.processes[1]).toMatchObject({
      id: "terminal:terminal-1",
      source: "terminal",
      terminalSessionId: "terminal-1",
    });
    expect(model.browserPages).toEqual([
      {
        pageId: "page-1",
        title: "报告",
        url: "https://example.com/report",
      },
    ]);
  });

  it("caps artifact output at six items and de-duplicates agent links", () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      id: `change-${index + 1}`,
      type: "fileChange" as const,
      status: "completed" as const,
      changes: [
        {
          path: `src/file-${index + 1}.ts`,
          kind: "update",
          diff: { text: "+fixture" },
        },
      ],
    }));
    const model = buildTaskPresentationModel({
      sessionId: "session-1",
      readThread: {
        ...readThread,
        turns: [
          {
            ...readThread.turns[0],
            items: [
              ...items,
              {
                id: "agent",
                type: "agentMessage",
                text: "https://example.com/a https://example.com/a",
              },
            ],
          },
        ],
      },
    });

    expect(model.outputContent).toHaveLength(6);
    expect(model.outputContent.filter((item) => item.kind === "link")).toEqual(
      [],
    );
  });

  it("expands every file in a multi-file change event", () => {
    const model = buildTaskPresentationModel({
      sessionId: "session-1",
      readThread: {
        ...readThread,
        turns: [
          {
            ...readThread.turns[0],
            items: [
              {
                id: "changes",
                type: "fileChange",
                status: "completed",
                changes: [
                  {
                    path: "src/first.ts",
                    kind: "update",
                    diff: { text: "+first" },
                  },
                  {
                    path: "src/second.ts",
                    kind: "create",
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(model.outputContent).toMatchObject([
      {
        id: "changes:0",
        detail: "src/first.ts",
        target: {
          kind: "review",
          path: "src/first.ts",
          diff: "+first",
        },
      },
      {
        id: "changes:1",
        detail: "src/second.ts",
        target: { kind: "file", path: "src/second.ts" },
      },
    ]);
  });

  it("applies created-task and source list limits", () => {
    const tasks = Array.from({ length: 7 }, (_, index) => ({
      id: `task-${index + 1}`,
      ordinal: index + 1,
      title: `任务 ${index + 1}`,
      status: "running" as const,
      createdAt: index + 1,
      updatedAt: index + 1,
    }));
    const sources = Array.from({ length: 7 }, (_, index) => ({
      id: `mcp-${index + 1}`,
      type: "mcpToolCall" as const,
      server: `server-${index + 1}`,
      tool: "tool",
      status: "completed" as const,
    }));
    const model = buildTaskPresentationModel({
      sessionId: "session-1",
      readThread: {
        ...readThread,
        turns: [{ ...readThread.turns[0], items: sources }],
      },
      tasks,
    });

    expect(model.tasks).toHaveLength(5);
    expect(model.tasks.at(-1)?.id).toBe("task-5");
    expect(model.sources).toHaveLength(6);
    expect(model.sources.at(-1)?.label).toBe("server-6");
  });

  it("keeps the summary surface available for an active empty session", () => {
    const model = buildTaskPresentationModel({
      sessionId: "empty",
      workspace: {
        id: "tmp",
        name: "tmp",
        path: "C:/tmp",
        lastOpenedAt: 1,
      },
      fallbackModelName: "fallback-model",
      securityMode: "request",
    });

    expect(model.hasData).toBe(true);
    expect(model.workspace?.path).toBe("C:/tmp");
    expect(model.modelName).toBe("fallback-model");
    expect(model.changes).toBeNull();
    expect(model.plan).toBeNull();
    expect(model.outputContent).toHaveLength(0);
    expect(model.tasks).toHaveLength(0);
    expect(model.scheduled).toHaveLength(0);
    expect(model.subagents).toHaveLength(0);
    expect(model.usage).toBeNull();
    expect(model.processes).toHaveLength(0);
    expect(model.browserPages).toHaveLength(0);
  });

  it("hides the surface when no session is active", () => {
    const model = buildTaskPresentationModel({ sessionId: null });
    expect(model.hasData).toBe(false);
  });
});
