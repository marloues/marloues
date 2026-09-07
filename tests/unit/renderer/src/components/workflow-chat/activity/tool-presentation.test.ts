import { describe, expect, it } from "vitest";
import { toolLabel } from "../../../../../../../client/renderer/src/components/workflow-chat/activity/ToolCallRowDetails/labels";
import { detailTitle } from "../../../../../../../client/renderer/src/components/workflow-chat/activity/ToolCallRowDetails/helpers";
import {
  codexActivityItemStateLabel,
  codexActivityGroupSummaryLabel,
} from "../../../../../../../client/renderer/src/components/workflow-chat/activity/codex-activity-contract";
import { emptyActivitySummary } from "../../../../../../../client/renderer/src/components/workflow-chat/turns/turn-layout/tool-helpers";
import { summarizeActivityItems } from "../../../../../../../client/renderer/src/components/workflow-chat/turns/turn-layout/summary-helpers";

describe("host activity presentation across tool variants", () => {
  it("presents native and adapter read tools with the same file label", () => {
    const sdk = {
      type: "mcpToolCall" as const,
      id: "sdk",
      tool: "Read",
      arguments: { file_path: "/workspace/src/main.ts", offset: 1, limit: 100 },
      status: "completed",
    };
    const native = {
      type: "dynamicToolCall" as const,
      id: "native",
      tool: "read_file",
      arguments: JSON.stringify({ path: "/workspace/src/main.ts" }),
      status: "completed",
    };
    expect(toolLabel(sdk)).toBe("已读取 main.ts");
    expect(toolLabel(native)).toBe(toolLabel(sdk));
    expect(codexActivityItemStateLabel(sdk, true)).toBe("正在读取 main.ts");
    expect(detailTitle(sdk)).toBe("Read");
    expect(summarizeActivityItems([sdk]).exploredFileCount).toBe(1);
  });

  it("does not turn missing or partial arguments into a file name", () => {
    expect(
      toolLabel({
        type: "mcpToolCall",
        id: "pending",
        tool: "Read",
        status: "pending",
        arguments: { raw: '{"file_path":"/wo' },
      }),
    ).toBe("正在读取文件");
  });

  it("distinguishes file discovery, search, failure and interruption", () => {
    const glob = {
      type: "mcpToolCall" as const,
      id: "glob",
      tool: "Glob",
      status: "completed",
      arguments: { pattern: "**/*.ts" },
    };
    expect(toolLabel(glob)).toBe("已查找文件 **/*.ts");
    expect(summarizeActivityItems([glob]).listCount).toBe(1);
    expect(
      toolLabel({ ...glob, tool: "Grep", arguments: { pattern: "runtime" } }),
    ).toBe("已搜索 runtime");
    expect(toolLabel({ ...glob, status: "failed" })).toContain("失败");
    expect(toolLabel({ ...glob, status: "cancelled" })).toContain("已停止");
  });

  it("separates mixed activities and uses the same active command label", () => {
    expect(
      codexActivityGroupSummaryLabel(
        {
          ...emptyActivitySummary(),
          exploredFileCount: 1,
          searchCount: 1,
          commandCount: 1,
        },
        [],
      ),
    ).toBe("读取文件、搜索工作区、运行了命令");
    expect(
      codexActivityItemStateLabel({
        type: "commandExecution",
        id: "git",
        command: "cd /workspace && git status --short",
        status: "running",
      }),
    ).toBe("正在检查 Git 状态");
  });
});
