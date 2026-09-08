import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui";
import styles from "./InspectorPanel.module.css";

export interface InspectorTreeNode {
  path: string;
  name: string;
  directory: boolean;
  children?: InspectorTreeNode[];
  detail?: string;
}

export function InspectorTree({
  nodes,
  selected,
  expanded,
  onToggle,
  onSelect,
  filter,
  onFilter,
  keepDirectories = false,
  loading,
}: {
  nodes: InspectorTreeNode[];
  selected?: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  filter: string;
  onFilter: (value: string) => void;
  keepDirectories?: boolean;
  loading?: Set<string>;
}) {
  const query = filter.trim().toLowerCase();
  const matches = (node: InspectorTreeNode): boolean =>
    !query ||
    node.path.toLowerCase().includes(query) ||
    Boolean(node.children?.some(matches)) ||
    (keepDirectories && node.directory);
  const renderNodes = (items: InspectorTreeNode[], depth = 0) =>
    items.filter(matches).map((node) => {
      const isOpen =
        expanded.has(node.path) ||
        Boolean(query && node.children?.some(matches));
      return (
        <li key={node.path}>
          <Button
            variant="ghost"
            size="sm"
            className={styles.treeRow}
            title={node.path}
            aria-label={node.directory ? node.name : node.path}
            aria-expanded={node.directory ? isOpen : undefined}
            aria-current={
              !node.directory && selected === node.path ? "true" : undefined
            }
            style={{
              paddingInlineStart: `calc(var(--space-2) + ${depth} * var(--space-4))`,
            }}
            onClick={() =>
              node.directory ? onToggle(node.path) : onSelect(node.path)
            }
          >
            {node.directory ? (
              isOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : (
              <FileText size={14} />
            )}
            <span className={styles.treeName}>{node.name}</span>
            {loading?.has(node.path) ? (
              <span className={styles.muted}>…</span>
            ) : node.detail ? (
              <small className={styles.muted}>{node.detail}</small>
            ) : null}
          </Button>
          {node.directory && isOpen && node.children ? (
            <ul>{renderNodes(node.children, depth + 1)}</ul>
          ) : null}
        </li>
      );
    });
  const visible = nodes.filter(matches);
  return (
    <div className={styles.tree}>
      <label className={styles.filter}>
        <Search size={14} />
        <input
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="筛选文件…"
          aria-label="筛选文件"
        />
      </label>
      <div className={`${styles.treeScroll} scrollbar-thin`}>
        {visible.length ? (
          <ul aria-label="文件目录">{renderNodes(visible)}</ul>
        ) : (
          <p className={styles.message}>
            {loading?.size
              ? "正在读取目录…"
              : query
                ? "没有匹配的文件"
                : "暂无文件"}
          </p>
        )}
      </div>
    </div>
  );
}

export function InspectorEmpty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <Folder size={32} />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

/** Review has a known complete path list, so its directory tree is eager. */
export function reviewTree(
  paths: { path: string; revisions: unknown[] }[],
): InspectorTreeNode[] {
  const roots: InspectorTreeNode[] = [];
  for (const file of paths) {
    const parts = file.path.split("/").filter(Boolean);
    let siblings = roots;
    let parent = file.path.startsWith("//")
      ? "//"
      : file.path.startsWith("/")
        ? "/"
        : "";
    parts.forEach((name, index) => {
      const path = `${parent}${name}`;
      const directory = index < parts.length - 1;
      let node = siblings.find((entry) => entry.path === path);
      if (!node) {
        node = {
          name,
          path,
          directory,
          children: directory ? [] : undefined,
          detail:
            !directory && file.revisions.length > 1
              ? `${file.revisions.length} 次`
              : undefined,
        };
        siblings.push(node);
      }
      siblings = node.children ?? [];
      parent = `${path}/`;
    });
  }
  const sort = (nodes: InspectorTreeNode[]) => {
    nodes.sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        a.name.localeCompare(b.name),
    );
    nodes.forEach((node) => node.children && sort(node.children));
  };
  sort(roots);
  return roots;
}

export function ancestorPaths(path: string): string[] {
  const parts = path.split("/");
  return parts
    .slice(0, -1)
    .map((_, index) => parts.slice(0, index + 1).join("/"))
    .filter(Boolean);
}
