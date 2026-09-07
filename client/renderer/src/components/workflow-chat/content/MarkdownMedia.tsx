import styles from "./MarkdownMedia.module.css";
import { useState } from "react";
import { WorkflowImageLightbox } from "../activity/ImageLightbox";
import { useMarkdownContext } from "./MarkdownContext";
import { mediaKind, mediaSource } from "./content-target";

export function WorkflowMarkdownMedia({
  src = "",
  alt = "",
  title,
}: {
  src?: string;
  alt?: string;
  title?: string;
}) {
  const { cwd } = useMarkdownContext();
  const source = mediaSource(src, cwd);
  return <Media key={source} source={source} alt={alt} title={title} />;
}

function Media({
  source,
  alt,
  title,
}: {
  source: string;
  alt: string;
  title?: string;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [preview, setPreview] = useState(false);
  const kind = mediaKind(source);
  const name =
    alt || (kind === "audio" ? "音频" : kind === "video" ? "视频" : "图片");
  if (!source || status === "error")
    return (
      <span
        className={`workflow-media-unavailable ${styles.status}`}
        role="status"
      >
        {name}暂不可用
      </span>
    );
  if (kind === "audio" || kind === "video") {
    const Player = kind;
    return (
      <span
        className={`workflow-inline-media ${styles.root}`}
        data-media-kind={kind}
        data-media-status={status}
      >
        {status === "loading" ? (
          <span className={styles.status} role="status">
            正在加载{name}…
          </span>
        ) : null}
        <Player
          src={source}
          controls
          preload="metadata"
          title={title}
          aria-label={name}
          onLoadedMetadata={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
      </span>
    );
  }
  return (
    <span
      className={`workflow-inline-media ${styles.root}`}
      data-media-kind="image"
      data-media-status={status}
    >
      {status === "loading" ? (
        <span
          className={`workflow-media-loading ${styles.status}`}
          role="status"
        >
          正在加载{name}…
        </span>
      ) : null}
      <button
        type="button"
        className={`workflow-markdown-image-button ${styles.imageButton}`}
        aria-label={`预览${name}`}
        disabled={status !== "ready"}
        onClick={() => setPreview(true)}
      >
        <img
          src={source}
          alt={name}
          title={title}
          loading="lazy"
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
      </button>
      {preview ? (
        <WorkflowImageLightbox
          image={{ src: source, name }}
          onClose={() => setPreview(false)}
        />
      ) : null}
    </span>
  );
}
