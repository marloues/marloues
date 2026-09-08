import type { WorkflowMessageBlock } from "@shared/adapters/workflow-messages-to-read-thread";
import type { ProcessItem } from "../turns/turn-layout";

export const componentFixtureCwd = "/component-gallery";
export const componentFixtureFiles: Record<string, string> = {
  "/component-gallery/example.css": "color: var(--text-1);\n",
  "/component-gallery/src/theme.ts":
    "// 组件展示页的示例文件\nexport const theme = {\n  text: 'var(--text-1)',\n  spacing: 'var(--space-3)',\n};\n",
  "/component-gallery/docs/样式说明.md":
    "# 样式说明\n\n颜色、字号和间距统一使用设计 token。\n这是展示页的示例内容。\n",
  "/component-gallery/src/ui/index.ts":
    "// UI 组件入口示例\nexport { Button } from './button';\n",
  "/component-gallery/src/runtime/index.ts":
    "// Runtime 入口示例\nexport { Runtime } from './runtime';\n",
};
export async function readComponentFixtureFile(path: string): Promise<string> {
  const text = componentFixtureFiles[path];
  if (text === undefined) throw new Error("示例文件不存在，请检查路径。");
  return text;
}

export const componentActivityExamples: Array<{
  title: string;
  item: ProcessItem;
}> = [
  {
    title: "读取文件 · 点击路径直接预览",
    item: {
      id: "gallery-read-file",
      type: "dynamicToolCall",
      tool: "read_file",
      arguments: { path: "src/theme.ts" },
      status: "completed",
      output: {
        text: componentFixtureFiles["/component-gallery/src/theme.ts"],
        truncated: false,
      },
      settled: true,
    },
  },
  {
    title: "读取指定行 · 定位第 3 行",
    item: {
      id: "gallery-read-line",
      type: "mcpToolCall",
      tool: "Read",
      arguments: { file_path: "src/theme.ts", offset: 3, limit: 2 },
      status: "completed",
      output: {
        text: "  text: 'var(--text-1)',\n  spacing: 'var(--space-3)',",
        truncated: false,
      },
      settled: true,
    },
  },
  {
    title: "读取多个文件 · 每个路径独立打开",
    item: {
      id: "gallery-read-files",
      type: "dynamicToolCall",
      tool: "read_files",
      arguments: { paths: ["src/theme.ts", "docs/样式说明.md"] },
      status: "completed",
      output: { text: "已读取 2 个示例文件。", truncated: false },
      settled: true,
    },
  },
  {
    title: "通过命令读取 · 同样显示文件路径",
    item: {
      id: "gallery-read-command",
      type: "commandExecution",
      command: "sed -n '2,4p' src/theme.ts",
      status: "completed",
      output: {
        text: "export const theme = {\n  text: 'var(--text-1)',\n  spacing: 'var(--space-3)',",
        truncated: false,
      },
      settled: true,
    },
  },
  {
    title: "思考内容",
    item: {
      id: "gallery-reasoning",
      type: "reasoning",
      summary: "先检查组件的职责，再确认颜色、字号和间距是否使用统一 token。",
      settled: true,
    },
  },
  {
    title: "命令完成 / 输入输出",
    item: {
      id: "gallery-command",
      type: "commandExecution",
      command: "npm run typecheck:web",
      status: "completed",
      output: { text: "类型检查通过，未发现错误。", truncated: false },
      settled: true,
    },
  },
  {
    title: "命令运行中",
    item: {
      id: "gallery-command-running",
      type: "commandExecution",
      command: "npm run test:unit",
      status: "running",
      output: { text: "正在检查组件交互…", truncated: false },
      settled: false,
    },
  },
  {
    title: "工具失败",
    item: {
      id: "gallery-tool-error",
      type: "dynamicToolCall",
      tool: "read_file",
      arguments: { path: "missing-example.txt" },
      status: "error",
      success: false,
      output: { text: "示例文件不存在，请检查路径。", truncated: false },
      settled: true,
    },
  },
  {
    title: "文件修改",
    item: {
      id: "gallery-file-change",
      type: "fileChange",
      status: "completed",
      changes: [
        {
          path: "example.css",
          kind: "update",
          diff: {
            text: "@@ -1 +1 @@\n-color: #fff;\n+color: var(--text-1);",
            truncated: false,
          },
        },
      ],
      settled: true,
    },
  },
  {
    title: "网页搜索",
    item: {
      id: "gallery-search",
      type: "webSearch",
      query: "设计规范与组件复用",
      status: "completed",
      output: { text: "找到 3 条示例结果。", truncated: false },
      settled: true,
    },
  },
  {
    title: "任务计划",
    item: {
      id: "gallery-plan",
      type: "plan",
      text: "- [x] 检查公共组件\n- [x] 对齐设计 token\n- [ ] 验证三种主题",
      settled: true,
    },
  },
  {
    title: "等待审批",
    item: {
      id: "gallery-permission",
      type: "permissionRequest",
      toolName: "shell_command",
      reason: "运行项目测试（展示示例）",
      status: "pending",
      settled: false,
    },
  },
  {
    title: "图片生成已取消",
    item: {
      id: "gallery-image-cancelled",
      type: "imageGeneration",
      revisedPrompt: "组件说明插图",
      status: "cancelled",
      settled: true,
    },
  },
  {
    title: "上下文压缩标记",
    item: {
      id: "gallery-compaction",
      type: "contextCompaction",
      settled: true,
    },
  },
];

