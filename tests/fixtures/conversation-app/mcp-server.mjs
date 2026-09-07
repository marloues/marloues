import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
const html = `<!doctype html><html><head><meta charset="UTF-8"><style>body{font:var(--font-text-md-size,14px) var(--font-sans,system-ui);padding:16px;background:var(--color-background-primary,#f4f7fb);color:var(--color-text-primary,#243044)}input,button{font:inherit;padding:8px 12px;background:var(--color-background-secondary,transparent);color:inherit;border:1px solid var(--color-border-primary,currentColor);border-radius:var(--border-radius-md,8px)}button:focus-visible,input:focus-visible{outline:2px solid var(--color-ring-primary,currentColor)}#value{padding:12px 0}</style></head><body><h3>MCP 交互验收</h3><input aria-label="卡片草稿" placeholder="离屏后保留草稿"><p id="value">正在连接宿主</p><button id="refresh">刷新工具结果</button><script>
function applyTheme(context){window.__hostContext={...window.__hostContext,...context};if(context.theme){document.documentElement.style.colorScheme=context.theme;document.documentElement.dataset.theme=context.theme}for(const [key,value] of Object.entries(context.styles?.variables||{}))if(typeof value==='string')document.documentElement.style.setProperty(key,value)}
let next=1;const pending=new Map();function request(method,params){const id=next++;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});parent.postMessage({jsonrpc:'2.0',id,method,params},'*')})}
addEventListener('message',event=>{if(event.source!==parent)return;const data=event.data;if(data.id&&pending.has(data.id)){const item=pending.get(data.id);pending.delete(data.id);data.error?item.reject(new Error(data.error.message)):item.resolve(data.result)}if(data.method==='ui/notifications/host-context-changed')applyTheme(data.params);if(data.method==='ui/notifications/tool-result')document.querySelector('#value').textContent='工具结果已送达'});
request('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'Conversation verification',version:'1.0'},appCapabilities:{}}).then(result=>{applyTheme(result.hostContext);parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*')});
document.querySelector('#refresh').onclick=()=>{document.querySelector('#value').textContent='正在请求刷新'; return request('tools/call',{name:'refresh',arguments:{}}).then(result=>{document.querySelector('#value').textContent=result.content[0].text}).catch(error=>{document.querySelector('#value').textContent=error.message});};
</script></body></html>`;
const pendingForms = new Map();
const tools = [
  {
    name: "form",
    description: "Request a typed user form",
    inputSchema: {
      type: "object",
      properties: { action: { type: "string" } },
      required: ["action"],
    },
  },
  {
    name: "cards",
    description:
      "Return conversation verification content and an interactive card",
    inputSchema: { type: "object", properties: {} },
    _meta: { ui: { resourceUri: "ui://conversation/cards.html" } },
  },
  {
    name: "refresh",
    description: "Refresh the verification card",
    inputSchema: { type: "object", properties: {} },
    _meta: { ui: { visibility: ["app"] } },
  },
];
for await (const line of createInterface({ input: process.stdin })) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    continue;
  }
  if (message.id == null) continue;
  const retryMarker = process.env.MARLOUES_MCP_RETRY_MARKER;
  if (
    message.method === "resources/read" &&
    retryMarker &&
    !existsSync(retryMarker)
  ) {
    writeFileSync(retryMarker, "resource failed once");
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: "QA_RESOURCE_RETRY_ONCE" },
      }) + "\n",
    );
    continue;
  }

  if (pendingForms.has(message.id)) {
    const toolRequestId = pendingForms.get(message.id);
    pendingForms.delete(message.id);
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: toolRequestId,
        result: {
          content: [{ type: "text", text: JSON.stringify(message.result) }],
        },
      }) + "\n",
    );
    continue;
  }
  if (message.method === "tools/call" && message.params.name === "form") {
    const requestId = "form-" + message.id;
    pendingForms.set(requestId, message.id);
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "elicitation/create",
        params: {
          mode: "form",
          message: "真实字段表单 " + message.params.arguments.action,
          requestedSchema: {
            type: "object",
            properties: {
              text: { type: "string", title: "文字", minLength: 2 },
              integer: {
                type: "integer",
                title: "整数",
                minimum: 1,
                maximum: 5,
              },
              decimal: { type: "number", title: "小数" },
              flag: { type: "boolean", title: "确认选项" },
              one: { type: "string", title: "单选", enum: ["甲", "乙"] },
            },
            required: ["text", "integer"],
          },
        },
      }) + "\n",
    );
    continue;
  }
  if (message.method === "tools/call" && process.env.MARLOUES_MCP_PROBE_TRACE)
    appendFileSync(
      process.env.MARLOUES_MCP_PROBE_TRACE,
      JSON.stringify(message) + "\n",
    );
  let result;
  if (message.method === "initialize")
    result = {
      protocolVersion: message.params.protocolVersion,
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "Conversation verification", version: "1.0" },
    };
  else if (message.method === "tools/list") result = { tools };
  else if (message.method === "resources/list")
    result = {
      resources: [
        {
          uri: "ui://conversation/cards.html",
          name: "Conversation verification",
          mimeType: "text/html;profile=mcp-app",
        },
      ],
    };
  else if (message.method === "resources/read")
    result = {
      contents: [
        {
          uri: "ui://conversation/cards.html",
          mimeType: "text/html;profile=mcp-app",
          text: html,
        },
      ],
    };
  else if (message.method === "tools/call")
    result =
      message.params.name === "refresh"
        ? { content: [{ type: "text", text: "真实 MCP 工具刷新成功" }] }
        : {
            content: [
              { type: "text", text: '{"verified":true}' },
              {
                type: "resource_link",
                uri: "ui://conversation/cards.html",
                name: "交互验收资源",
                description: "由配置的 MCP 服务返回",
                mimeType: "text/html;profile=mcp-app",
              },
            ],
            structuredContent: { verified: true },
            _meta: { resourceUri: "ui://conversation/cards.html" },
          };
  else if (message.method === "ping") result = {};
  else {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "Unsupported method" },
      }) + "\n",
    );
    continue;
  }
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n",
  );
}
