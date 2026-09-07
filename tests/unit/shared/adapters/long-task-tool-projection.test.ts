import { describe, expect, it } from "vitest";
import { projectToolItem } from "@shared/adapters/tool-item-projection";
import { messageItemToWorkflowTurnItem } from "@shared/adapters/message-item-to-workflow-turn-item";
import { commandPresentation } from "../../../../client/renderer/src/components/workflow-chat/activity/command-presentation";

describe("tool states captured during real long tasks", () => {
  it("does not expose partial SDK argument JSON as a runnable command", () => {
    const projected = projectToolItem({
      id: "streaming-bash",
      type: "mcpToolCall",
      tool: "Bash",
      status: "pending",
      arguments: { raw: '{"command":"cd /workspace && rg' },
    });
    expect(projected).toMatchObject({
      type: "commandExecution",
      command: "",
      status: "pending",
    });
    if (projected?.type !== "commandExecution")
      throw new Error("Expected command");
    expect(commandPresentation(projected).label).toBe("正在准备命令");
  });

  it("keeps SDK text-block results readable and durable at the persistence boundary", () => {
    const result = messageItemToWorkflowTurnItem({
      id: "bash-result",
      type: "mcp_tool_call",
      phase: "completed",
      tool: "Bash",
      args: { command: "git status" },
      status: "completed",
      result: [
        { type: "text", text: "On branch codex/review\nworking tree clean" },
      ],
    });
    expect(result).toMatchObject({
      output: {
        text: "On branch codex/review\nworking tree clean",
        truncated: false,
      },
    });
  });

  it("preserves structured tool outputs instead of silently losing them", () => {
    const result = messageItemToWorkflowTurnItem({
      id: "structured-result",
      type: "mcp_tool_call",
      phase: "completed",
      tool: "inspect",
      status: "completed",
      result: { count: 7, files: ["src/app.ts"] },
    });
    expect(result.type).toBe("mcpToolCall");
    if (result.type !== "mcpToolCall") throw new Error("Expected tool");
    expect(JSON.parse(result.output!.text)).toEqual({
      count: 7,
      files: ["src/app.ts"],
    });
  });
});