export const turnExampleOptions = [
  ["completed", "完成与 Token 用量"],
  ["thinking", "等待首条输出"],
  ["running", "运行中"],
  ["responding", "正文生成中"],
  ["failed", "失败"],
  ["cancelled", "已取消"],
  ["legacy-long", "历史耗时 · 73 秒"],
  ["legacy-short", "历史耗时 · 4 秒"],
  ["unknown", "无计时记录"],
] as const;
export type TurnExample = (typeof turnExampleOptions)[number][0];

export function componentTurnExample(
  example: TurnExample,
  now: number,
): WorkflowMessageBlock {
  const thinking = example === "thinking";
  const running = thinking || example === "running" || example === "responding";
  const failed = example === "failed";
  const cancelled = example === "cancelled";
  const legacy = example.startsWith("legacy-");
  const unknown = example === "unknown";
  const start = running ? now - 5000 : 1788591600000;
  const elapsed =
    example === "legacy-long"
      ? 73209
      : example === "legacy-short"
        ? 4496
        : 12000;
  const id = `component-turn-${example}`;
  return {
    id,
    user: "检查公共组件的样式，并展示执行结果。",
    userContent: [
      { type: "text", text: "检查公共组件的样式，并展示执行结果。" },
    ],
    status: running
      ? "running"
      : failed
        ? "failed"
        : cancelled
          ? "cancelled"
          : "completed",
    activity: thinking
      ? "thinking"
      : example === "responding"
        ? "responding"
        : running
          ? "running"
          : failed
            ? "failed"
            : "done",
    startedAt: unknown ? undefined : start,
    completedAt: unknown || running ? undefined : start + elapsed,
    durationMs: legacy || unknown || running ? null : elapsed,
    timing:
      legacy || unknown
        ? undefined
        : {
            basis: "host-observed",
            workStartedAt: thinking ? null : start,
            finalAnswerStartedAt:
              example === "completed"
                ? start + elapsed
                : example === "responding"
                  ? start + 3000
                  : null,
          },
    usage: running
      ? undefined
      : {
          inputTokens: 1200,
          outputTokens: 640,
          totalTokens: 1840,
          modelContextWindowTokens: 128000,
        },
    error: failed ? { message: "连接中断，未能完成本次检查。请重试。" } : null,
    items: thinking
      ? []
      : [
          {
            type: "reasoning",
            id: `${id}-reasoning`,
            summary: "确认组件使用统一的颜色、字号和间距。",
            settled: true,
          },
          {
            type: "commandExecution",
            id: `${id}-command`,
            command: "npm run typecheck:web",
            status:
              example === "running"
                ? "running"
                : failed
                  ? "error"
                  : cancelled
                    ? "cancelled"
                    : "completed",
            output: {
              text:
                example === "running"
                  ? "正在检查…"
                  : failed
                    ? "连接中断"
                    : cancelled
                      ? "操作已取消"
                      : "类型检查通过。",
              truncated: false,
            },
            settled: example !== "running",
          },
          ...(!failed && !cancelled && example !== "running"
            ? [
                {
                  type: "agentMessage" as const,
                  id: `${id}-answer`,
                  phase: "final_answer",
                  text: "公共组件已使用统一样式。**颜色、字号和间距**随主题切换。",
                  settled: !running,
                },
              ]
            : []),
        ],
  };
}
