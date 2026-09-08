import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/common";
import { FileText, Folder, RefreshCcw } from "lucide-react";
import type { DirEntry, MarlouesAPI } from "@shared/types";
import { type FileTarget, useInspectorStore } from "@/stores/inspector-store";
import { Button, ResizableSplitPane } from "@/components/ui";
import { WorkflowDetailCopyButton } from "@/components/workflow-chat/activity/DetailCopyButton";
import {
  InspectorEmpty,
  InspectorTree,
  ancestorPaths,
  type InspectorTreeNode,
} from "./InspectorTree";
import { reviewFilePath } from "./session-review";
import { languageFromPath } from "./helpers";
import styles from "./InspectorPanel.module.css";

export type InspectorFileSystem = Pick<
  MarlouesAPI["fs"],
  "readFile" | "listDir"
>;

export function FileExplorer({
  workspacePath,
  fileTarget,
  fileSystem,
  sessionId,
}: {
  workspacePath?: string;
  fileTarget?: FileTarget;
  fileSystem?: InspectorFileSystem;
  sessionId?: string;
}) {
  const openFile = useInspectorStore((state) => state.openFile);
  const fs = fileSystem ?? window.marloues?.fs;
  const workspaceRoot = (workspacePath ?? fileTarget?.cwd ?? "").replace(
    /\\/g,
    "/",
  );
  const root = workspaceRoot === "/" ? "/" : workspaceRoot.replace(/\/$/, "");
  const absolute = useCallback(
    (path: string) =>
      /^(?:\/|[a-z]:[\\/])/i.test(path)
        ? path
        : `${root.replace(/\/$/, "")}/${path === "." ? "" : path}`,
    [root],
  );
  const [entries, setEntries] = useState<Record<string, DirEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [directoryError, setDirectoryError] = useState("");
  const [selection, setSelection] = useState<{ path: string; line?: number }>();
  const [result, setResult] = useState<{ text?: string; error?: string }>({});
  const [filter, setFilter] = useState("");
  const [showTree, setShowTree] = useState(true);
  const treeToggleRef = useRef<HTMLButtonElement>(null);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const pendingDirs = useRef(new Map<string, Promise<void>>());
  const loadDir = useCallback(
    (path: string) => {
      const pending = pendingDirs.current.get(path);
      if (pending) return pending;
      if (!root || !fs?.listDir) return Promise.resolve();
      const version = generation.current;
      setLoading((prev) => new Set(prev).add(path));
      const request = Promise.resolve()
        .then(() => fs.listDir(absolute(path)))
        .then((next) => {
          if (version !== generation.current) return;
          setEntries((prev) => ({
            ...prev,
            [path]: next.sort(
              (a, b) =>
                Number(b.isDirectory) - Number(a.isDirectory) ||
                a.name.localeCompare(b.name),
            ),
          }));
        })
        .catch((error) => {
          if (version === generation.current)
            setDirectoryError(
              String(error instanceof Error ? error.message : error),
            );
        })
        .finally(() => {
          if (version !== generation.current) return;
          pendingDirs.current.delete(path);
          setLoading((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        });
      pendingDirs.current.set(path, request);
      return request;
    },
    [root, fs, absolute],
  );

  useEffect(() => {
    generation.current += 1;
    pendingDirs.current.clear();
    setEntries({});
    setExpanded(new Set());
    setLoading(new Set());
    setDirectoryError("");
    setFilter("");
    setSelection(undefined);
    void loadDir(".");
    return () => {
      generation.current += 1;
    };
  }, [loadDir]);

  useEffect(() => {
    if (!fileTarget) return;
    const path = reviewFilePath(fileTarget.path, root);
    setSelection({ path, line: fileTarget.line });
    const ancestors = ancestorPaths(path);
    setExpanded((prev) => new Set([...prev, ...ancestors]));
    setFilter("");
    // Files outside the workspace are readable, but do not replace the workspace tree.
    if (!/^(?:\/|[a-z]:)/i.test(path) && !path.startsWith("../"))
      ancestors.forEach((parent) => void loadDir(parent));
  }, [fileTarget, root, loadDir]);

  useEffect(() => {
    setResult({});
    if (!selection) return;
    let disposed = false;
    const reader = fileTarget?.readFile ?? fs?.readFile;
    if (!reader) {
      setResult({ error: "此环境暂不支持读取本地文件" });
      return;
    }
    Promise.resolve()
      .then(() => reader(absolute(selection.path)))
      .then(
        (text) => {
          if (!disposed) setResult({ text });
        },
        (error) => {
          if (!disposed)
            setResult({
              error: error instanceof Error ? error.message : String(error),
            });
        },
      );
    return () => {
      disposed = true;
    };
  }, [selection, fileTarget?.readFile, fs, absolute, reload]);

  const nodes = useMemo(() => {
    const build = (path: string): InspectorTreeNode[] =>
      (entries[path] ?? []).map((entry) => {
        const child = path === "." ? entry.name : `${path}/${entry.name}`;
        return {
          path: child,
          name: entry.name,
          directory: entry.isDirectory,
          children: entry.isDirectory ? build(child) : undefined,
        };
      });
    return build(".");
  }, [entries]);
  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    if (!entries[path]) void loadDir(path);
  };
  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <FileText size={16} />
        <span
          className={styles.title}
          title={selection ? absolute(selection.path) : root}
        >
          {selection?.path ?? (root || "/")}
          {selection?.line ? `:${selection.line}` : ""}
        </span>
        {result.text !== undefined ? (
          <WorkflowDetailCopyButton value={result.text} label="复制文件内容" />
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="重新加载文件和目录"
          onClick={() => {
            setReload((value) => value + 1);
            setDirectoryError("");
            void loadDir(".");
            expanded.forEach((path) => void loadDir(path));
          }}
        >
          <RefreshCcw size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          ref={treeToggleRef}
          aria-label="文件目录树"
          aria-pressed={showTree}
          onClick={() => setShowTree((value) => !value)}
        >
          <Folder size={16} />
        </Button>
      </div>
      {directoryError ? (
        <p role="alert" className={`${styles.message} ${styles.error}`}>
          {directoryError}
        </p>
      ) : null}
      <ResizableSplitPane
        label="调整文件目录宽度"
        asideOpen={showTree}
        onAsideOpenChange={(open) => {
          setShowTree(open);
          if (!open) treeToggleRef.current?.focus();
        }}
        aside={
          <InspectorTree
            nodes={nodes}
            selected={selection?.path}
            expanded={expanded}
            onToggle={toggle}
            onSelect={(path) =>
              openFile(absolute(path), {
                sessionId: sessionId ?? fileTarget?.sessionId,
                cwd: root,
                readFile: fileTarget?.readFile,
              })
            }
            filter={filter}
            onFilter={setFilter}
            loading={loading}
            keepDirectories
          />
        }
      >
        <div className={`${styles.content} scrollbar-thin`}>
          {!selection ? (
            <InspectorEmpty title="打开文件">
              从工作区目录树中选择文件
            </InspectorEmpty>
          ) : result.error ? (
            <p role="alert" className={`${styles.message} ${styles.error}`}>
              {result.error}
            </p>
          ) : result.text === undefined ? (
            <p role="status" className={styles.message}>
              正在读取文件…
            </p>
          ) : (
            <FilePreviewCode
              path={selection.path}
              content={result.text}
              line={selection.line}
            />
          )}
        </div>
      </ResizableSplitPane>
    </div>
  );
}

function FilePreviewCode({
  path,
  content,
  line,
}: {
  path: string;
  content: string;
  line?: number;
}) {
  const lines = useMemo(() => {
    const language = languageFromPath(path);
    return content
      .split(/\r?\n/)
      .map((text) =>
        hljs.getLanguage(language)
          ? hljs.highlight(text, { language, ignoreIllegals: true }).value
          : null,
      );
  }, [path, content]);
  const targetRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    targetRef.current?.scrollIntoView({ block: "center" });
  }, [content, line]);
  return (
    <pre className={`${styles.code} workflow-file-preview`}>
      {content.split(/\r?\n/).map((text, index) => (
        <span
          key={index}
          ref={line === index + 1 ? targetRef : undefined}
          className={`${styles.line} ${line === index + 1 ? "is-target-line" : ""}`}
          data-target={line === index + 1}
        >
          <span className={styles.lineNumber}>{index + 1}</span>
          {lines[index] !== null ? (
            <code dangerouslySetInnerHTML={{ __html: lines[index] }} />
          ) : (
            <code>{text || " "}</code>
          )}
        </span>
      ))}
    </pre>
  );
}
