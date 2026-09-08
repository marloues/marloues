import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join } from "node:path";
import type Database from "better-sqlite3";
import { AGENT_TURN_INPUT_SCHEMA_VERSION } from "@shared/agent-input";
import type { WorkflowUserMessageContent } from "@shared/workflow-read-thread-contract";
import { getStateDir } from "../app-paths";
import { getStateDb } from "../core/storage/state-db";

const ASSET_MARKER = "__marloues_input_asset_v1";

export type TurnInputState =
  | "queued"
  | "preparing"
  | "dispatching"
  | "acknowledged"
  | "completed"
  | "failed"
  | "uncertain"
  | "blocked";

export type DeliveryAttemptState =
  | "preparing"
  | "dispatching"
  | "acknowledged"
  | "completed"
  | "failed"
  | "uncertain"
  | "blocked";

type AssetEncoding = "data-url" | "utf8-text" | "local-path";

interface AssetPointer {
  [ASSET_MARKER]: {
    sha256: string;
    encoding: AssetEncoding;
    mediaType?: string;
    originalName?: string;
    dataUrlHeader?: string;
  };
}

interface StoredTurnInputEnvelope {
  schemaVersion: typeof AGENT_TURN_INPUT_SCHEMA_VERSION;
  parts: unknown[];
}

