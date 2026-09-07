import { Button } from "@/components/ui/button";
import styles from "./McpResult.module.css";
import { useState } from "react";
import { WorkflowContentDialog } from "../content/ContentDialog";
import type { WorkflowToolResult } from "@shared/workflow-tool-result";
import { WorkflowMarkdownContent } from "../content/MarkdownContent";
import { WorkflowMarkdownMedia } from "../content/MarkdownMedia";
import { WorkflowMarkdownLink } from "../content/MarkdownLink";
import { WorkflowCodeBlock } from "../content/CodeBlock";
import { WorkflowDetailCopyButton } from "./DetailCopyButton";

export function WorkflowMcpResult({ result }: { result: WorkflowToolResult }) {
  const [rawOpen, setRawOpen] = useState(false);
  const duplicate =
    result.structuredContent !== undefined &&
    result.content.some((value) => {
      const block = record(value);
      if (block.type !== "text" || typeof block.text !== "string") return false;
      try {
        return (
          JSON.stringify(JSON.parse(block.text)) ===
          JSON.stringify(result.structuredContent)
        );
      } catch {
        return block.text === result.structuredContent;
      }
    });
  return (
    <div
      className={`workflow-mcp-result ${styles.result}`}
      data-kind="mcp-result"
    >
      {result.isError ? (
        <p role="alert" className={styles.error}>
          工具返回错误
        </p>
      ) : null}
      {result.content.map((block, index) => (
        <ContentBlock key={index} value={block} />
      ))}
      {result.structuredContent !== undefined && !duplicate ? (
        <RawContent title="结构化结果" value={result.structuredContent} />
      ) : null}
      <Button
        className={styles.action}
        size="sm"
        variant="outline"
        type="button"
        onClick={() => setRawOpen(true)}
      >
        查看原始结果
      </Button>
      {rawOpen ? (
        <WorkflowContentDialog
          title="原始工具结果"
          onClose={() => setRawOpen(false)}
        >
          <RawContent title="完整结果" value={result} />
        </WorkflowContentDialog>
      ) : null}
      {!result.content.length && result.structuredContent === undefined ? (
        <p className="workflow-tool-empty">无输出</p>
      ) : null}
    </div>
  );
}

function ContentBlock({ value }: { value: unknown }) {
  const block = record(value);
  if (block.type === "text" && typeof block.text === "string")
    return <WorkflowMarkdownContent content={block.text} />;
  if (
    (block.type === "image" || block.type === "audio") &&
    typeof block.data === "string" &&
    typeof block.mimeType === "string" &&
    /^(image|audio)\/[a-z\d.+-]+$/i.test(block.mimeType)
  ) {
    return (
      <WorkflowMarkdownMedia
        src={`data:${block.mimeType};base64,${block.data}`}
        alt={
          typeof block.name === "string"
            ? block.name
            : block.type === "image"
              ? "工具返回图片"
              : "工具返回音频"
        }
      />
    );
  }
  if (block.type === "resource_link" && typeof block.uri === "string")
    return <ResourceLink block={block} />;
  if (block.type === "resource") {
    const resource = record(block.resource);
    if (typeof resource.text === "string")
      return (
        <section className={`workflow-mcp-resource ${styles.resource}`}>
          <ResourceLink block={resource} />
          {resource.mimeType === "text/markdown" ? (
            <WorkflowMarkdownContent content={resource.text} />
          ) : (
            <WorkflowCodeBlock>
              <code>{resource.text}</code>
            </WorkflowCodeBlock>
          )}
        </section>
      );
    if (
      typeof resource.blob === "string" &&
      typeof resource.mimeType === "string" &&
      /^(image|audio|video)\/[a-z\d.+-]+$/i.test(resource.mimeType)
    )
      return (
        <WorkflowMarkdownMedia
          src={`data:${resource.mimeType};base64,${resource.blob}`}
          alt={String(resource.uri ?? "工具资源")}
        />
      );
    return <RawContent title="资源内容" value={resource} />;
  }
  return <RawContent title="其他工具内容" value={value} />;
}

function ResourceLink({ block }: { block: Record<string, unknown> }) {
  const uri = typeof block.uri === "string" ? block.uri : "";
  const name = typeof block.name === "string" ? block.name : uri || "资源";
  return (
    <div className={`workflow-mcp-resource-link ${styles.resourceLink}`}>
      <WorkflowMarkdownLink href={uri}>{name}</WorkflowMarkdownLink>
      {typeof block.description === "string" ? (
        <small>{block.description}</small>
      ) : null}
      {uri ? (
        <WorkflowDetailCopyButton value={uri} label="复制资源地址" />
      ) : null}
    </div>
  );
}
function RawContent({ title, value }: { title: string; value: unknown }) {
  return (
    <section className={styles.raw}>
      <small>{title}</small>
      <WorkflowCodeBlock>
        <code className="language-json">
          {JSON.stringify(value, null, 2) ?? String(value)}
        </code>
      </WorkflowCodeBlock>
    </section>
  );
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
