import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { getAgentSettings } from "./config-service";
import { workflowThreadStore } from "../core/runtime/workflow-thread-store";
import { SecurityHost } from "../core/security/security-host";
import type {
  ConversationAppOwner,
  ConversationAppCall,
  ConversationAppResource,
  ConversationAppCallResult,
} from "@shared/conversation-app";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const connections = new Map<string, Promise<Client>>();
const pages = new Map<string, { html: string; csp: string }>();
const resources = new Map<
  string,
  ConversationAppResource & { configuration: string }
>();
const approvals = new Map<
  string,
  { owner: string; name: string; args: string; expires: number }
>();
const security = new SecurityHost({
  runtimeId: "sdk",
  sandboxOwnership: {
    kind: "disabled",
    reason: "Configured external MCP server owns tool execution",
  },
});
let origin: Promise<string> | undefined;
function ownerKey(owner: ConversationAppOwner) {
  return JSON.stringify([owner.sessionId, owner.turnId, owner.itemId]);
}
function source(owner: ConversationAppOwner) {
  const snapshot = workflowThreadStore.readThread({
    threadId: owner.sessionId,
    limit: 100000,
  });
  const item = snapshot.turns
    .find((turn) => turn.id === owner.turnId)
    ?.items.find((item) => item.id === owner.itemId);
  if (!item || item.type !== "mcpToolCall")
    throw new Error("找不到原始工具调用");
  const parsed = item.tool.match(/^mcp__(.+?)__(.+)$/);
  const name = item.server || parsed?.[1];
  const settings = getAgentSettings();
  const server = settings.mcpServers.find(
    (server) => server.enabled && (server.name === name || server.id === name),
  );
  return {
    item,
    server,
    settings,
    cwd: snapshot.thread.cwd ?? undefined,
    tool: parsed?.[2] ?? item.tool,
  };
}
async function connection(owner: ConversationAppOwner) {
  const context = source(owner);
  if (!context.server) return null;
  const config = record(context.server.config);
  const key = JSON.stringify([context.server.id, config]);
  let promise = connections.get(key);
  if (!promise) {
    promise = (async () => {
      const client = new Client(
        { name: "Marloues conversation", version: "0.4.0" },
        {
          capabilities: {
            extensions: {
              "io.modelcontextprotocol/ui": {
                mimeTypes: ["text/html;profile=mcp-app"],
              },
            },
          },
        },
      );
      const headers = record(config.headers) as Record<string, string>;
      const transport =
        typeof config.command === "string"
          ? new StdioClientTransport({
              command: config.command,
              args: Array.isArray(config.args) ? config.args.map(String) : [],
              env: {
                ...Object.fromEntries(
                  Object.entries(process.env).filter(
                    (entry): entry is [string, string] =>
                      typeof entry[1] === "string",
                  ),
                ),
                ...(record(config.env) as Record<string, string>),
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
      try {
        await client.connect(transport, { timeout: 15000 });
        return client;
      } catch (error) {
        connections.delete(key);
        await client.close().catch(() => {});
        throw error;
      }
    })();
    connections.set(key, promise);
  }
  return { ...context, client: await promise };
}
function resourceOrigin() {
  return (origin ??= new Promise<string>((resolve, reject) => {
    const server = createServer((request, response) => {
      const page = pages.get(request.url ?? "");
      if (request.method !== "GET" || !page) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": page.csp,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(page.html);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("无法启动交互资源"));
      server.unref();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  }));
}
function domains(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((entry) => {
      try {
        const url = new URL(String(entry));
        return /^https?:$/.test(url.protocol) ? [url.origin] : [];
      } catch {
        return [];
      }
    })
    .join(" ");
}
export async function loadConversationApp(
  owner: ConversationAppOwner,
): Promise<ConversationAppResource | null> {
  const key = ownerKey(owner);
  // Revalidate source and enabled configuration before restoring a cached resource.
  const context = source(owner);
  if (!context.server) return null;
  const cached = resources.get(key);
  const configuration = JSON.stringify(context.server);
  if (cached?.configuration === configuration)
    return {
      ...cached,
      arguments: context.item.arguments,
      result: context.item.result ?? cached.result,
    };
  const connected = await connection(owner);
  if (!connected) return null;
  const { tools } = await connected.client.listTools();
  const tool = tools.find((tool) => tool.name === connected.tool);
  const ui = record(record(tool?._meta).ui);
  const uri =
    typeof ui.resourceUri === "string"
      ? ui.resourceUri
      : typeof record(context.item.result?._meta).resourceUri === "string"
        ? String(record(context.item.result?._meta).resourceUri)
        : null;
  if (!uri || !uri.startsWith("ui://")) return null;
  const resource = await connected.client.readResource({ uri });
  const document = resource.contents.find(
    (content) =>
      content.uri === uri &&
      "text" in content &&
      content.mimeType?.startsWith("text/html"),
  );
  if (!document || !("text" in document) || typeof document.text !== "string")
    throw new Error("交互资源没有可显示的 HTML");
  const csp = record(record(record(document._meta).ui).csp);
  const assetDomains = domains(csp.resourceDomains);
  const connectDomains = domains(csp.connectDomains);
  const route = `/${randomUUID()}`;
  pages.set(route, {
    html: document.text,
    csp: `sandbox allow-scripts allow-forms; default-src 'none'; script-src 'unsafe-inline' ${assetDomains}; style-src 'unsafe-inline' ${assetDomains}; img-src data: blob: ${assetDomains}; media-src data: blob: ${assetDomains}; font-src data: ${assetDomains}; connect-src ${connectDomains || "'none'"}; base-uri 'none'; form-action 'none'; frame-src 'none'`,
  });
  const value = {
    url: `${await resourceOrigin()}${route}`,
    uri,
    title: tool?.title ?? tool?.name ?? "交互结果",
    arguments: context.item.arguments,
    result: context.item.result,
  };
  resources.set(key, { ...value, configuration });
  return value;
}
export async function callConversationAppTool(
  input: ConversationAppCall,
): Promise<ConversationAppCallResult> {
  const connected = await connection(input);
  if (!connected) throw new Error("原工具服务已禁用");
  const { tools } = await connected.client.listTools();
  const tool = tools.find((tool) => tool.name === input.name);
  const visibility = record(record(tool?._meta).ui).visibility;
  if (!tool || (Array.isArray(visibility) && !visibility.includes("app")))
    throw new Error("此工具未向交互组件开放");
  const args = input.arguments ?? {};
  const decision = security.evaluate({
    threadId: input.sessionId,
    turnId: input.turnId,
    toolName: `mcp__${connected.server?.name}__${input.name}`,
    input: args,
    workspaceRoot: connected.cwd,
    settings: connected.settings,
  });
  if (decision.action === "deny") throw new Error(decision.reason);
  if (decision.action === "ask") {
    const approval = input.approvalId
      ? approvals.get(input.approvalId)
      : undefined;
    if (input.approvalId) approvals.delete(input.approvalId);
    if (
      !approval ||
      approval.owner !== ownerKey(input) ||
      approval.name !== input.name ||
      approval.args !== JSON.stringify(args) ||
      approval.expires < Date.now()
    ) {
      const approvalId = randomUUID();
      approvals.set(approvalId, {
        owner: ownerKey(input),
        name: input.name,
        args: JSON.stringify(args),
        expires: Date.now() + 120000,
      });
      return {
        kind: "approval",
        approvalId,
        name: input.name,
        arguments: args,
        reason: decision.reason,
      };
    }
  }
  return {
    kind: "result",
    result: await connected.client.callTool({
      name: input.name,
      arguments: args,
    }),
  };
}
