import { Button, HoverPreview } from "@/components/ui";
import { filePatchStats, patchForFile } from "@/components/diff/file-patch";
import { useUnifiedChatStore } from "@/stores/unified-chat-store";
import { useRef, useState, type RefObject } from "react";
import { useMarkdownContext } from "../content/MarkdownContext";
import {
  ExternalLink,
  FileText,
  Globe2,
  Image as ImageIcon,
} from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import { useInspectorStore } from "@/stores/inspector-store";
import { useThemeStore } from "@/stores/theme-store";
import {
  DIFF_VIEW_SCROLL_CSS,
  normalizePatchForDiffs,
} from "@/components/diff/patch-helpers";
import type { WorkflowTurnItem } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import { itemInputText, itemOutputText } from "../";
import {
  WorkflowImageLightbox,
  type WorkflowImagePreview,
} from "./ImageLightbox";
import { workflowImageSource } from "./image-source";
import { imageGenerationLabel } from "./ImageGenerationRow";
import {
  ConversationChangesIcon,
  ConversationChevronDownIcon,
} from "../conversation-icons";

type ProcessItem = Exclude<
  WorkflowTurnItem,
  { type: "agentMessage" | "userMessage" }
>;
type FileChangeItemModel = Extract<WorkflowTurnItem, { type: "fileChange" }>;
type ToolLikeItem = Exclude<
  ProcessItem,
  Extract<WorkflowTurnItem, { type: "reasoning" }> | FileChangeItemModel
>;
type FileEditSummary = {
  path: string;
  added: number;
  removed: number;
  diff: string;
};
type ImagePreviewData = {
  id: string;
  title: string;
  subtitle: string;
  src: string;
};

interface Props {
  items: ProcessItem[];
  sessionId?: string;
  showFileChanges?: boolean;
  userMessageId?: string;
}

export function WorkflowResultCards({
  items,
  sessionId,
  showFileChanges = true,
}: Props) {
  const [previewImage, setPreviewImage] = useState<WorkflowImagePreview | null>(
    null,
  );
  const visibleFiles = showFileChanges
    ? items.filter(
        (item): item is FileChangeItemModel =>
          item.type === "fileChange" &&
          item.changes.length > 0 &&
          isCompletedFileChangeItem(item),
      )
    : [];
  const { cwd } = useMarkdownContext();
  const localFileSummaries = fileEditSummaries(visibleFiles, cwd);
  const fileSummaries = localFileSummaries;
  const browserItem = items.find(
    (item) =>
      (item.type === "webSearch" ||
        (item.type === "dynamicToolCall" && resultToolName(item) === "js")) &&
      Boolean(browserPreviewInfo(item).url),
  );
  const imagePreviews = imagePreviewData(items);
  if (!fileSummaries.length && !browserItem && !imagePreviews.length)
    return null;

  return (
    <>
      <div className="workflow-result-stack">
        {browserItem ? <BrowserPreviewCard item={browserItem} /> : null}
        {imagePreviews.map((image) => (
          <ImagePreviewCard
            key={image.id}
            image={image}
            onOpenImage={setPreviewImage}
          />
        ))}
        {fileSummaries.length ? (
          <EditSummaryCard summaries={fileSummaries} sessionId={sessionId} />
        ) : null}
      </div>
      <WorkflowImageLightbox
        image={previewImage}
        images={imagePreviews.map((image) => ({
          src: image.src,
          name: image.subtitle || image.title,
        }))}
        onNavigate={setPreviewImage}
        onClose={() => setPreviewImage(null)}
      />
    </>
  );
}

function ImagePreviewCard({
  image,
  onOpenImage,
}: {
  image: ImagePreviewData;
  onOpenImage: (image: WorkflowImagePreview) => void;
}) {
  const name = image.subtitle || image.title;

  return (
    <div
      className="result-card workflow-result-card workflow-result-image-card"
      data-kind="result-card"
      data-result-kind="image"
    >
      <div className="workflow-result-card-head">
        <span className="workflow-result-card-icon">
          <ImageIcon />
        </span>
        <div className="workflow-result-card-copy">
          <strong className="workflow-result-card-title">{image.title}</strong>
          <small className="workflow-result-card-subtitle">
            {image.subtitle}
          </small>
        </div>
      </div>
      <div className="workflow-result-image-preview">
        <button
          type="button"
          className="workflow-result-image-button"
          title="打开图片预览"
          aria-label={`打开图片预览：${name}`}
          onClick={() => onOpenImage({ src: image.src, name })}
        >
          <img
            src={image.src}
            alt={image.title}
            className="workflow-result-image"
          />
        </button>
      </div>
    </div>
  );
}

