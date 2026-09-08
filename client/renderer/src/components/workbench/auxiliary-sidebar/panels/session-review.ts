import type { WorkflowTurn } from "@shared/workflow-read-thread-contract";
import { projectToolItem } from "@shared/adapters/tool-item-projection";
import { filePatchStats, patchForFile } from "@/components/diff/file-patch";

export interface ReviewRevision {
  id: string;
  rawDiff: string;
  kind: string;
  truncated: boolean;
}

export interface SessionReviewFile {
  path: string;
  added: number;
  removed: number;
  revisions: ReviewRevision[];
}

/** Normalize path identity only; never URL-decode filesystem paths. */
export function reviewFilePath(path: string, cwd?: string | null): string {
  const normalized = path.replace(/\\/g, "/");
  const root = (cwd ?? "").replace(/\\/g, "/").replace(/\/$/, "");
  const relative =
    cwd && normalized.startsWith(`${root}/`)
      ? normalized.slice(root.length + 1)
      : normalized;
  const segments: string[] = [];
  for (const segment of relative.split("/")) {
    if (segment === ".") continue;
    if (
      segment === ".." &&
      segments.length &&
      segments.at(-1) !== ".." &&
      segments.at(-1) !== ""
    )
      segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

/** ReadThread is newest first. Keep every successful edit, oldest first per file. */
export function buildSessionReview(
  turns: WorkflowTurn[],
  cwd?: string | null,
): SessionReviewFile[] {
  const files = new Map<string, SessionReviewFile>();
  const seen = new Set<string>();
  for (const turn of [...turns].reverse()) {
    for (const sourceItem of turn.items) {
      const item = projectToolItem(sourceItem);
      if (
        !item ||
        item.type !== "fileChange" ||
        !["completed", "done"].includes(item.status.toLowerCase())
      )
        continue;
      item.changes.forEach((change, index) => {
        if (!change.path) return;
        const id = `${turn.id}:${item.id}:${index}`;
        if (seen.has(id)) return;
        seen.add(id);
        const path = reviewFilePath(change.path, cwd);
        const file = files.get(path) ?? {
          path,
          added: 0,
          removed: 0,
          revisions: [],
        };
        const rawDiff = patchForFile(change.diff?.text ?? "", change.path, cwd);
        const stats = filePatchStats(rawDiff);
        file.added += stats.added;
        file.removed += stats.removed;
        file.revisions.push({
          id,
          rawDiff,
          kind: change.kind,
          truncated: Boolean(change.diff?.truncated),
        });
        files.set(path, file);
      });
    }
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}
