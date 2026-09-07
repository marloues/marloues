import { describe, expect, it } from "vitest";
import { parseCodexRecordedSession } from "../../client/main/codex/jsonl-session";
import { codexRecordedItem } from "../../client/main/codex/jsonl-item";
import { WorkflowThreadStore } from "../../client/main/core/runtime/workflow-thread-store";
import { storedMessagesForRuntimeTurn } from "../../client/main/core/runtime/workflow-turn-persistence";
import { workflowTurnToWorkflowMessage } from "../../client/shared/adapters/workflow-messages-to-read-thread";
import { buildTurnPresentationModel } from "../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model";

const epoch = 1_788_600_000_000;
const entry = (type: string, payload: unknown) => ({
  type,
  timestamp: new Date(epoch).toISOString(),
  payload,
});
const completed = (item: Record<string, unknown>, start: number, end = start) =>
  entry("event_msg", {
    type: "item_completed",
    turn_id: "t1",
    item,
    started_at_ms: epoch + start,
    completed_at_ms: epoch + end,
  });
const records = () => [
  entry("session_meta", { id: "source-thread", cwd: "/repo" }),
  entry("event_msg", {
    type: "task_started",
    turn_id: "t1",
    started_at: epoch / 1000,
  }),
  completed(
    {
      type: "UserMessage",
      id: "user-1",
      client_id: "client-1",
      content: [
        {
          type: "text",
          text: "请查看附件",
          text_elements: [{ type: "mention", name: "a.ts" }],
        },
        { type: "localImage", path: "/repo/a.png" },
        { type: "localImage", path: "/repo/a.png" },
      ],
    },
    100,
  ),
  entry("response_item", {
    type: "custom_tool_call",
    call_id: "wrapper",
    name: "exec",
    input: "wrapper call",
  }),
  completed(
    {
      type: "Reasoning",
      id: "reason",
      summary_text: [],
      raw_content: ["not displayable"],
    },
    500,
    900,
  ),
  completed(
    {
      type: "AgentMessage",
      id: "progress",
      content: [{ type: "Text", text: "正在检查" }],
      phase: "commentary",
    },
    1000,
    1300,
  ),
  completed(
    {
      type: "CommandExecution",
      id: "cmd",
      command: ["/bin/zsh", "-lc", "cat a.ts"],
      cwd: "/repo",
      status: "completed",
      aggregated_output: "real file",
      exit_code: 0,
      duration: { secs: 1, nanos: 250_000_000 },
      process_id: "9",
    },
    1400,
    2650,
  ),
  entry("response_item", {
    type: "message",
    role: "assistant",
    phase: "final_answer",
    content: [{ type: "output_text", text: "结果" }],
  }),
  completed(
    {
      type: "AgentMessage",
      id: "final",
      content: [{ type: "Text", text: "结果" }],
      phase: "final_answer",
    },
    3000,
    3500,
  ),
  entry("event_msg", {
    type: "task_complete",
    turn_id: "t1",
    completed_at: epoch / 1000 + 4,
    duration_ms: 3975,
    last_agent_message: "结果",
  }),
];
const decode = (rows = records(), throughLine?: number) =>
  parseCodexRecordedSession(rows.map((row) => JSON.stringify(row)).join("\n"), {
    source: "/local/source.jsonl",
    throughLine,
  })!;

