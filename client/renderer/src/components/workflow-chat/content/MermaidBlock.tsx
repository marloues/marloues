import styles from "./MermaidBlock.module.css";
import { useEffect, useId, useState } from "react";
import {
  diagramThemeVariables,
  useConversationTheme,
  type ConversationTheme,
} from "./conversation-theme";
import { WorkflowImageLightbox } from "../activity/ImageLightbox";
import { WorkflowDetailCopyButton } from "../activity/DetailCopyButton";
import { Button, FloatingActions } from "@/components/ui";

// initialize and render share Mermaid configuration; serialize them together.
let queue: Promise<unknown> = Promise.resolve();
function renderDiagram(id: string, code: string, theme: ConversationTheme) {
  const result = queue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: diagramThemeVariables(theme),
      themeCSS: ".node rect { rx: 8px; ry: 8px; }",
      suppressErrorRendering: true,
      maxTextSize: 50_000,
    });
    if (!(await mermaid.parse(code, { suppressErrors: true })))
      throw new Error("图表语法暂不完整");
    // Mermaid measures temporary SVG geometry synchronously. The app's
    // reduced-motion reset must not animate those dimensions between reads.
    const surface = document.createElement("div");
    surface.className = styles.renderSurface;
    surface.setAttribute("aria-hidden", "true");
    surface.setAttribute("inert", "");
    document.body.append(surface);
    try {
      return await mermaid.render(id, code, surface);
    } finally {
      surface.remove();
    }
  });
  queue = result.catch(() => undefined);
  return result;
}

export function WorkflowMermaidBlock({
  code,
  fenceOpen,
}: {
  code: string;
  fenceOpen: boolean;
}) {
  const id = useId().replace(/[^a-z\d]/gi, "");
  const theme = useConversationTheme();
  const key = `${JSON.stringify(theme)}:${code}`;
  const [result, setResult] = useState<{
    key: string;
    svg?: string;
    width?: number;
    error?: boolean;
  }>();
  const [source, setSource] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (!theme) return;
    let disposed = false;
    const timer = setTimeout(
      () => {
        void renderDiagram(`diagram${id}`, code, theme).then(
          ({ svg }) => {
            const width = Number(
              svg
                .match(/\bviewBox="([^"]+)"/)?.[1]
                .trim()
                .split(/[\s,]+/)[2],
            );
            if (!disposed)
              setResult({
                key,
                svg,
                width: Number.isFinite(width) && width > 0 ? width : undefined,
              });
          },
          () => {
            if (!disposed) setResult({ key, error: true });
          },
        );
      },
      fenceOpen ? 250 : 0,
    );
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [code, theme, fenceOpen, id, key]);
  const current = result?.key === key;
  const failed = current && result.error && !fenceOpen;
  const src = result?.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`
    : "";
  return (
    <div
      className={`workflow-mermaid-block ${styles.root}${source || failed ? " workflow-code-block" : ""}`}
      data-kind="mermaid-block"
      data-floating-actions-host
      aria-busy={!current}
    >
      <FloatingActions>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={source}
          onClick={() => setSource((value) => !value)}
        >
          {source ? "图表" : "源码"}
        </Button>
        {!fenceOpen ? (
          <WorkflowDetailCopyButton value={code} label="复制图表源码" />
        ) : null}
        {src && !failed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreview(true)}
          >
            预览图表
          </Button>
        ) : null}
      </FloatingActions>
      {source || failed ? (
        <>
          <span
            className={`workflow-mermaid-status ${styles.status}`}
            role="status"
          >
            {failed ? "图表暂时无法渲染，已保留源码" : ""}
          </span>
          <pre className="workflow-code-block-body">{code}</pre>
        </>
      ) : src ? (
        <img
          className={`workflow-mermaid-image ${styles.image}`}
          style={{ width: result?.width }}
          src={src}
          alt="Mermaid 图表"
        />
      ) : (
        <div
          className={`workflow-mermaid-placeholder ${styles.placeholder}`}
          role="status"
        >
          {fenceOpen ? "正在生成图表…" : "正在渲染图表…"}
        </div>
      )}
      {preview && src ? (
        <WorkflowImageLightbox
          image={{ src, name: "图表.svg" }}
          onClose={() => setPreview(false)}
        />
      ) : null}
    </div>
  );
}
