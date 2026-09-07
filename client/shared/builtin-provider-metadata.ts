import builtinModelsData from "./builtin-models.json";
import type { ModelOption, ModelProviderEndpoint } from "./types";

export type BuiltinProviderPresetId = "deepseek" | "minimax" | "zhipu" | "agw";

export interface BuiltinEndpointEntry {
  id: string;
  name: string;
  protocol: "openai-chat" | "openai-responses" | "anthropic";
  baseUrl: string;
  priority: number;
}

export interface BuiltinProviderMetadata {
  id: BuiltinProviderPresetId;
  name: string;
  endpoints: BuiltinEndpointEntry[];
  models: ModelOption[];
}

// v2 JSON structure: models[] is a global catalog, providers.models[] are references.
interface BuiltinModelCatalogEntry {
  id: string;
  label: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  supportsThinking?: boolean;
  supportsVision?: boolean;
}

interface BuiltinProviderModelRef {
  id: string;
  providerModelId?: string;
  label?: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  supportsThinking?: boolean;
  supportsVision?: boolean;
}

type BuiltinModelsFile = {
  version: number;
  models: BuiltinModelCatalogEntry[];
  providers: Array<{
    id: string;
    name: string;
    endpoints: BuiltinEndpointEntry[];
    models: (string | BuiltinProviderModelRef)[];
  }>;
};

const MODELS_FILE = builtinModelsData as BuiltinModelsFile;

const MODEL_CATALOG: ReadonlyMap<string, BuiltinModelCatalogEntry> = new Map(
  (MODELS_FILE.models ?? []).map((m) => [m.id, m]),
);

/** Resolve a provider model reference against the global catalog. */
function resolveModelRef(
  ref: string | BuiltinProviderModelRef,
): ModelOption | null {
  const refObj = typeof ref === "string" ? { id: ref } : ref;
  const catalog = MODEL_CATALOG.get(refObj.id);
  if (!catalog) {
    if (typeof ref === "string") return null;
    return {
      id: refObj.id,
      label: refObj.label ?? refObj.id,
      enabled: true,
      contextWindowTokens: refObj.contextWindowTokens,
      maxOutputTokens: refObj.maxOutputTokens,
      supportsThinking: refObj.supportsThinking ?? false,
      supportsVision: refObj.supportsVision ?? false,
      providerModelId: refObj.providerModelId,
    };
  }
  return {
    id: catalog.id,
    label: refObj.label ?? catalog.label,
    enabled: true,
    contextWindowTokens:
      refObj.contextWindowTokens ?? catalog.contextWindowTokens,
    maxOutputTokens: refObj.maxOutputTokens ?? catalog.maxOutputTokens,
    supportsThinking:
      refObj.supportsThinking ?? catalog.supportsThinking ?? false,
    supportsVision: refObj.supportsVision ?? catalog.supportsVision ?? false,
    providerModelId: refObj.providerModelId,
  };
}

function parseBuiltinData(): BuiltinProviderMetadata[] {
  const providers = MODELS_FILE.providers ?? [];
  return providers.map((p) => ({
    id: p.id as BuiltinProviderPresetId,
    name: p.name,
    endpoints: (p.endpoints ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      protocol: e.protocol,
      baseUrl: e.baseUrl,
      priority: e.priority,
    })),
    models: (p.models ?? [])
      .map((ref) => resolveModelRef(ref))
      .filter((m): m is ModelOption => m !== null),
  }));
}

export const BUILTIN_PROVIDER_METADATA: readonly BuiltinProviderMetadata[] =
  parseBuiltinData();

export function builtinProviderMetadata(
  presetId: string,
): BuiltinProviderMetadata | undefined {
  return BUILTIN_PROVIDER_METADATA.find((preset) => preset.id === presetId);
}

export function builtinProviderEndpoints(
  presetId: string,
): ModelProviderEndpoint[] {
  const metadata = builtinProviderMetadata(presetId);
  if (!metadata) return [];
  return metadata.endpoints.map((e) => ({ ...e, enabled: true }));
}

/** Look up canonical model specs from the global catalog, with a fallback to providerModelId. */
export function modelMetadataPreset(modelId: string): Partial<ModelOption> {
  const catalog = MODEL_CATALOG.get(modelId);
  if (catalog) {
    return {
      contextWindowTokens: catalog.contextWindowTokens,
      maxOutputTokens: catalog.maxOutputTokens,
      supportsThinking: catalog.supportsThinking,
      supportsVision: catalog.supportsVision,
    };
  }
  for (const provider of BUILTIN_PROVIDER_METADATA) {
    const model = provider.models.find((m) => m.providerModelId === modelId);
    if (model) {
      return {
        contextWindowTokens: model.contextWindowTokens,
        maxOutputTokens: model.maxOutputTokens,
        supportsThinking: model.supportsThinking,
        supportsVision: model.supportsVision,
      };
    }
  }
  return {};
}
