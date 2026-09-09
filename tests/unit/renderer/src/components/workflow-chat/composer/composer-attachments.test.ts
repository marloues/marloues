import { describe, expect, it, vi } from "vitest";
import {
  browserAppshotAttachment,
  MAX_ATTACHMENTS,
  attachmentsToUserContent,
  browserCommentAttachment,
  extractUrls,
  isMatchingBrowserCommentAttachment,
  isTextFile,
  isUrl,
  normalizeUrl,
  pastedTextAttachment,
  removeUrls,
  shouldExternalizePastedText,
  skillAttachment,
  urlAttachment,
} from "../../../../../../../client/renderer/src/components/workflow-chat/composer/composer-attachments";

// crypto.randomUUID is not available in the vitest jsdom env by default.
vi.stubGlobal("crypto", {
  randomUUID: () => "test-uuid-" + Math.random().toString(36).slice(2, 8),
});

describe("skillAttachment", () => {
  it("creates a skill attachment with name and command", () => {
    const att = skillAttachment("imagegen", "/imagegen");
    expect(att.kind).toBe("skill");
    // Narrow to the skill variant so TS exposes command/path.
    expect(att.kind).toBe("skill");
    if (att.kind !== "skill") throw new Error("not a skill");
    expect(att.name).toBe("imagegen");
    expect(att.command).toBe("/imagegen");
    expect(att.path).toBeUndefined();
    expect(att.id).toBeTruthy();
  });

  it("preserves optional path when provided", () => {
    const att = skillAttachment("imagegen", "/imagegen", "/skills/imagegen");
    if (att.kind !== "skill") throw new Error("not a skill");
    expect(att.path).toBe("/skills/imagegen");
  });
});

describe("attachmentsToUserContent — skill", () => {
  it("maps skill attachment to skill content part", () => {
    const att = skillAttachment("imagegen", "/imagegen");
    const content = attachmentsToUserContent([att]);
    expect(content).toEqual([
      expect.objectContaining({ type: "skill", name: "imagegen" }),
    ]);
  });

  it("maps skill with path when provided", () => {
    const att = skillAttachment(
      "frontend-design-pro",
      "/frontend-design-pro",
      "/skills/fdp",
    );
    const content = attachmentsToUserContent([att]);
    expect(content).toEqual([
      expect.objectContaining({
        type: "skill",
        name: "frontend-design-pro",
        path: "/skills/fdp",
      }),
    ]);
  });
});

describe("attachmentsToUserContent — mixed", () => {
  it("preserves attachment order across kinds", () => {
    const url = urlAttachment("https://example.com");
    const skill = skillAttachment("imagegen", "/imagegen");
    const content = attachmentsToUserContent([url, skill]);
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "url", url: "https://example.com" });
    expect(content[1]).toEqual(
      expect.objectContaining({ type: "skill", name: "imagegen" }),
    );
  });
});

describe("browser comment attachment identity", () => {
  const payload = {
    commentId: 2,
    targetType: "element" as const,
    ref: "body > main > button",
    tagName: "BUTTON",
    text: "提交",
    attributes: {},
    rect: { x: 10, y: 20, width: 80, height: 32 },
    viewport: { width: 1280, height: 720 },
    scrollX: 0,
    scrollY: 0,
    comment: "按钮间距需要调整",
  };

  it("keeps page identity in the composer but not in sent content", () => {
    const attachment = browserCommentAttachment(payload, "page-1");
    expect(attachment).toEqual(
      expect.objectContaining({ kind: "browser-comment", pageId: "page-1" }),
    );
    expect(attachmentsToUserContent([attachment])).toEqual([
      { type: "browserComment", ...payload },
    ]);
  });

  it("matches only the exact page and comment id", () => {
    const attachment = browserCommentAttachment(payload, "page-1");
    expect(isMatchingBrowserCommentAttachment(attachment, "page-1", 2)).toBe(
      true,
    );
    expect(isMatchingBrowserCommentAttachment(attachment, "page-2", 2)).toBe(
      false,
    );
    expect(isMatchingBrowserCommentAttachment(attachment, "page-1", 3)).toBe(
      false,
    );
  });
});

