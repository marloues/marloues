import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkflowTurnItem } from "@shared/adapters/workflow-messages-to-read-thread";
import { workflowToolResult } from "@shared/workflow-tool-result";
import { fileReadPresentation } from "@/components/workflow-chat/activity/file-read-presentation";
import { WorkflowMarkdownProvider } from "@/components/workflow-chat/content/MarkdownContext";
import { WorkflowTurnItemRenderer } from "@/components/workflow-chat/activity/TurnItemRenderer";

const read = (args: unknown, tool = "read_file"): WorkflowTurnItem => ({
  id: "read-file-test",
  type: "dynamicToolCall",
  tool,
  arguments: args,
  status: "completed",
  settled: true,
});
const command = (value: string): WorkflowTurnItem => ({
  id: "read-command-test",
  type: "commandExecution",
  command: value,
  status: "completed",
  settled: true,
});
const render = (item: WorkflowTurnItem, cwd?: string) =>
  renderToStaticMarkup(
    <WorkflowMarkdownProvider value={{ cwd, sessionId: "file-read-test" }}>
      <WorkflowTurnItemRenderer
        item={
          item as Exclude<
            WorkflowTurnItem,
            { type: "agentMessage" | "userMessage" }
          >
        }
      />
    </WorkflowMarkdownProvider>,
  );

describe("file reading through the actual conversation item renderer", () => {
  it.each([
    "Read",
    "read_file",
    "filesystem.read_text_file",
    "mcp__filesystem__read_file",
    "workflow_read_file",
  ])("turns %s arguments into a directly clickable file path", (tool) => {
    const html = render(
      read({ file_path: "src/theme.ts", offset: 3 }, tool),
      "/project",
    );
    expect(html).toContain('data-kind="file-read-row"');
    expect(html).toMatch(
      /<button[^>]*class="workflow-file-link [^"]*"[^>]*aria-describedby=/,
    );
    expect(html).toContain('hidden="">/project/src/theme.ts:3</span>');
    expect(html).not.toContain('title="/project/src/theme.ts:3"');
    expect(html).toContain(">theme.ts:3</button>");
    expect(html).not.toContain("已读取");
    expect(html).not.toContain('aria-label="查看读取详情"');
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain(
      '<button type="button" class="message-disclosure-row',
    );
    expect(html).not.toContain("&quot;file_path&quot;");
  });

  it("keeps raw filename characters instead of interpreting URL escapes or line suffixes", () => {
    const value = "/project/100%25#L3.ts:12";
    expect(fileReadPresentation(read({ path: value }))?.targets).toEqual([
      { label: value, path: value, line: undefined },
    ]);
    expect(render(read({ path: value }))).toContain(
      `hidden="">${value}</span>`,
    );
  });

  it("shows each file once for a serialized multi-file read", () => {
    const item = read(
      JSON.stringify({ paths: ["a.ts", "docs/样式说明.md", "a.ts"] }),
      "read_files",
    );
    const html = render(item, "/project");
    expect(html.match(/class="workflow-file-link /g)).toHaveLength(2);
    expect(html).toContain('hidden="">/project/docs/样式说明.md</span>');
  });

  it("retains a relative path without inventing a working directory", () => {
    expect(
      fileReadPresentation(read({ path: "src/a.ts" }))?.targets[0].path,
    ).toBeNull();
    const html = render(read({ path: "src/a.ts" }));
    expect(html).toContain("src/a.ts");
    expect(html).not.toContain('class="workflow-file-link');
    expect(html).not.toContain('aria-label="查看读取详情"');
  });

  it.each([
    {},
    { raw: '{"path":"/pro' },
    '{"path":"/pro',
    { path: "https://example.com/a" },
    { path: "a\nb" },
  ])(
    "keeps missing or invalid targets in the ordinary tool row: %j",
    (args) => {
      expect(fileReadPresentation(read(args), "/project")).toBeNull();
      expect(render(read(args), "/project")).not.toContain(
        'data-kind="file-read-row"',
      );
    },
  );

  it("preserves Windows paths, and does not reinterpret other tool arguments as file reads", () => {
    expect(
      fileReadPresentation(read({ path: "C:\\project\\a b.ts" }))?.targets[0]
        .path,
    ).toBe("C:\\project\\a b.ts");
    expect(
      fileReadPresentation(read({ path: "/project/a.ts" }, "write_file")),
    ).toBeNull();
  });

  it.each(["running", "pending", "failed", "error", "cancelled"])(
    "retains read status %s",
    (status) => {
      const item = {
        ...read({ path: "/project/a.ts" }),
        status,
      } as WorkflowTurnItem;
      const expected =
        status === "pending"
          ? "running"
          : status === "error"
            ? "failed"
            : status;
      expect(render(item)).toContain(`data-read-status="${expected}"`);
    },
  );

  it("retains structured tool errors and failed exit codes", () => {
    const item = {
      ...read({ path: "/project/a.ts" }),
      result: workflowToolResult({
        isError: true,
        content: [{ type: "text", text: "File missing" }],
      }),
    } as WorkflowTurnItem;
    expect(fileReadPresentation(item)?.status).toBe("failed");
    expect(
      fileReadPresentation({
        ...command("cat /project/a.ts"),
        exitCode: 1,
      } as WorkflowTurnItem)?.status,
    ).toBe("failed");
  });
});

describe("literal file read commands", () => {
  it.each([
    ['cat "src/a b.ts"', "/project/src/a b.ts", undefined],
    ["cat -n -- src/a.ts", "/project/src/a.ts", undefined],
    ["sed -n '10,20p' src/a.ts", "/project/src/a.ts", 10],
    ["head -n 20 src/a.ts", "/project/src/a.ts", undefined],
    ["tail -20 src/a.ts", "/project/src/a.ts", undefined],
    [
      "Get-Content -LiteralPath 'C:\\project\\a b.ts' -TotalCount 20",
      "C:\\project\\a b.ts",
      undefined,
    ],
    [
      "cd '/other project' && cat src/a.ts",
      "/other project/src/a.ts",
      undefined,
    ],
    ["cd sub && cat a.ts", "/project/sub/a.ts", undefined],
  ] as const)("opens the actual target of %s", (source, path, line) => {
    const item = command(source);
    expect(fileReadPresentation(item, "/project")?.targets[0]).toMatchObject({
      path,
      line,
    });
    expect(render(item, "/project")).toContain('data-kind="file-read-row"');
  });

  it("resolves the command's cwd before the conversation cwd", () => {
    const item = {
      ...command("cat a.ts"),
      cwd: "/command",
    } as WorkflowTurnItem;
    expect(fileReadPresentation(item, "/conversation")?.targets[0].path).toBe(
      "/command/a.ts",
    );
  });

  it.each([
    "cat a.ts && npm test",
    "cat a.ts; cat b.ts",
    "cat a.ts | head",
    "cat a.ts > b.ts",
    "cat $(pwd)/a.ts",
    "cat *.ts",
    "cat $FILE",
    "cat a.ts\ncat b.ts",
    "cat 'a'\"b\"",
    "cat a\\ b.ts",
    "sed -i 's/a/b/' a.ts",
    "git show HEAD:a.ts",
    "echo cat a.ts",
    "Get-Content %FILE%",
    "cat <(echo x)",
  ])(
    "does not guess a file for a compound or unsupported command: %s",
    (source) => {
      expect(fileReadPresentation(command(source), "/project")).toBeNull();
    },
  );
});
