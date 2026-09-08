import styles from "./MarkdownLink.module.css";
import { Children, isValidElement, type ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import { useInspectorStore } from "@/stores/inspector-store";
import { useMarkdownContext } from "./MarkdownContext";
import { resolveContentTarget } from "./content-target";

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
    <WorkflowFileLink
      path={target.path}
      line={target.line}
      sourceHref={href}
      className={className}
    >
      {children}
    </WorkflowFileLink>
  );
}

/** 已解析的文件路径不再按 Markdown URL 解码，保留文件名中的 %、# 等字符。 */
export function WorkflowFileLink({
  path,
  line,
  children,
  className,
  sourceHref,
}: {
  path: string;
  line?: number;
  children?: ReactNode;
  className?: string;
  /** 仅用于识别 Markdown 原始路径标签，不参与文件读取或二次解码。 */
  sourceHref?: string;
}) {
  const { sessionId, cwd, readFile } = useMarkdownContext();
  const openFile = useInspectorStore((state) => state.openFile);
  const basename = path.split(/[\\/]/).at(-1) || path;
  const lineSuffix = line ? `:${line}` : "";
  const title = `${path}${lineSuffix}`;
  const labelText = fileLinkText(children).trim();
  const useFilename =
    !labelText ||
    labelText === path ||
    labelText === title ||
    labelText === sourceHref?.trim() ||
    (line && labelText === `${path} (line ${line})`);
  const hasLineSuffix =
    line &&
    [lineSuffix, `#L${line}`, `(line ${line})`].some((suffix) =>
      labelText.endsWith(suffix),
    );
  return (
    <Tooltip content={title} delay={350}>
      <button
        type="button"
        className={`workflow-file-link ${className ?? styles.link}`}
        onClick={() => openFile(path, { line, sessionId, cwd, readFile })}
      >
        {useFilename ? `${basename}${lineSuffix}` : children}
        {!useFilename && !hasLineSuffix ? lineSuffix : null}
      </button>
    </Tooltip>
  );
}

/** 保留自定义标签的 React 格式，仅提取文字来判断是否使用默认文件名。 */
function fileLinkText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? fileLinkText(child.props.children)
        : "";
    })
    .join("");
}