interface TurnInputRow {
  id: string;
  session_id: string;
  turn_id: string;
  message_id: string;
  revision: number;
  schema_version: number;
  content_json: string;
  integrity_sha256: string;
  state: TurnInputState;
  runtime_id: string | null;
  model_id: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface InputAssetRow {
  sha256: string;
  storage_path: string;
  byte_length: number;
  media_type: string | null;
  original_name: string | null;
}

interface ExternalizedAsset {
  partIndex: number;
  fieldName: string;
  sha256: string;
  storagePath: string;
  byteLength: number;
  mediaType?: string;
  originalName?: string;
}

export interface PersistTurnInputOptions {
  sessionId: string;
  turnId: string;
  messageId: string;
  content: WorkflowUserMessageContent[];
  runtimeId?: string;
  modelId?: string;
  createdAt?: number;
}

export interface PersistedTurnInput {
  id: string;
  sessionId: string;
  turnId: string;
  messageId: string;
  revision: number;
  schemaVersion: number;
  integritySha256: string;
  state: TurnInputState;
  runtimeId?: string;
  modelId?: string;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  content: WorkflowUserMessageContent[];
  created: boolean;
}

export interface CreateDeliveryAttemptOptions {
  inputId: string;
  turnId: string;
  runtimeId: string;
  modelId?: string;
  adapterVersion?: string;
  capabilityFingerprint?: string;
  report?: unknown;
  payloadSha256?: string;
  createdAt?: number;
}

export function persistTurnInput(
  input: PersistTurnInputOptions,
): PersistedTurnInput {
  const database = getStateDb();
  const externalized = externalizeContent(input.content);
  const envelope: StoredTurnInputEnvelope = {
    schemaVersion: AGENT_TURN_INPUT_SCHEMA_VERSION,
    parts: externalized.content,
  };
  const contentJson = JSON.stringify(envelope);
  const integritySha256 = sha256(Buffer.from(contentJson, "utf8"));
  const id = randomUUID();
  const now = input.createdAt ?? Date.now();

  const result = database.transaction(() => {
    const existing = getTurnInputRowByMessage(
      database,
      input.sessionId,
      input.messageId,
    );
    if (existing?.integrity_sha256 === integritySha256) {
      return { row: existing, created: false };
    }
    const revision = (existing?.revision ?? 0) + 1;

    database
      .prepare(
        `INSERT INTO turn_inputs (
          id, session_id, turn_id, message_id, revision, schema_version, content_json,
          integrity_sha256, state, runtime_id, model_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.sessionId,
        input.turnId,
        input.messageId,
        revision,
        AGENT_TURN_INPUT_SCHEMA_VERSION,
        contentJson,
        integritySha256,
        input.runtimeId ?? null,
        input.modelId ?? null,
        now,
        now,
      );

    const insertAsset = database.prepare(
      `INSERT OR IGNORE INTO input_assets (
        sha256, storage_path, byte_length, media_type, original_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const linkAsset = database.prepare(
      `INSERT INTO turn_input_assets (
        input_id, part_index, field_name, asset_sha256
      ) VALUES (?, ?, ?, ?)`,
    );
    for (const asset of externalized.assets) {
      insertAsset.run(
        asset.sha256,
        asset.storagePath,
        asset.byteLength,
        asset.mediaType ?? null,
        asset.originalName ?? null,
        now,
      );
      linkAsset.run(id, asset.partIndex, asset.fieldName, asset.sha256);
    }
    const row = getTurnInputRowById(database, id);
    if (!row) throw new Error("Turn input was not readable after insert");
    return { row, created: true };
  })();

  return hydrateRow(database, result.row, result.created);
}

export function getTurnInput(
  sessionId: string,
  messageId: string,
): PersistedTurnInput | null {
  const database = getStateDb();
  const row = getTurnInputRowByMessage(database, sessionId, messageId);
  return row ? hydrateRow(database, row, false) : null;
}

export function getTurnInputById(inputId: string): PersistedTurnInput | null {
  const database = getStateDb();
  const row = getTurnInputRowById(database, inputId);
  return row ? hydrateRow(database, row, false) : null;
}

export function updateTurnInputState(
  inputId: string,
  state: TurnInputState,
  options: {
    runtimeId?: string;
    modelId?: string;
    lastError?: string | null;
  } = {},
): void {
  getStateDb()
    .prepare(
      `UPDATE turn_inputs
       SET state = ?, runtime_id = COALESCE(?, runtime_id),
           model_id = COALESCE(?, model_id), last_error = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      state,
      options.runtimeId ?? null,
      options.modelId ?? null,
      options.lastError ?? null,
      Date.now(),
      inputId,
    );
}

export function createDeliveryAttempt(
  input: CreateDeliveryAttemptOptions,
): string {
  const id = randomUUID();
  const now = input.createdAt ?? Date.now();
  getStateDb()
    .prepare(
      `INSERT INTO delivery_attempts (
        id, input_id, turn_id, runtime_id, model_id, adapter_version,
        capability_fingerprint, state, report_json, payload_sha256,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'preparing', ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.inputId,
      input.turnId,
      input.runtimeId,
      input.modelId ?? null,
      input.adapterVersion ?? "canonical-input-v1",
      input.capabilityFingerprint ?? null,
      input.report === undefined ? null : JSON.stringify(input.report),
      input.payloadSha256 ?? null,
      now,
      now,
    );
  return id;
}

export function updateDeliveryAttempt(
  attemptId: string,
  state: DeliveryAttemptState,
  options: {
    report?: unknown;
    payloadSha256?: string;
    lastError?: string | null;
  } = {},
): void {
  const completedAt =
    state === "completed" || state === "failed" || state === "blocked"
      ? Date.now()
      : null;
  getStateDb()
    .prepare(
      `UPDATE delivery_attempts
       SET state = ?, report_json = COALESCE(?, report_json),
           payload_sha256 = COALESCE(?, payload_sha256), last_error = ?,
           updated_at = ?, completed_at = COALESCE(?, completed_at)
       WHERE id = ?`,
    )
    .run(
      state,
      options.report === undefined ? null : JSON.stringify(options.report),
      options.payloadSha256 ?? null,
      options.lastError ?? null,
      Date.now(),
      completedAt,
      attemptId,
    );
}

function externalizeContent(content: WorkflowUserMessageContent[]): {
  content: unknown[];
  assets: ExternalizedAsset[];
} {
  const assets: ExternalizedAsset[] = [];
  const storedContent = content.map((part, partIndex) => {
    const stored = { ...part } as Record<string, unknown>;
    if (part.type === "image") {
      const parsed = parseDataUrl(part.url);
      if (parsed) {
        stored.url = writeAssetPointer({
          bytes: parsed.bytes,
          encoding: "data-url",
          mediaType: parsed.mediaType,
          originalName: imagePartName(part),
          dataUrlHeader: parsed.header,
          partIndex,
          fieldName: "url",
          assets,
        });
      }
    } else if (part.type === "localImage") {
      if (isReadableFile(part.path)) {
        const mediaType = mediaTypeFromPath(part.path);
        stored.path = writeAssetPointer({
          bytes: readFileSync(part.path),
          encoding: "local-path",
          mediaType,
          originalName: basename(part.path),
          partIndex,
          fieldName: "path",
          assets,
        });
      }
    } else if (part.type === "file") {
      stored.text = writeAssetPointer({
        bytes: Buffer.from(part.text, "utf8"),
        encoding: "utf8-text",
        mediaType: part.mimeType,
        originalName: part.name,
        partIndex,
        fieldName: "text",
        assets,
      });
    } else if (
      part.type === "browserComment" &&
      typeof part.screenshotDataUrl === "string"
    ) {
      const parsed = parseDataUrl(part.screenshotDataUrl);
      if (parsed) {
        stored.screenshotDataUrl = writeAssetPointer({
          bytes: parsed.bytes,
          encoding: "data-url",
          mediaType: parsed.mediaType,
          originalName: `browser-comment-${part.commentId}.png`,
          dataUrlHeader: parsed.header,
          partIndex,
          fieldName: "screenshotDataUrl",
          assets,
        });
      }
    }
    return stored;
  });
  return { content: storedContent, assets };
}

function writeAssetPointer(input: {
  bytes: Buffer;
  encoding: AssetEncoding;
  mediaType?: string;
  originalName?: string;
  dataUrlHeader?: string;
  partIndex: number;
  fieldName: string;
  assets: ExternalizedAsset[];
}): AssetPointer {
  const digest = sha256(input.bytes);
  const assetDir = join(getStateDir(), "input-assets");
  mkdirSync(assetDir, { recursive: true });
  const suffix = safeAssetSuffix(input.mediaType, input.originalName);
  const storagePath = `${digest}${suffix}`;
  const absolutePath = join(assetDir, storagePath);
  writeAssetAtomically(absolutePath, input.bytes);
  input.assets.push({
    partIndex: input.partIndex,
    fieldName: input.fieldName,
    sha256: digest,
    storagePath,
    byteLength: input.bytes.byteLength,
    mediaType: input.mediaType,
    originalName: input.originalName,
  });
  return {
    [ASSET_MARKER]: {
      sha256: digest,
      encoding: input.encoding,
      mediaType: input.mediaType,
      originalName: input.originalName,
      dataUrlHeader: input.dataUrlHeader,
    },
  };
}

function writeAssetAtomically(path: string, bytes: Buffer): void {
  if (existsSync(path)) return;
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, bytes, { flag: "wx" });
  try {
    renameSync(temporaryPath, path);
  } catch (error) {
    if (!existsSync(path)) throw error;
    // A concurrent writer won the content-addressed race. Only our temporary
    // file is removed; persisted user assets are never overwritten or deleted.
    unlinkSync(temporaryPath);
  }
}

function hydrateRow(
  database: Database.Database,
  row: TurnInputRow,
  created: boolean,
): PersistedTurnInput {
  if (row.schema_version !== AGENT_TURN_INPUT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported turn input schema version: ${row.schema_version}`,
    );
  }
  const actualIntegrity = sha256(Buffer.from(row.content_json, "utf8"));
  if (actualIntegrity !== row.integrity_sha256) {
    throw new Error(`Turn input integrity check failed: ${row.id}`);
  }
  const envelope = JSON.parse(row.content_json) as StoredTurnInputEnvelope;
  if (
    envelope.schemaVersion !== AGENT_TURN_INPUT_SCHEMA_VERSION ||
    !Array.isArray(envelope.parts)
  ) {
    throw new Error(`Invalid turn input envelope: ${row.id}`);
  }
  const content = envelope.parts.map((part) =>
    hydratePart(database, part),
  ) as WorkflowUserMessageContent[];
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    messageId: row.message_id,
    revision: row.revision,
    schemaVersion: row.schema_version,
    integritySha256: row.integrity_sha256,
    state: row.state,
    runtimeId: row.runtime_id ?? undefined,
    modelId: row.model_id ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    content,
    created,
  };
}

function hydratePart(database: Database.Database, raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const part = { ...(raw as Record<string, unknown>) };
  for (const [key, value] of Object.entries(part)) {
    if (isAssetPointer(value)) part[key] = hydrateAsset(database, value);
  }
  return part;
}

function hydrateAsset(
  database: Database.Database,
  pointer: AssetPointer,
): string {
  const metadata = pointer[ASSET_MARKER];
  const row = database
    .prepare("SELECT * FROM input_assets WHERE sha256 = ?")
    .get(metadata.sha256) as InputAssetRow | undefined;
  if (!row) throw new Error(`Missing input asset metadata: ${metadata.sha256}`);
  const absolutePath = join(getStateDir(), "input-assets", row.storage_path);
  const bytes = readFileSync(absolutePath);
  if (
    sha256(bytes) !== metadata.sha256 ||
    bytes.byteLength !== row.byte_length
  ) {
    throw new Error(`Input asset integrity check failed: ${metadata.sha256}`);
  }
  if (metadata.encoding === "local-path") return absolutePath;
  if (metadata.encoding === "utf8-text") return bytes.toString("utf8");
  const header =
    metadata.dataUrlHeader ?? `data:${metadata.mediaType ?? ""};base64`;
  return `${header},${bytes.toString("base64")}`;
}

function getTurnInputRowByMessage(
  database: Database.Database,
  sessionId: string,
  messageId: string,
): TurnInputRow | undefined {
  return database
    .prepare(
      `SELECT * FROM turn_inputs
       WHERE session_id = ? AND message_id = ?
       ORDER BY revision DESC LIMIT 1`,
    )
    .get(sessionId, messageId) as TurnInputRow | undefined;
}

function getTurnInputRowById(
  database: Database.Database,
  inputId: string,
): TurnInputRow | undefined {
  return database
    .prepare("SELECT * FROM turn_inputs WHERE id = ?")
    .get(inputId) as TurnInputRow | undefined;
}

function isAssetPointer(value: unknown): value is AssetPointer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = (value as Record<string, unknown>)[ASSET_MARKER];
  return Boolean(
    marker &&
    typeof marker === "object" &&
    typeof (marker as Record<string, unknown>).sha256 === "string",
  );
}

function parseDataUrl(
  value: string,
): { header: string; mediaType?: string; bytes: Buffer } | null {
  if (!value.startsWith("data:")) return null;
  const comma = value.indexOf(",");
  if (comma < 0) throw new Error("Invalid data URL input");
  const header = value.slice(0, comma);
  const payload = value.slice(comma + 1);
  const metadata = header.slice(5).split(";");
  const mediaType = metadata[0] || undefined;
  const isBase64 = metadata.some(
    (entry) => entry.toLocaleLowerCase() === "base64",
  );
  return {
    header,
    mediaType,
    bytes: isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8"),
  };
}

function isReadableFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function imagePartName(part: WorkflowUserMessageContent): string | undefined {
  if (part.type !== "image") return undefined;
  const value = part as WorkflowUserMessageContent & { name?: string };
  return value.name;
}

function safeAssetSuffix(mediaType?: string, originalName?: string): string {
  const byMediaType: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "application/json": ".json",
    "application/pdf": ".pdf",
  };
  if (mediaType && byMediaType[mediaType.toLocaleLowerCase()]) {
    return byMediaType[mediaType.toLocaleLowerCase()];
  }
  const extension = originalName
    ? extname(originalName).toLocaleLowerCase()
    : "";
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ".bin";
}

function mediaTypeFromPath(path: string): string | undefined {
  const byExtension: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
  };
  return byExtension[extname(path).toLocaleLowerCase()];
}
