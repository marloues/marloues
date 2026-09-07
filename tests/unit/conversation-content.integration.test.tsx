import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  WorkflowMarkdownContent,
  splitIncrementalMarkdown,
} from "../../client/renderer/src/components/workflow-chat/content/MarkdownContent";
import { WorkflowMarkdownProvider } from "../../client/renderer/src/components/workflow-chat/content/MarkdownContext";
import {
  resolveContentTarget,
  mediaSource,
  markdownUrlTransform,
} from "../../client/renderer/src/components/workflow-chat/content/content-target";
import { WorkflowTurnView } from "../../client/renderer/src/components/workflow-chat/turns/TurnView";
import { WorkflowTurnFooterView } from "../../client/renderer/src/components/workflow-chat/turns/TurnFooterView";
import { WorkflowMcpResult } from "../../client/renderer/src/components/workflow-chat/activity/McpResult";
import { imageGenerationLabel } from "../../client/renderer/src/components/workflow-chat/activity/ImageGenerationRow";
import { WorkflowResultCards } from "../../client/renderer/src/components/workflow-chat/activity/ResultCards";
import { workflowToolResult } from "@shared/workflow-tool-result";
import { normalizeCodexItem } from "../../client/main/codex/normalize";
import { createBinaryEventAdapter } from "../../client/main/core/runtime/binary-event-adapter";
import { workflowThreadStore } from "../../client/main/core/runtime/workflow-thread-store";
import { storedMessagesForRuntimeTurn } from "../../client/main/core/runtime/workflow-turn-persistence";

const threadId = "conversation-content-test";
afterEach(() => workflowThreadStore.deleteThread(threadId));
const render = (content: string, streaming = false) =>
  renderToStaticMarkup(
    <WorkflowMarkdownProvider value={{ cwd: "/project" }}>
      <WorkflowMarkdownContent content={content} streaming={streaming} />
    </WorkflowMarkdownProvider>,
  );

