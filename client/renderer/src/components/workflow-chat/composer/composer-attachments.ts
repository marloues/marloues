/**
 * Composer attachment helpers — shared by the input composer and tests.
 *
 * Attachment kinds are composer-facing semantics. Durable wire parts remain
 * image/file/url/skill/mention/browser-comment so runtime adapters stay stable.
 */
import type { UserMessageContent } from "../../../types";
import type { WorkflowUserMessageContent } from "@shared/workflow-read-thread-contract";
import type { SkillInfo } from "@shared/types";
import { composerAttachmentsToContent } from "./composer-contract";

export type ComposerAttachment =
  | {
      kind: "image";
      id: string;
      name: string;
      mimeType: string;
      dataUrl: string;
      size: number;
    }
  | {
      kind: "file";
      id: string;
      name: string;
      mimeType: string;
      text: string;
      size: number;
    }
  | {
      kind: "pasted-text";
      id: string;
      sequence: number;
      name: string;
      mimeType: string;
      text: string;
      size: number;
    }
  | {
      kind: "appshot";
      id: string;
      name: string;
      mimeType: string;
      dataUrl: string;
      size: number;
    }
  | {
      kind: "url";
      id: string;
      url: string;
    }
  | {
      kind: "skill";
      id: string;
      skill: SkillInfo;
      /** Compatibility fields for older composer consumers. */
      name: string;
      command: string;
      path?: string;
    }
  | {
      kind: "mention";
      id: string;
      name: string;
      path: string;
    }
  | {
      kind: "browser-comment";
      id: string;
      pageId?: string;
      payload: Extract<WorkflowUserMessageContent, { type: "browserComment" }>;
    };

export type BareUrlRange = {
  url: string;
  from: number;
  to: number;
};
export const MAX_ATTACHMENTS = 6;
export const MAX_IMAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_ATTACHMENT_BYTES = 256 * 1024;
export const PASTED_TEXT_ATTACHMENT_THRESHOLD_BYTES = 4 * 1024;

/** MIME types that are text-readable but don't start with "text/". */
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/x-sh",
  "application/typescript",
]);

/** Extensions accepted as text when the OS reports no usable MIME type. */
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".json5",
  ".jsonc",
  ".md",
  ".mdx",
  ".markdown",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".stylus",
  ".html",
  ".htm",
  ".xml",
  ".svg",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".properties",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".bat",
  ".cmd",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".swift",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cc",
  ".cxx",
  ".cs",
  ".php",
  ".sql",
  ".graphql",
  ".gql",
  ".proto",
  ".thrift",
  ".env",
  ".example",
  ".txt",
  ".log",
  ".csv",
  ".tsv",
  ".vue",
  ".svelte",
  ".astro",
  ".dockerfile",
  ".editorconfig",
  ".gitignore",
  ".gitattributes",
  ".eslintrc",
  ".prettierrc",
  ".babelrc",
  ".npmrc",
]);

/** Extensionless filenames treated as text. */
const TEXT_FILENAMES = new Set([
  "dockerfile",
  "makefile",
  "rakefile",
  "gemfile",
  "procfile",
  ".env",
  ".gitignore",
  ".npmrc",
  ".editorconfig",
]);

function fileExtension(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot < 0 ? "" : lower.slice(dot);
}

function fileBaseName(name: string): string {
  return name.toLowerCase().split(/[\\/]/).pop() ?? name.toLowerCase();
}

/**
 * Whether a file can be attached as readable text. Images are excluded
 * (they take the image path). Unknown binary formats return false so the
 * caller can notify the user instead of silently dropping them.
 */
export function isTextFile(file: File): boolean {
  if (file.type.startsWith("image/")) return false;
  const type = file.type.toLowerCase();
  if (type.startsWith("text/")) return true;
  if (TEXT_MIME_TYPES.has(type)) return true;
  // Many OSes report "" or "application/octet-stream" for code files.
  if (TEXT_EXTENSIONS.has(fileExtension(file.name))) return true;
  return TEXT_FILENAMES.has(fileBaseName(file.name));
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read file as text"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read image"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

export async function fileToImageAttachment(
  file: File,
): Promise<ComposerAttachment> {
  return {
    kind: "image",
    id: crypto.randomUUID(),
    name: file.name || "clipboard-image",
    mimeType: file.type || "image/png",
    dataUrl: await readFileAsDataUrl(file),
    size: file.size,
  };
}

export async function fileToFileAttachment(
  file: File,
): Promise<ComposerAttachment> {
  return {
    kind: "file",
    id: crypto.randomUUID(),
    name: file.name || "untitled.txt",
    mimeType: file.type || "text/plain",
    text: await readFileAsText(file),
    size: file.size,
  };
}

/** Build the <input type=file accept=...> value from image + text extensions. */
export const FILE_ACCEPT: string = ["image/*", ...TEXT_EXTENSIONS].join(",");

const BARE_URL_PATTERN =
  /\bhttps?:\/\/[^\s<>"'`，。；！？：、）》」』【】]+/giu;
const TRAILING_URL_PUNCTUATION = /[.,;:!?)\]}>'"，。；！？：、）》」』【】]$/u;

