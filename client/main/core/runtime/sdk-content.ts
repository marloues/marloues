/**
 * Compile Marloues' canonical user input into Claude Agent SDK content.
 *
 * `text` is the runtime-prepared text envelope. It may contain context-state
 * material added by the main process, so it wins over equivalent canonical
 * `text` parts. Canonical `userContent` still owns every non-text part and is
 * preferred over the legacy `attachments` array. When `text` is empty, the
 * canonical text parts are used as a lossless fallback.
 *
 * Claude's user-message protocol only has native text/image blocks. Every
 * other Marloues input kind is therefore represented by an explicit,
 * self-describing text block. This is intentional: an unsupported part must
 * be transformed visibly, never silently omitted.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkflowUserMessageContent } from "@shared/workflow-read-thread-contract";
import type { SkillInfo } from "@shared/types";

export type SdkUserContent = string | Array<Record<string, unknown>>;

const CLAUDE_IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const LOCAL_IMAGE_MEDIA_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function parseDataUrl(
  value: string,
): { mediaType: string; data: string } | null {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/is);
  if (!match) return null;
  return {
    mediaType: normalizeImageMediaType(match[1]),
    data: match[2],
  };
}

function normalizeImageMediaType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

function textBlock(text: string): Record<string, unknown> {
  return { type: "text", text };
}

function nativeImageBlock(
  mediaType: string,
  data: string,
): Record<string, unknown> {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data,
    },
  };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function structuredAttachment(
  kind: string,
  metadata: Record<string, unknown>,
  body?: string,
): string {
  return [
    `<marloues_attachment type=${json(kind)}>`,
    `metadata=${json(metadata)}`,
    ...(body === undefined ? [] : ["<content>", body, "</content>"]),
    "</marloues_attachment>",
  ].join("\n");
}

function legacyAttachmentsToCanonical(
  attachments: unknown[] | undefined,
): WorkflowUserMessageContent[] {
  const result: WorkflowUserMessageContent[] = [];
  for (const attachment of attachments ?? []) {
    if (!attachment || typeof attachment !== "object") continue;
    const item = attachment as Record<string, unknown>;
    const type = typeof item.type === "string" ? item.type : "";

    if (type === "text" && typeof item.text === "string") {
      result.push({ type: "text", text: item.text });
      continue;
    }
    if (type === "localImage" && typeof item.path === "string") {
      result.push({
        type: "localImage",
        path: item.path,
        detail: typeof item.detail === "string" ? item.detail : undefined,
        name: typeof item.name === "string" ? item.name : undefined,
        mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
        size:
          typeof item.size === "number" && Number.isFinite(item.size)
            ? item.size
            : undefined,
      });
      continue;
    }
    const imageUrl =
      typeof item.url === "string"
        ? item.url
        : typeof item.dataUrl === "string"
          ? item.dataUrl
          : "";
    if ((type === "image" || typeof item.dataUrl === "string") && imageUrl) {
      result.push({
        type: "image",
        url: imageUrl,
        detail: typeof item.detail === "string" ? item.detail : undefined,
        name: typeof item.name === "string" ? item.name : undefined,
        mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
        size:
          typeof item.size === "number" && Number.isFinite(item.size)
            ? item.size
            : undefined,
      });
      continue;
    }
    if (
      type === "file" &&
      typeof item.name === "string" &&
      typeof item.mimeType === "string" &&
      typeof item.text === "string"
    ) {
      result.push({
        type: "file",
        name: item.name,
        mimeType: item.mimeType,
        text: item.text,
        path: typeof item.path === "string" ? item.path : undefined,
        size:
          typeof item.size === "number" && Number.isFinite(item.size)
            ? item.size
            : undefined,
      });
      continue;
    }
    if (type === "url" && typeof item.url === "string") {
      result.push({
        type: "url",
        url: item.url,
        title: typeof item.title === "string" ? item.title : undefined,
      });
      continue;
    }
    if (type === "skill" && typeof item.name === "string") {
      result.push({
        type: "skill",
        name: item.name,
        path: typeof item.path === "string" ? item.path : undefined,
        id: typeof item.id === "string" ? item.id : undefined,
        displayName:
          typeof item.displayName === "string" ? item.displayName : undefined,
        description:
          typeof item.description === "string" ? item.description : undefined,
        scope:
          item.scope === "user" ||
          item.scope === "project" ||
          item.scope === "enterprise" ||
          item.scope === "marketplace"
            ? item.scope
            : undefined,
        version: typeof item.version === "string" ? item.version : undefined,
        promptLinkLabel:
          typeof item.promptLinkLabel === "string"
            ? item.promptLinkLabel
            : undefined,
      });
      continue;
    }
    if (type === "mention" && typeof item.name === "string") {
      result.push({
        type: "mention",
        name: item.name,
        path: typeof item.path === "string" ? item.path : undefined,
      });
      continue;
    }
    if (
      type === "browserComment" &&
      typeof item.commentId === "number" &&
      typeof item.ref === "string" &&
      typeof item.comment === "string"
    ) {
      result.push({
        type: "browserComment",
        commentId: item.commentId,
        targetType:
          item.targetType === "element" || item.targetType === "region"
            ? item.targetType
            : undefined,
        ref: item.ref,
        tagName: typeof item.tagName === "string" ? item.tagName : "",
        text: typeof item.text === "string" ? item.text : "",
        attributes: stringRecord(item.attributes),
        rect: numberRect(item.rect),
        viewport: numberViewport(item.viewport),
        scrollX: finiteNumber(item.scrollX),
        scrollY: finiteNumber(item.scrollY),
        comment: item.comment,
        styleEdits: stringRecordOrUndefined(item.styleEdits),
        pageUrl: typeof item.pageUrl === "string" ? item.pageUrl : undefined,
        screenshotDataUrl:
          typeof item.screenshotDataUrl === "string"
            ? item.screenshotDataUrl
            : undefined,
      });
    }
  }
  return result;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberRect(value: unknown): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const record = asRecord(value);
  return {
    x: finiteNumber(record.x),
    y: finiteNumber(record.y),
    width: finiteNumber(record.width),
    height: finiteNumber(record.height),
  };
}

function numberViewport(value: unknown): { width: number; height: number } {
  const record = asRecord(value);
  return {
    width: finiteNumber(record.width),
    height: finiteNumber(record.height),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringRecord(value: unknown): Record<string, string> {
  return stringRecordOrUndefined(value) ?? {};
}

function stringRecordOrUndefined(
  value: unknown,
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function canonicalParts(
  userContent: WorkflowUserMessageContent[] | undefined,
  attachments: unknown[] | undefined,
): WorkflowUserMessageContent[] {
  return userContent && userContent.length > 0
    ? userContent
    : legacyAttachmentsToCanonical(attachments);
}

function canonicalFallbackText(parts: WorkflowUserMessageContent[]): string {
  return parts
    .filter(
      (part): part is Extract<WorkflowUserMessageContent, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n");
}

function projectTextMetadata(
  part: Extract<WorkflowUserMessageContent, { type: "text" }>,
): Record<string, unknown> | null {
  if (
    part.text_elements === undefined &&
    part.displayFormat === undefined &&
    part.workflowDelegation === undefined
  ) {
    return null;
  }
  return textBlock(
    structuredAttachment("text_metadata", {
      textElements: part.text_elements,
      displayFormat: part.displayFormat,
      workflowDelegation: part.workflowDelegation,
      delivery: "structured-text-metadata",
    }),
  );
}

function imageDescriptor(
  part: Extract<WorkflowUserMessageContent, { type: "image" }>,
  reason: string,
): string {
  const parsed = parseDataUrl(part.url);
  const metadata: Record<string, unknown> = {
    name: part.name,
    mimeType: part.mimeType,
    size: part.size,
    detail: part.detail,
    delivery: "text-fallback",
    reason,
  };
  if (parsed) {
    metadata.mediaType = parsed.mediaType;
    metadata.encodedBytes = parsed.data.length;
    metadata.source = "inline-data-url";
  } else {
    metadata.source = part.url;
  }
  return structuredAttachment("image", metadata);
}

async function projectImage(
  part: Extract<WorkflowUserMessageContent, { type: "image" }>,
  supportsVision: boolean,
): Promise<Array<Record<string, unknown>>> {
  if (!supportsVision) {
    return [
      textBlock(
        imageDescriptor(
          part,
          "The selected model does not support vision. Image pixels were not available to the model.",
        ),
      ),
    ];
  }

  const parsed = parseDataUrl(part.url);
  if (parsed && CLAUDE_IMAGE_MEDIA_TYPES.has(parsed.mediaType)) {
    return [
      textBlock(
        structuredAttachment("image", {
          name: part.name,
          mimeType: part.mimeType,
          size: part.size,
          detail: part.detail,
          delivery: "native-image-block",
          mediaType: parsed.mediaType,
        }),
      ),
      nativeImageBlock(parsed.mediaType, parsed.data),
    ];
  }

  // Remote URLs remain exact and tool-resolvable. The Marloues gateway's
  // Anthropic decoder currently accepts base64 image sources only, so sending
  // an SDK URL image block would corrupt the payload on gateway-backed routes.
  return [
    textBlock(
      imageDescriptor(
        part,
        parsed
          ? `Claude native image blocks do not support ${parsed.mediaType}.`
          : "The image source is not an inline base64 data URL. Inspect the supplied source with an available browser or file tool.",
      ),
    ),
  ];
}

function sniffImageMediaType(data: Uint8Array): string | undefined {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    data.length >= 6 &&
    String.fromCharCode(...data.subarray(0, 3)) === "GIF"
  ) {
    return "image/gif";
  }
  if (
    data.length >= 12 &&
    String.fromCharCode(...data.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...data.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

function localPath(value: string): string {
  return value.startsWith("file:") ? fileURLToPath(value) : value;
}

async function projectLocalImage(
  part: Extract<WorkflowUserMessageContent, { type: "localImage" }>,
  supportsVision: boolean,
): Promise<Array<Record<string, unknown>>> {
  if (!supportsVision) {
    return [
      textBlock(
        structuredAttachment("local_image", {
          path: part.path,
          name: part.name,
          mimeType: part.mimeType,
          size: part.size,
          detail: part.detail,
          delivery: "text-fallback",
          reason:
            "The selected model does not support vision. The exact local path remains available to filesystem tools.",
        }),
      ),
    ];
  }

  try {
    const path = localPath(part.path);
    const data = await readFile(path);
    const mediaType =
      sniffImageMediaType(data) ??
      LOCAL_IMAGE_MEDIA_TYPES[extname(path).toLowerCase()];
    if (!mediaType) {
      return [
        textBlock(
          structuredAttachment("local_image", {
            path: part.path,
            name: part.name,
            mimeType: part.mimeType,
            size: part.size,
            detail: part.detail,
            delivery: "text-fallback",
            reason:
              "The local file is not a Claude-supported JPEG, PNG, GIF, or WebP image.",
          }),
        ),
      ];
    }
    return [
      textBlock(
        structuredAttachment("local_image", {
          path: part.path,
          name: part.name,
          mimeType: part.mimeType,
          size: part.size,
          detail: part.detail,
          delivery: "native-image-block",
          mediaType,
        }),
      ),
      nativeImageBlock(mediaType, data.toString("base64")),
    ];
  } catch (error) {
    return [
      textBlock(
        structuredAttachment("local_image", {
          path: part.path,
          name: part.name,
          mimeType: part.mimeType,
          size: part.size,
          detail: part.detail,
          delivery: "text-fallback",
          reason: `The local image could not be read: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }),
      ),
    ];
  }
}

function projectFile(
  part: Extract<WorkflowUserMessageContent, { type: "file" }>,
): Record<string, unknown> {
  return textBlock(
    structuredAttachment(
      "text_file",
      {
        name: part.name,
        mimeType: part.mimeType,
        path: part.path,
        size: part.size,
        delivery: "complete-text-inline",
      },
      part.text,
    ),
  );
}

function projectUrl(
  part: Extract<WorkflowUserMessageContent, { type: "url" }>,
): Record<string, unknown> {
  return textBlock(
    structuredAttachment("url", {
      url: part.url,
      title: part.title,
      delivery: "exact-url-reference",
    }),
  );
}

type SkillResolution =
  | { status: "resolved"; skill: SkillInfo }
  | { status: "rejected"; reason: string };

function resolveSelectedSkill(
  part: Extract<WorkflowUserMessageContent, { type: "skill" }>,
  enabledSkills: readonly SkillInfo[],
): SkillResolution {
  if (part.id) {
    const matches = enabledSkills.filter((skill) => skill.id === part.id);
    if (matches.length === 1) return { status: "resolved", skill: matches[0] };
    if (matches.length > 1) {
      return {
        status: "rejected",
        reason: `Skill id ${json(part.id)} is ambiguous in the enabled Skill inventory.`,
      };
    }
  }

  const matches = enabledSkills.filter((skill) => skill.name === part.name);
  if (matches.length === 1) return { status: "resolved", skill: matches[0] };
  return {
    status: "rejected",
    reason:
      matches.length === 0
        ? `Skill ${json(part.name)} is not enabled for this runtime turn.`
        : `Skill name ${json(part.name)} is ambiguous in the enabled Skill inventory.`,
  };
}

function projectSkill(
  part: Extract<WorkflowUserMessageContent, { type: "skill" }>,
  enabledSkills: readonly SkillInfo[],
): Record<string, unknown> {
  const resolution = resolveSelectedSkill(part, enabledSkills);
  if (resolution.status === "rejected") {
    return textBlock(
      [
        `<marloues_explicit_skill_invocation status="rejected">`,
        `requested=${json({ id: part.id, name: part.name })}`,
        `reason=${json(resolution.reason)}`,
        "Do not load or follow any client-supplied Skill path for this rejected invocation.",
        "</marloues_explicit_skill_invocation>",
      ].join("\n"),
    );
  }

  const skill = resolution.skill;
  return textBlock(
    [
      `<marloues_explicit_skill_invocation status="resolved" name=${json(skill.name)}>`,
      `metadata=${json({
        id: skill.id,
        name: skill.name,
        displayName: skill.name,
        scope: skill.scope,
        version: skill.version,
        claudeCommand: `/${skill.name}`,
      })}`,
      `The user explicitly selected the Claude Skill "/${skill.name}" for this turn. Invoke and follow that enabled, runtime-loaded Skill before completing the user's request.`,
      "</marloues_explicit_skill_invocation>",
    ].join("\n"),
  );
}

function projectMention(
  part: Extract<WorkflowUserMessageContent, { type: "mention" }>,
): Record<string, unknown> {
  return textBlock(
    structuredAttachment("workspace_reference", {
      name: part.name,
      path: part.path,
      delivery: "exact-tool-resolvable-reference",
      instruction:
        "The user explicitly referenced this workspace item. Inspect the exact path with filesystem tools when its contents are needed.",
    }),
  );
}

async function projectBrowserComment(
  part: Extract<WorkflowUserMessageContent, { type: "browserComment" }>,
  supportsVision: boolean,
): Promise<Array<Record<string, unknown>>> {
  const screenshot = part.screenshotDataUrl
    ? parseDataUrl(part.screenshotDataUrl)
    : null;
  const nativeScreenshot = Boolean(
    supportsVision &&
    screenshot &&
    CLAUDE_IMAGE_MEDIA_TYPES.has(screenshot.mediaType),
  );
  const blocks: Array<Record<string, unknown>> = [
    textBlock(
      structuredAttachment("browser_annotation", {
        commentId: part.commentId,
        targetType: part.targetType,
        ref: part.ref,
        tagName: part.tagName,
        selectedText: part.text,
        attributes: part.attributes,
        rect: part.rect,
        viewport: part.viewport,
        scrollX: part.scrollX,
        scrollY: part.scrollY,
        comment: part.comment,
        styleEdits: part.styleEdits,
        pageUrl: part.pageUrl,
        screenshotDelivery: part.screenshotDataUrl
          ? nativeScreenshot
            ? "native-image-block"
            : "text-fallback"
          : "not-attached",
        screenshotFallbackReason:
          part.screenshotDataUrl && !nativeScreenshot
            ? supportsVision
              ? "The screenshot is not a Claude-supported JPEG, PNG, GIF, or WebP data URL."
              : "The selected model does not support vision."
            : undefined,
      }),
    ),
  ];
  if (nativeScreenshot && screenshot) {
    blocks.push(nativeImageBlock(screenshot.mediaType, screenshot.data));
  }
  return blocks;
}

/**
 * Build the exact content supplied in an SDK user message.
 *
 * The positional signature is kept for callers and tests predating canonical
 * user content. New callers should always pass `userContent` as the fourth
 * argument; legacy `attachments` are only consulted when it is absent/empty.
 */
