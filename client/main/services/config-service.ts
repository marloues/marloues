/**
 * Facade over the split config domain services.
 *
 * - Model config (providers, defaultModel, runtime) -> model-config-service -> models.json
 * - Integration config (MCP, tools, IM, skills) -> integration-config-service -> integrations.json
 * - App behavior (workMode, security, thinking, etc.) -> settings.json
 * - Enterprise overlay -> marloues.enterprise.json
 *
 * Maintains backward compat with legacy { agentSettings: {...} } format in settings.json.
 * On first save with the new code, legacy data is split into the three domain files.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AgentSettings,
  AppSettings,
  ContextManagementSettings,
  ImBotBindingsConfig,
  IntegrationSettings,
  ModelProviderConfig,
  ModelSelection,
  McpServerConfig,
  ToolProfile,
} from "@shared/types";
import {
  getEnterpriseConfigPath,
  getLegacyStorePath,
  getSettingsPath,
} from "../app-paths";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "./secure-storage.service";
import { logInfo, logWarn } from "../core/logging/app-logger";
import { setRedactionRules } from "../core/security/redaction";
import {
  getModelConfig,
  saveModelConfig,
  normalizeModelOption,
  preserveEncryptedApiKeys,
} from "./model-config-service";
import {
  getIntegrationSettings,
  saveIntegrationSettings,
  normalizeIntegrationSettings,
} from "./integration-config-service";

// Re-export for convenience.
export {
  getModelConfig,
  saveModelConfig,
  normalizeModelOption,
  preserveEncryptedApiKeys,
} from "./model-config-service";
export {
  getIntegrationSettings,
  saveIntegrationSettings,
  normalizeIntegrationSettings,
} from "./integration-config-service";
export { buildSdkEnv } from "../core/config/env-builder";

// ── Types ──────────────────────────────────────────────────────

type LegacyAgentSettings = Partial<AgentSettings>;
type ToolPermissionRuleConfig = {
  pattern: string;
  action: "deny" | "ask" | "allow";
  description?: string;
};
type ExtendedToolPermissionPolicy = NonNullable<
  AgentSettings["toolPermissionPolicy"]
> & {
  rules?: ToolPermissionRuleConfig[];
};

interface EnterpriseConfig {
  agentSettings?: LegacyAgentSettings;
  skillRoots?: unknown;
  policy?: AgentSettings["enterprisePolicy"];
}

interface AppStoreShape {
  appSettings?: Partial<AppSettings>;
  // Legacy: everything was in agentSettings.
  agentSettings?: LegacyAgentSettings;
}

// ── Defaults ───────────────────────────────────────────────────

function defaultAppSettings(): AppSettings {
  return {
    maxTurns: 50,
    workMode: "execute",
    securityMode: "request",
    securityRules: {
      autoAllowPaths: [],
      protectedPaths: [],
      commandAllowlist: [],
      commandAsklist: [],
      networkAccess: "ask",
      allowedDomains: [],
      deniedDomains: [],
    },
    permissionMode: "default",
    permissionApprovalTimeoutMs: 120_000,
    desktopNotificationsEnabled: true,
    friendlyTone: true,
    customInstructions: "",
    memoryMode: "workspace",
    contextManagement: {
      warningThresholdPercent: 70,
      compactThresholdPercent: 85,
      restartThresholdPercent: 92,
      autoCompactEnabled: false,
    },
    autoMemoryEnabled: true,
    thinkingEnabled: true,
    maxThinkingTokens: 10240,
    sandboxEnabled: true,
    sandboxMode: "workspace-write",
  };
}

function defaultAgentSettings(): AgentSettings {
  return {
    ...defaultAppSettings(),
    providers: [],
    defaultModel: { providerId: "unconfigured-provider", modelId: "default" },
    activeRuntimeId: "sdk",
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
    } satisfies ExtendedToolPermissionPolicy,
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

// ── App store I/O (settings.json) ──────────────────────────────

function readAppStore(): AppStoreShape {
  const settingsPath = getSettingsPath();
  migrateSettingsIfNeeded(settingsPath);
  if (!existsSync(settingsPath)) return {};
  try {
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppStoreShape>;
    return {
      appSettings: parsed.appSettings,
      agentSettings: decryptLegacyAgentSettings(parsed.agentSettings),
    };
  } catch (error) {
    logWarn("config.readFailed", {
      settingsPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function writeAppStore(appSettings: AppSettings): void {
  const settingsPath = getSettingsPath();
  try {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({ appSettings }, null, 2),
      "utf-8",
    );
  } catch (error) {
    logWarn("config.writeFailed", {
      settingsPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function migrateSettingsIfNeeded(settingsPath: string): void {
  if (existsSync(settingsPath)) return;
  const legacyStorePath = getLegacyStorePath();
  if (!existsSync(legacyStorePath)) return;
  try {
    mkdirSync(dirname(settingsPath), { recursive: true });
    const legacy = readSettingsFromLegacy(
      readFileSync(legacyStorePath, "utf-8"),
    );
    writeFileSync(
      settingsPath,
      JSON.stringify(
        { agentSettings: encryptLegacyAgentSettings(legacy.agentSettings) },
        null,
        2,
      ),
      "utf-8",
    );
    logInfo("config.settings.migrated", {
      legacyStorePath,
      settingsPath,
    });
  } catch (error) {
    logWarn("config.settings.migrationFailed", {
      legacyStorePath,
      settingsPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function readSettingsFromLegacy(rawStore: string): {
  agentSettings: AgentSettings;
} {
  const parsed = JSON.parse(rawStore) as Partial<{
    agentSettings?: LegacyAgentSettings;
  }>;
  return {
    agentSettings: normalizeAgentSettings(
      decryptLegacyAgentSettings(parsed.agentSettings),
    ),
  };
}

// ── Enterprise config ──────────────────────────────────────────

function readEnterpriseConfig(): EnterpriseConfig | null {
  const enterprisePath = getEnterpriseConfigPath();
  if (!existsSync(enterprisePath)) return null;
  try {
    const parsed = JSON.parse(
      stripUtf8Bom(readFileSync(enterprisePath, "utf-8")),
    ) as EnterpriseConfig;
    return {
      ...parsed,
      agentSettings: decryptLegacyAgentSettings(parsed.agentSettings),
    };
  } catch (error) {
    logWarn("config.enterprise.readFailed", {
      enterprisePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function getEnterpriseSkillRoots(): string[] {
  const skillRoots = readEnterpriseConfig()?.skillRoots;
  return Array.isArray(skillRoots)
    ? skillRoots.filter(
        (root): root is string =>
          typeof root === "string" && root.trim().length > 0,
      )
    : [];
}

function applyEnterprisePolicy(settings: AgentSettings): AgentSettings {
  const merged = applyEnterpriseConfigToAgentSettings(
    settings,
    readEnterpriseConfig(),
  );
  setRedactionRules(merged.enterprisePolicy?.redactionRules);
  return merged;
}

export function applyEnterpriseConfigToAgentSettings(
  local: AgentSettings,
  enterpriseConfig: EnterpriseConfig | null,
): AgentSettings {
  const enterprise = enterpriseConfig?.agentSettings;
  if (!enterprise) {
    return enterpriseConfig?.policy
      ? { ...local, enterprisePolicy: enterpriseConfig.policy }
      : local;
  }

  const enterpriseProviders = enterprise.providers?.length
    ? normalizeEnterpriseProviders(enterprise.providers)
    : [];
  const enterpriseMcpServers = enterprise.mcpServers?.length
    ? enterprise.mcpServers
    : [];
  const enterpriseToolProfiles = enterprise.toolProfiles?.length
    ? enterprise.toolProfiles
    : [];
  const merged: AgentSettings = {
    ...local,
    ...stripUndefined({
      activeRuntimeId: enterprise.activeRuntimeId,
      runtimeConfigDir: enterprise.runtimeConfigDir,
      defaultModel: enterprise.defaultModel,
      maxTurns: enterprise.maxTurns,
      workMode:
        enterprise.workMode !== undefined ||
        (enterprise.permissionMode as unknown) === "plan"
          ? normalizeWorkMode(enterprise.workMode, enterprise.permissionMode)
          : undefined,
      securityMode:
        enterprise.securityMode !== undefined
          ? normalizeSecurityMode(enterprise.securityMode)
          : undefined,
      securityRules: enterprise.securityRules,
      permissionMode:
        enterprise.permissionMode !== undefined
          ? normalizePermissionMode(enterprise.permissionMode)
          : undefined,
      permissionApprovalTimeoutMs:
        enterprise.permissionApprovalTimeoutMs === undefined
          ? undefined
          : normalizePermissionApprovalTimeoutMs(
              enterprise.permissionApprovalTimeoutMs,
            ),
      desktopNotificationsEnabled: enterprise.desktopNotificationsEnabled,
      friendlyTone: enterprise.friendlyTone,
      customInstructions: enterprise.customInstructions,
      memoryMode: enterprise.memoryMode,
      contextManagement: enterprise.contextManagement,
      toolPermissionPolicy: enterprise.toolPermissionPolicy,
      autoMemoryEnabled: enterprise.autoMemoryEnabled,
      autoMemoryDirectory: enterprise.autoMemoryDirectory,
      autoDreamEnabled: enterprise.autoDreamEnabled,
      thinkingEnabled: enterprise.thinkingEnabled,
      maxThinkingTokens: enterprise.maxThinkingTokens,
      activeToolProfileId: enterprise.activeToolProfileId,
      imBotBindings: enterprise.imBotBindings,
      skillDirectories: enterprise.skillDirectories,
      disabledSkills: enterprise.disabledSkills,
    }),
    providers: enterpriseProviders.length
      ? mergeArrays(
          local.providers,
          enterpriseProviders.map(markEnterpriseProvider),
          ["id", "name"],
        )
      : local.providers,
    mcpServers: enterpriseMcpServers.length
      ? mergeArrays(
          local.mcpServers,
          enterpriseMcpServers.map(markEnterpriseMcpServer),
          ["id", "name"],
        )
      : local.mcpServers,
    toolProfiles: enterpriseToolProfiles.length
      ? mergeArrays(
          local.toolProfiles,
          enterpriseToolProfiles.map(markEnterpriseToolProfile),
          ["id"],
        )
      : local.toolProfiles,
  };

  return {
    ...normalizeAgentSettings(merged),
    enterprisePolicy: enterpriseConfig?.policy,
    enterpriseControlledSettings: Object.keys(enterprise).filter(
      (key) => (enterprise as Record<string, unknown>)[key] !== undefined,
    ),
  };
}

// ── Public API: get / save ──────────────────────────────────────

export function getAgentSettings(): AgentSettings {
  const store = readAppStore();

  // Legacy format: everything was in agentSettings.
  if (store.agentSettings) {
    return applyEnterprisePolicy(normalizeAgentSettings(store.agentSettings));
  }

  // New format: combine three domain services.
  const modelConfig = getModelConfig();
  const integration = getIntegrationSettings();
  const appSettings = normalizeAppSettings(store.appSettings);

  return applyEnterprisePolicy({
    ...defaultAgentSettings(),
    ...appSettings,
    ...modelConfig,
    ...integration,
  });
}

export function saveAgentSettings(settings: AgentSettings): void {
  const sanitized = sanitizeLocalAgentSettingsForSave(
    settings,
    getAgentSettings(),
    readEnterpriseConfig(),
  );

  // Write model config first (most likely to throw on encryption).
  saveModelConfig({
    providers: preserveEncryptedApiKeys(
      stripTransientFromProviders(sanitized.providers),
    ),
    defaultModel: sanitized.defaultModel,
    activeRuntimeId: sanitized.activeRuntimeId,
    runtimeConfigDir: sanitized.runtimeConfigDir,
  });

  // Integration config next.
  saveIntegrationSettings(extractIntegrationSettings(sanitized));

  // App behavior last (no encryption, cannot fail).
  writeAppStore(extractAppSettings(sanitized));

  logInfo("config.saved", { settingsPath: getSettingsPath() });
}

// ── Sanitization for save ─────────────────────────────────────

export function sanitizeLocalAgentSettingsForSave(
  submitted: AgentSettings,
  currentLocal: AgentSettings,
  enterpriseConfig: EnterpriseConfig | null,
): AgentSettings {
  if (!enterpriseConfig) {
    return stripTransientPolicyFields(submitted);
  }

  const enterprise = enterpriseConfig.agentSettings ?? {};
  const policy = enterpriseConfig.policy ?? {};
  const enterpriseProviders = enterprise.providers?.length
    ? normalizeEnterpriseProviders(enterprise.providers)
    : [];
  const enterpriseMcpServers = enterprise.mcpServers?.length
    ? enterprise.mcpServers
    : [];
  const enterpriseToolProfiles = enterprise.toolProfiles ?? [];
  const next = stripTransientPolicyFields(submitted);

  return {
    ...next,
    ...preserveEnterpriseControlledScalars(next, currentLocal, enterprise),
    providers:
      policy.allowLocalEndpointProfiles === false
        ? currentLocal.providers
        : filterEnterpriseItems(next.providers, enterpriseProviders, (item) => [
            item.id,
            item.name,
          ]),
    mcpServers:
      policy.allowLocalMcpServers === false
        ? currentLocal.mcpServers
        : filterEnterpriseItems(
            next.mcpServers,
            enterpriseMcpServers,
            (item) => [item.id, item.name],
          ),
    toolProfiles:
      policy.allowLocalToolProfiles === false
        ? currentLocal.toolProfiles
        : filterEnterpriseItems(
            next.toolProfiles,
            enterpriseToolProfiles,
            (item) => [item.id],
          ),
    disabledSkills:
      policy.allowLocalSkillDisable === false
        ? currentLocal.disabledSkills
        : next.disabledSkills,
  };
}

function stripTransientPolicyFields(settings: AgentSettings): AgentSettings {
  const {
    enterprisePolicy: _ep,
    enterpriseControlledSettings: _ec,
    ...rest
  } = settings;
  return {
    ...rest,
    providers: rest.providers.map(
      (p) => stripPolicyMetadata(p) as ModelProviderConfig,
    ),
    mcpServers: rest.mcpServers.map(stripPolicyMetadata),
    toolProfiles: rest.toolProfiles.map(stripPolicyMetadata),
  };
}

function stripTransientFromProviders(
  providers: ModelProviderConfig[],
): ModelProviderConfig[] {
  return providers.map((p) => stripPolicyMetadata(p) as ModelProviderConfig);
}

function preserveEnterpriseControlledScalars(
  submitted: AgentSettings,
  currentLocal: AgentSettings,
  enterprise: Partial<AgentSettings>,
): Partial<AgentSettings> {
  const preserved: Partial<AgentSettings> = {};
  const keys = [
    "activeRuntimeId",
    "runtimeConfigDir",
    "defaultModel",
    "maxTurns",
    "workMode",
    "securityMode",
    "securityRules",
    "permissionMode",
    "permissionApprovalTimeoutMs",
    "desktopNotificationsEnabled",
    "friendlyTone",
    "customInstructions",
    "memoryMode",
    "contextManagement",
    "toolPermissionPolicy",
    "autoMemoryEnabled",
    "autoMemoryDirectory",
    "autoDreamEnabled",
    "thinkingEnabled",
    "maxThinkingTokens",
    "activeToolProfileId",
    "skillMarketplaceEndpoint",
    "mcpMarketplaceEndpoint",
    "imBotBindings",
    "skillDirectories",
  ] as const;
  for (const key of keys) {
    preserved[key] = (
      enterprise[key] !== undefined ? currentLocal[key] : submitted[key]
    ) as never;
  }
  return preserved;
}

function filterEnterpriseItems<T>(
  submittedItems: T[],
  enterpriseItems: T[],
  keyReader: (item: T) => string[],
): T[] {
  const enterpriseKeys = new Set(enterpriseItems.flatMap(keyReader));
  return submittedItems.filter((item) => {
    const maybePolicyItem = item as { source?: unknown; locked?: unknown };
    if (
      maybePolicyItem.source === "enterprise" ||
      maybePolicyItem.locked === true
    )
      return false;
    return keyReader(item).every((key) => !enterpriseKeys.has(key));
  });
}

// ── Domain extraction helpers ──────────────────────────────────

function extractAppSettings(settings: AgentSettings): AppSettings {
  const {
    maxTurns,
    workMode,
    securityMode,
    securityRules,
    permissionMode,
    permissionApprovalTimeoutMs,
    desktopNotificationsEnabled,
    friendlyTone,
    customInstructions,
    preventSleep,
    outputStyle,
    memoryMode,
    contextManagement,
    autoMemoryEnabled,
    autoMemoryDirectory,
    autoDreamEnabled,
    thinkingEnabled,
    maxThinkingTokens,
    sandboxEnabled,
    sandboxMode,
  } = settings;
  return {
    maxTurns,
    workMode,
    securityMode,
    securityRules,
    permissionMode,
    permissionApprovalTimeoutMs,
    desktopNotificationsEnabled,
    friendlyTone,
    customInstructions,
    preventSleep,
    outputStyle,
    memoryMode,
    contextManagement,
    autoMemoryEnabled,
    autoMemoryDirectory,
    autoDreamEnabled,
    thinkingEnabled,
    maxThinkingTokens,
    sandboxEnabled,
    sandboxMode,
  };
}

function extractIntegrationSettings(
  settings: AgentSettings,
): IntegrationSettings {
  return {
    activeToolProfileId: settings.activeToolProfileId,
    toolProfiles: settings.toolProfiles,
    toolPermissionPolicy: settings.toolPermissionPolicy,
    mcpServers: settings.mcpServers,
    skillMarketplaceEndpoint: settings.skillMarketplaceEndpoint,
    mcpMarketplaceEndpoint: settings.mcpMarketplaceEndpoint,
    imBotBindings: settings.imBotBindings,
    skillDirectories: settings.skillDirectories,
    disabledSkills: settings.disabledSkills,
  };
}

// ── Enterprise merge helpers ───────────────────────────────────

function normalizeEnterpriseProviders(
  providers: ModelProviderConfig[],
): ModelProviderConfig[] {
  return normalizeAgentSettings({ providers }).providers;
}

function mergeArrays<T>(local: T[], enterprise: T[], keys: string[]): T[] {
  const enterpriseKeys = new Set(
    enterprise.flatMap((item) =>
      keys.map((k) => String((item as Record<string, unknown>)[k])),
    ),
  );
  return [
    ...enterprise,
    ...local.filter((item) => {
      const record = item as Record<string, unknown>;
      return keys.every((k) => !enterpriseKeys.has(String(record[k])));
    }),
  ];
}

function markEnterpriseProvider(
  provider: ModelProviderConfig,
): ModelProviderConfig {
  return { ...provider, source: "enterprise", locked: true };
}

function markEnterpriseMcpServer(server: McpServerConfig): McpServerConfig {
  return { ...server, source: "enterprise", locked: true };
}

function markEnterpriseToolProfile(profile: ToolProfile): ToolProfile {
  return { ...profile, source: "enterprise", locked: true };
}

// ── Legacy encrypt / decrypt (for backward-compat reads) ───────

function decryptLegacyAgentSettings(
  settings: LegacyAgentSettings | undefined,
): LegacyAgentSettings | undefined {
  if (!settings) return undefined;
  return {
    ...settings,
    providers: settings.providers?.map((provider) => ({
      ...provider,
      apiKey: decryptSecret(provider.apiKey),
    })),
    imBotBindings: decryptImBotBindingsConfig(settings.imBotBindings),
  };
}

function encryptLegacyAgentSettings(settings: AgentSettings): AgentSettings {
  const {
    enterprisePolicy: _ep,
    enterpriseControlledSettings: _ec,
    ...rest
  } = settings;
  return {
    ...rest,
    providers: rest.providers.map(
      (p) =>
        stripUndefined({
          ...stripPolicyMetadata(p),
          apiKey: encryptSecret(p.apiKey),
        }) as ModelProviderConfig,
    ),
    mcpServers: rest.mcpServers.map(stripPolicyMetadata),
    imBotBindings: encryptImBotBindingsConfig(rest.imBotBindings),
    toolProfiles: rest.toolProfiles.map(stripPolicyMetadata),
  };
}

// ── Normalization: composite (for legacy + enterprise merge) ───

export function normalizeAgentSettings(
  settings: LegacyAgentSettings | undefined,
): AgentSettings {
  const defaults = defaultAgentSettings();
  if (!settings) return defaults;
  const legacyRuntimeConfigDir = (
    settings as Partial<AgentSettings> & Record<string, unknown>
  )["clau" + "deConfigDir"];

  const providers = normalizeProviders(settings, defaults.providers);
  const defaultModel = normalizeDefaultModel(
    settings,
    providers,
    defaults.defaultModel,
  );
  const integration = normalizeIntegrationSettings({
    activeToolProfileId: settings.activeToolProfileId,
    toolProfiles: settings.toolProfiles,
    toolPermissionPolicy: settings.toolPermissionPolicy,
    mcpServers: settings.mcpServers,
    skillMarketplaceEndpoint: settings.skillMarketplaceEndpoint,
    mcpMarketplaceEndpoint: settings.mcpMarketplaceEndpoint,
    imBotBindings: settings.imBotBindings,
    skillDirectories: settings.skillDirectories,
    disabledSkills: settings.disabledSkills,
  });
  const securityMode = normalizeSecurityMode(settings.securityMode);
  const normalizedSandboxMode = normalizeSandboxMode(
    settings.sandboxMode,
    settings.sandboxEnabled,
    defaults.sandboxMode,
  );
  const fullAccess = securityMode === "full-access";

  return {
    ...defaults,
    ...settings,
    runtimeConfigDir:
      settings.runtimeConfigDir ??
      (typeof legacyRuntimeConfigDir === "string"
        ? legacyRuntimeConfigDir
        : undefined),
    ...integration,
    providers,
    defaultModel,
    workMode: normalizeWorkMode(settings.workMode, settings.permissionMode),
    securityMode,
    securityRules: normalizeSecurityRules(settings.securityRules),
    permissionMode: fullAccess ? "bypassPermissions" : "default",
    permissionApprovalTimeoutMs: normalizePermissionApprovalTimeoutMs(
      settings.permissionApprovalTimeoutMs,
    ),
    memoryMode: normalizeMemoryMode(settings.memoryMode),
    contextManagement: normalizeContextManagementSettings(
      settings.contextManagement,
    ),
    sandboxEnabled: fullAccess ? false : true,
    sandboxMode: fullAccess
      ? "danger-full-access"
      : normalizedSandboxMode === "danger-full-access"
        ? "workspace-write"
        : normalizedSandboxMode,
  };
}

/** Normalize only app-behavior fields (for new-format reads). */
function normalizeAppSettings(
  raw: Partial<AppSettings> | undefined,
): AppSettings {
  const defaults = defaultAppSettings();
  if (!raw) return defaults;
  const securityMode = normalizeSecurityMode(raw.securityMode);
  const fullAccess = securityMode === "full-access";
  const normalizedSandboxMode = normalizeSandboxMode(
    raw.sandboxMode,
    raw.sandboxEnabled,
    defaults.sandboxMode,
  );
  return {
    ...defaults,
    ...raw,
    workMode: normalizeWorkMode(raw.workMode, raw.permissionMode),
    securityMode,
    securityRules: normalizeSecurityRules(raw.securityRules),
    permissionMode: fullAccess ? "bypassPermissions" : "default",
    permissionApprovalTimeoutMs: normalizePermissionApprovalTimeoutMs(
      raw.permissionApprovalTimeoutMs,
    ),
    memoryMode: normalizeMemoryMode(raw.memoryMode),
    contextManagement: normalizeContextManagementSettings(
      raw.contextManagement,
    ),
    sandboxEnabled: fullAccess ? false : true,
    sandboxMode: fullAccess
      ? "danger-full-access"
      : normalizedSandboxMode === "danger-full-access"
        ? "workspace-write"
        : normalizedSandboxMode,
  };
}

