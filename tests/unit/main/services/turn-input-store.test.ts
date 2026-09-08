import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { WorkflowUserMessageContent } from "../../../../client/shared/workflow-read-thread-contract";

vi.mock("electron", () => ({ app: undefined }));

const originalHome = process.env.MARLOUES_HOME;
const testHome = mkdtempSync(join(tmpdir(), "marloues-turn-input-"));
process.env.MARLOUES_HOME = testHome;

afterAll(async () => {
  const { closeStateDbForTests } =
    await import("../../../../client/main/core/storage/state-db");
  closeStateDbForTests();
  if (originalHome === undefined) delete process.env.MARLOUES_HOME;
  else process.env.MARLOUES_HOME = originalHome;
});

describe("turn input store", () => {
  it("round-trips every canonical input type and snapshots binary/text assets", async () => {
    const localImagePath = join(testHome, "local.png");
    const localImageBytes = Buffer.from("local-image-bytes");
    writeFileSync(localImagePath, localImageBytes);
    const imageDataUrl = `data:image/png;base64,${Buffer.from(
      "uploaded-image-bytes",
    ).toString("base64")}`;
    const screenshotDataUrl = `data:image/png;base64,${Buffer.from(
      "browser-screenshot-bytes",
    ).toString("base64")}`;
    const content: WorkflowUserMessageContent[] = [
      { type: "text", text: "请综合处理这些输入" },
      {
        type: "image",
        url: imageDataUrl,
        name: "upload.png",
        mimeType: "image/png",
        size: 20,
      },
      {
        type: "localImage",
        path: localImagePath,
        name: "local.png",
        mimeType: "image/png",
      },
      {
        type: "file",
        name: "notes.md",
        mimeType: "text/markdown",
        text: "# durable file\n完整内容",
        path: "/workspace/notes.md",
      },
      { type: "url", url: "https://example.com/spec", title: "Spec" },
      {
        type: "skill",
        id: "skill-1",
        name: "reviewer",
        path: "/skills/reviewer/SKILL.md",
        version: "1.2.3",
      },
      { type: "mention", name: "src/index.ts", path: "src/index.ts" },
      {
        type: "browserComment",
        commentId: 7,
        targetType: "element",
        ref: "button#save",
        tagName: "BUTTON",
        text: "Save",
        attributes: { id: "save" },
        rect: { x: 1, y: 2, width: 80, height: 24 },
        viewport: { width: 1280, height: 720 },
        scrollX: 0,
        scrollY: 120,
        comment: "按钮需要更明显",
        pageUrl: "https://example.com/editor",
        screenshotDataUrl,
      },
    ];

    const store =
      await import("../../../../client/main/services/turn-input-store");
    const saved = store.persistTurnInput({
      sessionId: "session-1",
      turnId: "turn-1",
      messageId: "message-1",
      content,
      runtimeId: "binary",
      modelId: "gpt-test",
      createdAt: 100,
    });

    expect(saved.created).toBe(true);
    expect(saved.content).toHaveLength(8);
    expect(saved.content[0]).toEqual(content[0]);
    expect(saved.content[1]).toEqual(content[1]);
    expect(saved.content[3]).toEqual(content[3]);
    expect(saved.content.slice(4, 7)).toEqual(content.slice(4, 7));
    expect(saved.content[7]).toEqual(content[7]);

    const hydratedLocalImage = saved.content[2];
    expect(hydratedLocalImage.type).toBe("localImage");
    if (hydratedLocalImage.type !== "localImage")
      throw new Error("unreachable");
    expect(hydratedLocalImage.path).not.toBe(localImagePath);
    expect(readFileSync(hydratedLocalImage.path)).toEqual(localImageBytes);

    const { getStateDb } =
      await import("../../../../client/main/core/storage/state-db");
    const database = getStateDb();
    const persisted = database
      .prepare("SELECT content_json FROM turn_inputs WHERE id = ?")
      .get(saved.id) as { content_json: string };
    expect(persisted.content_json).not.toContain("uploaded-image-bytes");
    expect(persisted.content_json).not.toContain("durable file");
    expect(
      (
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM turn_input_assets WHERE input_id = ?",
          )
          .get(saved.id) as { count: number }
      ).count,
    ).toBe(4);

    const duplicate = store.persistTurnInput({
      sessionId: "session-1",
      turnId: "turn-retry",
      messageId: "message-1",
      content,
    });
    expect(duplicate.created).toBe(false);
    expect(duplicate.id).toBe(saved.id);

    const attemptId = store.createDeliveryAttempt({
      inputId: saved.id,
      turnId: "turn-1",
      runtimeId: "binary",
      modelId: "gpt-test",
      report: { partTypes: saved.content.map((part) => part.type) },
    });
    store.updateTurnInputState(saved.id, "dispatching");
    store.updateDeliveryAttempt(attemptId, "completed", {
      payloadSha256: "payload-digest",
    });
    store.updateTurnInputState(saved.id, "completed");

    expect(store.getTurnInput("session-1", "message-1")?.state).toBe(
      "completed",
    );
    expect(
      database
        .prepare("SELECT state FROM delivery_attempts WHERE id = ?")
        .get(attemptId),
    ).toEqual({ state: "completed" });
  });

  it("keeps immutable revisions when an edited message reuses its UI id", async () => {
    const { persistTurnInput } =
      await import("../../../../client/main/services/turn-input-store");
    const first = persistTurnInput({
      sessionId: "session-conflict",
      turnId: "turn-a",
      messageId: "same-message",
      content: [{ type: "text", text: "first" }],
    });
    const edited = persistTurnInput({
      sessionId: "session-conflict",
      turnId: "turn-b",
      messageId: "same-message",
      content: [{ type: "text", text: "changed" }],
    });
    expect(first.revision).toBe(1);
    expect(edited.revision).toBe(2);
    expect(edited.id).not.toBe(first.id);
    expect(edited.content).toEqual([{ type: "text", text: "changed" }]);
  });
});
