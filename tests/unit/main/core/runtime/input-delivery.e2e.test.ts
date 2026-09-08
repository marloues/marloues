import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { WorkflowUserMessageContent } from "@shared/workflow-read-thread-contract";
import type { SkillInfo } from "@shared/types";

vi.mock("electron", () => ({ app: undefined }));

const originalHome = process.env.MARLOUES_HOME;
const testHome = mkdtempSync(join(tmpdir(), "marloues-delivery-"));
process.env.MARLOUES_HOME = testHome;

const REAL_LOCAL_IMAGE = fileURLToPath(
  new URL("../../../../../client/resources/tray-icon.png", import.meta.url),
);
const REAL_PNG = "data:image/png;base64,aGVsbG8gaW1hZ2UgcGl4ZWxz";
const SCREENSHOT_PNG = "data:image/png;base64,c2NyZWVuc2hvdCBwaXhlbHM";

afterAll(async () => {
  const { closeStateDbForTests } =
    await import("../../../../../client/main/core/storage/state-db");
  closeStateDbForTests();
  if (originalHome === undefined) delete process.env.MARLOUES_HOME;
  else process.env.MARLOUES_HOME = originalHome;
});

function enabledSkills(): SkillInfo[] {
  return [
    {
      id: "skill:reviewer",
      name: "reviewer",
      path: "/trusted/skills/reviewer",
      scope: "project",
      enabled: true,
      version: "1.0.0",
    },
  ];
}