// ── App behavior normalizers ──────────────────────────────────

function normalizeWorkMode(
  mode: unknown,
  legacyPermissionMode: unknown,
): AgentSettings["workMode"] {
  return mode === "plan" || legacyPermissionMode === "plan"
    ? "plan"
    : "execute";
}

function normalizeSecurityMode(mode: unknown): AgentSettings["securityMode"] {
  if (mode === "request" || mode === "auto-review" || mode === "full-access") {
    return mode;
  }
  return "request";
}

function normalizeSecurityRules(
  rules: Partial<AgentSettings["securityRules"]> | undefined,
): AgentSettings["securityRules"] {
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        )
      : [];
  return {
    autoAllowPaths: strings(rules?.autoAllowPaths),
    protectedPaths: strings(rules?.protectedPaths),
    commandAllowlist: strings(rules?.commandAllowlist),
    commandAsklist: strings(rules?.commandAsklist),
    networkAccess:
      rules?.networkAccess === "allow" || rules?.networkAccess === "deny"
        ? rules.networkAccess
        : "ask",
    allowedDomains: strings(rules?.allowedDomains),
    deniedDomains: strings(rules?.deniedDomains),
  };
}

function normalizeSandboxMode(
  mode: unknown,
  legacySandboxEnabled: unknown,
  fallback: AgentSettings["sandboxMode"],
): AgentSettings["sandboxMode"] {
  if (
    mode === "read-only" ||
    mode === "workspace-write" ||
    mode === "workspace-write-network" ||
    mode === "danger-full-access"
  ) {
    return mode;
  }
  if (legacySandboxEnabled === false) return "danger-full-access";
  if (legacySandboxEnabled === true) return "workspace-write";
  return fallback ?? "workspace-write";
}