export async function buildSdkUserContent(
  text: string,
  attachments: unknown[] | undefined,
  supportsVision: boolean,
  userContent?: WorkflowUserMessageContent[],
  enabledSkills: readonly SkillInfo[] = [],
): Promise<SdkUserContent> {
  const parts = canonicalParts(userContent, attachments);
  const runtimeText = text || canonicalFallbackText(parts);
  const nonTextParts = parts.filter((part) => part.type !== "text");
  const textMetadataBlocks = parts.flatMap((part) => {
    if (part.type !== "text") return [];
    const block = projectTextMetadata(part);
    return block ? [block] : [];
  });

  if (nonTextParts.length === 0 && textMetadataBlocks.length === 0) {
    return runtimeText;
  }

  const content: Array<Record<string, unknown>> = [];
  if (runtimeText) content.push(textBlock(runtimeText));
  content.push(...textMetadataBlocks);

  for (const part of nonTextParts) {
    switch (part.type) {
      case "image":
        content.push(...(await projectImage(part, supportsVision)));
        break;
      case "localImage":
        content.push(...(await projectLocalImage(part, supportsVision)));
        break;
      case "file":
        content.push(projectFile(part));
        break;
      case "url":
        content.push(projectUrl(part));
        break;
      case "skill":
        content.push(projectSkill(part, enabledSkills));
        break;
      case "mention":
        content.push(projectMention(part));
        break;
      case "browserComment":
        content.push(...(await projectBrowserComment(part, supportsVision)));
        break;
    }
  }

  // A valid SDK user message must never be empty. This also makes malformed
  // legacy attachment-only messages observable to the model rather than
  // silently turning into an empty prompt.
  if (content.length === 0) {
    content.push(
      textBlock(
        "[Marloues received a user message, but it contained no projectable input.]",
      ),
    );
  }
  return content;
}