function imagePreviewData(items: ProcessItem[]): ImagePreviewData[] {
  return items.flatMap((item) => {
    if (item.type === "imageGeneration") {
      const resultPath = typeof item.result === "string" ? item.result : "";
      const src = workflowImageSource(item.savedPath || resultPath);
      if (!src) return [];
      return [
        {
          id: item.id,
          title: imageGenerationLabel(item),
          subtitle: item.savedPath ? basename(item.savedPath) : "生成结果",
          src,
        },
      ];
    }

    return [];
  });
}

function BrowserPreviewCard({ item }: { item: ProcessItem }) {
  const { title, subtitle, url } = browserPreviewInfo(item);

  return (
    <div
      className="result-card workflow-result-card workflow-result-preview-card"
      data-kind="result-card"
      data-result-kind="preview"
    >
      <span className="workflow-result-card-icon is-accent">
        <Globe2 />
      </span>
      <div className="workflow-result-card-copy">
        <strong className="workflow-result-card-title">{title}</strong>
        <small className="workflow-result-card-subtitle">{subtitle}</small>
      </div>
      {url ? (
        <a
          className="workflow-result-card-action"
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`在浏览器中打开 ${title}`}
        >
          <ExternalLink />
          打开
        </a>
      ) : null}
    </div>
  );
}

function browserPreviewInfo(item: ProcessItem): {
  title: string;
  subtitle: string;
  url?: string;
} {
  const input = itemInputText(item);
  const output = itemOutputText(item);

  for (const text of [output, input]) {
    const parsed = parseJsonRecord(text);
    const title = stringFromRecord(parsed, ["title", "pageTitle", "name"]);
    const candidate = stringFromRecord(parsed, ["url", "href"]);
    const url = /^https?:\/\//i.test(candidate) ? candidate : "";
    if (title) return { title, subtitle: hostLabel(url) || "网站", url };
    if (url)
      return {
        title: hostLabel(url) || "网页预览",
        subtitle: "网站",
        url,
      };
  }

  return { title: "网页预览", subtitle: "网站" };
}

