import builtinModelsData from "./builtin-models.json";
import type { ModelOption, ModelProviderEndpoint } from "./types";

export type BuiltinProviderPresetId = "deepseek" | "minimax" | "zhipu";

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

function parseBuiltinData(): BuiltinProviderMetadata[] {
  const providers = builtinModelsData.providers ?? [];
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
    models: (p.models ?? []).map((m) => ({
      id: m.id,
      label: m.label ?? m.id,
      enabled: true,
      contextWindowTokens: m.contextWindowTokens,
      maxOutputTokens: m.maxOutputTokens,
      supportsThinking: m.supportsThinking ?? false,
      supportsVision: m.supportsVision ?? false,
    })),
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

export function modelMetadataPreset(modelId: string): Partial<ModelOption> {
  for (const provider of BUILTIN_PROVIDER_METADATA) {
    const model = provider.models.find((m) => m.id === modelId);
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
