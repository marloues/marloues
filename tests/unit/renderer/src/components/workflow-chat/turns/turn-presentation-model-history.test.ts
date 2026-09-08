import { describe, expect, it } from "vitest";
import type { WorkflowMessageBlock } from "../../../../../../../client/shared/adapters/workflow-messages-to-read-thread";
import { buildTurnPresentationModel } from "../../../../../../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model";

describe("historical turn presentation", () => {
  it("keeps raw reasoning visible as a standalone Think row", () => {
    const message: WorkflowMessageBlock = {
      id: "history",
      user: "Inspect this session",
      userContent: [{ type: "text", text: "Inspect this session" }],
      status: "completed",
      activity: "done",
      durationMs: 1_000,
      items: [
        {
          type: "reasoning",
          id: "reasoning",
          summary: "Reasoning",
          content: [{ text: "Long historical reasoning", truncated: false }],
        },
        {
          type: "agentMessage",
          id: "answer",
          text: "Final answer",
          phase: "updated",
        },
      ],
    };

    const model = buildTurnPresentationModel(message, {
      isLastStreaming: false,
    });
    const process = model.blocks.find((block) => block.kind === "process");
    expect(process).toBeDefined();
    expect(process?.entries[0]?.kind).toBe("activityItem");
    expect(
      process?.entries[0]?.kind === "activityItem" &&
        process.entries[0].item.type,
    ).toBe("reasoning");
    expect(model.blocks.some((block) => block.kind === "document")).toBe(true);
  });
});
