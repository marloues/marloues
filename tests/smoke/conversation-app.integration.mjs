/** Runs the production Electron app through its normal composer, IPC, SDK and persistent store.
 * A local Anthropic protocol server makes rare UI states deterministic; it is not a live-model evaluation.
 * Keeps an isolated app home and evidence. Never deletes user data.
 */
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
const root = resolve(import.meta.dirname, "../..");
const live = process.argv.includes("--live");
// Preserve encrypted credentials verbatim; only the normal Electron config
// service may decrypt them. Never print credentials or borrow another app's key.
const savedSettings = live
  ? JSON.parse(
      readFileSync(
        process.env.MARLOUES_LIVE_CONFIG ??
          join(homedir(), ".marloues-dev/config/settings.json"),
        "utf8",
      ),
    ).agentSettings
  : undefined;
const savedProvider = savedSettings?.providers?.find(
  (provider) => provider.id === savedSettings.defaultModel?.providerId,
);
const configuredModel = live
  ? savedSettings?.defaultModel?.modelId
  : "claude-sonnet-4-6";
const configuredKey = "local-protocol-test";
if (live && (!savedProvider || !configuredModel))
  throw new Error("Marloues default model is not configured");
const require = createRequire(join(root, "client/package.json"));
const { _electron: electron, expect } = require("@playwright/test");
const { output } = JSON.parse(
  readFileSync(
    join(root, "client/test-results/conversation-details/build.json"),
    "utf8",
  ),
);
function ensureDependencyLink(source, destination) {
  try {
    symlinkSync(source, destination);
  } catch (error) {
    if (
      error.code !== "EEXIST" ||
      realpathSync(source) !== realpathSync(destination)
    )
      throw error;
  }
}
ensureDependencyLink(
  join(root, "client/node_modules"),
  join(output, "node_modules"),
);
ensureDependencyLink(
  join(root, "node_modules"),
  join(output, "main/node_modules"),
);
const home = mkdtempSync(join(tmpdir(), "marloues-conversation-app-"));
const launchEntry = live
  ? join(output, "conversation-live-launcher.cjs")
  : join(output, "main/index.js");
if (live) {
  // Playwright's Electron loader forces a mock OS keychain. Restore the normal
  // credential backend before app readiness, without exporting or rewriting keys.
  writeFileSync(
    launchEntry,
    [
      "const { app } = require('electron');",
      "app.commandLine.removeSwitch('use-mock-keychain');",
      "app.commandLine.removeSwitch('password-store');",
      "require('./main/index.js');",
    ].join("\n"),
  );
}
const workspace = join(home, "workspace");
const config = join(home, "config");
const artifacts = join(
  root,
  live
    ? "client/test-results/conversation-app-live"
    : "client/test-results/conversation-app",
);
for (const path of [workspace, config, artifacts])
  mkdirSync(path, { recursive: true });