function EditSummaryCard({
  summaries,
  sessionId,
}: {
  summaries: FileEditSummary[];
  sessionId?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const context = useMarkdownContext();
  const { cwd } = context;
  const activeSessionId = useUnifiedChatStore((state) => state.activeSessionId);
  const reviewSessionId = sessionId ?? context.sessionId ?? activeSessionId;
  const previewEnabled = useInspectorStore(
    (state) =>
      !reviewSessionId ||
      !Object.values(state.visibleAuxiliaryPanels).includes(reviewSessionId),
  );
  const openReview = useInspectorStore((state) => state.openReview);
  const stats = summaries.reduce(
    (total, file) => ({
      added: total.added + file.added,
      removed: total.removed + file.removed,
    }),
    { added: 0, removed: 0 },
  );
  const firstSummary = summaries[0];

  const [expanded, setExpanded] = useState(false);

  const handleReview = (summary = firstSummary) => {
    if (!summary) return;
    openReview(summary.path, summary.diff, {
      sessionId: reviewSessionId ?? undefined,
      cwd,
    });
  };

  const singleFile = summaries.length === 1;
  const title = singleFile
    ? `已编辑 ${basename(summaries[0].path)}`
    : `已编辑 ${summaries.length} 个文件`;
  const visibleFiles = expanded ? summaries : summaries.slice(0, 3);
  const remainingFiles = summaries.length - 3;

  return (
    <div
      className="result-card workflow-result-card workflow-result-diff-card"
      ref={cardRef}
      data-kind="result-card"
      data-result-kind="diff"
    >
      <div className="workflow-result-card-head workflow-result-review-head">
        <span className="workflow-result-card-icon">
          <ConversationChangesIcon />
        </span>
        <div className="workflow-result-card-copy">
          <strong className="workflow-result-card-title">{title}</strong>
          <small className="workflow-result-card-subtitle">
            <span className="workflow-result-review-default">
              <b>+{stats.added}</b>
              <em>-{stats.removed}</em>
            </span>
          </small>
        </div>
        <div className="workflow-result-card-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleReview()}
            aria-label="审核文件变更"
          >
            审核
          </Button>
        </div>
      </div>
      {singleFile && previewEnabled ? (
        <FileDiffHoverPreview file={firstSummary} anchorRef={cardRef} />
      ) : null}
      {!singleFile && summaries.length ? (
        <div className="workflow-result-file-list">
          {visibleFiles.map((file) => (
            <FileSummaryRow
              key={file.path}
              file={file}
              cwd={cwd}
              onReview={() => handleReview(file)}
              previewEnabled={previewEnabled}
            />
          ))}
          {remainingFiles > 0 ? (
            <button
              type="button"
              className="workflow-result-file-expand"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <span>
                {expanded ? "收起文件" : `再显示 ${remainingFiles} 个文件`}
              </span>
              <ConversationChevronDownIcon
                className={expanded ? "is-expanded" : ""}
              />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function fileEditSummaries(
  items: FileChangeItemModel[],
  cwd?: string | null,
): FileEditSummary[] {
  const files = new Map<string, FileEditSummary>();

  for (const item of items) {
    for (const change of item.changes) {
      if (!change.path) continue;
      const patch = patchForFile(change.diff?.text ?? "", change.path, cwd);
      const previous = files.get(change.path);
      const stats = filePatchStats(patch);
      files.set(change.path, {
        path: change.path,
        added: (previous?.added ?? 0) + stats.added,
        removed: (previous?.removed ?? 0) + stats.removed,
        diff: patch,
      });
    }
  }

  return Array.from(files.values()).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function relativeFileLabel(path: string, cwd?: string | null): string {
  const normalized = path.replace(/\\/g, "/");
  const root = cwd?.replace(/\\/g, "/").replace(/\/$/, "");
  return root && normalized.startsWith(root + "/")
    ? normalized.slice(root.length + 1)
    : path;
}
function FileSummaryRow({
  file,
  cwd,
  onReview,
  previewEnabled,
}: {
  file: FileEditSummary;
  cwd?: string | null;
  onReview: () => void;
  previewEnabled: boolean;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={rowRef}
        type="button"
        className="workflow-result-file-row"
        onClick={onReview}
      >
        <span className="workflow-result-file-path" title={file.path}>
          {relativeFileLabel(file.path, cwd)}
        </span>
        <span className="workflow-result-diff-stats">
          <b>+{file.added}</b>
          <em>-{file.removed}</em>
        </span>
      </button>
      {previewEnabled ? (
        <FileDiffHoverPreview file={file} anchorRef={rowRef} />
      ) : null}
    </>
  );
}

function filePreviewBoundary(anchor: HTMLElement) {
  const viewport = anchor.closest<HTMLElement>(".messages-scroll");
  if (!viewport) return undefined;
  const bounds = viewport.getBoundingClientRect();
  const dockHeight =
    Number.parseFloat(
      getComputedStyle(viewport).getPropertyValue(
        "--interaction-dock-safe-area",
      ),
    ) || 0;
  return {
    left: 0,
    right: window.innerWidth,
    top: bounds.top,
    bottom: bounds.bottom - dockHeight,
  };
}

function FileDiffHoverPreview({
  file,
  anchorRef,
}: {
  file: FileEditSummary;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const diffThemeType = useThemeStore((state) =>
    state.isDark ? "dark" : "light",
  );
  const patch = normalizePatchForDiffs(file.diff, file.path);
  if (!patch) return null;

  return (
    <HoverPreview
      anchorRef={anchorRef}
      className="workflow-result-file-popover"
      label={`审核预览：${basename(file.path)}`}
      getBoundary={filePreviewBoundary}
      openDelay={350}
      width={800}
      limitWidthToAnchor
      horizontalBoundary="viewport"
    >
      <div className="workflow-result-file-popover-head">
        <FileText />
        <span>{basename(file.path)}</span>
      </div>
      <div className="workflow-result-file-popover-body">
        <PatchDiff
          patch={patch}
          className="workflow-result-hover-diff"
          disableWorkerPool
          options={{
            themeType: diffThemeType,
            diffStyle: "unified",
            diffIndicators: "bars",
            lineDiffType: "word-alt",
            overflow: "scroll",
            stickyHeader: false,
            hunkSeparators: "line-info",
            unsafeCSS: DIFF_VIEW_SCROLL_CSS,
          }}
        />
      </div>
    </HoverPreview>
  );
}

function isCompletedFileChangeItem(item: FileChangeItemModel): boolean {
  const status = String(item.status).toLowerCase();
  return status === "completed" || status === "done";
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringFromRecord(
  record: Record<string, unknown> | null,
  keys: string[],
): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function hostLabel(value: string): string {
  if (!value.trim()) return "";
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//i, "").split("/")[0] ?? "";
  }
}

function resultToolName(item: ToolLikeItem): string {
  if (item.type === "dynamicToolCall") return item.tool.toLowerCase();
  if (item.type === "webSearch") return "web_search";
  if (item.type === "mcpToolCall")
    return [item.server, item.tool].filter(Boolean).join(".") || item.tool;
  if (item.type === "collabAgentToolCall") return item.tool.toLowerCase();
  if (item.type === "commandExecution") return "shell_command";
  if (item.type === "imageGeneration") return "image_generation";
  if (item.type === "plan") return "plan_snapshot";
  if (item.type === "contextCompaction") return "context_compacted";
  if (item.type === "enteredReviewMode") return "entered_review_mode";
  if (item.type === "exitedReviewMode") return "exited_review_mode";
  if (item.type === "hookPrompt") return "hook_prompt";
  if (item.type === "imageView") return "image_view";
  if (item.type === "unknown") return item.rawType ?? "unknown";
  return "unknown";
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}
