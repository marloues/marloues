import { describe, expect, it } from "vitest";
import { normalizeCodexItem } from "../../../../../client/main/codex/normalize";
import { createBinaryEventAdapter } from "../../../../../client/main/core/runtime/binary-event-adapter";
import { decodeWorkflowItemEvent } from "@shared/adapters/workflow-item-event";

describe("Binary runtime contract boundary", () => {
  it.each([
    { type: "plan", text: "检查实现" },
    {
      type: "dynamicToolCall",
      tool: "custom",
      arguments: { path: "src" },
      output: "result",
    },
    {
      type: "collabAgentToolCall",
      tool: "spawnAgent",
      receiverThreadIds: ["child"],
    },
    { type: "imageView", path: "/tmp/image.png" },
    {
      type: "imageGeneration",
      savedPath: "/tmp/generated.png",
      result: "image",
    },
    { type: "enteredReviewMode", review: { target: "branch" } },
    { type: "exitedReviewMode", review: { target: "branch" } },
    { type: "hookPrompt", fragmentCount: 2 },
    { type: "contextCompaction" },
    { type: "permissionRequest", toolName: "shell", reason: "Run tests" },
  ])(
    "preserves native $type items previously lost by the text-only bridge",
    (raw) => {
      const item = normalizeCodexItem(
        { id: "native-item", ...raw },
        {},
        "completed",
      )!;
      const events = createBinaryEventAdapter("turn")({
        type: "item.completed",
        item,
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "item-updated",
        payload: {
          turnId: "turn",
          item: { id: "native-item", type: raw.type, settled: true },
        },
      });
    },
  );

  it("preserves file diffs and failed status instead of marking every completed notification successful", () => {
    const item = normalizeCodexItem(
      {
        id: "patch",
        type: "fileChange",
        status: "failed",
        changes: [
          { path: "src/app.ts", kind: { type: "update" }, diff: "-old\n+new" },
        ],
      },
      {},
      "completed",
    )!;
    expect(
      createBinaryEventAdapter("turn")({ type: "item.completed", item })[0],
    ).toMatchObject({
      kind: "item-updated",
      payload: {
        item: {
          type: "fileChange",
          status: "failed",
          settled: true,
          changes: [
            {
              path: "src/app.ts",
              kind: "update",
              diff: { text: "-old\n+new" },
            },
          ],
        },
      },
    });
  });

  it("retains unknown native items for the contract fallback renderer", () => {
    const item = normalizeCodexItem(
      { id: "future", type: "futureEvent", detail: "new capability" },
      {},
      "completed",
    )!;
    expect(
      createBinaryEventAdapter("turn")({ type: "item.completed", item })[0],
    ).toMatchObject({
      kind: "item-updated",
      payload: {
        item: {
          id: "future",
          type: "unknown",
          rawType: "futureEvent",
          settled: true,
        },
      },
    });
  });

  it("decodes legacy reasoning explicitly and preserves canonical reasoning unchanged", () => {
    const legacy = decodeWorkflowItemEvent({
      type: "item.updated",
      sessionId: "s",
      turnId: "t",
      item: {
        id: "r",
        type: "reasoning",
        text: "reason",
        status: "completed",
        phase: "completed",
      },
    });
    expect(legacy.item).toMatchObject({
      type: "reasoning",
      summary: "reason",
      settled: true,
    });
    const canonical = {
      id: "r",
      type: "reasoning" as const,
      summary: "reason",
      settled: true,
    };
    expect(
      decodeWorkflowItemEvent({
        schemaVersion: 2,
        type: "item.updated",
        sessionId: "s",
        turnId: "t",
        item: canonical,
      }).item,
    ).toBe(canonical);
  });
});
