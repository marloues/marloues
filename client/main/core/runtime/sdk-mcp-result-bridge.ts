import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ElicitRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { AgentSettings } from "@shared/types";
import { normalizeSdkMcpServerConfig } from "../config/options-builder";
import {
  workflowToolResult,
  type WorkflowToolResult,
} from "@shared/workflow-tool-result";

/** Capture the real MCP result before Claude converts resources to model text.
 * The SDK supplies the original tool-use id in request metadata; never correlate by text/order.
 * Permission decisions still run through the SDK's normal canUseTool callback.
 */
export function createSdkMcpResultBridges(
  settings: AgentSettings,
  cwd: string,
  capture: (id: string, result: WorkflowToolResult) => void,
  elicit: (
    serverName: string,
    request: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<{
    action: "accept" | "decline" | "cancel";
    content?: Record<string, unknown>;
  }>,
) {
  const servers: Record<string, unknown> = {};
  const clients: Client[] = [];
  for (const server of settings.mcpServers ?? []) {
    if (!server.enabled || !server.config || typeof server.config !== "object")
      continue;
    const name = server.name?.trim() || server.id;
    const config = normalizeSdkMcpServerConfig(server.config) as Record<
      string,
      unknown
    >;
    // Keep SDK-managed OAuth connections native; this bridge only owns transports
    // whose credentials are already explicit in Marloues configuration.
    let localHttp = false;
    try {
      const host = new URL(String(config.url)).hostname;
      localHttp = ["127.0.0.1", "localhost", "[::1]"].includes(host);
    } catch {
      /* stdio */
    }
    if (
      typeof config.command !== "string" &&
      !localHttp &&
      (!config.headers || !Object.keys(config.headers as object).length)
    )
      continue;
    const bridge = createSdkMcpServer({ name, version: "1.0.0", tools: [] });
    bridge.instance.server.registerCapabilities({
      tools: {},
      resources: {},
      prompts: {},
    });
    let connected: Promise<Client> | undefined;
    const client = () =>
      (connected ??= (async () => {
        const upstream = new Client(
          { name: "Marloues SDK bridge", version: "0.3.4" },
          {
            capabilities: {
              elicitation: { form: {}, url: {} },
              extensions: {
                "io.modelcontextprotocol/ui": {
                  mimeTypes: ["text/html;profile=mcp-app"],
                },
              },
            },
          },
        );
        clients.push(upstream);
        upstream.setRequestHandler(ElicitRequestSchema, (request, extra) =>
          elicit(
            name,
            request.params as unknown as Record<string, unknown>,
            extra.signal,
          ),
        );
        const headers = config.headers as Record<string, string> | undefined;
        const transport =
          typeof config.command === "string"
            ? new StdioClientTransport({
                command: config.command,
                args: Array.isArray(config.args) ? config.args.map(String) : [],
                cwd,
                env: {
                  ...Object.fromEntries(
                    Object.entries(process.env).filter(
                      (entry): entry is [string, string] =>
                        typeof entry[1] === "string",
                    ),
                  ),
                  ...(config.env as Record<string, string> | undefined),
                },
                stderr: "ignore",
              })
            : config.type === "sse"
              ? new SSEClientTransport(new URL(String(config.url)), {
                  requestInit: { headers },
                })
              : new StreamableHTTPClientTransport(new URL(String(config.url)), {
                  requestInit: { headers },
                });
        await upstream.connect(transport, { timeout: 15000 });
        return upstream;
      })());
    bridge.instance.server.setRequestHandler(
      ListToolsRequestSchema,
      async (request) => (await client()).listTools(request.params),
    );
    bridge.instance.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, extra) => {
        const result = await (
          await client()
        ).callTool(request.params, undefined, { signal: extra.signal });
        const original = workflowToolResult(result);
        const id = extra._meta?.["claudecode/toolUseId"];
        if (original && typeof id === "string") capture(id, original);
        return result;
      },
    );
    bridge.instance.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (request) => {
        const upstream = await client();
        return upstream.getServerCapabilities()?.resources
          ? upstream.listResources(request.params)
          : { resources: [] };
      },
    );
    bridge.instance.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => (await client()).readResource(request.params),
    );
    bridge.instance.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (request) => {
        const upstream = await client();
        return upstream.getServerCapabilities()?.resources
          ? upstream.listResourceTemplates(request.params)
          : { resourceTemplates: [] };
      },
    );
    bridge.instance.server.setRequestHandler(
      ListPromptsRequestSchema,
      async (request) => {
        const upstream = await client();
        return upstream.getServerCapabilities()?.prompts
          ? upstream.listPrompts(request.params)
          : { prompts: [] };
      },
    );
    bridge.instance.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request) => (await client()).getPrompt(request.params),
    );
    servers[name] = bridge;
  }
  return {
    servers,
    close: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
  };
}
