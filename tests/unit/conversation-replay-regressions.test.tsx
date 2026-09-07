import { describe, it, expect, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { workflowShouldShowActivityItem } from "../../client/renderer/src/components/workflow-chat/turns/turn-collapse-rules";
import { buildTurnPresentationModel } from "../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model";
import { WorkflowFileChangeRow } from "../../client/renderer/src/components/workflow-chat/activity/FileChangeRow";
import { workflowThreadStore } from "../../client/main/core/runtime/workflow-thread-store";
import { storedMessagesForRuntimeTurn } from "../../client/main/core/runtime/workflow-turn-persistence";
import { workflowTurnToWorkflowMessage } from "@shared/adapters/workflow-messages-to-read-thread";
const id = "replay-error-details";
afterEach(() => workflowThreadStore.deleteThread(id));
describe("full conversation replay regressions", () => {
  it.each(["rejected", "cancelled"])(
    "keeps a %s file edit discoverable without reporting an applied result",
    (status) => {
      const item = {
        type: "fileChange" as const,
        id: "edit",
        status,
        changes: [{ path: "a.ts", kind: "update" }],
      };
      expect(workflowShouldShowActivityItem(item)).toBe(true);
      const html = renderToStaticMarkup(<WorkflowFileChangeRow item={item} />);
      expect(html).toContain(
        status === "rejected" ? "编辑已拒绝" : "编辑已停止",
      );
      expect(html).not.toContain("已编辑");
    },
  );
  it("keeps web tool process even when it also supplies a result preview", () => {
    expect(
      workflowShouldShowActivityItem({
        type: "webSearch",
        id: "search",
        query: "q",
        action: { type: "search" },
      }),
    ).toBe(true);
    expect(
      workflowShouldShowActivityItem({
        type: "dynamicToolCall",
        id: "browser",
        tool: "js",
        arguments: {},
        status: "completed",
      }),
    ).toBe(true);
  });
  it("restores additional error details and retains already applied files in a failed turn", () => {
    workflowThreadStore.rehydrateFromStoredMessages(id, [
      {
        id: "a",
        turnId: "turn",
        role: "assistant",
        timestamp: 1000,
        status: "failed",
        error: "Connection lost",
        errorDetails: { attempt: 2, source: "runtime" },
        content: "Partial answer",
        items: [
          {
            type: "fileChange",
            id: "applied",
            status: "completed",
            changes: [{ path: "a.ts", kind: "update" }],
          },
          {
            type: "agentMessage",
            id: "answer",
            phase: "final_answer",
            text: "Partial answer",
          },
        ],
      },
    ]);
    const turn = workflowThreadStore.readThread({ threadId: id }).turns[0];
    expect(turn.error?.additionalDetails).toEqual({
      attempt: 2,
      source: "runtime",
    });
    const model = buildTurnPresentationModel(
      workflowTurnToWorkflowMessage(turn),
      { isLastStreaming: false },
    );
    expect(
      model.blocks.some(
        (b) => b.kind === "results" && b.items.some((i) => i.id === "applied"),
      ),
    ).toBe(true);
    const stored = storedMessagesForRuntimeTurn(
      workflowThreadStore.readThread({ threadId: id }),
      "turn",
    );
    expect(stored.find((m) => m.role === "assistant")?.errorDetails).toEqual({
      attempt: 2,
      source: "runtime",
    });
  });
});
