import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import {
  findComposerLinkRanges,
  formatMarkdownLink,
  handleLinkTextInput,
  insertComposerLink,
  updateComposerLink,
} from "../../../../../../../client/renderer/src/components/workflow-chat/composer/composer-link-tokens";
import type { EditorView } from "@codemirror/view";

function createView(
  doc: string,
  selection = EditorSelection.cursor(doc.length),
): EditorView {
  let state = EditorState.create({
    doc,
    selection,
    extensions: [markdown({ addKeymap: false })],
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(transaction: Parameters<EditorView["dispatch"]>[0]) {
      state = state.update(transaction).state;
    },
    focus() {
      return undefined;
    },
  };
  return view as unknown as EditorView;
}

describe("composer inline links", () => {
  it("serializes labels and hrefs safely", () => {
    expect(
      formatMarkdownLink("Marloues [docs]", "https://example.com/a(b)"),
    ).toBe("[Marloues \\[docs\\]](https://example.com/a%28b%29)");
  });

  it("turns a completed bare URL into a Markdown link after space", () => {
    const doc = "看这个 https://example.com/docs?a=1";
    const view = createView(doc);
    expect(handleLinkTextInput(view, doc.length, doc.length, " ")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "看这个 [https://example.com/docs?a=1](https://example.com/docs?a=1) ",
    );
  });

  it("keeps selected text as the link label when inserting a URL", () => {
    const view = createView("查这个", EditorSelection.range(1, 3));
    insertComposerLink(view, "https://example.com");
    expect(view.state.doc.toString()).toBe("查[这个](https://example.com)");
  });

  it("updates and removes Markdown-backed links", () => {
    const doc = "[指南](https://example.com/guide)";
    const view = createView(doc);
    const range = findComposerLinkRanges(view.state)[0];
    updateComposerLink(view, range, {
      label: "文档",
      href: "https://example.com/docs",
    });
    expect(view.state.doc.toString()).toBe("[文档](https://example.com/docs)");

    const nextRange = findComposerLinkRanges(view.state)[0];
    updateComposerLink(view, nextRange, {
      label: "文档",
      href: null,
    });
    expect(view.state.doc.toString()).toBe("文档");
  });

  it("finds consecutive links without merging them", () => {
    const state = EditorState.create({
      doc: "先 [https://one.com](https://one.com) 再 [二](https://two.com)",
      extensions: [markdown({ addKeymap: false })],
    });
    expect(findComposerLinkRanges(state)).toMatchObject([
      { label: "https://one.com", href: "https://one.com" },
      { label: "二", href: "https://two.com" },
    ]);
  });
});
