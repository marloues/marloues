import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ImBotBindingsConfig,
  IntegrationSettings,
  McpMarketplaceEndpoint,
  SkillMarketplaceEndpoint,
  ToolProfile,
} from "@shared/types";
import { getIntegrationsPath } from "../app-paths";
import { decryptSecret, encryptSecret } from "./secure-storage.service";
import { logInfo, logWarn } from "../core/logging/app-logger";

// ── Disk shape ─────────────────────────────────────────────────

interface IntegrationStore {
  integrationSettings?: IntegrationSettings;
}

function defaultIntegrationSettings(): IntegrationSettings {
  return {
    activeToolProfileId: "default-tool-policy",
    toolProfiles: [
      {
        id: "default-tool-policy",
        name: "Default",
        description: "Default tool policy",
        permissionMode: "default",
        allowedTools: ["Read", "Glob", "Grep", "TodoWrite"],
        disallowedTools: [],
      },
    ],
    toolPermissionPolicy: {
      rules: [
        {
          pattern: "AskUserQuestion",
          action: "deny",
          description: "Marloues handles user questions through chat UI.",
        },
        { pattern: "Read", action: "allow" },
        { pattern: "Glob", action: "allow" },
        { pattern: "Grep", action: "allow" },
        { pattern: "LS", action: "allow" },
        { pattern: "TodoWrite", action: "allow" },
      ],
      allowedTools: ["Read", "Glob", "Grep", "LS", "TodoWrite"],
      disallowedTools: ["AskUserQuestion"],
      sensitiveToolAllowlist: ["Read", "Glob", "Grep", "LS", "TodoWrite"],
      requireConfirmationForSensitiveTools: true,
    },
    mcpServers: [],
    skillMarketplaceEndpoint: {
      baseUrl: "https://clawhub.ai",
      enabled: true,
      lastStatus: "untested",
    },
    mcpMarketplaceEndpoint: {
      baseUrl: "https://registry.modelcontextprotocol.io",
      enabled: true,
      lastStatus: "untested",
    },
    imBotBindings: { bots: [] },
    skillDirectories: [],
    disabledSkills: [],
  };
}

// ── I/O ────────────────────────────────────────────────────────