writeFileSync(
  join(workspace, "evidence.txt"),
  "来自真实文件读取的验收内容。\n",
);
const calls = [];
const server = createServer(async (req, res) => {
  let data = "";
  for await (const chunk of req) data += chunk;
  if (!req.url?.includes("/messages")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
    return;
  }
  const body = JSON.parse(data || "{}");
  const messages = body.messages ?? [];
  const tools = body.tools ?? [];
  const whole = JSON.stringify(messages);
  const results = messages.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.filter((block) => block.type === "tool_result")
      : [],
  );
  calls.push({
    url: req.url,
    tools: tools.map((tool) => tool.name),
    resultCount: results.length,
  });
  let content;
  const lastUser = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        (typeof message.content === "string" ||
          message.content?.some?.((part) => part.type === "text")),
    );
  const latest = JSON.stringify(lastUser?.content ?? "");
  if (latest.includes("表单验收")) {
    const action = latest.includes("decline")
      ? "decline"
      : latest.includes("cancel")
        ? "cancel"
        : "accept";
    const id = "tool-form-" + action;
    content = whole.includes(id)
      ? [{ type: "text", text: "表单链路完成 " + action }]
      : [
          {
            type: "tool_use",
            id,
            name: "mcp__conversation_probe__form",
            input: { action },
          },
        ];
  } else if (
    latest.includes("立即验收") &&
    !whole.includes("tool-question-apply")
  ) {
    content = [
      {
        type: "tool_use",
        id: "tool-question-apply",
        name: "AskUserQuestion",
        input: {
          questions: [
            {
              question: "等待立即引导",
              header: "引导",
              options: [
                { label: "继续", description: "不选择" },
                { label: "返回", description: "不选择" },
              ],
              multiSelect: false,
            },
          ],
        },
      },
    ];
  } else if (
    latest.includes("停止验收") &&
    !whole.includes("tool-question-stop")
  ) {
    content = [
      {
        type: "tool_use",
        id: "tool-question-stop",
        name: "AskUserQuestion",
        input: {
          questions: [
            {
              question: "等待停止操作",
              header: "停止",
              options: [
                { label: "继续", description: "不选择" },
                { label: "返回", description: "不选择" },
              ],
              multiSelect: false,
            },
          ],
        },
      },
    ];
  } else if (
    whole.includes("对话区验收") &&
    !whole.includes("tool-question-1") &&
    tools.some((tool) => tool.name === "AskUserQuestion")
  ) {
    content = [
      {
        type: "tool_use",
        id: "tool-question-1",
        name: "AskUserQuestion",
        input: {
          questions: [
            {
              question: "选择验收方式",
              header: "验收",
              options: [
                { label: "完整桌面流程", description: "运行主进程与真实组件" },
                { label: "只看文字", description: "不选择此项" },
              ],
              multiSelect: false,
            },
          ],
        },
      },
    ];
  } else if (
    whole.includes("对话区验收") &&
    !whole.includes("tool-read-1") &&
    tools.some((tool) => tool.name === "Read")
  ) {
    content = [
      {
        type: "tool_use",
        id: "tool-read-1",
        name: "Read",
        input: { file_path: join(workspace, "evidence.txt") },
      },
    ];
  } else if (
    whole.includes("对话区验收") &&
    !whole.includes("tool-mcp-1") &&
    tools.some((tool) => tool.name.endsWith("__cards"))
  ) {
    content = [
      {
        type: "tool_use",
        id: "tool-mcp-1",
        name: tools.find((tool) => tool.name.endsWith("__cards")).name,
        input: {},
      },
    ];
  } else {
    content = [
      {
        type: "text",
        text: "桌面链路验收完成。公式：$x^2$。\n\n| 项目 | 状态 |\n| --- | --- |\n| 主进程与会话存储 | 已连接 |\n| 输入与工具结果 | 已处理 |\n\n```typescript\nconst verified = true;\n```\n\n```markdown\n这是一段可以复制的写作内容。\n```\n\n[查看验收文件](./evidence.txt:1)\n\n选择这段正文可以添加到输入框。",
      },
    ];
  }
  const response = {
    id: `msg-${calls.length}`,
    type: "message",
    role: "assistant",
    model: body.model,
    content,
    stop_reason: content[0].type === "tool_use" ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 100 },
  };
  if (!body.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(response));
    return;
  }
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
  });
  const send = (type, payload) =>
    res.write(
      `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`,
    );
  send("message_start", {
    message: {
      ...response,
      content: [],
      stop_reason: null,
      usage: { input_tokens: 100, output_tokens: 0 },
    },
  });
  for (const [index, block] of content.entries()) {
    send("content_block_start", {
      index,
      content_block:
        block.type === "text"
          ? { type: "text", text: "" }
          : { ...block, input: {} },
    });
    const value =
      block.type === "text" ? block.text : JSON.stringify(block.input);
    for (let offset = 0; offset < value.length; offset += 28) {
      send("content_block_delta", {
        index,
        delta:
          block.type === "text"
            ? { type: "text_delta", text: value.slice(offset, offset + 28) }
            : {
                type: "input_json_delta",
                partial_json: value.slice(offset, offset + 28),
              },
      });
      await new Promise((done) => setTimeout(done, 25));
    }
    send("content_block_stop", { index });
  }
  send("message_delta", {
    delta: { stop_reason: response.stop_reason, stop_sequence: null },
    usage: { output_tokens: 100 },
  });
  send("message_stop", {});
  res.end();
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
writeFileSync(
  join(config, "settings.json"),
  JSON.stringify(
    {
      agentSettings: {
        providers: [
          live
            ? { ...savedProvider, id: "conversation-test" }
            : {
                id: "conversation-test",
                name: "Conversation protocol test",
                kind: "custom",
                enabled: true,
                endpoints: [
                  {
                    id: "local",
                    protocol: "anthropic",
                    baseUrl,
                    enabled: true,
                    priority: 10,
                  },
                ],
                apiKeyEnv: "MARLOUES_CONVERSATION_TEST_KEY",
                models: [
                  {
                    id: configuredModel,
                    label: "Protocol verification",
                    enabled: true,
                  },
                ],
              },
        ],
        defaultModel: {
          providerId: "conversation-test",
          modelId: configuredModel,
        },
        activeRuntimeId: "sdk",
        maxTurns: 8,
        workMode: "execute",
        securityMode: "request",
        permissionMode: "default",
        sandboxEnabled: true,
        sandboxMode: "workspace-write",
        desktopNotificationsEnabled: false,
        autoMemoryEnabled: false,
        thinkingEnabled: false,
        maxThinkingTokens: 0,
        activeToolProfileId: "conversation-test",
        toolPermissionPolicy: {
          rules: [
            { pattern: "Read", action: "allow" },
            { pattern: "mcp__conversation_probe__cards", action: "allow" },
            { pattern: "mcp__conversation_probe__form", action: "allow" },
          ],
          allowedTools: ["Read"],
          disallowedTools: [],
          sensitiveToolAllowlist: ["Read"],
          requireConfirmationForSensitiveTools: true,
        },
        toolProfiles: [],
        mcpServers: [
          {
            id: "conversation_probe",
            name: "conversation_probe",
            enabled: true,
            config: {
              env: {
                MARLOUES_MCP_PROBE_TRACE: join(artifacts, "mcp-requests.jsonl"),
                MARLOUES_MCP_RETRY_MARKER: join(home, "resource-retry-once"),
              },
              command: process.execPath,
              args: [
                join(root, "tests/fixtures/conversation-app/mcp-server.mjs"),
              ],
            },
          },
        ],
        skillDirectories: [],
        disabledSkills: [],
      },
    },
    null,
    2,
  ),
);
writeFileSync(
  join(config, "workspaces.json"),
  JSON.stringify({
    currentWorkspaceId: "conversation-test",
    workspaces: [
      {
        id: "conversation-test",
        name: "对话区验收",
        path: workspace,
        lastOpenedAt: Date.now(),
      },
    ],
  }),
);
const passed = [],
  errors = [];
