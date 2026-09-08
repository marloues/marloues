import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowMarkdownContent } from "@/components/workflow-chat/content/MarkdownContent";
import { WorkflowMarkdownProvider } from "@/components/workflow-chat/content/MarkdownContext";
import { WorkflowFileLink } from "@/components/workflow-chat/content/MarkdownLink";

const render = (content: string, cwd: string | undefined = "/project") =>
  renderToStaticMarkup(
    <WorkflowMarkdownProvider value={{ cwd }}>
      <WorkflowMarkdownContent content={content} />
    </WorkflowMarkdownProvider>,
  );

describe("shared conversation file link rules", () => {
  it.each([
    ["[](/project/src/theme.ts)", "theme.ts", "/project/src/theme.ts"],
    [
      "[/project/src/theme.ts](/project/src/theme.ts)",
      "theme.ts",
      "/project/src/theme.ts",
    ],
    ["[src/theme.ts](src/theme.ts)", "theme.ts", "/project/src/theme.ts"],
    [
      "[/project/src/theme.ts:3](/project/src/theme.ts:3)",
      "theme.ts:3",
      "/project/src/theme.ts:3",
    ],
    [
      "[file:///project/src/theme.ts#L3](file:///project/src/theme.ts#L3)",
      "theme.ts:3",
      "/project/src/theme.ts:3",
    ],
    ["[/project/a%20b.ts](/project/a%20b.ts)", "a b.ts", "/project/a b.ts"],
    ["`/project/src/theme.ts:3`", "theme.ts:3", "/project/src/theme.ts:3"],
  ])(
    "shortens a path label without changing its target: %s",
    (source, label, title) => {
      const html = render(source);
      expect(html).toContain(`hidden="">${title}</span>`);
      expect(html).not.toContain("title=");
      expect(html).toContain("aria-describedby=");
      expect(html).toContain(`>${label}</button>`);
    },
  );

  it("preserves explicit directory levels and distinct targets for equal basenames", () => {
    const html = render(
      "[ui/index.ts](/project/src/ui/index.ts) · [runtime/index.ts](/project/src/runtime/index.ts)",
    );
    expect(html).toContain('hidden="">/project/src/ui/index.ts</span>');
    expect(html).toContain(">ui/index.ts</button>");
    expect(html).toContain('hidden="">/project/src/runtime/index.ts</span>');
    expect(html).toContain(">runtime/index.ts</button>");
  });

  it("keeps label formatting, adds the line once, and avoids nested controls", () => {
    const html = render(
      "[**主题定义**](/project/src/theme.ts:3) · [`ui/index.ts`](/project/src/ui/index.ts:2)",
    );
    expect(html).toContain("<strong>主题定义</strong>:3</button>");
    expect(html).toContain("<code>ui/index.ts</code>:2</button>");
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).not.toContain("workflow-inline-code-copy");
  });

  it.each(["theme.ts:3", "theme.ts#L3", "theme.ts (line 3)"])(
    "does not repeat an existing line suffix: %s",
    (label) => {
      const html = render(`[${label}](/project/src/theme.ts:3)`);
      expect(html).toContain(`>${label}</button>`);
    },
  );

  it.each([
    ["/project/100%25#L3.ts:12", "100%25#L3.ts:12"],
    ["C:\\project\\目录\\a b.ts", "a b.ts"],
    ["\\\\server\\share\\index.ts", "index.ts"],
  ])("keeps literal file paths intact: %s", (path, label) => {
    const html = renderToStaticMarkup(<WorkflowFileLink path={path} />);
    expect(html).toContain(`hidden="">${path}</span>`);
    expect(html).toContain(`>${label}</button>`);
  });

  it("preserves web and anchor labels and leaves unresolved paths inactive", () => {
    const html = renderToStaticMarkup(
      <WorkflowMarkdownContent content="[Example](https://example.com) · [Section](#section) · [src/a.ts](src/a.ts)" />,
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="#section"');
    expect(html).toContain(">src/a.ts</span>");
    expect(html).not.toContain("workflow-file-link");
  });
});