function readStore(): IntegrationStore {
  const path = getIntegrationsPath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<IntegrationStore>;
    return {
      integrationSettings: decryptIntegrationSettings(
        parsed.integrationSettings,
      ),
    };
  } catch (error) {
    logWarn("integration-config.readFailed", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function writeStore(store: IntegrationStore): void {
  const path = getIntegrationsPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    const forDisk = {
      integrationSettings: encryptIntegrationSettings(
        store.integrationSettings,
      ),
    };
    writeFileSync(path, JSON.stringify(forDisk, null, 2), "utf-8");
  } catch (error) {
    logWarn("integration-config.writeFailed", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function decryptIntegrationSettings(
  settings: Partial<IntegrationSettings> | undefined,
): IntegrationSettings | undefined {
  if (!settings) return undefined;
  return {
    ...settings,
    imBotBindings: decryptImBotBindings(settings.imBotBindings),
  } as IntegrationSettings;
}

function encryptIntegrationSettings(
  settings: IntegrationSettings | undefined,
): IntegrationSettings | undefined {
  if (!settings) return undefined;
  const {
    enterprisePolicy: _ep,
    enterpriseControlledSettings: _ec,
    ...rest
  } = settings;
  return {
    ...rest,
    imBotBindings: encryptImBotBindings(rest.imBotBindings),
  };
}

// ── Public API ─────────────────────────────────────────────────

export function getIntegrationSettings(): IntegrationSettings {
  const stored = readStore().integrationSettings;
  return normalizeIntegrationSettings(stored);
}

export function saveIntegrationSettings(settings: IntegrationSettings): void {
  const normalized = normalizeIntegrationSettings(settings);
  // Strip transient enterprise fields before writing to disk.
  const {
    enterprisePolicy: _ep,
    enterpriseControlledSettings: _ec,
    ...forDisk
  } = normalized;
  writeStore({ integrationSettings: forDisk });
  logInfo("integration-config.saved", { path: getIntegrationsPath() });
}

export function normalizeIntegrationSettings(
  raw: Partial<IntegrationSettings> | undefined,
): IntegrationSettings {
  const defaults = defaultIntegrationSettings();
  if (!raw) return defaults;
  const toolProfiles = raw.toolProfiles?.length
    ? raw.toolProfiles
    : defaults.toolProfiles;
  const activeToolProfileId = resolveActiveToolProfileId(
    toolProfiles,
    raw.activeToolProfileId,
  );
  return {
    ...defaults,
    ...raw,
    toolProfiles,
    activeToolProfileId,
    toolPermissionPolicy: normalizeToolPermissionPolicy(
      raw.toolPermissionPolicy,
    ),
    mcpServers: raw.mcpServers ?? [],
    skillMarketplaceEndpoint: normalizeMarketplaceEndpoint(
      raw.skillMarketplaceEndpoint,
      defaults.skillMarketplaceEndpoint,
    ),
    mcpMarketplaceEndpoint: normalizeMarketplaceEndpoint(
      raw.mcpMarketplaceEndpoint,
      defaults.mcpMarketplaceEndpoint,
    ),
    imBotBindings: normalizeImBotBindings(raw.imBotBindings),
    skillDirectories: raw.skillDirectories ?? [],
    disabledSkills: raw.disabledSkills ?? [],
  };
}

// ── Helpers ────────────────────────────────────────────────────

function resolveActiveToolProfileId(
  profiles: ToolProfile[],
  requestedId: string | undefined,
): string {
  if (requestedId && profiles.some((p) => p.id === requestedId))
    return requestedId;
  return profiles[0]?.id ?? "default-tool-policy";
}

function normalizeToolPermissionPolicy(
  policy: IntegrationSettings["toolPermissionPolicy"] | undefined,
): NonNullable<IntegrationSettings["toolPermissionPolicy"]> {
  const defaults = defaultIntegrationSettings().toolPermissionPolicy!;
  return {
    rules: policy?.rules ?? defaults.rules,
    allowedTools:
      normalizeToolList(policy?.allowedTools) ?? defaults.allowedTools!,
    disallowedTools:
      normalizeToolList(policy?.disallowedTools) ?? defaults.disallowedTools!,
    sensitiveToolAllowlist:
      normalizeToolList(policy?.sensitiveToolAllowlist) ??
      defaults.sensitiveToolAllowlist!,
    requireConfirmationForSensitiveTools:
      policy?.requireConfirmationForSensitiveTools ??
      defaults.requireConfirmationForSensitiveTools!,
  };
}

function normalizeToolList(tools: unknown): string[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const normalized = tools
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : [];
}

function normalizeMarketplaceEndpoint(
  endpoint: SkillMarketplaceEndpoint | McpMarketplaceEndpoint | undefined,
  fallback: SkillMarketplaceEndpoint | McpMarketplaceEndpoint | undefined,
): SkillMarketplaceEndpoint | McpMarketplaceEndpoint | undefined {
  if (!endpoint || typeof endpoint !== "object") return fallback;
  const normalizedBaseUrl = endpoint.baseUrl?.trim().replace(/\/+$/, "") || "";
  const baseUrl =
    normalizedBaseUrl === "https:" || normalizedBaseUrl === "http:"
      ? ""
      : normalizedBaseUrl;
  const configured = Boolean(baseUrl);
  return {
    baseUrl,
    enabled: endpoint.enabled !== false,
    lastStatus: configured ? endpoint.lastStatus : "untested",
    lastError: configured ? endpoint.lastError : undefined,
    lastCheckedAt: endpoint.lastCheckedAt,
  };
}

// ── IM Bot bindings ────────────────────────────────────────────

function normalizeImBotBindings(
  channels: Partial<ImBotBindingsConfig> | undefined,
): ImBotBindingsConfig {
  const raw =
    channels && typeof channels === "object"
      ? (channels as Record<string, unknown>)
      : {};
  const bots = Array.isArray(raw.bots)
    ? raw.bots
        .map((item, index) => normalizeImBotInstance(item, index))
        .filter((item): item is ImBotBindingsConfig["bots"][number] =>
          Boolean(item),
        )
    : [];
  const defaultWorkspacePath = compactString(raw.defaultWorkspacePath);
  const defaultToolProfileId = compactString(raw.defaultToolProfileId);
  return {
    bots: dedupeImBots(bots),
    ...(defaultWorkspacePath ? { defaultWorkspacePath } : {}),
    ...(defaultToolProfileId ? { defaultToolProfileId } : {}),
  };
}

function decryptImBotBindings(
  channels: Partial<ImBotBindingsConfig> | undefined,
): ImBotBindingsConfig {
  const normalized = normalizeImBotBindings(channels);
  return {
    ...normalized,
    bots: normalized.bots.map((bot) =>
      bot.manualSecret
        ? { ...bot, manualSecret: decryptSecret(bot.manualSecret) }
        : bot,
    ),
  };
}

function encryptImBotBindings(
  channels: Partial<ImBotBindingsConfig> | undefined,
): ImBotBindingsConfig {
  const normalized = normalizeImBotBindings(channels);
  return {
    ...normalized,
    bots: normalized.bots.map((bot) =>
      bot.manualSecret
        ? { ...bot, manualSecret: encryptSecret(bot.manualSecret) }
        : bot,
    ),
  };
}

const IM_CHANNELS = new Set(["wecom", "feishu"]);
const IM_BOT_STATUSES = new Set([
  "binding",
  "connected",
  "paused",
  "needsRebind",
  "error",
]);
const IM_BOT_CAPABILITIES = new Set([
  "inboundTasks",
  "taskNotifications",
  "scheduledNotifications",
  "permissionApprovals",
]);
const DEFAULT_IM_BOT_CAPABILITIES: ImBotBindingsConfig["bots"][number]["capabilities"] =
  [
    "inboundTasks",
    "taskNotifications",
    "scheduledNotifications",
    "permissionApprovals",
  ];

function normalizeImBotInstance(
  value: unknown,
  index: number,
): ImBotBindingsConfig["bots"][number] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const channel = typeof record.channel === "string" ? record.channel : "";
  if (!IM_CHANNELS.has(channel)) return null;
  const id = nonEmptyString(record.id) ?? `im-bot-${channel}-${index + 1}`;
  const bindMode = record.bindMode === "manual" ? "manual" : "scan";
  const status =
    typeof record.status === "string" && IM_BOT_STATUSES.has(record.status)
      ? record.status
      : record.enabled === false
        ? "paused"
        : "connected";
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.filter(
        (
          capability,
        ): capability is ImBotBindingsConfig["bots"][number]["capabilities"][number] =>
          typeof capability === "string" && IM_BOT_CAPABILITIES.has(capability),
      )
    : [];
  return stripUndefined({
    id,
    channel,
    name: nonEmptyString(record.name) ?? channelLabel(channel),
    enabled: record.enabled !== false,
    bindMode,
    status,
    capabilities: capabilities.length
      ? capabilities
      : DEFAULT_IM_BOT_CAPABILITIES,
    workspacePath: nonEmptyString(record.workspacePath),
    toolProfileId: nonEmptyString(record.toolProfileId),
    tenantId: nonEmptyString(record.tenantId),
    tenantName: nonEmptyString(record.tenantName),
    botExternalId: nonEmptyString(record.botExternalId),
    manualSecret: nonEmptyString(record.manualSecret),
    chatId: nonEmptyString(record.chatId),
    chatName: nonEmptyString(record.chatName),
    createdAt: normalizeTimestamp(record.createdAt),
    updatedAt: normalizeTimestamp(record.updatedAt),
    lastEventAt: normalizeTimestamp(record.lastEventAt),
    lastError: nonEmptyString(record.lastError),
  }) as ImBotBindingsConfig["bots"][number];
}

function dedupeImBots(
  bots: ImBotBindingsConfig["bots"],
): ImBotBindingsConfig["bots"] {
  const seen = new Set<string>();
  return bots.filter((bot) => {
    if (seen.has(bot.id)) return false;
    seen.add(bot.id);
    return true;
  });
}

function channelLabel(channel: string): string {
  return channel === "wecom" ? "\u4f01\u4e1a\u5fae\u4fe1" : "\u98de\u4e66";
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function compactString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function stripUndefined<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

/** Migrate integration settings from legacy settings.json. */
export function migrateFromLegacyIntegration(
  settings: Partial<IntegrationSettings>,
): void {
  const normalized = normalizeIntegrationSettings(settings);
  writeStore({ integrationSettings: normalized });
  logInfo("integration-config.migrated", { path: getIntegrationsPath() });
}

export { defaultIntegrationSettings };
export type { IntegrationStore };
