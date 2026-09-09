import { describe, expect, it } from "vitest";
import {
  composerAttachmentsToContent,
  composerSuggestionQuery,
  replaceComposerSuggestion,
  selectedSkillAttachment,
} from "../../../../../../../client/renderer/src/components/workflow-chat/composer/composer-contract";

describe("composer contract", () => {
  it("keeps an explicitly dismissed suggestion closed", () => {
    expect(composerSuggestionQuery("$qa-verify", -1)).toBeNull();
    expect(composerSuggestionQuery("$qa-verify", 10)?.kind).toBe("skill");
  });
  it("parses unicode command, skill and mention tokens at the caret", () => {
    expect(composerSuggestionQuery("前文 $图片-生成", 8)?.kind).toBe("skill");
    expect(composerSuggestionQuery("引用 @src/组件.tsx", 14)?.kind).toBe(
      "mention",
    );
    expect(composerSuggestionQuery("/compact", 8)?.kind).toBe("command");
  });

  it("starts a new skill query after an inserted mention separator", () => {
    const firstSkillToken = `${"\u2063"}${encodeURIComponent(
      "skill:project-e2e",
    )}${"\u2063"} `;
    const value = `${firstSkillToken}$second`;
    expect(composerSuggestionQuery(value, value.length)).toMatchObject({
      kind: "skill",
      query: "second",
      start: firstSkillToken.length,
      end: value.length,
    });
  });

  it("replaces only the active token and preserves surrounding text", () => {
    const query = composerSuggestionQuery("前文 $img 后文", 7)!;
    expect(replaceComposerSuggestion("前文 $img 后文", query, "")).toEqual({
      value: "前文  后文",
      caret: 3,
    });
  });

  it("serializes exact skill identity in attachment order", () => {
    const skill = selectedSkillAttachment({
      id: "skill-1",
      name: "imagegen",
      path: "C:/skills/imagegen/SKILL.md",
      scope: "user",
      enabled: true,
      version: "1.2.0",
    });
    expect(composerAttachmentsToContent([skill])).toEqual([
      expect.objectContaining({
        type: "skill",
        id: "skill-1",
        name: "imagegen",
        path: "C:/skills/imagegen/SKILL.md",
        version: "1.2.0",
      }),
    ]);
  });

  it("preserves original image and file metadata in canonical content", () => {
    expect(
      composerAttachmentsToContent([
        {
          kind: "image",
          id: "image-1",
          name: "diagram.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,aW1hZ2U=",
          size: 5,
        },
        {
          kind: "file",
          id: "file-1",
          name: "notes.md",
          mimeType: "text/markdown",
          text: "# Notes",
          size: 7,
        },
      ]),
    ).toEqual([
      {
        type: "image",
        url: "data:image/png;base64,aW1hZ2U=",
        detail: "auto",
        name: "diagram.png",
        mimeType: "image/png",
        size: 5,
      },
      {
        type: "file",
        name: "notes.md",
        mimeType: "text/markdown",
        text: "# Notes",
        size: 7,
      },
    ]);
  });
});