const recordPass = passed.push.bind(passed);
passed.push = (...names) => {
  names.forEach((name) => console.log("PASS " + name));
  return recordPass(...names);
};
let failure;
let app;
const launch = () =>
  electron.launch({
    args: [launchEntry],
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: live ? "development" : "test",
      ELECTRON_RENDERER_URL: "",
      MARLOUES_REMOTE_DEBUGGING_PORT: "0",
      NODE_PATH: [
        join(root, "node_modules"),
        join(root, "client/node_modules"),
      ].join(":"),
      MARLOUES_HOME: home,
      MARLOUES_CONVERSATION_TEST_KEY: configuredKey,
    },
    timeout: 30000,
  });
try {
  app = await launch();
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("Content Security Policy")
    )
      errors.push(message.text().slice(0, 200));
  });
  await page.setViewportSize({ width: 1440, height: 980 });
  await expect(
    page.locator(".onboarding-view, .app-shell").first(),
  ).toBeVisible({ timeout: 30000 });
  const dialog = page.getByRole("dialog", { name: "marloues 初次设置" });
  if (await dialog.isVisible()) {
    const skip = dialog.getByRole("button", { name: "稍后配置" });
    if (await skip.isVisible()) await skip.click();
    await dialog.getByRole("button", { name: "开始使用" }).click();
  }
  await expect(page.locator(".app-shell")).toBeVisible();
  passed.push("production Electron main/preload/renderer boot");
  if (live) {
    const keychainSwitches = await app.evaluate(({ app }) => ({
      mockKeychain: app.commandLine.hasSwitch("use-mock-keychain"),
      basicPasswordStore:
        app.commandLine.getSwitchValue("password-store") === "basic",
    }));
    expect(keychainSwitches).toEqual({
      mockKeychain: false,
      basicPasswordStore: false,
    });
    passed.push("live-model test uses the normal OS credential backend");
    await page
      .getByPlaceholder("随心输入")
      .fill(
        "这是 Marloues 对话区集成验收。请只调用一次 Read 工具读取当前工作目录的 evidence.txt，然后用一句中文回复文件全文。不修改文件，不使用其他工具。",
      );
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect
      .poll(
        async () => {
          const sessions = await page.evaluate(() =>
            window.marloues.chat.listSessions(),
          );
          if (!sessions.length) return false;
          const snapshot = await page.evaluate(
            (id) => window.marloues.chat.readThread(id),
            sessions[0].id,
          );
          return (
            snapshot?.turns.length &&
            snapshot.turns.some(
              (turn) =>
                turn.items.some((item) => item.type !== "userMessage") ||
                turn.error,
            ) &&
            snapshot.turns.every((turn) =>
              ["completed", "failed", "cancelled"].includes(turn.status),
            )
          );
        },
        { timeout: 120000 },
      )
      .toBe(true);
    const sessions = await page.evaluate(() =>
      window.marloues.chat.listSessions(),
    );
    const snapshot = await page.evaluate(
      (id) => window.marloues.chat.readThread(id),
      sessions[0].id,
    );
    const items = snapshot.turns.flatMap((turn) => turn.items);
    writeFileSync(
      join(artifacts, "thread.json"),
      JSON.stringify(snapshot, null, 2),
    );
    const failedTurn = snapshot.turns.find((turn) => turn.error);
    if (failedTurn) {
      await expect(
        page.getByText(failedTurn.error.message, { exact: true }).first(),
      ).toBeVisible({ timeout: 10000 });
      throw new Error(`Live model failed: ${failedTurn.error.message}`);
    }
    if (
      !items.some(
        (item) =>
          item.type === "agentMessage" &&
          item.text.includes("来自真实文件读取的验收内容"),
      )
    )
      throw new Error("Live model did not return the actual file content");
    if (!items.some((item) => item.tool === "Read"))
      throw new Error("Live model did not perform the required file read");
    await expect(
      page.locator('[data-kind="assistant-answer"]').last(),
    ).toContainText("来自真实文件读取的验收内容");
    writeFileSync(
      join(artifacts, "thread.json"),
      JSON.stringify(snapshot, null, 2),
    );
    await page.screenshot({
      path: join(artifacts, "desktop.png"),
      fullPage: true,
    });
    passed.push(
      "configured live model → real Read tool → actual file content → final conversation UI",
    );
  } else {
    await page
      .getByPlaceholder("随心输入")
      .fill(
        "对话区验收：先提问选择验收方式，然后读取 evidence.txt，再输出表格、代码和写作块。",
      );
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.locator('[data-kind="question-card"]')).toBeVisible({
      timeout: 60000,
    });
    await page
      .getByRole("button", { name: "完整桌面流程", exact: true })
      .click();
    await page.getByRole("button", { name: "提交回答", exact: true }).click();
    await expect(page.locator('[data-kind="question-card"]')).toContainText(
      "已回答",
    );
    passed.push(
      "SDK question → host broker → real IPC answer → completed record",
    );
    await expect(
      page.locator('[data-kind="assistant-answer"]').last(),
    ).toContainText("桌面链路验收完成", { timeout: 60000 });
    const sessions = await page.evaluate(() =>
      window.marloues.chat.listSessions(),
    );
    const session =
      sessions.find((value) => !value.parentSessionId) ?? sessions[0];
    await expect
      .poll(
        async () => {
          const snapshot = await page.evaluate(
            (id) => window.marloues.chat.readThread(id),
            session.id,
          );
          return snapshot?.turns.map((turn) => turn.status);
        },
        { timeout: 60000 },
      )
      .toEqual(["completed"]);
    const thread = await page.evaluate(
      (id) => window.marloues.chat.readThread(id),
      session.id,
    );
    writeFileSync(
      join(artifacts, "thread.json"),
      JSON.stringify(thread, null, 2),
    );
    if (
      !thread.turns.some((turn) =>
        turn.items.some((item) => item.question?.status === "answered"),
      )
    )
      throw new Error("Question history was lost");
    if (!thread.turns.some((turn) => turn.timing?.workStartedAt != null))
      throw new Error("Host timing missing");
    const mcpResult = thread.turns
      .flatMap((turn) => turn.items)
      .find((item) => item.tool?.includes("conversation_probe__cards"))?.result;
    if (
      !mcpResult?.content?.some((part) => part.type === "resource_link") ||
      !mcpResult.structuredContent ||
      !mcpResult._meta
    )
      throw new Error("SDK flattened the original MCP resource or metadata");
    passed.push("canonical readThread preserves tools, question and timing");
    await expect(page.locator(".workflow-markdown-table")).toBeVisible();
    await expect(page.locator(".katex")).toBeVisible();
    expect(
      await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts]
          .filter((font) => font.status === "error")
          .map((font) => font.family);
      }),
    ).toEqual([]);
    await expect(page.locator('[data-kind="writing-block"]')).toBeVisible();
    await page
      .getByRole("button", { name: "查看验收文件", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "来自真实文件读取的验收内容",
    );
    await page.keyboard.press("Escape");
    passed.push(
      "table, formula fonts, writing block, real file IPC preview and Escape",
    );
    // Expand completed trace using the actual header, then open the MCP call details.
    const header = page
      .locator('[data-kind="assistant-turn"] button[aria-expanded]')
      .first();
    if ((await header.getAttribute("aria-expanded")) === "false")
      await header.click();
    for (const summary of await page
      .locator('[data-activity-kind="summary"][aria-expanded="false"]')
      .all())
      await summary.click();
    const toolRow = page
      .locator('[data-kind="activity-row"]')
      .filter({ hasText: "cards" })
      .first();
    const toolToggle = toolRow.locator("button[aria-expanded]").first();
    if (
      (await toolToggle.count()) &&
      (await toolToggle.getAttribute("aria-expanded")) === "false"
    )
      await toolToggle.click();
    await expect(
      page.locator('[data-kind="mcp-app"] [role="alert"]'),
    ).toContainText("QA_RESOURCE_RETRY_ONCE", { timeout: 30000 });
    await page.screenshot({ path: join(artifacts, "resource-retry.png") });
    await page.getByRole("button", { name: "重试资源", exact: true }).click();
    await expect(page.locator('[data-kind="mcp-app"] iframe')).toBeVisible({
      timeout: 30000,
    });
    passed.push(
      "real MCP resource read failure → visible source error → retry original resource → ready iframe",
    );
    const frame = page.frameLocator('[data-kind="mcp-app"] iframe');
    await expect(frame.locator("#value")).toHaveText("工具结果已送达", {
      timeout: 15000,
    });
    await frame.getByPlaceholder("离屏后保留草稿").fill("保留此草稿");
    const previousTheme = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      style: document.documentElement.getAttribute("style"),
    }));
    for (const theme of ["dark", "light", "warm"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      const hostStyle = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return {
          color: css.getPropertyValue("--text-1").trim(),
          background: css.getPropertyValue("--surface-workspace").trim(),
          font: css.getPropertyValue("--font-ui").trim(),
        };
      });
      await expect
        .poll(() =>
          frame.locator("html").evaluate((element) => ({
            color: element.style.getPropertyValue("--color-text-primary"),
            background: element.style.getPropertyValue(
              "--color-background-primary",
            ),
            font: element.style.getPropertyValue("--font-sans"),
          })),
        )
        .toEqual(hostStyle);
      await expect(frame.getByPlaceholder("离屏后保留草稿")).toHaveValue(
        "保留此草稿",
      );
      await page.locator('[data-kind="mcp-app"]').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(artifacts, "mcp-theme-" + theme + ".png"),
      });
    }
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--accent", "#a749bf"),
    );
    await expect
      .poll(() =>
        frame
          .locator("html")
          .evaluate((element) =>
            element.style.getPropertyValue("--color-ring-primary"),
          ),
      )
      .toBe("#a749bf");
    await page.evaluate(({ theme, style }) => {
      document.documentElement.dataset.theme = theme;
      if (style === null) document.documentElement.removeAttribute("style");
      else document.documentElement.setAttribute("style", style);
    }, previousTheme);
    passed.push(
      "MCP App receives light/dark/warm semantic tokens and live accent updates without resetting its draft",
    );

    await frame.getByRole("button", { name: "刷新工具结果" }).click();
    const approval = page.getByRole("button", { name: "允许本次操作" });
    await expect(approval).toBeVisible({ timeout: 15000 });
    await page
      .getByRole("dialog", { name: "交互组件请求执行工具" })
      .getByRole("button", { name: "拒绝", exact: true })
      .click();
    await expect(frame.locator("#value")).toHaveText("用户拒绝此操作");
    await frame.getByRole("button", { name: "刷新工具结果" }).click();
    await expect(approval).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(frame.locator("#value")).toHaveText("用户拒绝此操作");
    passed.push(
      "MCP App tool permission: deny and Escape return rejection to original iframe",
    );
    await frame.getByRole("button", { name: "刷新工具结果" }).click();
    await expect(approval).toBeVisible();
    await approval.click();
    await expect(frame.locator("#value")).toHaveText("真实 MCP 工具刷新成功", {
      timeout: 15000,
    });
    passed.push(
      "MCP resource discovery → sandbox iframe handshake → permission-gated real tool call",
    );
    await toolToggle.click();
    await expect(page.locator('[data-kind="mcp-app"]')).toHaveCount(0);
    await toolToggle.click();
    await expect(frame.getByPlaceholder("离屏后保留草稿")).toHaveValue(
      "保留此草稿",
    );
    passed.push(
      "collapsing and remounting MCP details retains live iframe form state",
    );
    await page.screenshot({
      path: join(artifacts, "desktop.png"),
      fullPage: true,
    });
    for (const action of ["accept", "decline", "cancel"]) {
      await page.getByPlaceholder("随心输入").fill("表单验收 " + action);
      await page.getByRole("button", { name: "发送消息", exact: true }).click();
      const form = page
        .locator('[data-kind="question-card"]')
        .filter({ hasText: "真实字段表单 " + action });
      await expect(form).toBeVisible({ timeout: 60000 });
      if (action === "accept") {
        await form.getByRole("button", { name: "提交回答" }).click();
        await expect(form.getByRole("alert")).toContainText("请填写");
        await form.getByLabel("文字", { exact: true }).fill("主进程验证");
        await form.getByLabel("整数", { exact: true }).fill("3");
        await form.getByLabel("小数", { exact: true }).fill("1.5");
        await form.getByLabel("确认选项", { exact: true }).check();
        await form.getByLabel("单选", { exact: true }).selectOption("乙");
      }
      await form
        .getByRole("button", {
          name:
            action === "accept"
              ? "提交回答"
              : action === "decline"
                ? "跳过"
                : "取消",
          exact: true,
        })
        .click();
      await expect(
        page.locator('[data-kind="assistant-answer"]').last(),
      ).toContainText("表单链路完成 " + action, { timeout: 60000 });
      const finishedHeader = form
        .locator('xpath=ancestor::*[@data-kind="assistant-turn"]')
        .locator('.workflow-turn-header-button[aria-expanded="false"]');
      if (await finishedHeader.count()) await finishedHeader.click();
      await expect(form).toContainText(
        action === "accept"
          ? "已回答"
          : action === "decline"
            ? "已跳过"
            : "已取消",
      );
      await expect(
        page.locator('[data-kind="assistant-answer"]').last(),
      ).toContainText("表单链路完成 " + action, { timeout: 60000 });
      await expect(
        page.getByRole("button", { name: "停止任务", exact: true }),
      ).toHaveCount(0, { timeout: 15000 });
      const history = await page.evaluate(
        (id) => window.marloues.chat.readThread(id),
        session.id,
      );
      const question = history.turns
        .flatMap((t) => t.items)
        .find((i) => i.question?.title === "真实字段表单 " + action)?.question;
      expect(question.status).toBe(
        action === "accept"
          ? "answered"
          : action === "decline"
            ? "skipped"
            : "cancelled",
      );
      if (action === "accept")
        expect(question.answers).toEqual({
          text: "主进程验证",
          integer: 3,
          decimal: 1.5,
          flag: true,
          one: "乙",
        });
      await page.screenshot({
        path: join(artifacts, "elicitation-" + action + ".png"),
      });
      passed.push(
        "real MCP elicitation form → IPC → " +
          action +
          " result and durable history",
      );
    }
    await page
      .getByPlaceholder("随心输入")
      .fill("停止验收：请提问并等待我的回答。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    const waiting = page
      .locator('[data-kind="question-card"]')
      .filter({ hasText: "等待停止操作" });
    await expect(waiting).toContainText("等待回答", { timeout: 60000 });
    for (const text of ["排队引导甲", "排队引导乙"]) {
      await page.getByPlaceholder("随心输入").fill(text);
      await page.getByRole("button", { name: "发送追加消息" }).click();
    }
    const queue = page.getByRole("list", { name: "排队中的引导消息" });
    await expect(queue.getByRole("listitem")).toHaveCount(2);
    const first = queue.getByRole("listitem").filter({ hasText: "排队引导甲" });
    const second = queue
      .getByRole("listitem")
      .filter({ hasText: "排队引导乙" });
    await first.dragTo(second);
    await expect(queue.getByRole("listitem").first()).toContainText(
      "排队引导乙",
    );
    await first.getByRole("button", { name: "更多操作" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await first.getByRole("button", { name: "更多操作" }).click();
    await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
    await expect(page.getByPlaceholder("随心输入")).toHaveValue("排队引导甲");
    await expect(queue.getByRole("listitem")).toHaveCount(1);
    await page.getByPlaceholder("随心输入").fill("");
    await second.getByRole("button", { name: "删除", exact: true }).click();
    await expect(queue).toHaveCount(0);
    passed.push(
      "real running turn: queue two steers → drag reorder → menu Escape → edit → cancel one",
    );
    await page.getByPlaceholder("随心输入").fill("暂停队列恢复验收");
    await page.getByRole("button", { name: "发送追加消息" }).click();
    await expect(queue.getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "停止任务", exact: true }).click();
    await expect(waiting).toContainText("已取消", { timeout: 15000 });
    await expect
      .poll(
        async () => {
          const snapshot = await page.evaluate(
            (id) => window.marloues.chat.readThread(id),
            session.id,
          );
          return snapshot?.turns[0]?.status;
        },
        { timeout: 30000 },
      )
      .toBe("cancelled");
    await expect(page.locator(".workflow-message-navigation")).toBeVisible();
    const scroller = page.locator(".messages-scroll");
    const beforeNavigation = await scroller.evaluate(
      (element) => element.scrollTop,
    );
    await page.locator(".workflow-message-navigation summary").hover();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(
      beforeNavigation,
    );
    await page.locator(".workflow-message-navigation summary").click();
    await page
      .getByRole("navigation", { name: "消息导航", exact: true })
      .getByRole("button")
      .first()
      .click();
    passed.push(
      "stop pending question → cancelled record; message navigation hover does not scroll",
    );
    await expect(
      page.getByRole("status", { name: "队列因中断而暂停" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "继续队列", exact: true }).click();
    await expect(queue).toHaveCount(0, { timeout: 30000 });
    const latestButton = page.getByRole("button", {
      name: "滚动到底部",
      exact: true,
    });
    if (await latestButton.count()) await latestButton.click();

    await expect(
      page.locator('[data-kind="assistant-answer"]').last(),
    ).toContainText("桌面链路验收完成", { timeout: 60000 });
    await expect(
      page.getByRole("button", { name: "停止任务", exact: true }),
    ).toHaveCount(0, { timeout: 30000 });
    const resumed = await page.evaluate(
      (id) => window.marloues.chat.readThread(id),
      session.id,
    );
    expect(resumed.turns[0].status).toBe("completed");
    expect(JSON.stringify(resumed.turns[0])).toContain("暂停队列恢复验收");
    passed.push(
      "real queue: interrupt keeps pending steer → paused banner → resume creates completed turn",
    );
    await page.getByPlaceholder("随心输入").fill("立即验收：请提问并等待。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(
      page
        .locator('[data-kind="question-card"]')
        .filter({ hasText: "等待立即引导" }),
    ).toContainText("等待回答", { timeout: 60000 });
    await page.getByPlaceholder("随心输入").fill("立即引导覆盖验收");
    await page.getByRole("button", { name: "发送追加消息" }).click();
    await expect(queue.getByRole("listitem")).toHaveCount(1);
    await queue.getByRole("button", { name: "立即引导", exact: true }).click();
    await expect(queue).toHaveCount(0, { timeout: 30000 });
    if (await latestButton.count()) await latestButton.click();
    await expect(
      page.getByRole("button", { name: "停止任务", exact: true }),
    ).toHaveCount(0, { timeout: 60000 });
    const applied = await page.evaluate(
      (id) => window.marloues.chat.readThread(id),
      session.id,
    );
    expect(applied.turns[0].status).toBe("completed");
    expect(JSON.stringify(applied)).toContain("立即引导覆盖验收");
    await expect(
      page.locator('[data-kind="assistant-answer"]').last(),
    ).toContainText("桌面链路验收完成");
    passed.push(
      "real queued steer apply-now → interrupts pending SDK question → delivers new user input → completed answer",
    );
    await page.reload();
    await expect(page.locator(".app-shell")).toBeVisible({ timeout: 30000 });
    const restored = await page.evaluate(
      (id) => window.marloues.chat.readThread(id),
      session.id,
    );
    if (
      !restored.turns.some((turn) =>
        turn.items.some((item) => item.question?.status === "answered"),
      )
    )
      throw new Error("Reload lost answered record");
    passed.push("renderer reload recovers persisted canonical conversation");
    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    await expect(reopened.locator(".app-shell")).toBeVisible({
      timeout: 30000,
    });
    const afterRestart = await reopened.evaluate(
      (id) => window.marloues.chat.readThread(id),
      session.id,
    );
    if (
      !afterRestart.turns.some(
        (turn) =>
          turn.timing?.workStartedAt != null &&
          turn.items.some((item) => item.question?.status === "answered"),
      )
    )
      throw new Error("App restart lost timing or answer history");
    writeFileSync(
      join(artifacts, "restored-thread.json"),
      JSON.stringify(afterRestart, null, 2),
    );
    passed.push(
      "full process restart restores persisted timing, tools and answered question",
    );
    // Exercise the real preflight failure in this disposable home. The existing
    // user configuration and credential store are never changed by the probe.
    const missingCredentialSettings = JSON.parse(
      readFileSync(join(config, "settings.json"), "utf8"),
    );
    missingCredentialSettings.agentSettings.providers =
      missingCredentialSettings.agentSettings.providers.map((provider) => ({
        ...provider,
        apiKey: "",
        apiKeyEnv: "",
      }));
    writeFileSync(
      join(config, "settings.json"),
      JSON.stringify(missingCredentialSettings, null, 2),
    );
    await reopened
      .getByPlaceholder("随心输入")
      .fill("验证缺少凭据时的错误提示。");
    await reopened
      .getByRole("button", { name: "发送消息", exact: true })
      .click();
    await expect(
      reopened
        .getByText(
          "当前供应商的 API 密钥无法读取或尚未配置，请检查系统凭据访问或重新保存密钥。",
          { exact: true },
        )
        .first(),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      reopened.getByRole("button", { name: "停止任务", exact: true }),
    ).toHaveCount(0);
    passed.push(
      "missing credentials render the correct error and leave no running turn",
    );
    if (errors.length) throw new Error(`Renderer errors: ${errors.join("\n")}`);
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  if (app) {
    const page = app.windows()[0];
    if (page) {
      await page
        .screenshot({ path: join(artifacts, "failure.png"), fullPage: true })
        .catch(() => {});
      writeFileSync(
        join(artifacts, "failure.txt"),
        (await page
          .locator("body")
          .innerText()
          .catch(() => "unavailable")) +
          "\nFRAMES\n" +
          (
            await Promise.all(
              page
                .frames()
                .filter((frame) => frame !== page.mainFrame())
                .map((frame) =>
                  frame
                    .locator("body")
                    .innerText()
                    .catch(() => "unavailable"),
                ),
            )
          ).join("\n"),
      );
    }
  }
  throw error;
} finally {
  writeFileSync(
    join(artifacts, "results.json"),
    JSON.stringify(
      {
        passed,
        errors,
        success: !failure,
        failure,
        liveModel: live ? configuredModel : undefined,
        builtAssets: true,
        runtimeIdentity: live ? "Marloues Dev" : "test",
        credentialBackend: live ? "system" : "Playwright mock",
        calls,
        home,
        build: output,
        verification: live
          ? "built main/preload/renderer under development identity with saved model configuration"
          : "production app with local protocol server; no UI bridge mocks",
      },
      null,
      2,
    ),
  );
  if (app) await app.close();
  server.close();
  console.log(JSON.stringify({ passed, errors, home, artifacts }));
}
