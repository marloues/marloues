import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  FileText,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { WorkflowReadThreadResponse } from "@shared/workflow-read-thread-contract";
import type { WorkspaceProjectReview } from "@shared/types";
import { useThemeStore } from "@/stores/theme-store";
import { type ReviewTarget, useInspectorStore } from "@/stores/inspector-store";
import {
  DIFF_VIEW_NATURAL_HEIGHT_CSS,
  normalizePatchForDiffs,
} from "@/components/diff";
import { filePatchStats } from "@/components/diff/file-patch";
import { Button, ResizableSplitPane } from "@/components/ui";
import {
  buildSessionReview,
  projectReviewFiles,
  reviewFilePath,
} from "./session-review";
import { copyToClipboard } from "./helpers";
import {
  InspectorEmpty,
  InspectorTree,
  ancestorPaths,
  reviewTree,
} from "./InspectorTree";
import styles from "./InspectorPanel.module.css";

type ReviewScope = "uncommitted" | "lastRound";

const scopeLabels: Record<ReviewScope, string> = {
  uncommitted: "未提交",
  lastRound: "上一轮",
};

const scopeTitles: Record<ReviewScope, string> = {
  uncommitted: "未提交变更",
  lastRound: "上一轮变更",
};

function absoluteReviewPath(path: string, cwd?: string | null): string {
  if (!cwd || /^(?:\/|[a-z]:[\\/])/i.test(path)) return path;
  return `${cwd.replace(/[\\/]$/, "")}/${path}`;
}

