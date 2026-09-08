import { useEffect, useMemo, useRef, useState } from "react";
import { Folder, FileText } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { WorkflowReadThreadResponse } from "@shared/workflow-read-thread-contract";
import { useThemeStore } from "@/stores/theme-store";
import { type ReviewTarget, useInspectorStore } from "@/stores/inspector-store";
import {
  DIFF_VIEW_SCROLL_CSS,
  normalizePatchForDiffs,
} from "@/components/diff";
import { filePatchStats } from "@/components/diff/file-patch";
import { Button, ResizableSplitPane } from "@/components/ui";
import { WorkflowDetailCopyButton } from "@/components/workflow-chat/activity/DetailCopyButton";
import { buildSessionReview, reviewFilePath } from "./session-review";
import {
  InspectorEmpty,
  InspectorTree,
  ancestorPaths,
  reviewTree,
} from "./InspectorTree";
import styles from "./InspectorPanel.module.css";

export function ReviewPanel({
  reviewTarget,
  readThread,
  workspacePath,
  history,
}: {
  reviewTarget: ReviewTarget | null;
  readThread?: WorkflowReadThreadResponse;
  workspacePath?: string;
  history?: { loading: boolean; error: string; retry: () => void };
}) {
  const diffThemeType = useThemeStore((state) =>
    state.isDark ? "dark" : "light",
  );
  const openFile = useInspectorStore((state) => state.openFile);
  const openReview = useInspectorStore((state) => state.openReview);
  const cwd = readThread?.thread.cwd ?? reviewTarget?.cwd ?? workspacePath;
  const files = useMemo(() => {
    const result = buildSessionReview(readThread?.turns ?? [], cwd);
    if (reviewTarget) {
      const path = reviewFilePath(reviewTarget.path, cwd);
      if (!result.some((file) => file.path === path))
        result.push({
          path,
          ...filePatchStats(reviewTarget.rawDiff),
          revisions: [
            {
              id: `target-${reviewTarget.seq}`,
              rawDiff: reviewTarget.rawDiff,
              kind: "update",
              truncated: false,
            },
          ],
        });
    }
    return result;
  }, [readThread, reviewTarget, cwd]);
  const nodes = useMemo(() => reviewTree(files), [files]);
  const [selection, setSelection] = useState<string>();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [showTree, setShowTree] = useState(true);
  const treeToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!reviewTarget) return;
    const path = reviewFilePath(reviewTarget.path, cwd);
    setSelection(path);
    setFilter("");
    setCollapsed(
      (prev) =>
        new Set(
          [...prev].filter((parent) => !ancestorPaths(path).includes(parent)),
        ),
    );
  }, [reviewTarget, cwd]);
  const selected = files.find((file) => file.path === selection) ?? files[0];
  const expanded = new Set(
    files
      .flatMap((file) => ancestorPaths(file.path))
      .filter((path) => !collapsed.has(path)),
  );
  const stats = files.reduce(
    (sum, file) => ({
      added: sum.added + file.added,
      removed: sum.removed + file.removed,
    }),
    { added: 0, removed: 0 },
  );
  const fullPath =
    selected && cwd && !/^(?:\/|[a-z]:[\\/])/i.test(selected.path)
      ? `${cwd.replace(/[\\/]$/, "")}/${selected.path}`
      : selected?.path;
  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <strong className={styles.title}>
          会话变更 · {files.length} 个文件
        </strong>
        <span className={styles.stats} title="会话内各次修改的累计行数">
          <span className={styles.added}>+{stats.added}</span>
          <span className={styles.removed}>−{stats.removed}</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          ref={treeToggleRef}
          aria-label="审核文件目录树"
          aria-pressed={showTree}
          onClick={() => setShowTree((value) => !value)}
        >
          <Folder size={16} />
        </Button>
      </div>
      {history?.loading ? (
        <p role="status" className={styles.message}>
          正在汇总更早的会话变更…
        </p>
      ) : null}
      {history?.error ? (
        <div role="alert" className={`${styles.message} ${styles.error}`}>
          {history.error}{" "}
          <Button variant="outline" size="sm" onClick={history.retry}>
            重试
          </Button>
        </div>
      ) : null}
      <ResizableSplitPane
        label="调整审核目录宽度"
        asideOpen={showTree}
        onAsideOpenChange={(open) => {
          setShowTree(open);
          if (!open) treeToggleRef.current?.focus();
        }}
        aside={
          <InspectorTree
            nodes={nodes}
            selected={selected?.path}
            expanded={expanded}
            onToggle={(path) =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              })
            }
            onSelect={(path) => {
              const file = files.find((entry) => entry.path === path);
              if (file)
                openReview(path, file.revisions.at(-1)?.rawDiff ?? "", {
                  sessionId: readThread?.thread.id ?? reviewTarget?.sessionId,
                  cwd,
                });
            }}
            filter={filter}
            onFilter={setFilter}
          />
        }
      >
        <div className={`${styles.content} scrollbar-thin`}>
          {selected ? (
            <>
              <div className={styles.revisionHead}>
                <span className={styles.title} title={fullPath}>
                  {selected.path}
                </span>
                <span className={styles.stats}>
                  <span className={styles.added}>+{selected.added}</span>
                  <span className={styles.removed}>−{selected.removed}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="打开此文件"
                  onClick={() =>
                    fullPath &&
                    openFile(fullPath, {
                      sessionId:
                        readThread?.thread.id ?? reviewTarget?.sessionId,
                      cwd,
                    })
                  }
                >
                  <FileText size={14} />
                </Button>
              </div>
              {selected.revisions.length > 1 ? (
                <p className={styles.message}>
                  此文件共 {selected.revisions.length} 次修改，按发生顺序展示。
                </p>
              ) : null}
              {selected.revisions.map((revision, index) => {
                const patch = normalizePatchForDiffs(
                  revision.rawDiff,
                  selected.path,
                );
                return (
                  <section
                    key={revision.id}
                    className={styles.revision}
                    aria-label={`第 ${index + 1} 次修改`}
                  >
                    <div className={styles.revisionHead}>
                      <span className={styles.title}>
                        第 {index + 1} 次修改
                      </span>
                      <WorkflowDetailCopyButton
                        value={revision.rawDiff}
                        label="复制差异"
                      />
                    </div>
                    {revision.truncated ? (
                      <p className={styles.message}>
                        此差异已被截断，仅展示已记录的部分。
                      </p>
                    ) : null}
                    {patch ? (
                      <PatchDiff
                        patch={patch}
                        className="workflow-patch-diff-view"
                        disableWorkerPool
                        options={{
                          themeType: diffThemeType,
                          diffStyle: "unified",
                          diffIndicators: "bars",
                          lineDiffType: "word-alt",
                          overflow: "scroll",
                          stickyHeader: true,
                          hunkSeparators: "line-info",
                          unsafeCSS: DIFF_VIEW_SCROLL_CSS,
                        }}
                      />
                    ) : (
                      <p className={styles.message}>此修改未记录差异内容。</p>
                    )}
                  </section>
                );
              })}
            </>
          ) : (
            <InspectorEmpty title="暂无审核内容">
              当前会话的文件变更会集中显示在这里。
            </InspectorEmpty>
          )}
        </div>
      </ResizableSplitPane>
    </div>
  );
}
