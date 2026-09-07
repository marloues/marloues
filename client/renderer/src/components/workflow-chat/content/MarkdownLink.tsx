import styles from "./MarkdownLink.module.css";
import { useEffect, useState, type ReactNode } from "react";
import { WorkflowContentDialog } from "./ContentDialog";
import { useMarkdownContext } from "./MarkdownContext";
import { resolveContentTarget } from "./content-target";
import { WorkflowDetailCopyButton } from "../activity/DetailCopyButton";

export function WorkflowMarkdownLink({
  href = "",
  children,
  className,
}: {
  href?: string;
  children?: ReactNode;
  /** A composed control can own its layout instead of inheriting inline text styles. */
  className?: string;
}) {
  const { cwd } = useMarkdownContext();
  const target = resolveContentTarget(href, cwd);
  const [open, setOpen] = useState(false);
  if (target.kind === "url")
    return (
      <a
        className={className ?? styles.link}
        href={target.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  if (target.kind === "anchor")
    return (
      <a className={className ?? styles.link} href={target.href}>
        {children}
      </a>
    );
  if (target.kind !== "file")
    return (
      <span className={className} title={href}>
        {children}
      </span>
    );
  return (
    <>
      <button
        type="button"
        className={`workflow-file-link ${className ?? styles.link}`}
        title={target.path}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open ? (
        <WorkflowContentDialog
          title={target.path.split(/[\\/]/).at(-1) || "文件预览"}
          onClose={() => setOpen(false)}
        >
          <FilePreview path={target.path} line={target.line} />
        </WorkflowContentDialog>
      ) : null}
    </>
  );
}

function FilePreview({ path, line }: { path: string; line?: number }) {
  const [result, setResult] = useState<{
    path: string;
    text?: string;
    error?: string;
  }>();
  useEffect(() => {
    let disposed = false;
    if (!window.marloues?.fs) {
      setResult({ path, error: "此环境暂不支持读取本地文件" });
      return;
    }
    window.marloues.fs.readFile(path).then(
      (text) => {
        if (!disposed) setResult({ path, text });
      },
      (error) => {
        if (!disposed)
          setResult({
            path,
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      disposed = true;
    };
  }, [path]);
  if (result?.path !== path) return <p role="status">正在读取文件…</p>;
  if (result.error)
    return (
      <p role="alert" className={styles.error}>
        {result.error}
      </p>
    );
  return (
    <div className={`workflow-file-preview ${styles.preview}`}>
      <div className="workflow-code-block-header">
        <span className={styles.path}>
          {path}
          {line ? `:${line}` : ""}
        </span>
        <WorkflowDetailCopyButton
          value={result.text ?? ""}
          label="复制文件内容"
        />
      </div>
      <pre className={styles.code}>
        {(result.text ?? "").split("\n").map((text, i) => (
          <span
            key={i}
            className={`${styles.line} ${line === i + 1 ? `is-target-line ${styles.target}` : ""}`}
            ref={(node) => {
              if (node && line === i + 1)
                node.scrollIntoView({ block: "center" });
            }}
          >
            <span className={`workflow-line-number ${styles.lineNumber}`}>
              {i + 1}
            </span>
            {text}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}