function normalizePermissionMode(
  mode: unknown,
): AgentSettings["permissionMode"] {
  return mode === "acceptEdits" || mode === "bypassPermissions"
    ? mode
    : "default";
}

function normalizeMemoryMode(mode: unknown): AgentSettings["memoryMode"] {
  return mode === "session" || mode === "off" ? mode : "workspace";
}

function normalizeContextManagementSettings(
  value: unknown,
): ContextManagementSettings {
  const defaults = defaultAppSettings()
    .contextManagement as ContextManagementSettings;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return defaults;
  const record = value as Record<string, unknown>;
  return {
    warningThresholdPercent: normalizePercent(
      record.warningThresholdPercent,
      defaults.warningThresholdPercent,
    ),
    compactThresholdPercent: normalizePercent(
      record.compactThresholdPercent,
      defaults.compactThresholdPercent,
    ),
    restartThresholdPercent: normalizePercent(
      record.restartThresholdPercent,
      defaults.restartThresholdPercent,
    ),
    autoCompactEnabled: record.autoCompactEnabled === true,
  };
}

function normalizePercent(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, 1), 99);
}

function normalizePermissionApprovalTimeoutMs(value: unknown): number {
  const timeout = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(timeout)) return 120_000;
  return Math.min(Math.max(Math.trunc(timeout), 10_000), 3_600_000);
}