describe("conversation content and runtime integration", () => {
  it("keeps blank lines inside a growing code fence and hides unfinished copy actions", () => {
    const code = "Intro\n\n```ts\nconst a = 1;\n\nconst b = 2;\n\n";
    expect(splitIncrementalMarkdown(code)).toEqual({
      settledBlocks: ["Intro"],
      pending: code.slice(7),
      pendingIsCode: true,
    });
    expect(render(code, true)).not.toContain('aria-label="复制代码"');
    expect(render(code + "```", true)).toContain('aria-label="复制代码"');
    expect(render(code, true)).not.toContain("hljs-keyword");
  });
  it("preserves reference links and footnotes across paragraphs", () => {
    const html = render(
      "A [reference][doc].\n\nSecond[^note].\n\n[doc]: https://example.com\n[^note]: Note.",
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="#user-content-fn-note"');
    expect(html).toContain("Note.");
  });
  it("renders formulae in tables and display math without unsafe commands", () => {
    const html = render(
      "| Formula |\n| --- |\n| $x^2$ |\n\n$$\n\\frac{1}{2}\n$$",
    );
    expect(html).toContain("katex");
    expect(html).toContain('aria-label="展开表格"');
    expect(html).toContain('aria-label="复制表格"');
    expect(render("$\\href{javascript:alert(1)}{x}$")).not.toContain(
      'href="javascript:',
    );
  });
  it("routes Mermaid separately from ordinary code", () => {
    expect(render("```mermaid\nflowchart LR\nA-->B\n```")).toContain(
      'data-kind="mermaid-block"',
    );
    expect(render("```ts\nconst a = 1;\n```")).toContain(
      'aria-label="代码自动换行"',
    );
  });
  it("routes local file links through the actual thread cwd and line hint", () => {
    expect(resolveContentTarget("./src/a%20b.ts:12:3", "/project")).toEqual({
      kind: "file",
      path: "/project/./src/a b.ts",
      line: 12,
    });
    expect(resolveContentTarget("file:///project/a.ts#L7")).toEqual({
      kind: "file",
      path: "/project/a.ts",
      line: 7,
    });
    expect(render("[open](./src/a.ts:7)")).toMatch(
      /class="[^"]*\bworkflow-file-link\b[^"]*"/,
    );
    expect(resolveContentTarget("./a.ts")).toEqual({ kind: "unsupported" });
    expect(resolveContentTarget("file://remote/a.ts")).toEqual({
      kind: "unsupported",
    });
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,bad",
    "vbscript:bad",
    "java\nscript:bad",
  ])("does not activate unsupported content URLs: %s", (value) => {
    expect(markdownUrlTransform(value)).toBe("");
    expect(resolveContentTarget(value, "/project").kind).toBe("unsupported");
  });
  it("encodes local image paths once on Unix and Windows", () => {
    expect(mediaSource("/project/a b.png")).toBe("file:///project/a%20b.png");
    expect(mediaSource("file:///project/a%20b.png")).toBe(
      "file:///project/a%20b.png",
    );
    expect(mediaSource("C:\\folder\\a b.png")).toBe(
      "file:///C:/folder/a%20b.png",
    );
  });
  it("renders audio and video controls through Markdown image syntax", () => {
    expect(render("![audio](https://example.com/a.mp3)")).toContain("<audio");
    expect(render("![video](https://example.com/a.webm)")).toContain("<video");
  });
  it("does not invent elapsed time for history without timing facts", () => {
    const html = renderToStaticMarkup(
      <WorkflowTurnView
        message={{
          id: "history",
          user: "question",
          activity: "done",
          status: "completed",
          durationMs: null,
          items: [
            {
              id: "a",
              type: "agentMessage",
              phase: "final_answer",
              text: "answer",
              settled: true,
            },
          ],
        }}
        expanded={false}
        isLastStreaming={false}
        onToggle={() => {}}
      />,
    );
    expect(html).not.toMatch(/\d+秒/);
  });
  it("suppresses empty footers but retains independent timestamp metadata", () => {
    expect(
      renderToStaticMarkup(
        <WorkflowTurnFooterView
          messageId="a"
          finalText=""
          showFooterMetadata={false}
        />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <WorkflowTurnFooterView messageId="a" finalText="" createdAt={1000} />,
      ),
    ).toContain("<time");
  });
  it("retains renamed or binary changed files even with zero textual diff lines", () => {
    const html = renderToStaticMarkup(
      <WorkflowResultCards
        items={[
          {
            id: "f",
            type: "fileChange",
            status: "completed",
            settled: true,
            changes: [{ path: "logo.png", kind: "update" }],
          },
        ]}
      />,
    );
    expect(html).toContain("logo.png");
  });
  it("does not render a pretend browser preview without a URL", () => {
    expect(
      renderToStaticMarkup(
        <WorkflowResultCards
          items={[
            { id: "s", type: "webSearch", query: "question", settled: true },
          ]}
        />,
      ),
    ).toBe("");
  });
  it.each(["cancelled", "canceled", "interrupted"])(
    "retains cancellation labels for %s image generation",
    (status) => {
      expect(
        imageGenerationLabel({ id: "i", type: "imageGeneration", status }),
      ).toBe("已取消生成图片");
    },
  );
  it("preserves MCP content through native events, store snapshots and persistence", () => {
    const result = {
      content: [
        { type: "image", mimeType: "image/png", data: "base64" },
        { type: "future-type", payload: { a: 1 } },
      ],
      structuredContent: { count: 2 },
      isError: true,
    };
    workflowThreadStore.startTurn({
      threadId,
      turnId: "t",
      content: "q",
      userMessageId: "u",
      startedAt: 1000,
    });
    const normalized = normalizeCodexItem(
      {
        id: "m",
        type: "mcpToolCall",
        tool: "image_read",
        server: "demo",
        result,
        status: "completed",
      },
      {},
      "completed",
    )!;
    for (const event of createBinaryEventAdapter("t")({
      type: "item.completed",
      item: normalized,
    }))
      workflowThreadStore.applyRuntimeEvent(threadId, "t", event);
    const snapshot = workflowThreadStore.readThread({ threadId });
    expect(
      snapshot.turns[0].items.find((item) => item.id === "m"),
    ).toMatchObject({ result });
    expect(storedMessagesForRuntimeTurn(snapshot, "t").at(-1)?.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ result })]),
    );
  });
  it("keeps structured-only and unknown MCP content inspectable", () => {
    const result = workflowToolResult({
      content: [{ type: "future-type", payload: "keep" }],
      structuredContent: { count: 1 },
      isError: true,
    })!;
    const html = renderToStaticMarkup(<WorkflowMcpResult result={result} />);
    expect(html).toContain("future-type");
    expect(html).toContain("keep");
    expect(html).toContain("结构化结果");
    expect(html).toContain('role="alert"');
    expect(
      workflowToolResult({ structuredContent: { x: 1 } })?.content,
    ).toEqual([]);
    expect(workflowToolResult("ordinary text")).toBeUndefined();
  });
});
