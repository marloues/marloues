import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  BuiltinModelProviderConfig,
  CustomModelProviderConfig,
  ModelOption,
  ModelProviderConfig,
  ModelSelection,
  RuntimeKind,
} from "@shared/types";
import {
  BUILTIN_PROVIDER_METADATA,
  builtinProviderMetadata,
  modelMetadataPreset,
  type BuiltinProviderMetadata,
} from "@shared/builtin-provider-metadata";
import { getUserModelsPath } from "../app-paths";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "./secure-storage.service";
import { logInfo, logWarn } from "../core/logging/app-logger";

// ── User models.json shape ────────────────────────────────────

interface UserBuiltinOverride {
  enabled?: boolean;
  apiKey?: string;
  apiKeyEnv?: string;
  purpose?: "prod" | "test" | "dev";
  modelOverrides?: Record<string, { enabled?: boolean }>;
}

interface UserCustomProvider extends Omit<CustomModelProviderConfig, "kind"> {
  kind?: "custom";
}

interface UserModelsFile {
  version?: number;
  defaultModel?: ModelSelection;
  activeRuntimeId?: RuntimeKind;
  runtimeConfigDir?: string;
  builtinOverrides?: Record<string, UserBuiltinOverride>;
  customProviders?: UserCustomProvider[];
}

// ── Defaults ───────────────────────────────────────────────────

function defaultModelSelection(): ModelSelection {
  const first = BUILTIN_PROVIDER_METADATA[0];
  const firstModel = first?.models[0];
  return {
    providerId: first?.id ?? "unconfigured-provider",
    modelId: firstModel?.id ?? "default",
  };
}

function defaultProviders(): ModelProviderConfig[] {
  // Build from builtin-models.json; user hasn't configured anything yet.
  return BUILTIN_PROVIDER_METADATA.map((meta) =>
    builtinMetadataToProviderConfig(meta),
  );
}

function builtinMetadataToProviderConfig(
  meta: BuiltinProviderMetadata,
): BuiltinModelProviderConfig {
  return {
    id: meta.id,
    name: meta.name,
    kind: "builtin",
    presetId: meta.id,
    enabled: true,
    models: meta.models.map((m) => ({ ...m })),
  };
}

function unconfiguredProvider(): ModelProviderConfig {
  return {
    id: "unconfigured-provider",
    name: "\u672a\u914d\u7f6e\u4f9b\u5e94\u5546",
    kind: "custom",
    enabled: true,
    purpose: "prod",
    endpoints: [],
    models: [
      normalizeModelOption({
        id: "default",
        label:
          "\u672a\u914d\u7f6e\uff08\u8bf7\u8bbe\u7f6e\u6a21\u578b\u7aef\u70b9\uff09",
        enabled: true,
      }),
    ],
  };
}

// ── User models.json I/O ───────────────────────────────────────