describe("recorded Codex JSONL replay", () => {
  it("uses completed UI items once, keeps identity, phases and recorded timing", () => {
    const { readThread, audit } = decode();
    const turn = readThread.turns[0];
    expect(turn.id).toBe("t1");
    expect(turn.items.map((item) => item.id)).toEqual([
      "user-1",
      "reason",
      "progress",
      "cmd",
      "final",
    ]);
    expect(turn.items[0]).toMatchObject({
      clientId: "client-1",
      content: [
        { type: "text", text_elements: [{ type: "mention", name: "a.ts" }] },
        { path: "/repo/a.png" },
        { path: "/repo/a.png" },
      ],
    });
    expect(turn.items[2]).toMatchObject({ phase: "commentary" });
    expect(turn.items[3]).toMatchObject({
      command: "cat a.ts",
      shell: "/bin/zsh",
      output: { text: "real file" },
      durationMs: 1250,
      exitCode: 0,
    });
    expect(turn.durationMs).toBe(3975);
    expect(turn.timing).toEqual({
      basis: "codex-recorded",
      workStartedAt: epoch,
      finalAnswerStartedAt: epoch + 3000,
    });
    expect(JSON.stringify(readThread)).not.toContain("not displayable");
    expect(audit.omittedTransportRecords).toBe(2);
    expect(audit.items.find((i) => i.itemId === "cmd")).toMatchObject({
      line: 7,
      retainedInSourceFields: ["process_id"],
    });
    expect(audit.missingTerminalItems).toEqual([]);
  });

  it("checkpoints contain no future answer; duration moves when the recorded final arrives", () => {
    const before = decode(records(), 7).readThread.turns[0];
    const after = decode(records(), 9).readThread.turns[0];
    expect(before.status).toBe("running");
    expect(before.items.some((i) => i.id === "final")).toBe(false);
    const model = (turn: typeof before) =>
      buildTurnPresentationModel(workflowTurnToWorkflowMessage(turn), {
        isLastStreaming: true,
      });
    expect(model(before).runtime.timingPlacement).toBe("before-process");
    expect(model(after).runtime.timingPlacement).toBe("before-answer");
    expect(model(after).runtime.durationMs).toBe(3000);
    expect(model(after).runtime.clockRunning).toBe(false);
  });

  it("reports missing final records and unknown kinds instead of guessing", () => {
    const rows = records();
    rows.splice(
      8,
      1,
      completed({ type: "FutureCard", id: "future", value: "retained" }, 3000),
    );
    const { readThread, audit } = decode(rows);
    expect(readThread.turns[0].items.at(-1)).toMatchObject({
      type: "unknown",
      rawType: "FutureCard",
      raw: { value: "retained" },
    });
    expect(audit.missingTerminalItems).toEqual(["t1"]);
  });

  it("keeps late user input in separate display segments and round-trips via persistence", () => {
    const rows = records();
    rows.splice(
      7,
      0,
      completed(
        {
          type: "UserMessage",
          id: "user-2",
          content: [{ type: "text", text: "补充要求" }],
        },
        2700,
      ),
    );
    const { readThread } = decode(rows);
    expect(readThread.turns.map((turn) => turn.id)).toEqual([
      "t1:steer:user-2",
      "t1",
    ]);
    const persisted = storedMessagesForRuntimeTurn(readThread, "t1");
    const host = new WorkflowThreadStore();
    host.rehydrateFromStoredMessages("replay", persisted);
    const restored = host.readThread({ threadId: "replay" });
    expect(restored.turns.map((turn) => turn.id)).toEqual(
      readThread.turns.map((turn) => turn.id),
    );
    expect(restored.turns[1].items[0]).toEqual(readThread.turns[1].items[0]);
    expect(restored.turns[0].items).toEqual(readThread.turns[0].items);
    expect(restored.turns[1].durationMs).toBe(3975);
    expect(restored.turns[1].timing).toEqual(readThread.turns[1].timing);
  });

  it("preserves all MCP result content and file diffs", () => {
    const result = {
      content: [
        { type: "text", text: "hello" },
        { type: "resource_link", uri: "file:///a", name: "a" },
      ],
      structuredContent: { answer: 42 },
      isError: false,
    };
    expect(
      codexRecordedItem({ type: "McpToolCall", id: "mcp", result }, "fallback")
        .item,
    ).toMatchObject({ result, output: { text: JSON.stringify(result) } });
    const change = codexRecordedItem(
      {
        type: "FileChange",
        id: "patch",
        status: "failed",
        changes: {
          "/a": {
            type: "update",
            unified_diff: "@@ -1 +1 @@\n-before\n+after",
          },
        },
      },
      "fallback",
    ).item;
    expect(change).toMatchObject({
      status: "failed",
      changes: [
        {
          path: "/a",
          kind: "update",
          diff: { text: "@@ -1 +1 @@\n-before\n+after" },
        },
      ],
    });
  });

  it("replaces repeated item snapshots without reordering and reports malformed lines", () => {
    const rows = records();
    rows.splice(
      7,
      0,
      completed(
        {
          type: "CommandExecution",
          id: "cmd",
          command: "cat a.ts",
          aggregated_output: "updated",
          status: "completed",
        },
        1400,
        2650,
      ),
    );
    const text =
      rows.map((row) => JSON.stringify(row)).join("\n") + '\n{"unfinished":';
    const { readThread, audit } = parseCodexRecordedSession(text, {
      source: "local",
    })!;
    expect(
      readThread.turns[0].items.filter((i) => i.id === "cmd"),
    ).toHaveLength(1);
    expect(readThread.turns[0].items[3]).toMatchObject({
      output: { text: "updated" },
    });
    expect(audit.invalidLines).toEqual([12]);
  });
});
