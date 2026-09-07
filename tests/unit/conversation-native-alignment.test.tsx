import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkflowTurnItem } from "@shared/workflow-read-thread-contract";
import { workflowTurnToWorkflowMessage } from "@shared/adapters/workflow-messages-to-read-thread";
import { parseCodexRecordedSession } from "../../client/main/codex/jsonl-session";
import { codexRecordedItem } from "../../client/main/codex/jsonl-item";
import { buildTurnPresentationModel } from "../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model";
import { workflowTurnDurationLabel } from "../../client/renderer/src/components/workflow-chat/turns/turn-status";
import { workflowUserMessagePresentation } from "../../client/renderer/src/components/workflow-chat/turns/user-message-contract";
import { workflowTurnLayout } from "../../client/renderer/src/components/workflow-chat/turns/turn-layout";
import { commandPresentation } from "../../client/renderer/src/components/workflow-chat/activity/command-presentation";
import { WorkflowResultCards } from "../../client/renderer/src/components/workflow-chat/activity/ResultCards";
import { WorkflowMarkdownProvider } from "../../client/renderer/src/components/workflow-chat/content/MarkdownContext";

describe("native comparison regressions", () => {
  it.each([
    ["", ""],
    ["const answer = 1;\n", "+const answer = 1;"],
    ["const answer = 1;\r\n", "+const answer = 1;"],
    ["\n", "+"],
    ["one\n\n", "+one\n+"],
  ])(
    "does not count a phantom final line in native added content %j",
    (content, diff) => {
      const { item } = codexRecordedItem(
        {
          type: "FileChange",
          id: "native-add",
          status: "completed",
          changes: { "file.ts": { type: "add", content } },
        },
        "fallback",
      );
      expect(item.type).toBe("fileChange");
      if (item.type === "fileChange")
        expect(item.changes[0].diff?.text).toBe(diff);
    },
  );
  const start = 1788679262809;
  const final = 1788679339125;
  const row = (timestamp: number, payload: unknown) => ({
    timestamp: new Date(timestamp).toISOString(),
    type: "event_msg",
    payload,
  });
  const recorded = (timestamp = start) => [
    row(timestamp, {
      type: "task_started",
      turn_id: "t",
      started_at: 1788679262,
    }),
    row(start + 3000, {
      type: "item_completed",
      turn_id: "t",
      started_at_ms: start + 3000,
      item: {
        type: "AgentMessage",
        id: "progress",
        phase: "commentary",
        content: [{ type: "Text", text: "检查中" }],
      },
    }),
    row(final + 1000, {
      type: "item_completed",
      turn_id: "t",
      started_at_ms: final,
      item: {
        type: "AgentMessage",
        id: "final",
        phase: "final_answer",
        content: [{ type: "Text", text: "完成" }],
      },
    }),
    row(final + 2000, {
      type: "task_complete",
      turn_id: "t",
      completed_at: 1788679341,
    }),
  ];
  const decode = (rows = recorded()) =>
    parseCodexRecordedSession(rows.map((r) => JSON.stringify(r)).join("\n"), {
      source: "native-regression",
    })!.readThread.turns[0];

  it("retains subsecond start precision and matches the observed 1m16s", () => {
    const model = buildTurnPresentationModel(
      workflowTurnToWorkflowMessage(decode()),
      { isLastStreaming: false },
    );
    expect(model.runtime.durationMs).toBe(76316);
    expect(workflowTurnDurationLabel(model.runtime.durationMs)).toBe(
      "1分钟 16秒",
    );
  });
  it("does not replace an event time with a delayed log timestamp", () => {
    expect(decode(recorded(start + 10000)).startedAt).toBe(1788679262000);
  });
  it("decodes composer escaping once while retaining the original protocol text", () => {
    const text =
      "\\# 标题\\\n\\\n\\*\\*粗体\\*\\*\\\n&#x20; \\- 嵌套\\\n[https://example.com](https://example.com)\\\n\\int\\_0^1 x^2 \\\\, dx";
    const content = [
      { type: "text" as const, text, displayFormat: "markdown" as const },
    ];
    const shown = workflowUserMessagePresentation(content);
    expect(shown.text).toBe(
      "# 标题\n\n**粗体**\n  - 嵌套\nhttps://example.com\n\\int_0^1 x^2 \\, dx",
    );
    expect(shown.protocolContent).toBe(content);
    expect(content[0].text).toBe(text);
  });
  it("preserves ordinary code, paths, math and literal entity text", () => {
    const text = String.raw`C:\work\[files] \\server\share $\int_0^1 x\,dx$ &#x20;`;
    expect(workflowUserMessagePresentation([], text).text).toBe(text);
    const command = "printf '%s' \\\n  'value'";
    expect(workflowUserMessagePresentation([], command).text).toBe(command);
  });
  it("keeps a failed command in its activity group with its exit code and output", () => {
    const failed = {
      type: "commandExecution" as const,
      id: "failed",
      status: "failed",
      command: "printf '预期失败输出\\n'\nexit 1",
      exitCode: 1,
      output: { text: "预期失败输出\n", truncated: false },
    };
    const items: WorkflowTurnItem[] = [
      {
        ...failed,
        id: "before",
        status: "completed",
        command: "pwd",
        exitCode: 0,
      },
      failed,
      {
        ...failed,
        id: "after",
        status: "completed",
        command: "ls",
        exitCode: 0,
      },
      {
        type: "agentMessage",
        id: "answer",
        phase: "final_answer",
        text: "完成",
      },
    ];
    const layout = workflowTurnLayout(
      workflowTurnToWorkflowMessage({
        id: "t",
        status: "completed",
        items,
        error: null,
      }),
    );
    const groups = layout.leadingFlow.filter((e) => e.kind === "activityGroup");
    expect(groups).toHaveLength(1);
    expect(groups[0].group.items.map((i) => i.id)).toEqual([
      "before",
      "failed",
      "after",
    ]);
    expect(commandPresentation(failed)).toMatchObject({
      failed: true,
      exitCode: 1,
      statusText: "失败",
      detailOutput: "预期失败输出",
    });
    expect(commandPresentation(failed).label).toMatch(/^已运行/);
  });
  it("sums both create and update diffs and sorts workspace-relative file names", () => {
    const html = renderToStaticMarkup(
      <WorkflowMarkdownProvider value={{ cwd: "/repo" }}>
        <WorkflowResultCards
          items={[
            {
              type: "fileChange",
              id: "create",
              status: "completed",
              changes: [
                {
                  path: "/repo/outputs/evidence.ts",
                  kind: "add",
                  diff: {
                    text: "*** Add File: /repo/outputs/evidence.ts\n+const answer = 1;",
                    truncated: false,
                  },
                },
                {
                  path: "/repo/outputs/empty.bin",
                  kind: "add",
                  diff: { text: "", truncated: false },
                },
              ],
            },
            {
              type: "fileChange",
              id: "update",
              status: "completed",
              changes: [
                {
                  path: "/repo/outputs/evidence.ts",
                  kind: "update",
                  diff: {
                    text: "@@ -1 +1 @@\n-const answer = 1;\n+const answer = 42;",
                    truncated: false,
                  },
                },
              ],
            },
            {
              type: "fileChange",
              id: "failed-edit",
              status: "failed",
              changes: [
                {
                  path: "/repo/outputs/evidence.ts",
                  kind: "update",
                  diff: { text: "+not applied", truncated: false },
                },
              ],
            },
          ]}
        />
      </WorkflowMarkdownProvider>,
    );
    expect(html).toContain("<b>+2</b><em>-1</em>");
    expect(html.indexOf(">outputs/empty.bin<")).toBeLessThan(
      html.indexOf(">outputs/evidence.ts<"),
    );
    expect(html).toContain('title="/repo/outputs/evidence.ts"');
    expect(html).not.toContain("not applied");
  });
});