function readUserModelsFile(): UserModelsFile {
  const path = getUserModelsPath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<UserModelsFile>;
    return decryptUserModels(parsed);
  } catch (error) {
    logWarn("model-config.readFailed", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function writeUserModelsFile(data: UserModelsFile): void {
  const path = getUserModelsPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const forDisk = encryptUserModels(data);
    writeFileSync(path, JSON.stringify(forDisk, null, 2), "utf-8");
  } catch (error) {
    logWarn("model-config.writeFailed", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function decryptUserModels(data: Partial<UserModelsFile>): UserModelsFile {
  const overrides = data.builtinOverrides ?? {};
  for (const key of Object.keys(overrides)) {
    const o = overrides[key];
    if (o?.apiKey) o.apiKey = decryptSecret(o.apiKey);
  }
  const customs = data.customProviders ?? [];
  for (const p of customs) {
    if (p.apiKey) p.apiKey = decryptSecret(p.apiKey);
  }
  return { ...data, builtinOverrides: overrides, customProviders: customs };
}

function encryptUserModels(data: UserModelsFile): UserModelsFile {
  const overrides = { ...(data.builtinOverrides ?? {}) };
  for (const key of Object.keys(overrides)) {
    const o = overrides[key];
    if (o?.apiKey) o.apiKey = encryptSecret(o.apiKey);
  }
  const customs = (data.customProviders ?? []).map((p) => ({
    ...p,
    kind: "custom" as const,
    apiKey: p.apiKey ? encryptSecret(p.apiKey) : undefined,
  }));
  return { ...data, builtinOverrides: overrides, customProviders: customs };
}

// ── Merge: builtin + user overrides + custom ────────────────────

function mergeProviders(user: UserModelsFile): ModelProviderConfig[] {
  const overrides = user.builtinOverrides ?? {};
  const builtinProviders = BUILTIN_PROVIDER_METADATA.map((meta) =>
    applyBuiltinOverride(
      builtinMetadataToProviderConfig(meta),
      overrides[meta.id],
    ),
  );
  const customProviders = (user.customProviders ?? []).map(
    normalizeCustomProvider,
  );
  return [...builtinProviders, ...customProviders];
}

function applyBuiltinOverride(
  provider: BuiltinModelProviderConfig,
  override: UserBuiltinOverride | undefined,
): BuiltinModelProviderConfig {
  if (!override) return provider;
  return {
    ...provider,
    enabled: override.enabled ?? provider.enabled,
    apiKey: override.apiKey ?? provider.apiKey,
    apiKeyEnv: override.apiKeyEnv ?? provider.apiKeyEnv,
    purpose: override.purpose ?? provider.purpose,
    models: provider.models.map((m) => {
      const mo = override.modelOverrides?.[m.id];
      return mo?.enabled !== undefined ? { ...m, enabled: mo.enabled } : m;
    }),
  };
}

// ── Public API ─────────────────────────────────────────────────

export function getModelConfig(): ModelConfigResolved {
  const user = readUserModelsFile();
  const providers =
    user.builtinOverrides || user.customProviders?.length
      ? mergeProviders(user)
      : defaultProviders();
  const defaultModel = normalizeDefaultModel(user.defaultModel, providers);
  return {
    providers,
    defaultModel,
    activeRuntimeId: user.activeRuntimeId,
    runtimeConfigDir: user.runtimeConfigDir,
  };
}

export interface ModelConfigResolved {
  providers: ModelProviderConfig[];
  defaultModel: ModelSelection;
  activeRuntimeId?: RuntimeKind;
  runtimeConfigDir?: string;
}

export function saveModelConfig(input: ModelConfigResolved): void {
  const user: UserModelsFile = {
    version: 1,
    defaultModel: input.defaultModel,
    activeRuntimeId: input.activeRuntimeId,
    runtimeConfigDir: input.runtimeConfigDir,
    builtinOverrides: extractBuiltinOverrides(input.providers),
    customProviders: extractCustomProviders(input.providers),
  };
  writeUserModelsFile(user);
  logInfo("model-config.saved", { path: getUserModelsPath() });
}

function extractBuiltinOverrides(
  providers: ModelProviderConfig[],
): Record<string, UserBuiltinOverride> {
  const result: Record<string, UserBuiltinOverride> = {};
  for (const p of providers) {
    if (p.kind !== "builtin") continue;
    const meta = builtinProviderMetadata(p.presetId);
    if (!meta) continue;
    // Only store if user changed something from defaults.
    const defaultP = builtinMetadataToProviderConfig(meta);
    const hasApiKey = p.apiKey && p.apiKey.trim();
    const hasApiKeyEnv = p.apiKeyEnv && p.apiKeyEnv.trim();
    const enabledChanged = p.enabled !== defaultP.enabled;
    const modelOverrides: Record<string, { enabled: boolean }> = {};
    for (const m of p.models) {
      const defaultM = defaultP.models.find((dm) => dm.id === m.id);
      if (defaultM && m.enabled !== defaultM.enabled) {
        modelOverrides[m.id] = { enabled: m.enabled };
      }
    }
    if (
      hasApiKey ||
      hasApiKeyEnv ||
      enabledChanged ||
      Object.keys(modelOverrides).length
    ) {
      result[p.presetId] = {
        ...(enabledChanged ? { enabled: p.enabled } : {}),
        ...(hasApiKey ? { apiKey: p.apiKey } : {}),
        ...(hasApiKeyEnv ? { apiKeyEnv: p.apiKeyEnv } : {}),
        ...(p.purpose ? { purpose: p.purpose } : {}),
        ...(Object.keys(modelOverrides).length ? { modelOverrides } : {}),
      };
    }
  }
  return result;
}

function extractCustomProviders(
  providers: ModelProviderConfig[],
): UserCustomProvider[] {
  return providers
    .filter((p): p is CustomModelProviderConfig => p.kind === "custom")
    .map((p) => {
      const { kind: _kind, source: _src, locked: _lock, ...rest } = p;
      return { ...rest, kind: "custom" as const };
    });
}

// ── Normalization helpers ──────────────────────────────────────

function normalizeDefaultModel(
  requested: ModelSelection | undefined,
  providers: ModelProviderConfig[],
): ModelSelection {
  if (!providers.length) {
    return requested ?? defaultModelSelection();
  }
  const provider =
    providers.find((p) => p.id === requested?.providerId && p.enabled) ??
    providers.find((p) => p.enabled) ??
    providers[0];
  const model =
    provider.models.find((m) => m.id === requested?.modelId && m.enabled) ??
    provider.models.find((m) => m.enabled) ??
    provider.models[0];
  return {
    providerId: provider.id,
    modelId: model?.id ?? requested?.modelId ?? "default",
  };
}

function normalizeCustomProvider(
  p: UserCustomProvider,
): CustomModelProviderConfig {
  return {
    id: p.id,
    name: p.name,
    kind: "custom",
    enabled: p.enabled !== false,
    apiKey: p.apiKey,
    apiKeyEnv: p.apiKeyEnv,
    purpose: p.purpose,
    source: p.source,
    locked: p.locked,
    endpoints: (p.endpoints ?? [])
      .map((e, i) => ({
        id: e.id?.trim() || `endpoint-${i + 1}`,
        name: e.name?.trim() || undefined,
        protocol: normalizeEndpointProtocol(e.protocol),
        baseUrl: e.baseUrl?.trim() ?? "",
        enabled: e.enabled !== false,
        priority:
          Number.isFinite(e.priority) && e.priority >= 0
            ? Math.trunc(e.priority)
            : (i + 1) * 10,
      }))
      .filter((e) => e.baseUrl),
    models: (p.models ?? []).map(normalizeModelOption),
  };
}

function normalizeEndpointProtocol(
  protocol: unknown,
): "openai-chat" | "openai-responses" | "anthropic" {
  return protocol === "openai-responses" || protocol === "anthropic"
    ? protocol
    : "openai-chat";
}

export function normalizeModelOption(model: Partial<ModelOption>): ModelOption {
  const id = model.id ?? "";
  const preset = modelMetadataPreset(id);
  return {
    id,
    label: model.label ?? id,
    enabled: model.enabled !== false,
    contextWindowTokens:
      normalizePositiveInteger(model.contextWindowTokens) ??
      preset.contextWindowTokens,
    maxOutputTokens:
      normalizePositiveInteger(model.maxOutputTokens) ?? preset.maxOutputTokens,
    supportsVision: model.supportsVision ?? preset.supportsVision ?? false,
    supportsThinking:
      model.supportsThinking ?? preset.supportsThinking ?? false,
  };
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.trunc(value);
  return n > 0 ? n : undefined;
}

/** Migrate providers from legacy settings.json into models.json format. */
export function migrateFromLegacyProviders(
  providers: ModelProviderConfig[],
  defaultModel: ModelSelection,
  activeRuntimeId?: RuntimeKind,
  runtimeConfigDir?: string,
): void {
  const overrides = extractBuiltinOverrides(providers);
  const customs = extractCustomProviders(providers);
  // Only write if there's actual user data to migrate.
  if (!Object.keys(overrides).length && !customs.length) return;
  writeUserModelsFile({
    version: 1,
    defaultModel,
    activeRuntimeId,
    runtimeConfigDir,
    builtinOverrides: overrides,
    customProviders: customs,
  });
  logInfo("model-config.migrated", { path: getUserModelsPath() });
}

/** Preserve encrypted API keys from disk when saving. */
export function preserveEncryptedApiKeys(
  providers: ModelProviderConfig[],
): ModelProviderConfig[] {
  const raw = readUserModelsFile();
  return providers.map((p) => {
    if (p.kind === "builtin") {
      const rawOverride = raw.builtinOverrides?.[p.presetId];
      if (rawOverride?.apiKey && isEncryptedSecret(rawOverride.apiKey)) {
        if (!p.apiKey?.trim()) {
          return { ...p, apiKey: rawOverride.apiKey };
        }
      }
    } else {
      const rawCustom = raw.customProviders?.find(
        (rp) => rp.id === p.id || rp.name === p.name,
      );
      if (rawCustom?.apiKey && isEncryptedSecret(rawCustom.apiKey)) {
        if (!p.apiKey?.trim()) {
          return { ...p, apiKey: rawCustom.apiKey };
        }
      }
    }
    return p;
  });
}

export { unconfiguredProvider, defaultModelSelection };
export type { UserModelsFile };
