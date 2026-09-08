import { WorkflowInlineCode } from "./InlineCode";
import { memo, useMemo, createContext, useContext } from "react";
import { Lexer } from "marked";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { Components } from "react-markdown";
import remend from "remend";
import "highlight.js/styles/github.min.css";
import { WorkflowCodeBlock } from "./CodeBlock";
import { WorkflowMarkdownTable } from "./MarkdownTable";
import { WorkflowMarkdownMedia } from "./MarkdownMedia";
import { WorkflowMarkdownLink } from "./MarkdownLink";
import { markdownUrlTransform } from "./content-target";
import { MarkdownErrorBoundary } from "./MarkdownErrorBoundary";
// Note: import directly from the adapter subdir to avoid a circular dep
// (the parent barrel re-exports this file's source module).
import { rehypeSharedHighlight } from "../adapter/shared-rehype-highlight";

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_HIGHLIGHT_PLUGINS = [rehypeSharedHighlight];
const EMPTY_REHYPE_PLUGINS: [] = [];
function markInlineCode() {
  type Node = {
    type?: string;
    tagName?: string;
    properties?: Record<string, unknown>;
    children?: Node[];
  };
  return (tree: Node) => {
    const walk = (node: Node, parent?: Node, inLink = false) => {
      if (node.tagName === "code" && parent?.tagName !== "pre")
        node.properties = {
          ...node.properties,
          "data-inline-code": true,
          "data-link-label": inLink,
        };
      node.children?.forEach((child) =>
        walk(child, node, inLink || node.tagName === "a"),
      );
    };
    walk(tree);
  };
}
const BlockContext = createContext({ source: "", fenceOpen: false });

function WorkflowHorizontalRule() {
  return <hr aria-hidden="true" className="workflow-markdown-divider" />;
}

const MARKDOWN_COMPONENTS: Components = {
  code: function MarkdownCode({ node, children, className }) {
    return node?.properties?.["data-inline-code"] &&
      !node.properties["data-link-label"] ? (
      <WorkflowInlineCode>{children}</WorkflowInlineCode>
    ) : (
      <code className={className}>{children}</code>
    );
  },
  pre: function MarkdownPre({ children }) {
    const { fenceOpen } = useContext(BlockContext);
    return (
      <WorkflowCodeBlock fenceOpen={fenceOpen}>{children}</WorkflowCodeBlock>
    );
  },
  hr: WorkflowHorizontalRule,
  table: function MarkdownTable({ children, node }) {
    const { source } = useContext(BlockContext);
    return (
      <WorkflowMarkdownTable
        source={source.slice(
          node?.position?.start.offset ?? 0,
          node?.position?.end.offset ?? source.length,
        )}
      >
        {children}
      </WorkflowMarkdownTable>
    );
  },
  a: WorkflowMarkdownLink,
  img: WorkflowMarkdownMedia,
};

const FOOTNOTE_REFERENCE_PATTERN = /\[\^[\w-]{1,200}\](?!:)/;
const FOOTNOTE_DEFINITION_PATTERN = /\[\^[\w-]{1,200}\]:/;
function requiresWholeDocument(markdown: string) {
  return (
    FOOTNOTE_REFERENCE_PATTERN.test(markdown) ||
    FOOTNOTE_DEFINITION_PATTERN.test(markdown) ||
    /(?:^|\n) {0,3}\[[^\]\n]+\]:/.test(markdown) ||
    /(?:^|\n)\s*\$\$/.test(markdown)
  );
}

/**
 * 增量拆分：把流式 markdown 切成「已稳定块 + 增长中的尾部」。
 *
 * 稳定边界 = 最后一个空行（块分隔符）之后：
 * - 原文以空行结尾 → 全部稳定；
 * - 最后一块是闭合代码块（围栏完整）→ 全部稳定；
 * - 否则最后一个空行之后的内容是增长中的尾部（可能还在变）。
 *
 * 返回值语义：
 * - `settledBlocks`：内容已稳定的块，渲染结果可被 memo 完全复用；
 * - `pending`：增长中的最后一块原文（为空表示全部稳定）；
 * - `pendingIsCode`：pending 是未闭合代码块（代码不做语法高亮，保持同一组件实例）。
 */