describe("MAX_ATTACHMENTS", () => {
  it("counts skill attachments against the limit", () => {
    // Skills, files, images, and urls all share the same MAX_ATTACHMENTS budget.
    const skills = Array.from({ length: MAX_ATTACHMENTS }, (_, i) =>
      skillAttachment(`skill-${i}`, `/skill-${i}`),
    );
    expect(skills.length).toBe(MAX_ATTACHMENTS);
    expect(attachmentsToUserContent(skills).length).toBe(MAX_ATTACHMENTS);
  });
});

// ── Existing helpers used by the composer (light smoke) ──

describe("isUrl", () => {
  it("accepts http and https", () => {
    expect(isUrl("https://example.com")).toBe(true);
    expect(isUrl("http://localhost:3000")).toBe(true);
  });

  it("rejects non-url strings", () => {
    expect(isUrl("not a url")).toBe(false);
    expect(isUrl("/local/path")).toBe(false);
  });
});

describe("bare URL extraction", () => {
  it("extracts unique URLs and trims sentence punctuation", () => {
    const text =
      "看这个 https://example.com/docs?a=1，再看 http://localhost:3000/status。";
    expect(extractUrls(text)).toEqual([
      "https://example.com/docs?a=1",
      "http://localhost:3000/status",
    ]);
  });

  it("leaves Markdown links and code snippets in the message text", () => {
    const text =
      "文档是 [指南](https://example.com/guide)，代码是 `https://example.com/code`，裸链接是 https://example.com/bare";
    expect(extractUrls(text)).toEqual(["https://example.com/bare"]);
    expect(removeUrls(text, ["https://example.com/bare"])).toContain(
      "[指南](https://example.com/guide)",
    );
    expect(removeUrls(text, ["https://example.com/bare"])).toContain(
      "`https://example.com/code`",
    );
  });

  it("normalizes only http and https links", () => {
    expect(normalizeUrl(" https://example.com/a?b=1 ")).toBe(
      "https://example.com/a?b=1",
    );
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("https://")).toBeNull();
  });
});

describe("isTextFile", () => {
  it("rejects images", () => {
    const file = new File([""], "test.png", { type: "image/png" });
    expect(isTextFile(file)).toBe(false);
  });

  it("accepts plain text", () => {
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    expect(isTextFile(file)).toBe(true);
  });

  it("accepts conventional extensionless config examples", () => {
    const file = new File(["API_URL=https://example.com"], ".env.example");
    expect(isTextFile(file)).toBe(true);
  });
});

describe("pasted text attachments", () => {
  it("externalizes only clipboard text above the threshold", () => {
    expect(shouldExternalizePastedText("short note")).toBe(false);
    expect(shouldExternalizePastedText("a".repeat(4095))).toBe(false);
    expect(shouldExternalizePastedText("a".repeat(4096))).toBe(true);
  });

  it("keeps pasted text as a semantic attachment with stable naming", () => {
    const attachment = pastedTextAttachment("hello".repeat(1024), 2);
    if (attachment.kind !== "pasted-text") {
      throw new Error("not a pasted-text attachment");
    }
    expect(attachment.name).toBe("粘贴文本 2");
    expect(attachment.mimeType).toBe("text/plain");
    expect(attachment.size).toBe(5120);
    expect(attachment.text).toBe("hello".repeat(1024));
  });

  it("maps pasted text to the durable file content part", () => {
    const attachment = pastedTextAttachment("hello".repeat(1024), 1);
    expect(attachmentsToUserContent([attachment])).toEqual([
      {
        type: "file",
        name: "粘贴文本 1",
        mimeType: "text/plain",
        text: "hello".repeat(1024),
        size: 5120,
      },
    ]);
  });
});

describe("browser appshot attachments", () => {
  it("decodes metadata and maps the screenshot to an image part", () => {
    const base64 = Buffer.from("png-bytes", "binary").toString("base64");
    const attachment = browserAppshotAttachment(
      `data:image/png;base64,${base64}`,
    );
    if (attachment.kind !== "appshot") {
      throw new Error("not an appshot attachment");
    }
    expect(attachment.name).toBe("页面截图");
    expect(attachment.mimeType).toBe("image/png");
    expect(attachment.size).toBe(9);
    expect(attachmentsToUserContent([attachment])).toEqual([
      {
        type: "image",
        url: `data:image/png;base64,${base64}`,
        detail: "auto",
        name: "页面截图",
        mimeType: "image/png",
        size: 9,
      },
    ]);
  });
});