// ── Provider normalization (for legacy + enterprise) ──────────

function normalizeProviders(
  settings: LegacyAgentSettings,
  defaults: ModelProviderConfig[],
): ModelProviderConfig[] {
  if (settings.providers?.length) {
    return settings.providers.map(normalizeProvider);
  }
  return defaults;
}

function normalizeProvider(provider: ModelProviderConfig): ModelProviderConfig {
  const common = {
    id: provider.id,
    name: provider.name,
    enabled: provider.enabled !== false,
    source: provider.source,
    locked: provider.locked,
    apiKey: provider.apiKey,
    apiKeyEnv: provider.apiKeyEnv,
    purpose: provider.purpose,
    models: provider.models?.length
      ? provider.models.map(normalizeModelOption)
      : [],
  };
  if (provider.kind === "builtin" && compactString(provider.presetId)) {
    return { ...common, kind: "builtin", presetId: provider.presetId };
  }
  return {
    ...common,
    kind: "custom",
    endpoints:
      provider.kind === "custom" && Array.isArray(provider.endpoints)
        ? provider.endpoints
            .map((endpoint, index) => ({
              id: compactString(endpoint.id) ?? `endpoint-${index + 1}`,
              name: compactString(endpoint.name),
              protocol: normalizeEndpointProtocol(endpoint.protocol),
              baseUrl: compactString(endpoint.baseUrl) ?? "",
              enabled: endpoint.enabled !== false,
              priority:
                Number.isFinite(endpoint.priority) && endpoint.priority >= 0
                  ? Math.trunc(endpoint.priority)
                  : (index + 1) * 10,
            }))
            .filter((endpoint) => endpoint.baseUrl)
        : [],
  };
}

