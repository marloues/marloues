import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../client/main/core/logging/app-logger", () => ({
  logWarn: vi.fn(),
}));
vi.mock("../../../../client/main/core/storage/state-db", () => ({
  getStateDb: vi.fn(),
}));
vi.mock("../../../../client/main/services/session-store", () => ({
  recordSessionArtifact: vi.fn(),
  recordWorkspaceCheckpoint: vi.fn(),
  recordWorkspaceFileChange: vi.fn(),
}));

import {
  readWorkspaceGitContext,
  readWorkspaceProjectReview,
} from "../../../../client/main/services/workspace-checkpoint-service";

function runRepoGit(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

describe("workspace checkpoint service", () => {
  it("counts untracked files in line stats without staging them", async () => {
    const repo = mkdtempSync(join(tmpdir(), "marloues-git-context-"));
    try {
      runRepoGit(repo, ["init", "-q"]);
      runRepoGit(repo, ["config", "user.email", "test@example.com"]);
      runRepoGit(repo, ["config", "user.name", "marloues-test"]);
      runRepoGit(repo, ["config", "commit.gpgsign", "false"]);
      writeFileSync(join(repo, ".gitignore"), "ignored.txt\n");
      writeFileSync(join(repo, "base.txt"), "one\ntwo\n");
      runRepoGit(repo, ["add", "."]);
      runRepoGit(repo, ["commit", "-qm", "base"]);

      writeFileSync(join(repo, "base.txt"), "one\n");
      writeFileSync(join(repo, "new.txt"), "a\nb");
      mkdirSync(join(repo, "nested"), { recursive: true });
      writeFileSync(join(repo, "nested", "deep.txt"), "x\ny\nz");
      writeFileSync(join(repo, "ignored.txt"), "ignored\n");

      const context = await readWorkspaceGitContext(repo);

      expect(context.isRepository).toBe(true);
      expect(context.insertions).toBe(5);
      expect(context.deletions).toBe(1);

      const status = runRepoGit(repo, ["status", "--porcelain"]);
      expect(status).toContain("?? new.txt");
      expect(status).toContain("?? nested/");
      expect(runRepoGit(repo, ["diff", "--cached", "--numstat"]).trim()).toBe(
        "",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns an empty context outside a git repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "marloues-git-none-"));
    try {
      const context = await readWorkspaceGitContext(dir);
      expect(context).toMatchObject({
        isRepository: false,
        changedFiles: 0,
        insertions: 0,
        deletions: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns project review files including untracked files", async () => {
    const repo = mkdtempSync(join(tmpdir(), "marloues-project-review-"));
    try {
      runRepoGit(repo, ["init", "-q"]);
      runRepoGit(repo, ["config", "user.email", "test@example.com"]);
      runRepoGit(repo, ["config", "user.name", "marloues-test"]);
      runRepoGit(repo, ["config", "commit.gpgsign", "false"]);
      writeFileSync(join(repo, ".gitignore"), "ignored.txt\n");
      writeFileSync(join(repo, "base.txt"), "one\ntwo\n");
      runRepoGit(repo, ["add", "."]);
      runRepoGit(repo, ["commit", "-qm", "base"]);

      writeFileSync(join(repo, "base.txt"), "one\n");
      writeFileSync(join(repo, "new.txt"), "a\nb");
      mkdirSync(join(repo, "nested"), { recursive: true });
      writeFileSync(join(repo, "nested", "deep.txt"), "x\ny\nz");
      writeFileSync(join(repo, "ignored.txt"), "ignored\n");
      writeFileSync(join(repo, "staged.txt"), "staged\n");
      runRepoGit(repo, ["add", "staged.txt"]);

      const review = await readWorkspaceProjectReview(repo);

      expect(review.isRepository).toBe(true);
      expect(review.root).toBe(realpathSync(repo));
      expect(review.files.map((file) => file.path)).toEqual([
        "base.txt",
        "nested/deep.txt",
        "new.txt",
        "staged.txt",
      ]);
      expect(
        review.files.find((file) => file.path === "base.txt"),
      ).toMatchObject({
        added: 0,
        removed: 1,
      });
      expect(
        review.files.find((file) => file.path === "new.txt"),
      ).toMatchObject({
        added: 2,
        removed: 0,
      });
      expect(
        review.files.find((file) => file.path === "nested/deep.txt"),
      ).toMatchObject({
        added: 3,
        removed: 0,
      });
      expect(
        review.files.find((file) => file.path === "staged.txt"),
      ).toMatchObject({
        added: 1,
        removed: 0,
      });
      expect(review.insertions).toBe(6);
      expect(review.deletions).toBe(1);
      expect(
        review.files.find((file) => file.path === "new.txt")?.rawDiff,
      ).toContain("diff --git a/new.txt b/new.txt");
      expect(
        review.files.some((file) => file.path.includes("ignored.txt")),
      ).toBe(false);

      expect(runRepoGit(repo, ["diff", "--cached", "--numstat"]).trim()).toBe(
        "1\t0\tstaged.txt",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns an empty project review outside a git repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "marloues-project-none-"));
    try {
      const review = await readWorkspaceProjectReview(dir);
      expect(review).toMatchObject({
        isRepository: false,
        files: [],
        insertions: 0,
        deletions: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