export function splitIncrementalMarkdown(markdown: string): {
  settledBlocks: string[];
  pending: string;
  pendingIsCode: boolean;
} {
  if (!markdown) {
    return { settledBlocks: [], pending: "", pendingIsCode: false };
  }

  // Footnote references and definitions can affect distant parts of the tree.
  // Keep those documents together so ReactMarkdown can resolve them correctly.
  if (requiresWholeDocument(markdown)) {
    return { settledBlocks: [markdown], pending: "", pendingIsCode: false };
  }

  // A blank line inside an open fence is code, not a stable block boundary.
  const fenceStart = openCodeFenceOffset(markdown);
  if (fenceStart != null)
    return {
      settledBlocks: parseProgressiveMarkdownBlocks(
        markdown.slice(0, fenceStart).trimEnd(),
      ),
      pending: markdown.slice(fenceStart),
      pendingIsCode: true,
    };

  // 原文以空行结尾：最后一个块已被空行分隔，全部稳定。
  if (/(\r?\n)[ \t]*(\r?\n)[ \t]*$/.test(markdown)) {
    return {
      settledBlocks: parseProgressiveMarkdownBlocks(markdown),
      pending: "",
      pendingIsCode: false,
    };
  }

  // 最后一块是闭合代码块（围栏完整）：整个文档已稳定。
  if (!hasUnclosedCodeFence(markdown)) {
    const lastToken = Lexer.lex(markdown, { gfm: true })
      .filter((token) => token.type !== "space")
      .at(-1);
    if (lastToken?.type === "code") {
      return {
        settledBlocks: parseProgressiveMarkdownBlocks(markdown),
        pending: "",
        pendingIsCode: false,
      };
    }
  }

  // 最后一个空行（块分隔符）的结束位置 = 稳定边界。
  let lastBlankEnd = 0;
  const blankRe = /(\r?\n)[ \t]*(\r?\n)/g;
  while (blankRe.exec(markdown) !== null) {
    lastBlankEnd = blankRe.lastIndex;
  }

  const settledText = markdown.slice(0, lastBlankEnd);
  const pending = markdown.slice(lastBlankEnd);
  return {
    settledBlocks: settledText
      ? parseProgressiveMarkdownBlocks(settledText)
      : [],
    pending,
    pendingIsCode: hasUnclosedCodeFence(pending),
  };
}

export function parseProgressiveMarkdownBlocks(markdown: string): string[] {
  if (!markdown) {
    return [];
  }

  // Footnote references and definitions can affect distant parts of the tree.
  // Keep those documents together so ReactMarkdown can resolve them correctly.
  if (requiresWholeDocument(markdown)) {
    return [markdown];
  }

  return Lexer.lex(markdown, { gfm: true })
    .filter((token) => token.type !== "space")
    .map((token) => token.raw)
    .filter(Boolean);
}

export function hasUnclosedCodeFence(markdown: string): boolean {
  return openCodeFenceOffset(markdown) != null;
}

function openCodeFenceOffset(markdown: string): number | null {
  let openFence: { marker: string; length: number; offset: number } | null =
    null;
  let offset = 0;

  for (const lineWithEnding of markdown.match(/[^\n]*(?:\n|$)/g) ?? []) {
    const line = lineWithEnding.replace(/\r?\n$/, "");
    const lineOffset = offset;
    offset += lineWithEnding.length;
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (!match) {
      continue;
    }

    const fence = match[1];
    if (!openFence) {
      if (fence[0] === "`" && line.slice(match[0].length).includes("`"))
        continue;
      openFence = {
        marker: fence[0],
        length: fence.length,
        offset: lineOffset,
      };
      continue;
    }

    const trailingText = line.slice(match[0].length);
    if (
      fence[0] === openFence.marker &&
      fence.length >= openFence.length &&
      /^[\t ]*$/.test(trailingText)
    ) {
      openFence = null;
    }
  }

  return openFence?.offset ?? null;
}

const MarkdownBlock = memo(function MarkdownBlock({
  content,
  highlightCode,
  streaming = false,
}: {
  content: string;
  highlightCode: boolean;
  streaming?: boolean;
}) {
  const fenceOpen = streaming && hasUnclosedCodeFence(content);
  const context = useMemo(
    () => ({ source: content, fenceOpen }),
    [content, fenceOpen],
  );
  return (
    <BlockContext.Provider value={context}>
      <ReactMarkdown
        urlTransform={markdownUrlTransform}
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={[
          markInlineCode,
          [
            rehypeKatex,
            { trust: false, strict: "ignore", throwOnError: false },
          ],
          ...(highlightCode ? REHYPE_HIGHLIGHT_PLUGINS : EMPTY_REHYPE_PLUGINS),
        ]}
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </BlockContext.Provider>
  );
});

const MarkdownDocument = memo(function MarkdownDocument({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const displayContent = useMemo(
    () => (streaming ? remend(content, { linkMode: "text-only" }) : content),
    [content, streaming],
  );
  const { settledBlocks, pending } = useMemo(
    () =>
      streaming
        ? splitIncrementalMarkdown(displayContent)
        : {
            settledBlocks: parseProgressiveMarkdownBlocks(displayContent),
            pending: "",
            pendingIsCode: false,
          },
    [displayContent, streaming],
  );

  return (
    <div className="workflow-markdown" data-kind="workflow-markdown-content">
      {[...settledBlocks, ...(pending ? [pending] : [])].map((block, index) => (
        <MarkdownBlock
          key={index}
          content={block}
          streaming={streaming}
          highlightCode={
            index < settledBlocks.length &&
            !(streaming && hasUnclosedCodeFence(block))
          }
        />
      ))}
    </div>
  );
});

export const WorkflowMarkdownContent = memo(function WorkflowMarkdownContent({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  // content 直接渲染（无缓冲/节流）：主进程已按 ~100ms 合并推送快照，
  // 流式文本随快照渐进更新。之前用 setTimeout 节流会导致 timer 回调被高频
  // 渲染饿死（渲染永远排在 timer 前），流式文本只显示开头、完成时一次性出现。
  return (
    <MarkdownErrorBoundary contentKey={content}>
      <MarkdownDocument content={content} streaming={streaming} />
    </MarkdownErrorBoundary>
  );
});