function normalizeDefaultModel(
  settings: LegacyAgentSettings,
  providers: ModelProviderConfig[],
  fallback: ModelSelection,
): ModelSelection {
  if (!providers.length) return settings.defaultModel ?? fallback;
  const requested = settings.defaultModel;
  const provider =
    providers.find(
      (item) => item.id === requested?.providerId && item.enabled,
    ) ??
    providers.find((item) => item.enabled) ??
    providers[0];
  const model =
    provider.models.find(
      (item) => item.id === requested?.modelId && item.enabled,
    ) ??
    provider.models.find((item) => item.enabled) ??
    provider.models[0];
  return {
    providerId: provider.id,
    modelId: model?.id ?? fallback.modelId,
  };
}

function normalizeEndpointProtocol(
  protocol: unknown,
): "openai-chat" | "openai-responses" | "anthropic" {
  return protocol === "openai-responses" || protocol === "anthropic"
    ? protocol
    : "openai-chat";
}

// ── IM bot bindings (for legacy compat) ────────────────────────

function normalizeImBotBindingsConfig(
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

function decryptImBotBindingsConfig(
  channels: Partial<ImBotBindingsConfig> | undefined,
): ImBotBindingsConfig {
  const normalized = normalizeImBotBindingsConfig(channels);
  return {
    ...normalized,
    bots: normalized.bots.map((bot) =>
      bot.manualSecret
        ? { ...bot, manualSecret: decryptSecret(bot.manualSecret) }
        : bot,
    ),
  };
}

function encryptImBotBindingsConfig(
  channels: Partial<ImBotBindingsConfig> | undefined,
): ImBotBindingsConfig {
  const normalized = normalizeImBotBindingsConfig(channels);
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

// ── Small utilities ────────────────────────────────────────────

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function stripPolicyMetadata<T extends { source?: unknown; locked?: unknown }>(
  value: T,
): Omit<T, "source" | "locked"> {
  const { source: _source, locked: _locked, ...rest } = value;
  return rest;
}

function stripUndefined<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
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

// ── Legacy raw reader (for encrypted-key preservation) ─────────

export function readRawAgentSettings(): Partial<AgentSettings> | undefined {
  try {
    const raw = readFileSync(getSettingsPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppStoreShape>;
    return parsed.agentSettings;
  } catch {
    return undefined;
  }
}

export function preserveExistingEncryptedProviderSecrets(
  settings: AgentSettings,
  rawSettings: Partial<AgentSettings> | undefined,
): AgentSettings {
  if (!rawSettings?.providers?.length) return settings;
  return {
    ...settings,
    providers: settings.providers.map((provider) => {
      const rawProvider = rawSettings.providers?.find(
        (item) => item.id === provider.id || item.name === provider.name,
      );
      const encryptedApiKey = rawProvider?.apiKey;
      if (!isEncryptedSecret(encryptedApiKey)) return provider;
      if (provider.apiKey !== undefined && provider.apiKey.trim() !== "")
        return provider;
      return { ...provider, apiKey: encryptedApiKey };
    }),
  };
}

export type { EnterpriseConfig, AppStoreShape };
