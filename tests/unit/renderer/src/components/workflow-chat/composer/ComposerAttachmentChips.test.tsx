import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ComposerAttachmentChips } from "../../../../../../../client/renderer/src/components/workflow-chat/composer/ComposerAttachmentChips";

describe("ComposerAttachmentChips", () => {
  it("keeps skill links out of the separate attachment band", () => {
    const html = renderToStaticMarkup(
      <ComposerAttachmentChips
        attachments={[
          {
            kind: "skill",
            id: "attachment-1",
            skill: {
              id: "skill:borrow-no-query",
              name: "borrow-no-query",
              scope: "project",
              path: "/workspace/.marloues/skills/borrow-no-query/SKILL.md",
              enabled: true,
              description: "Borrow without querying",
            },
            name: "borrow-no-query",
            command: "$borrow-no-query",
            path: "/workspace/.marloues/skills/borrow-no-query/SKILL.md",
          },
        ]}
        onRemove={vi.fn()}
        onPreviewImage={vi.fn()}
      />,
    );

    expect(html).toBe("");
  });

  it("renders one scrollable attachment band with semantic file metadata", () => {
    const html = renderToStaticMarkup(
      <ComposerAttachmentChips
        attachments={[
          {
            kind: "file",
            id: "file-1",
            name: "notes.md",
            mimeType: "text/markdown",
            text: "# Notes",
            size: 12 * 1024,
          },
          {
            kind: "url",
            id: "url-1",
            url: "https://example.com/reference",
          },
          {
            kind: "pasted-text",
            id: "pasted-1",
            sequence: 1,
            name: "粘贴文本 1",
            mimeType: "text/plain",
            text: "a".repeat(4096),
            size: 4096,
          },
        ]}
        onRemove={vi.fn()}
        onPreviewImage={vi.fn()}
      />,
    );

    expect(html).toContain('class="composer-attachments"');
    expect(html).toContain("MD · 12 KB");
    expect(html).toContain("粘贴文本 1");
    expect(html).toContain("粘贴文本 · 4.0 KB");
    expect(html).toContain('class="composer-chip-link"');
    const linkMarkup = html.match(
      /<a class="composer-chip-link"[\s\S]*?<\/a>/,
    )?.[0];
    expect(linkMarkup).toBeDefined();
    expect(linkMarkup).not.toContain("<button");
  });

  it("does not reserve attachment height in the zero state", () => {
    const html = renderToStaticMarkup(
      <ComposerAttachmentChips
        attachments={[]}
        onRemove={vi.fn()}
        onPreviewImage={vi.fn()}
      />,
    );

    expect(html).toBe("");
  });
});