function allInputs(): WorkflowUserMessageContent[] {
  return [
    { type: "text", text: "请综合处理这些输入" },
    {
      type: "image",
      url: REAL_PNG,
      detail: "high",
      name: "upload.png",
      mimeType: "image/png",
      size: 18,
    },
    {
      type: "localImage",
      path: REAL_LOCAL_IMAGE,
      name: "local.png",
      mimeType: "image/png",
    },
    {
      type: "file",
      name: "notes.md",
      mimeType: "text/markdown",
      text: "# durable file\n完整正文内容",
      path: "/workspace/notes.md",
    },
    { type: "url", url: "https://example.com/spec", title: "完整规格" },
    {
      type: "skill",
      id: "skill:reviewer",
      name: "forged-name",
      path: "/tmp/evil/SKILL.md",
      version: "9.9.9",
    },
    { type: "mention", name: "src/index.ts", path: "src/index.ts" },
    {
      type: "browserComment",
      commentId: 7,
      targetType: "element",
      ref: "button#save",
      tagName: "BUTTON",
      text: "Save",
      attributes: { id: "save", role: "button" },
      rect: { x: 1, y: 2, width: 80, height: 24 },
      viewport: { width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 120,
      comment: "按钮需要更明显",
      pageUrl: "https://example.com/editor",
      screenshotDataUrl: SCREENSHOT_PNG,
    },
  ];
}

function sdkText(blocks: Array<Record<string, unknown>>): string {
  return blocks
    .filter((block) => block.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("\n");
}

function sdkImages(blocks: Array<Record<string, unknown>>): Array<{
  type: string;
  media_type: string;
  data: string;
}> {
  return blocks
    .filter((block) => block.type === "image")
    .map((block) => block.source as never);
}

function codexTextOf(
  inputs: ReadonlyArray<{ type: string; text?: string }>,
): string {
  const item = inputs.find((entry) => entry.type === "text");
  return item?.text ?? "";
}

describe("end-to-end input delivery", () => {
  it("persists every input kind, hydrates it back, and lands it in the final model payload", async () => {
    const { persistTurnInput, getTurnInput } =
      await import("../../../../../client/main/services/turn-input-store");
    const { buildSdkUserContent } =
      await import("../../../../../client/main/core/runtime/sdk-content");
    const { projectCodexTurnInput } =
      await import("../../../../../client/main/codex/input-adapter");

    const inputs = allInputs();
    const saved = persistTurnInput({
      sessionId: "session-e2e",
      turnId: "turn-e2e",
      messageId: "message-e2e",
      content: inputs,
      runtimeId: "sdk",
      modelId: "claude-model",
      createdAt: 100,
    });
    expect(saved.created).toBe(true);
    expect(saved.content).toHaveLength(8);

    // Re-hydrate from the durable record (the source of truth), not the in-memory input.
    const hydrated = getTurnInput("session-e2e", "message-e2e");
    expect(hydrated).not.toBeNull();
    const content = hydrated!.content;
    expect(content).toHaveLength(8);

    // --- Claude SDK projection ---
    const sdkResult = (await buildSdkUserContent(
      "用户主文本",
      undefined,
      true,
      content,
      enabledSkills(),
    )) as Array<Record<string, unknown>>;
    const sdkTextValue = sdkText(sdkResult);

    expect(sdkResult[0]).toEqual({ type: "text", text: "用户主文本" });
    expect(sdkImages(sdkResult)).toContainEqual({
      type: "base64",
      media_type: "image/png",
      data: "aGVsbG8gaW1hZ2UgcGl4ZWxz",
    });
    expect(
      sdkImages(sdkResult).some((img) => img.media_type === "image/png"),
    ).toBe(true);
    expect(sdkTextValue).toContain("完整正文内容");
    expect(sdkTextValue).toContain("notes.md");
    expect(sdkTextValue).toContain("https://example.com/spec");
    expect(sdkTextValue).toContain('status="resolved"');
    expect(sdkTextValue).toContain('"claudeCommand":"/reviewer"');
    expect(sdkTextValue).not.toContain("/tmp/evil");
    expect(sdkTextValue).toContain("src/index.ts");
    expect(sdkTextValue).toContain("按钮需要更明显");
    expect(sdkTextValue).toContain("button#save");
    expect(sdkTextValue).toContain('"screenshotDelivery":"native-image-block"');

    // --- Codex projection ---
    const codexInput = projectCodexTurnInput("用户主文本", content, {
      cwd: "/workspace",
      availableSkills: [
        {
          id: "skill:reviewer",
          name: "reviewer",
          path: "/trusted/skills/reviewer",
        },
      ],
    });
    const codexText = codexTextOf(codexInput);

    expect(codexInput).toContainEqual({
      type: "image",
      url: REAL_PNG,
      detail: "high",
    });
    // localImage is content-addressed into the managed asset store on persist,
    // so its path is rewritten to the managed copy rather than the source path.
    const codexLocalImage = codexInput.find(
      (entry) => entry.type === "localImage",
    ) as { type: "localImage"; path: string } | undefined;
    expect(codexLocalImage).toBeDefined();
    expect(codexLocalImage!.path).toMatch(
      /\/marloues-delivery-[^/]+\/state\/input-assets\/[0-9a-f]+\.png$/,
    );
    expect(codexLocalImage!.path).not.toBe(REAL_LOCAL_IMAGE);
    expect(codexInput).toContainEqual({
      type: "skill",
      name: "reviewer",
      path: "/trusted/skills/reviewer/SKILL.md",
    });
    expect(codexText).toContain("完整正文内容");
    expect(codexText).toContain("https://example.com/spec");
    expect(codexText).toContain("src/index.ts");
    expect(codexText).toContain("按钮需要更明显");
    expect(codexText).toContain("$reviewer");
    expect(codexText).not.toContain("/tmp/evil");
    expect(codexText).not.toContain(SCREENSHOT_PNG);
    // The browser screenshot is attached as a native Codex image, never dumped
    // into the text payload. Its bytes survive the asset round-trip, so the
    // emitted data URL decodes back to the original screenshot bytes.
    const codexImages = codexInput
      .filter((entry): entry is { type: "image"; url: string } => {
        if (entry.type !== "image") return false;
        return typeof (entry as { url?: string }).url === "string";
      })
      .map((entry) => entry.url);
    const codexScreenshot = codexImages.find((url) => {
      const payload = url.split(",")[1] ?? "";
      return (
        url.startsWith("data:image/png;base64,") &&
        Buffer.from(payload, "base64").toString("utf8") === "screenshot pixels"
      );
    });
    expect(codexScreenshot).toBeDefined();
  });

  it("does not trust a forged skill path after rehydration", async () => {
    const { persistTurnInput, getTurnInput } =
      await import("../../../../../client/main/services/turn-input-store");
    const { projectCodexTurnInput } =
      await import("../../../../../client/main/codex/input-adapter");

    const saved = persistTurnInput({
      sessionId: "session-forge",
      turnId: "turn-forge",
      messageId: "message-forge",
      content: [
        {
          type: "skill",
          id: "skill:unknowable",
          name: "dangerous",
          path: "/tmp/attacker/SKILL.md",
        },
      ],
    });
    expect(saved.content[0]?.type).toBe("skill");

    const hydrated = getTurnInput("session-forge", "message-forge");
    expect(hydrated).not.toBeNull();

    const codexInput = projectCodexTurnInput("", hydrated!.content, {
      availableSkills: [
        { id: "safe", name: "safe-skill", path: "/skills/safe" },
      ],
    });
    // The un-enabled skill is rejected visibly: no native skill input is emitted
    // and no `$dangerous` marker is sent, but the requested path is surfaced as
    // a data block so the rejection is observable rather than silently dropped.
    const codexText = codexTextOf(codexInput);
    expect(
      codexInput.some(
        (entry) => entry.type === "skill" && entry.name === "dangerous",
      ),
    ).toBe(false);
    expect(codexText).not.toContain("$dangerous");
    expect(codexText).toContain("/tmp/attacker/SKILL.md");
    expect(codexText).toContain(
      "is not enabled in the current workspace extension plan",
    );
  });
});
