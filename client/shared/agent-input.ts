/**
 * Runtime-independent representation of everything the user submitted in one
 * turn. Runtime adapters project these parts into their native protocols; this
 * representation is the durable source of truth.
 */
export const AGENT_TURN_INPUT_SCHEMA_VERSION = 1 as const;

export interface WorkflowDelegation {
  sourceThreadId: string;
  input: string;
}

export type AgentInputPart =
  | {
      type: "text";
      text: string;
      text_elements?: unknown[];
      /** Native rich-text serialization, decoded only for display. */
      displayFormat?: "markdown";
      workflowDelegation?: WorkflowDelegation;
    }
  | {
      type: "image";
      url: string;
      detail?: string;
      /** Original upload metadata; retained even when a runtime transforms it. */
      name?: string;
      mimeType?: string;
      size?: number;
    }
  | {
      type: "localImage";
      path: string;
      detail?: string;
      name?: string;
      mimeType?: string;
      size?: number;
    }
  | {
      type: "file";
      name: string;
      mimeType: string;
      text: string;
      path?: string;
      size?: number;
    }
  | { type: "url"; url: string; title?: string }
  | {
      type: "skill";
      name: string;
      path?: string;
      id?: string;
      displayName?: string;
      description?: string;
      scope?: "user" | "project" | "enterprise" | "marketplace";
      version?: string;
      promptLinkLabel?: string;
    }
  | { type: "mention"; name: string; path?: string }
  | {
      /** A page annotation captured from the embedded browser. */
      type: "browserComment";
      commentId: number;
      targetType?: "element" | "region";
      ref: string;
      tagName: string;
      text: string;
      attributes: Record<string, string>;
      rect: { x: number; y: number; width: number; height: number };
      viewport: { width: number; height: number };
      scrollX: number;
      scrollY: number;
      comment: string;
      /** Direct style changes proposed for a selected DOM element. */
      styleEdits?: Record<string, string>;
      pageUrl?: string;
      screenshotDataUrl?: string;
    };

export interface AgentTurnInput {
  schemaVersion: typeof AGENT_TURN_INPUT_SCHEMA_VERSION;
  parts: AgentInputPart[];
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalSize(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  const record = recordFrom(value);
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rectFrom(value: unknown): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const record = recordFrom(value);
  return {
    x: finiteNumber(record?.x),
    y: finiteNumber(record?.y),
    width: finiteNumber(record?.width),
    height: finiteNumber(record?.height),
  };
}

function viewportFrom(value: unknown): { width: number; height: number } {
  const record = recordFrom(value);
  return {
    width: finiteNumber(record?.width),
    height: finiteNumber(record?.height),
  };
}

/**
 * Decode an IPC/persisted value into the canonical input union. Invalid parts
 * are rejected rather than being silently reinterpreted as another type.
 */
export function normalizeAgentInputPart(value: unknown): AgentInputPart | null {
  const record = recordFrom(value);
  if (!record) return null;

  if (record.type === "text" && typeof record.text === "string") {
    const delegation = recordFrom(record.workflowDelegation);
    return {
      type: "text",
      text: record.text,
      text_elements: Array.isArray(record.text_elements)
        ? record.text_elements
        : undefined,
      displayFormat:
        record.displayFormat === "markdown" ? "markdown" : undefined,
      workflowDelegation:
        typeof delegation?.sourceThreadId === "string" &&
        typeof delegation.input === "string"
          ? {
              sourceThreadId: delegation.sourceThreadId,
              input: delegation.input,
            }
          : undefined,
    };
  }

  if (
    record.type === "localImage" &&
    typeof record.path === "string" &&
    record.path.trim()
  ) {
    return {
      type: "localImage",
      path: record.path,
      detail: optionalString(record.detail),
      name: optionalString(record.name),
      mimeType: optionalString(record.mimeType),
      size: optionalSize(record.size),
    };
  }

  const imageUrl =
    typeof record.url === "string"
      ? record.url
      : typeof record.dataUrl === "string"
        ? record.dataUrl
        : "";
  if ((record.type === "image" || record.dataUrl) && imageUrl.trim()) {
    return {
      type: "image",
      url: imageUrl,
      detail: optionalString(record.detail),
      name: optionalString(record.name),
      mimeType: optionalString(record.mimeType),
      size: optionalSize(record.size),
    };
  }

  if (
    record.type === "file" &&
    typeof record.name === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.text === "string"
  ) {
    return {
      type: "file",
      name: record.name,
      mimeType: record.mimeType,
      text: record.text,
      path: optionalString(record.path),
      size: optionalSize(record.size),
    };
  }

  if (
    record.type === "url" &&
    typeof record.url === "string" &&
    record.url.trim()
  ) {
    return {
      type: "url",
      url: record.url,
      title: optionalString(record.title),
    };
  }

  if (
    record.type === "skill" &&
    typeof record.name === "string" &&
    record.name.trim()
  ) {
    const scope =
      record.scope === "user" ||
      record.scope === "project" ||
      record.scope === "enterprise" ||
      record.scope === "marketplace"
        ? record.scope
        : undefined;
    return {
      type: "skill",
      name: record.name,
      path: optionalString(record.path),
      id: optionalString(record.id),
      displayName: optionalString(record.displayName),
      description: optionalString(record.description),
      scope,
      version: optionalString(record.version),
      promptLinkLabel: optionalString(record.promptLinkLabel),
    };
  }

  if (
    record.type === "mention" &&
    typeof record.name === "string" &&
    record.name.trim()
  ) {
    return {
      type: "mention",
      name: record.name,
      path: optionalString(record.path),
    };
  }

  if (
    record.type === "browserComment" &&
    typeof record.commentId === "number" &&
    Number.isFinite(record.commentId) &&
    typeof record.ref === "string" &&
    typeof record.comment === "string"
  ) {
    return {
      type: "browserComment",
      commentId: record.commentId,
      targetType:
        record.targetType === "region"
          ? "region"
          : record.targetType === "element"
            ? "element"
            : undefined,
      ref: record.ref,
      tagName: optionalString(record.tagName) ?? "",
      text: optionalString(record.text) ?? "",
      attributes: stringRecord(record.attributes) ?? {},
      rect: rectFrom(record.rect),
      viewport: viewportFrom(record.viewport),
      scrollX: finiteNumber(record.scrollX),
      scrollY: finiteNumber(record.scrollY),
      comment: record.comment,
      styleEdits: stringRecord(record.styleEdits),
      pageUrl: optionalString(record.pageUrl),
      screenshotDataUrl: optionalString(record.screenshotDataUrl),
    };
  }

  return null;
}

export function normalizeAgentInputParts(
  values: readonly unknown[] | undefined,
): AgentInputPart[] {
  const result: AgentInputPart[] = [];
  for (const value of values ?? []) {
    const part = normalizeAgentInputPart(value);
    if (part) result.push(part);
  }
  return result;
}

/** Build the durable input for a user turn from text plus rich composer parts. */
export function createCanonicalUserContent(
  text: string,
  attachments: readonly unknown[] | undefined,
): AgentInputPart[] {
  const parts = normalizeAgentInputParts(attachments);
  if (!text.trim()) return parts;

  const alreadyPresent = parts.some(
    (part) => part.type === "text" && part.text === text,
  );
  return alreadyPresent ? parts : [{ type: "text", text }, ...parts];
}

export function createAgentTurnInput(
  text: string,
  attachments: readonly unknown[] | undefined,
): AgentTurnInput {
  return {
    schemaVersion: AGENT_TURN_INPUT_SCHEMA_VERSION,
    parts: createCanonicalUserContent(text, attachments),
  };
}