export function ReviewPanel({
  reviewTarget,
  readThread,
  workspacePath,
  workspaceId,
}: {
  reviewTarget: ReviewTarget | null;
  readThread?: WorkflowReadThreadResponse;
  workspacePath?: string;
  workspaceId?: string;
}) {
  const diffThemeType = useThemeStore((state) =>
    state.isDark ? "dark" : "light",
  );
  const cwd = readThread?.thread.cwd ?? reviewTarget?.cwd ?? workspacePath;
  const [projectReview, setProjectReview] =
    useState<WorkspaceProjectReview | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [scope, setScope] = useState<ReviewScope>(() =>
    workspaceId ? "uncommitted" : "lastRound",
  );
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [copiedPath, setCopiedPath] = useState<string>();
  const [filter, setFilter] = useState("");
  const [showTree, setShowTree] = useState(true);
  const reviewListRef = useRef<HTMLDivElement>(null);
  const treeToggleRef = useRef<HTMLButtonElement>(null);
  const targetFallbackRef = useRef(0);
  const readThreadRevision =
    readThread?.thread.updatedAt ?? readThread?.turns.length ?? 0;
  const openFile = useInspectorStore((state) => state.openFile);

  useEffect(() => {
    setProjectReview(null);
    if (!cwd || !workspaceId) {
      setProjectLoading(false);
      setProjectError("未找到工作区，无法读取项目变更。");
      return;
    }
    let cancelled = false;
    setProjectLoading(true);
    setProjectError("");
    const timer = window.setTimeout(() => {
      void window.marloues.workspace.getProjectReview(workspaceId, cwd).then(
        (result) => {
          if (cancelled) return;
          if (!result) {
            setProjectReview(null);
            setProjectLoading(false);
            setProjectError("未找到工作区，无法读取项目变更。");
            return;
          }
          setProjectReview(result);
          setProjectLoading(false);
        },
        (error: unknown) => {
          if (cancelled) return;
          setProjectReview(null);
          setProjectLoading(false);
          setProjectError(
            error instanceof Error ? error.message : String(error),
          );
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cwd, workspaceId, refreshKey, readThreadRevision]);

  const lastRoundFiles = useMemo(
    () => buildSessionReview(readThread?.turns.slice(0, 1) ?? [], cwd),
    [readThread, cwd],
  );
  const usingProject = scope === "uncommitted";
  const files = useMemo(() => {
    const projectFiles = projectReviewFiles(projectReview);
    const result = usingProject ? projectFiles : lastRoundFiles;
    if (reviewTarget && scope === "lastRound") {
      const path = reviewFilePath(reviewTarget.path, cwd);
      if (!result.some((file) => file.path === path)) {
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
    }
    return result;
  }, [usingProject, scope, projectReview, lastRoundFiles, reviewTarget, cwd]);

  const filteredFiles = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return files;
    return files.filter((file) => file.path.toLowerCase().includes(query));
  }, [files, filter]);

  const nodes = useMemo(() => reviewTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!reviewTarget) return;
    const path = reviewFilePath(reviewTarget.path, cwd);
    setSelectedPath(path);
    setFilter("");
    setCollapsed(
      (prev) =>
        new Set(
          [...prev].filter((parent) => !ancestorPaths(path).includes(parent)),
        ),
    );
  }, [reviewTarget, cwd]);

  useEffect(() => {
    if (!selectedPath) return;
    const row = reviewListRef.current?.querySelector<HTMLElement>(
      `[data-review-path="${CSS.escape(selectedPath)}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedPath]);

  useEffect(() => {
    if (
      !reviewTarget ||
      projectLoading ||
      targetFallbackRef.current === reviewTarget.seq
    )
      return;
    targetFallbackRef.current = reviewTarget.seq;
    const path = reviewFilePath(reviewTarget.path, cwd);
    if (scope !== "uncommitted" || files.some((file) => file.path === path))
      return;
    setScope("lastRound");
  }, [reviewTarget, cwd, scope, projectLoading, files]);

  const fileCount = usingProject
    ? (projectReview?.files.length ?? 0)
    : files.length;
  const stats = usingProject
    ? {
        added: projectReview?.insertions ?? 0,
        removed: projectReview?.deletions ?? 0,
      }
    : files.reduce(
        (sum, file) => ({
          added: sum.added + file.added,
          removed: sum.removed + file.removed,
        }),
        { added: 0, removed: 0 },
      );
  const expandedTreePaths = new Set(
    files
      .flatMap((file) => ancestorPaths(file.path))
      .filter((path) => !collapsed.has(path)),
  );

  const copyPath = async (path: string) => {
    try {
      await copyToClipboard(absoluteReviewPath(path, cwd));
      setCopiedPath(path);
      window.setTimeout(() => {
        setCopiedPath((current) => (current === path ? undefined : current));
      }, 1200);
    } catch {
      setCopiedPath(undefined);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.scope}>
          <Button
            variant="ghost"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={scopeMenuOpen}
            onClick={() => setScopeMenuOpen((value) => !value)}
          >
            <GitBranch size={14} />
            <span>{scopeLabels[scope]}</span>
            <ChevronDown size={12} />
          </Button>
          {scopeMenuOpen ? (
            <>
              <div
                className={styles.scopeOverlay}
                onClick={() => setScopeMenuOpen(false)}
              />
              <div className={styles.scopeMenu} role="menu">
                {(["uncommitted", "lastRound"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={scope === option}
                    onClick={() => {
                      setScope(option);
                      setScopeMenuOpen(false);
                    }}
                  >
                    <span>{scopeLabels[option]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <strong className={styles.title}>
          {scopeTitles[scope]} · {fileCount} 个文件
        </strong>
        <span
          className={styles.stats}
          title={
            usingProject
              ? "项目工作区相对 HEAD 的行数变更"
              : "会话内各次修改的累计行数"
          }
        >
          <span className={styles.added}>+{stats.added}</span>
          <span className={styles.removed}>−{stats.removed}</span>
        </span>
        {cwd && workspaceId ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="刷新项目变更"
            title="刷新项目变更"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <RefreshCw size={14} />
          </Button>
        ) : null}
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

      {scope === "uncommitted" && projectLoading ? (
        <p role="status" className={styles.message}>
          正在读取项目变更…
        </p>
      ) : null}
      {scope === "uncommitted" && projectError ? (
        <div role="alert" className={`${styles.message} ${styles.error}`}>
          {projectError}
        </div>
      ) : null}
      {scope === "uncommitted" &&
      !projectLoading &&
      projectReview &&
      !projectReview.isRepository ? (
        <p className={styles.message}>
          当前目录不是 Git 仓库，未提交差异不可用。
        </p>
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
            selected={selectedPath}
            expanded={expandedTreePaths}
            onToggle={(path) =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              })
            }
            onSelect={setSelectedPath}
            filter={filter}
            onFilter={setFilter}
          />
        }
      >
        <div className={styles.reviewPane}>
          <div
            ref={reviewListRef}
            data-review-list
            className={`${styles.reviewList} scrollbar-thin`}
          >
            {filteredFiles.length ? (
              <ul aria-label="审核文件列表">
                {filteredFiles.map((file) => {
                  const open = selectedPath === file.path;
                  return (
                    <li
                      key={file.path}
                      className={styles.reviewItem}
                      data-open={open ? "true" : "false"}
                      data-review-path={file.path}
                    >
                      <div className={styles.reviewFileRow}>
                        <button
                          type="button"
                          className={styles.reviewFileButton}
                          aria-label={file.path}
                          aria-expanded={open}
                          aria-current={open ? "true" : undefined}
                          title={file.path}
                          onClick={() =>
                            setSelectedPath((previous) =>
                              previous === file.path ? undefined : file.path,
                            )
                          }
                        >
                          {open ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                          <FileText size={14} />
                          <span className={styles.reviewFilePath}>
                            {file.path}
                          </span>
                          <span className={styles.stats}>
                            <span className={styles.added}>+{file.added}</span>
                            <span className={styles.removed}>
                              −{file.removed}
                            </span>
                          </span>
                        </button>
                        <div className={styles.reviewFileActions}>
                          <button
                            type="button"
                            className={styles.reviewFileAction}
                            aria-label={`复制路径：${file.path}`}
                            title={
                              copiedPath === file.path
                                ? "路径已复制"
                                : "复制路径"
                            }
                            onClick={() => void copyPath(file.path)}
                          >
                            {copiedPath === file.path ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            className={styles.reviewFileAction}
                            aria-label={`打开文件：${file.path}`}
                            title="打开文件"
                            onClick={() =>
                              openFile(absoluteReviewPath(file.path, cwd), {
                                sessionId:
                                  readThread?.thread.id ??
                                  reviewTarget?.sessionId,
                                cwd,
                              })
                            }
                          >
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      </div>

                      {open ? (
                        <section
                          className={styles.reviewContent}
                          aria-label={`审核差异：${file.path}`}
                        >
                          {file.revisions.map((revision) => {
                            const patch = normalizePatchForDiffs(
                              revision.rawDiff,
                              file.path,
                            );
                            return (
                              <div
                                key={revision.id}
                                className={styles.reviewDiff}
                              >
                                {revision.truncated ? (
                                  <p className={styles.message}>
                                    此差异已被截断，仅展示已记录的部分。
                                  </p>
                                ) : null}
                                {revision.kind === "binary" ? (
                                  <p className={styles.message}>
                                    此文件为二进制文件，没有可展示的文本差异。
                                  </p>
                                ) : null}
                                {patch && revision.kind !== "binary" ? (
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
                                      stickyHeader: false,
                                      hunkSeparators: "line-info",
                                      disableFileHeader: true,
                                      unsafeCSS: DIFF_VIEW_NATURAL_HEIGHT_CSS,
                                    }}
                                  />
                                ) : revision.kind === "binary" ? null : (
                                  <p className={styles.message}>
                                    此修改未记录差异内容。
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </section>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : files.length ? (
              <p className={styles.message}>没有匹配的文件</p>
            ) : (
              <InspectorEmpty title="暂无审核内容">
                当前范围的文件变更会集中显示在这里。
              </InspectorEmpty>
            )}
          </div>
        </div>
      </ResizableSplitPane>
    </div>
  );
}