function trimTrailingUrlPunctuation(text: string): string {
  let value = text;
  while (TRAILING_URL_PUNCTUATION.test(value)) {
    value = value.slice(0, -1);
  }
  return value;
}

/** Normalize a pasted or typed http(s) link without changing its spelling. */
export function normalizeUrl(text: string): string | null {
  const candidate = trimTrailingUrlPunctuation(text.trim());
  if (!/^https?:\/\//iu.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return candidate;
  } catch {
    return null;
  }
}

/** Quick check for http(s) URLs. */
export function isUrl(text: string): boolean {
  return normalizeUrl(text) !== null;
}

function protectedUrlRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const patterns = [
    /```[\s\S]*?```/gu,
    /`[^`\n]*`/gu,
    /\[[^\]\n]*\]\(\s*https?:\/\/[^\s)]+(?:\s+["'][^"'\n]*["'])?\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index !== undefined) {
        ranges.push([match.index, match.index + match[0].length]);
      }
    }
  }
  return ranges;
}

function isProtectedRange(
  ranges: Array<[number, number]>,
  start: number,
  end: number,
): boolean {
  return ranges.some(([from, to]) => start < to && end > from);
}

/** Extract bare http(s) links while leaving Markdown links and code intact. */
export function findBareUrlRanges(text: string): BareUrlRange[] {
  const protectedRanges = protectedUrlRanges(text);
  const ranges: BareUrlRange[] = [];
  for (const match of text.matchAll(BARE_URL_PATTERN)) {
    if (match.index === undefined) continue;
    const url = normalizeUrl(match[0]);
    if (!url) continue;
    const from = match.index;
    const to = from + url.length;
    if (isProtectedRange(protectedRanges, from, to)) continue;
    ranges.push({ url, from, to });
  }
  return ranges;
}

/** Extract unique bare http(s) links while leaving protected text intact. */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const { url } of findBareUrlRanges(text)) {
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

/** Remove only the specified bare URLs, preserving trailing punctuation. */
export function removeUrls(text: string, urls: string[] = []): string {
  const targets = new Set(urls);
  const ranges = protectedUrlRanges(text);
  return text.replace(BARE_URL_PATTERN, (match, offset: number) => {
    if (isProtectedRange(ranges, offset, offset + match.length)) return match;
    const url = normalizeUrl(match);
    if (!url || !targets.has(url)) return match;
    return match.slice(url.length);
  });
}
export function urlAttachment(url: string): ComposerAttachment {
  return { kind: "url", id: crypto.randomUUID(), url: url };
}

export function shouldExternalizePastedText(text: string): boolean {
  return (
    new TextEncoder().encode(text).byteLength >=
    PASTED_TEXT_ATTACHMENT_THRESHOLD_BYTES
  );
}

export function pastedTextAttachment(
  text: string,
  sequence: number,
): ComposerAttachment {
  return {
    kind: "pasted-text",
    id: crypto.randomUUID(),
    sequence,
    name: `粘贴文本 ${sequence}`,
    mimeType: "text/plain",
    text,
    size: new TextEncoder().encode(text).byteLength,
  };
}

export function browserAppshotAttachment(dataUrl: string): ComposerAttachment {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  const base64 = match?.[2] ?? "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return {
    kind: "appshot",
    id: crypto.randomUUID(),
    name: "页面截图",
    mimeType: match?.[1] ?? "image/png",
    dataUrl,
    size: Math.max(0, Math.floor((base64.length * 3) / 4) - padding),
  };
}

/** Create a skill attachment from a slash-command selection. */
export function skillAttachment(
  name: string,
  command: string,
  path?: string,
): ComposerAttachment {
  return {
    kind: "skill",
    id: crypto.randomUUID(),
    skill: {
      id: path || command || name,
      name,
      path: path ?? "",
      scope: "user",
      enabled: Boolean(path),
    },
    name,
    command,
    path,
  };
}
export function mentionAttachment(
  name: string,
  path: string,
): ComposerAttachment {
  return { kind: "mention", id: crypto.randomUUID(), name, path };
}

export function browserCommentAttachment(
  payload: Omit<
    Extract<WorkflowUserMessageContent, { type: "browserComment" }>,
    "type"
  >,
  pageId?: string,
): ComposerAttachment {
  return {
    kind: "browser-comment",
    id: crypto.randomUUID(),
    pageId,
    payload: { type: "browserComment", ...payload },
  };
}

export function isMatchingBrowserCommentAttachment(
  attachment: ComposerAttachment,
  pageId: string,
  commentId: number,
): boolean {
  return (
    attachment.kind === "browser-comment" &&
    attachment.pageId === pageId &&
    attachment.payload.commentId === commentId
  );
}
/** Convert composer attachments to the wire content sent to the store. */
export function attachmentsToUserContent(
  attachments: ComposerAttachment[],
): UserMessageContent[] {
  return composerAttachmentsToContent(attachments);
}
