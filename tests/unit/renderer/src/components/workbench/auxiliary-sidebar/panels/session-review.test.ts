import { describe, expect, it } from "vitest";
import type {
  WorkflowTurn,
  WorkflowTurnItem,
} from "@shared/workflow-read-thread-contract";
import {
  buildSessionReview,
  reviewFilePath,
} from "@/components/workbench/auxiliary-sidebar/panels/session-review";

const edit = (
  id: string,
  path: string,
  text = "@@ -1 +1 @@\n-before\n+after",
  status = "completed",
): WorkflowTurnItem => ({
  type: "fileChange",
  id,
  status,
  changes: [{ path, kind: "update", diff: { text, truncated: false } }],
});
const turn = (id: string, items: WorkflowTurnItem[]): WorkflowTurn => ({
  id,
  items,
  status: "completed",
  zone: "workspace",
  error: null,
});

describe("session review collection", () => {
  it("collects SDK edits across turns using their content, not success messages", () => {
    const sdkEdit = (
      id: string,
      oldText: string,
      newText: string,
      status = "completed",
    ): WorkflowTurnItem => ({
      type: "mcpToolCall",
      id,
      tool: "Edit",
      arguments: {
        file_path: "/workspace/example.ts",
        old_string: oldText,
        new_string: newText,
      },
      status,
      output: {
        text: "The file has been updated successfully.",
        truncated: false,
      },
    });
    const files = buildSessionReview(
      [
        turn("new", [
          sdkEdit("second", "after", "latest"),
          sdkEdit("failed", "latest", "wrong", "failed"),
        ]),
        turn("old", [sdkEdit("first", "before", "after")]),
      ],
      "/workspace",
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      path: "example.ts",
      added: 2,
      removed: 2,
    });
    expect(files[0].revisions.map((revision) => revision.id)).toEqual([
      "old:first:0",
      "new:second:0",
    ]);
    expect(files[0].revisions[0].rawDiff).toContain("-before\n+after");
    expect(files[0].revisions[1].rawDiff).toContain("-after\n+latest");
  });
  it("collects every file across turns and retains edits to the same file in chronological order", () => {
    const older = turn("old", [
      edit("first", "src/a.ts"),
      edit("other", "src/b.ts"),
    ]);
    const newer = turn("new", [
      edit("second", "/workspace/src/a.ts", "@@ -1 +1 @@\n-after\n+latest"),
    ]);
    const files = buildSessionReview([newer, older], "/workspace");
    expect(files.map((file) => file.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(files[0]).toMatchObject({ added: 2, removed: 2 });
    expect(files[0].revisions.map((revision) => revision.id)).toEqual([
      "old:first:0",
      "new:second:0",
    ]);
    expect(files[0].revisions[1].rawDiff).toContain("+latest");
  });
  it("excludes pending and failed edits, while retaining a successful edit from an interrupted turn", () => {
    const files = buildSessionReview([
      {
        ...turn("partial", [
          edit("ok", "ok.ts"),
          edit("failed", "failed.ts", "", "failed"),
          edit("running", "running.ts", "", "inProgress"),
        ]),
        status: "interrupted",
      },
    ]);
    expect(files.map((file) => file.path)).toEqual(["ok.ts"]);
  });
  it("does not double count overlapping history pages", () => {
    const item = turn("one", [edit("change", "a.ts")]);
    expect(buildSessionReview([item, item])[0].revisions).toHaveLength(1);
  });
  it("does not cap the session to twenty files or the latest turn", () => {
    const turns = Array.from({ length: 120 }, (_, i) =>
      turn(String(i), [edit("edit", `${i}.ts`)]),
    );
    expect(buildSessionReview(turns)).toHaveLength(120);
  });
  it("keeps unavailable and truncated patches visible", () => {
    const item = edit("edit", "a.ts", "") as Extract<
      WorkflowTurnItem,
      { type: "fileChange" }
    >;
    item.changes.push({
      path: "b.ts",
      kind: "delete",
      diff: { text: "-partial", truncated: true },
    });
    const files = buildSessionReview([turn("one", [item])]);
    expect(files[0].revisions[0].rawDiff).toBe("");
    expect(files[1].revisions[0]).toMatchObject({
      kind: "delete",
      truncated: true,
    });
  });
  it("slices a multi-file patch before counting each file", () => {
    const patch =
      "*** Begin Patch\n*** Update File: a.ts\n-old\n+new\n*** Add File: b.ts\n+one\n+two\n*** End Patch";
    const files = buildSessionReview([
      turn("one", [edit("a", "a.ts", patch), edit("b", "b.ts", patch)]),
    ]);
    expect(files.map(({ added, removed }) => ({ added, removed }))).toEqual([
      { added: 1, removed: 1 },
      { added: 2, removed: 0 },
    ]);
    expect(files[0].revisions[0].rawDiff).not.toContain("+two");
  });
  it.each([
    ["/workspace/src/../a.ts", "/workspace", "a.ts"],
    ["C:\\repo\\src\\a.ts", "C:\\repo", "src/a.ts"],
    ["/workspace-other/a.ts", "/workspace", "/workspace-other/a.ts"],
    ["./100%25#L3.ts", "/workspace", "100%25#L3.ts"],
    ["../outside/a.ts", "/workspace", "../outside/a.ts"],
  ])(
    "normalizes identities without decoding or confusing workspace prefixes",
    (path, cwd, expected) => {
      expect(reviewFilePath(path, cwd)).toBe(expected);
    },
  );
});

it("matches absolute change paths to relative patch headers without attributing other files", () => {
  const patch =
    "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/b.ts b/b.ts\n@@ -0,0 +1 @@\n+second";
  const files = buildSessionReview(
    [
      turn("one", [
        edit("a", "/workspace/a.ts", patch),
        edit("missing", "/workspace/missing.ts", patch),
      ]),
    ],
    "/workspace",
  );
  expect(files[0]).toMatchObject({ added: 1, removed: 1 });
  expect(files[0].revisions[0].rawDiff).not.toContain("+second");
  expect(files[1].revisions[0].rawDiff).toBe("");
});
