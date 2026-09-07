import { describe, expect, it } from "vitest";
import {
  cleanCommandOutput,
  commandPresentation,
  formatShellLabel,
  inferShellLabel,
  readableCommandLabel,
} from "../../../../../../../client/renderer/src/components/workflow-chat/activity/command-presentation";
import { commandDisplayText } from "../../../../../../../client/renderer/src/components/workflow-chat/activity/command-display";

describe("command presentation", () => {
  it("removes execution metadata while preserving command output", () => {
    expect(
      cleanCommandOutput(
        "Exit code: 0\nWall time: 0.4 seconds\nOutput:\n71 tests passed",
      ),
    ).toBe("71 tests passed");
  });

  it("maps common commands to concise activity labels", () => {
    expect(readableCommandLabel("git status --short")).toBe("已检查 Git 状态");
    expect(readableCommandLabel("rg -n workflow src")).toBe("已搜索工作区");
    expect(readableCommandLabel("Get-Content src/main.ts")).toBe(
      "已读取 main.ts",
    );
  });

  it("normalizes explicit shells and infers PowerShell commands", () => {
    expect(formatShellLabel("pwsh.exe")).toBe("PowerShell");
    expect(formatShellLabel("/bin/zsh")).toBe("Zsh");
    expect(inferShellLabel("Get-ChildItem src")).toBe("PowerShell");
  });

  it("summarizes a real task command once and preserves its full details", () => {
    const command =
      'cd "/workspace/my project" && npm run test:unit -- --run tests/unit/render.test.ts 2>&1 | tail -60';
    const result = commandPresentation({
      type: "commandExecution",
      id: "test",
      command,
      status: "completed",
    });
    expect(result.label).toBe(
      "已运行 npm run test:unit -- --run tests/unit/render.test.ts 2>&1 | tail -60",
    );
    expect(result.meta).toBe("");
    expect(result.input).toBe(command);
    expect(
      readableCommandLabel("cd /workspace && git status --short 2>/dev/null"),
    ).toBe("已检查 Git 状态");
  });

  it("only removes literal directory setup from the display", () => {
    expect(commandDisplayText("cd '/workspace/a && b' && rg --files src")).toBe(
      "rg --files src",
    );
    expect(commandDisplayText('cd "$(resolve_workspace)" && npm test')).toBe(
      'cd "$(resolve_workspace)" && npm test',
    );
    expect(commandDisplayText("cd /workspace; npm test")).toBe(
      "cd /workspace; npm test",
    );
  });

  it("keeps the status of multiple command blocks accurate", () => {
    const item = {
      type: "commandExecution" as const,
      id: "multi",
      command: "npm test\n\ngit status",
    };
    expect(commandPresentation({ ...item, status: "running" }).label).toBe(
      "正在运行 2 条命令",
    );
    expect(commandPresentation({ ...item, status: "failed" })).toMatchObject({
      label: "已运行 2 条命令",
      statusKind: "failed",
      statusText: "失败",
      failed: true,
    });
    expect(
      commandPresentation({ ...item, status: "cancelled" }).label,
    ).toContain("已停止");
  });
});
