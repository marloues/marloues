/** Exhaustive canonical UI replay in the production Electron app.
 * Seeded persisted sessions, real preload/IPC/files/clipboard. No renderer mocks.
 * Runtime transitions are covered separately by conversation-app.integration.mjs.
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
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { boundaryChecks } from "./conversation-boundary-checks.mjs";
import { lifecycleChecks } from "./conversation-lifecycle-checks.mjs";
import { styleChecks } from "./conversation-style-checks.mjs";
import { attachmentChecks } from "./conversation-attachment-checks.mjs";
import {
  createScenes,
  attachmentLongFilename,
} from "../fixtures/conversation-full/scenes.mjs";
const root = resolve(import.meta.dirname, "../..");
const require = createRequire(join(root, "client/package.json"));
const { _electron: electron, chromium, expect } = require("@playwright/test");
expect.configure({ timeout: 5000 });
const { output } = JSON.parse(
  readFileSync(
    join(root, "client/test-results/conversation-details/build.json"),
    "utf8",
  ),
);
for (const [src, dst] of [
  [join(root, "client/node_modules"), join(output, "node_modules")],
  [join(root, "node_modules"), join(output, "main/node_modules")],
]) {
  try {
    symlinkSync(src, dst);
  } catch (e) {
    if (e.code !== "EEXIST" || realpathSync(src) !== realpathSync(dst)) throw e;
  }
}
const home = mkdtempSync(join(tmpdir(), "marloues-full-conversation-"));
const workspace = join(home, "workspace");
const artifacts = join(root, "client/test-results/conversation-complete");
const skillRoot = join(home, "qa-skills");
mkdirSync(join(skillRoot, "qa-verify"), { recursive: true });
writeFileSync(
  join(skillRoot, "qa-verify/SKILL.md"),
  "---\nname: qa-verify\ndescription: Conversation QA skill fixture\n---\nOnly a fixture for testing a skill attachment.\n",
);
for (const p of [
  workspace,
  artifacts,
  join(home, "config"),
  join(home, "electron-user-data"),
])
  mkdirSync(p, { recursive: true });
writeFileSync(
  join(workspace, "evidence.ts"),
  "// 实际磁盘文件\nconst answer = 42;\nexport { answer };\n",
);
writeFileSync(join(workspace, "empty.bin"), "");
writeFileSync(
  join(workspace, attachmentLongFilename),
  "// 长名称的实际磁盘文件\nexport const attachment = true;\n",
);
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#1659bc"/><circle cx="200" cy="120" r="70" fill="#fbc544"/><text x="140" y="130" font-size="24">QA image</text></svg>';
writeFileSync(join(workspace, "image.svg"), svg);
writeFileSync(join(workspace, "second.svg"), svg.replace("#1659bc", "#b5365b"));
const frames = 8000,
  wav = Buffer.alloc(44 + frames * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++)
  wav.writeInt16LE(
    Math.round(Math.sin((i * 2 * Math.PI * 220) / 8000) * 1000),
    44 + i * 2,
  );
writeFileSync(join(workspace, "audio.wav"), wav);
const recorder = await chromium.launch({
  executablePath:
    process.env.MARLOUES_CHROMIUM_PATH ||
    "/Users/xuzong/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  headless: true,
});
const recording = await recorder.newPage();
const video = await recording.evaluate(async () => {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 180;
  const x = c.getContext("2d");
  const r = new MediaRecorder(c.captureStream(10), {
    mimeType: "video/webm;codecs=vp8",
  });
  const chunks = [];
  r.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((ok) => (r.onstop = ok));
  r.start();
  for (let i = 0; i < 12; i++) {
    x.fillStyle = i % 2 ? "#124fa0" : "#eeca42";
    x.fillRect(0, 0, 320, 180);
    x.fillStyle = "#ffffff";
    x.fillText("QA video " + i, 50, 80);
    await new Promise((ok) => setTimeout(ok, 100));
  }
  r.stop();
  await done;
  return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
});
writeFileSync(join(workspace, "video.webm"), Buffer.from(video));
await recorder.close();
const url = (name) => pathToFileURL(join(workspace, name)).href;
const scenes = createScenes({
  cwd: workspace,
  media: {
    image: url("image.svg"),
    imagePath: join(workspace, "image.svg"),
    secondImagePath: join(workspace, "second.svg"),
    audio: url("audio.wav"),
    video: url("video.webm"),
    invalid: url("missing.svg"),
    svgBase64: Buffer.from(svg).toString("base64"),
    wavBase64: wav.toString("base64"),
  },
});
writeFileSync(
  join(home, "electron-user-data/config.json"),
  JSON.stringify({
    settings: { maxSessions: 500 },
    sessions: scenes.map((s) => s.session),
  }),
);
writeFileSync(
  join(home, "config/workspaces.json"),
  JSON.stringify({
    currentWorkspaceId: "full-qa",
    workspaces: [
      {
        id: "full-qa",
        name: "完整对话验收",
        path: workspace,
        lastOpenedAt: Date.now(),
      },
    ],
  }),
);
writeFileSync(
  join(home, "config/settings.json"),
  JSON.stringify({
    agentSettings: {
      providers: [
        {
          id: "qa-ui-provider",
          name: "界面验收供应商",
          kind: "custom",
          enabled: true,
          endpoints: [
            {
              id: "local",
              protocol: "anthropic",
              baseUrl: "http://127.0.0.1:9",
              enabled: true,
              priority: 10,
            },
          ],
          models: [
            { id: "qa-first", label: "验收模型一", enabled: true },
            { id: "qa-second", label: "验收模型二", enabled: true },
            { id: "qa-hidden", label: "禁用模型", enabled: false },
          ],
        },
      ],
      defaultModel: { providerId: "qa-ui-provider", modelId: "qa-first" },
      mcpServers: [],
      skillDirectories: [join(skillRoot, "qa-verify")],
      disabledSkills: [],
      desktopNotificationsEnabled: false,
      autoMemoryEnabled: false,
      activeRuntimeId: "sdk",
    },
  }),
);
const results = [],
  errors = [];
const startedAt = new Date().toISOString();
let evidence = [];
let app, page;
const snapshot = async (name) => {
  const path = join(artifacts, name + ".png");
  await page.screenshot({ path });
  evidence.push(name + ".png");
  return path;
};
async function check(id, body) {
  if (
    process.env.QA_FILTER &&
    id !== "isolated-store-boot" &&
    !new RegExp(process.env.QA_FILTER).test(id)
  )
    return;
  const t = Date.now();
  evidence = [];
  try {
    await body();
    results.push({ id, status: "passed", ms: Date.now() - t, evidence });
    console.log("PASS " + id);
  } catch (error) {
    const proof = await snapshot(
      "FAIL-" + id.replace(/[^a-z0-9-]/gi, "_"),
    ).catch(() => null);
    results.push({
      id,
      status: "failed",
      error: String(error),
      screenshot: proof,
      evidence,
      ms: Date.now() - t,
    });
    console.log("FAIL " + id + ": " + String(error).slice(0, 550));
    await page.keyboard.press("Escape").catch(() => {});
  }
  writeFileSync(
    join(artifacts, "results.json"),
    JSON.stringify(
      {
        startedAt,
        recordedAt: new Date().toISOString(),
        home,
        build: output,
        scenes: scenes.length,
        results,
        errors,
      },
      null,
      2,
    ),
  );
}
async function choose(id) {
  const s = scenes.find((s) => s.id === "qa-" + id);
  await page
    .locator(".session-title-text")
    .filter({ hasText: s.title })
    .click();
  await expect(
    page.locator('[data-message-id="turn-' + id + '"]'),
  ).toBeAttached({ timeout: 10000 });
  return page.locator('[data-message-id="turn-' + id + '"]');
}
async function expandProcess() {
  for (const b of await page
    .locator(
      '.workflow-process-disclosure[aria-expanded="false"], .workflow-turn-header-button[aria-expanded="false"]',
    )
    .all())
    await b.click();
  for (const b of await page
    .locator('.workflow-activity-summary-row[aria-expanded="false"]')
    .all())
    await b.click();
}
async function clipboard() {
  return app.evaluate(({ clipboard }) => clipboard.readText());
}
try {
  app = await electron.launch({
    args: [join(output, "main/index.js")],
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      ELECTRON_RENDERER_URL: "",
      MARLOUES_HOME: home,
      MARLOUES_REMOTE_DEBUGGING_PORT: "0",
      NODE_PATH: [
        join(root, "node_modules"),
        join(root, "client/node_modules"),
      ].join(":"),
    },
    timeout: 30000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 980 });
  await expect(
    page.locator(".onboarding-view, .app-shell").first(),
  ).toBeVisible({ timeout: 30000 });
  const welcome = page.getByRole("dialog", { name: "marloues 初次设置" });
  if (await welcome.isVisible()) {
    if (await welcome.getByRole("button", { name: "稍后配置" }).isVisible())
      await welcome.getByRole("button", { name: "稍后配置" }).click();
    await welcome.getByRole("button", { name: "开始使用" }).click();
  }
  await check("isolated-store-boot", async () => {
    await expect(page.locator(".app-shell")).toBeVisible();
    const stored = await page.evaluate(() =>
      window.marloues.chat.listSessions(),
    );
    expect(stored.map((s) => s.id).sort()).toEqual(
      scenes.map((s) => s.id).sort(),
    );
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(
      join(home, "electron-user-data"),
    );
  });
  if (process.argv.includes("--inspect")) {
    await snapshot("inspect");
    console.log((await page.locator("body").innerText()).slice(0, 12000));
    await app.close();
    process.exit(0);
  }
  for (const s of scenes.filter((s) => !s.history))
    await check("render-" + s.id, async () => {
      const turn = await choose(s.id.slice(3));
      await expect(turn).toBeVisible();
      await expandProcess();
      const rows = page.locator(
        '.workflow-activity-row-button[aria-expanded="false"]',
      );
      let partIndex = 0;
      while (await rows.count()) {
        await rows.first().click();
        await snapshot(s.id + "-detail-" + partIndex++);
      }
      const actual = await turn
        .locator("[data-activity-kind]")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            kind: n.getAttribute("data-activity-kind"),
            text: n.textContent,
          })),
        );
      const text = await turn.innerText();
      expect(text.trim().length).toBeGreaterThan(0);
      for (const i of s.items) {
        if (
          ![
            "agentMessage",
            "userMessage",
            "reasoning",
            "fileChange",
            "plan",
            "imageView",
          ].includes(i.type) &&
          i.tool !== "token_count" &&
          !(i.type === "imageGeneration" && i.savedPath)
        )
          expect(
            actual.some((a) => a.kind === i.type) || i.question !== undefined,
            "visible canonical " + i.type + " " + i.id,
          ).toBe(true);
      }
      writeFileSync(
        join(artifacts, s.id + ".json"),
        JSON.stringify(
          {
            expected: s.items.map((i) => i.type),
            actual,
            text,
            buttons: await turn.getByRole("button").evaluateAll((ns) =>
              ns.map((n) => ({
                label: n.getAttribute("aria-label") || n.textContent,
                expanded: n.getAttribute("aria-expanded"),
              })),
            ),
          },
          null,
          2,
        ),
      );
      await turn.scrollIntoViewIfNeeded();
      await snapshot(s.id);
    });
  await check("markdown-semantic-nodes", async () => {
    await choose("markdown");
    const m = page.locator(".workflow-assistant-answer");
    await expect(m.locator("h1")).toHaveText("标题一级");
    await expect(m.locator("h2").first()).toHaveText("标题二级");
    for (const tag of [
      "strong",
      "em",
      "del",
      "blockquote",
      "hr",
      'ol[start="4"]',
      "ul",
      "table",
      ".katex",
      ".katex-display",
    ])
      expect(await m.locator(tag).count()).toBeGreaterThan(0);
    expect(await m.locator("input[type=checkbox]:disabled").count()).toBe(2);
    await expect(
      m.locator('a[href="https://example.com/reference"]'),
    ).toBeVisible();
    await expect(m.locator('a[href^="#user-content-fn-"]')).toHaveCount(1);
    await expect(m.locator('a[href^="future:"]')).toHaveCount(0);
    await expect(m).toContainText("::future-component");
  });
  await check("table-overflow-copy-preview-focus", async () => {
    await choose("markdown");
    const region = page.getByRole("region", { name: "表格，支持横向滚动" });
    expect(await region.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: "复制表格", exact: true }).click();
    await expect.poll(clipboard).toContain("| 很长的字段名称");
    expect(
      await app.evaluate(({ clipboard }) => clipboard.readHTML()),
    ).toContain("<table");
    const trigger = page.getByRole("button", { name: "展开表格" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "表格预览" });
    await expect(dialog.locator("table")).toBeVisible();
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
    ).toBe(true);
    await snapshot("table-dialog");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
  await check("code-writing-inline-copy-wrap", async () => {
    await choose("markdown");
    await page.getByRole("button", { name: "复制代码", exact: true }).click();
    await expect.poll(clipboard).toContain("const answer = 42;\n\nconst long");
    const wrap = page.getByRole("button", { name: "代码自动换行" });
    const before = await wrap.getAttribute("aria-pressed");
    await wrap.click();
    await expect(wrap).toHaveAttribute(
      "aria-pressed",
      String(before !== "true"),
    );
    await page.getByRole("button", { name: "复制写作内容" }).click();
    await expect.poll(clipboard).toContain("第二段写作内容");
    await page
      .getByRole("button", { name: "复制 answer", exact: true })
      .click();
    await expect.poll(clipboard).toBe("answer");
    await choose("child");
    await choose("markdown");
    await expect(wrap).toHaveAttribute(
      "aria-pressed",
      String(before !== "true"),
    );
  });
  await check("file-preview-success-error-line-copy", async () => {
    await choose("markdown");
    await page.getByRole("button", { name: "本地文件", exact: true }).click();
    const d = page.getByRole("dialog", { name: "evidence.ts" });
    await expect(d.locator(".is-target-line")).toContainText(
      "const answer = 42",
    );
    await d.getByRole("button", { name: "复制文件内容" }).click();
    await expect.poll(clipboard).toContain("// 实际磁盘文件");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "缺失文件", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      /ENOENT|不存在|no such file/,
    );
    await page.keyboard.press("Escape");
  });
  await check("mermaid-render-source-copy", async () => {
    await choose("markdown");
    const mermaid = page.locator('[data-kind="mermaid-block"]');
    await mermaid.scrollIntoViewIfNeeded();
    await expect(mermaid.locator("img")).toBeVisible({ timeout: 15000 });
    await mermaid.getByRole("button", { name: "源码", exact: true }).click();
    await expect(mermaid.locator("pre")).toContainText("flowchart LR");
    await mermaid.getByRole("button", { name: "复制图表源码" }).click();
    await expect.poll(clipboard).toContain("flowchart LR");
    await mermaid.getByRole("button", { name: "图表", exact: true }).click();
    await mermaid.getByRole("button", { name: "预览图表" }).click();
    await expect(page.getByRole("dialog", { name: "图表.svg" })).toBeVisible();
    await page.keyboard.press("Escape");
    await snapshot("mermaid");
  });
  await check("question-validation-all-fields-stale-submit", async () => {
    await choose("questions");
    await expandProcess();
    const card = page.locator('[data-request-id="form-pending"]');
    await card.getByRole("button", { name: "提交回答", exact: true }).click();
    await expect(card.getByRole("alert")).toBeVisible();
    await card.getByLabel("文字", { exact: true }).fill("完整验收");
    await card.getByLabel("整数", { exact: true }).fill("3");
    await card.getByLabel("小数", { exact: true }).fill("1.5");
    await card.getByLabel("确认选项", { exact: true }).check();
    await card.getByLabel("单选", { exact: true }).selectOption("乙");
    await card.getByLabel("多选", { exact: true }).selectOption(["一", "三"]);
    await card.getByRole("button", { name: "提交回答", exact: true }).click();
    await expect(card.getByRole("alert")).toContainText(
      /不存在|过期|无效|结束|not|pending|等待/i,
    );
    await choose("child");
    await choose("questions");
    await expandProcess();
    await expect(card.getByLabel("文字", { exact: true })).toHaveValue(
      "完整验收",
    );
    await expect(card.getByLabel("多选", { exact: true })).toHaveValues([
      "一",
      "三",
    ]);
    await snapshot("question-form-draft");
  });
  for (const status of ["running", "completed", "failed", "cancelled"])
    await check("command-state-" + status, async () => {
      await choose("command-" + status);
      await expandProcess();
      const row = page.locator('[data-activity-kind="commandExecution"]');
      const toggle = row.locator("button[aria-expanded]");
      if ((await toggle.getAttribute("aria-expanded")) === "false")
        await toggle.click();
      await expect(row.locator(".workflow-command-status")).toContainText(
        {
          running: "运行中",
          completed: "成功",
          failed: "失败",
          cancelled: "已停止",
        }[status],
      );
      await row.getByRole("button", { name: "复制命令", exact: true }).click();
      await expect.poll(clipboard).toBe('printf "验收命令"');
      await row
        .getByRole("button", {
          name: status === "failed" ? "复制错误" : "复制输出",
          exact: true,
        })
        .click();
      await expect.poll(clipboard).toContain("命令输出 " + status);
      await toggle.click();
      await expect(row.locator(".workflow-activity-detail")).toHaveCount(0);
      await choose("child");
      await choose("command-" + status);
      await expandProcess();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
  for (const status of ["pending", "failed", "rejected", "cancelled"])
    await check("patch-terminal-" + status, async () => {
      await choose("patch-" + status);
      await expandProcess();
      const row = page.locator('[data-activity-kind="fileChange"]');
      await expect(row).toContainText(
        {
          pending: "正在编辑",
          failed: "编辑失败",
          rejected: "编辑已拒绝",
          cancelled: "编辑已停止",
        }[status],
      );
      const toggle = row.locator("button[aria-expanded]");
      if ((await toggle.getAttribute("aria-expanded")) === "false")
        await toggle.click();
      await expect(row).toContainText("无 diff 预览");
      await row.getByRole("button", { name: "复制差异", exact: true }).click();
      await expect.poll(clipboard).toContain("+const answer = 42;");
      await expect(page.locator('[data-result-kind="diff"]')).toHaveCount(0);
      await snapshot("patch-" + status + "-expanded");
    });
  await check("file-results-expand-hover-review", async () => {
    await choose("many-files");
    const result = page.locator('[data-result-kind="diff"]');
    await expect(result.locator(".workflow-result-file-row")).toHaveCount(3);
    await result.getByRole("button", { name: "再显示 2 个文件" }).click();
    await expect(result.locator(".workflow-result-file-row")).toHaveCount(5);
    await result.locator(".workflow-result-file-row").first().hover();
    await snapshot("five-file-results");
    await result.getByRole("button", { name: "收起文件" }).click();
    await expect(result.locator(".workflow-result-file-row")).toHaveCount(3);
    await result.getByRole("button", { name: "审核文件变更" }).click();
    await expect(
      page
        .locator(
          '.auxiliary-content, .inspector-panel, .review-panel, [data-testid="review-panel"]',
        )
        .first(),
    ).toBeVisible();
    await page.locator('.thread-inspector-toggle[aria-pressed="true"]').click();
  });
  await check("failed-turn-retains-body-and-applied-files", async () => {
    await choose("error");
    await expect(page.locator(".workflow-assistant-answer")).toContainText(
      "错误前已有正文",
    );
    await expect(page.locator('[data-result-kind="diff"]')).toBeVisible();
    await expect(page.locator(".message-error-card")).toContainText("重连 2/5");
    await page.getByRole("button", { name: "错误详情", exact: true }).click();
    await expect(page.locator(".message-error-card")).toContainText("qa-error");
    await page.getByRole("button", { name: "复制错误详情" }).click();
    await expect.poll(clipboard).toContain("重连 2/5");
    await snapshot("failed-turn-with-artifact");
  });
  await check("mcp-six-content-raw-copy", async () => {
    await choose("mcp");
    await expandProcess();
    const row = page.locator('[data-activity-kind="mcpToolCall"]');
    if (
      (await row
        .locator("button[aria-expanded]")
        .getAttribute("aria-expanded")) === "false"
    )
      await row.locator("button[aria-expanded]").click();
    await expect(row.getByRole("img", { name: "工具返回图片" })).toBeVisible();
    await expect(row.locator("audio")).toBeVisible();
    await expect(row.getByRole("link", { name: "资源报告" })).toHaveAttribute(
      "href",
      "https://example.com/report",
    );
    await expect(row).toContainText("嵌入资源正文");
    await expect(row).toContainText("未知内容完整保留");
    await expect(row.getByText("结构化结果", { exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: "复制资源地址" }).first().click();
    await expect.poll(clipboard).toBe("https://example.com/report");
    await row.getByRole("button", { name: "查看原始结果" }).click();
    const d = page.getByRole("dialog", { name: "原始工具结果" });
    await expect(d).toContainText("annotations");
    await expect(d).toContainText("structuredContent");
    await expect(d).toContainText("_meta");
    await d.getByRole("button", { name: "复制代码" }).click();
    await expect.poll(clipboard).toContain("future-content");
    await snapshot("mcp-raw-dialog");
    await page.keyboard.press("Escape");
  });
  await check("tool-specialized-details-plan", async () => {
    await choose("tool-details");
    await expandProcess();
    const rows = page.locator(
      '.workflow-activity-row-button[aria-expanded="false"]',
    );
    while (await rows.count()) await rows.first().click();
    await expect(page.locator(".workflow-turn-body")).toContainText(
      "1 / 3 已完成",
    );
    await expect(page.locator(".workflow-turn-body")).toContainText(
      "In progress",
    );
    await expect(page.locator(".workflow-turn-body")).toContainText(
      "读取详情内容",
    );
    await expect(page.locator(".workflow-turn-body")).toContainText("read");
    await expect(page.locator(".workflow-turn-body")).toContainText("write");
    await expect(page.locator('[data-result-kind="preview"]')).toContainText(
      "验收网页",
    );
    await expect(
      page.getByRole("link", { name: "在浏览器中打开 验收网页" }),
    ).toHaveAttribute("href", "https://example.com/qa");
    await snapshot("all-tool-details");
  });
  await check("marker-raw-disclosure-survives-remount", async () => {
    await choose("markers");
    await expandProcess();
    const review = page.locator('[data-activity-kind="enteredReviewMode"]');
    const toggle = review.locator("button[aria-expanded]");
    if ((await toggle.getAttribute("aria-expanded")) === "false")
      await toggle.click();
    await expect(review).toContainText("qa-review");
    await choose("child");
    await choose("markers");
    await expandProcess();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const unknown = page
      .locator('[data-activity-kind="unknown"]')
      .filter({ hasText: "future-event" });
    if (
      (await unknown
        .locator("button[aria-expanded]")
        .getAttribute("aria-expanded")) === "false"
    )
      await unknown.locator("button[aria-expanded]").click();
    await expect(unknown).toContainText("原始 future-event");
    await expect(
      page
        .locator('[data-activity-kind="unknown"]')
        .filter({ hasText: "工作树初始化失败" }),
    ).toBeVisible();
  });
  for (const status of ["running", "completed", "failed", "cancelled"])
    await check("collab-status-source-" + status, async () => {
      await choose("collab-" + status);
      await expandProcess();
      const row = page.locator('[data-activity-kind="collabAgentToolCall"]');
      await expect(row).toContainText(
        {
          running: "正在使用协作代理",
          completed: "已使用协作代理",
          failed: "协作代理失败",
          cancelled: "协作代理已停止",
        }[status],
      );
      if (
        (await row
          .locator("button[aria-expanded]")
          .getAttribute("aria-expanded")) === "false"
      )
        await row.locator("button[aria-expanded]").click();
      await row.getByRole("button", { name: "打开子任务 qa-child" }).click();
      await expect(
        page.locator('[data-message-id="turn-child"]'),
      ).toContainText("只属于 qa-child");
    });
  await check("permission-history-all-statuses", async () => {
    await choose("permissions");
    for (const value of [
      "等待批准",
      "已处理权限",
      "已拒绝权限",
      "审批超时",
      "已取消",
    ])
      await expect(page.locator(".workflow-turn-body")).toContainText(value);
    expect(await page.locator(".workflow-permission-card").count()).toBe(5);
  });
  await check("settled-question-readonly-unsupported-url", async () => {
    await choose("questions");
    for (const [id, label] of [
      ["form-answered", "已回答"],
      ["form-skipped", "已跳过"],
      ["form-cancelled", "已取消"],
    ]) {
      const c = page.locator('[data-request-id="' + id + '"]');
      await expect(c).toContainText(label);
      await expect(c.locator("input,select,form")).toHaveCount(0);
    }
    await expect(
      page.locator('[data-request-id="form-answered"]'),
    ).toContainText("一、三");
    const u = page.locator('[data-request-id="form-unsupported"]');
    await expect(u.getByRole("button", { name: "提交回答" })).toBeDisabled();
    await expect(u.getByRole("button", { name: "跳过" })).toBeEnabled();
    await expect(
      page.locator('[data-request-id="url-pending"]').getByRole("link"),
    ).toHaveAttribute("href", "https://example.com/auth");
  });
  await check("media-loaded-play-pause-error-preview", async () => {
    await choose("media");
    await expect(page.locator('[data-media-kind="audio"]')).toHaveAttribute(
      "data-media-status",
      "ready",
    );
    await expect(page.locator('[data-media-kind="video"]')).toHaveAttribute(
      "data-media-status",
      "ready",
    );
    for (const type of ["audio", "video"]) {
      const player = page.locator(type);
      await player.scrollIntoViewIfNeeded();
      await player.evaluate(async (p) => {
        p.muted = true;
        await p.play();
      });
      await expect
        .poll(() => player.evaluate((p) => p.currentTime))
        .toBeGreaterThan(0);
      await player.evaluate((p) => p.pause());
      expect(await player.evaluate((p) => p.paused)).toBe(true);
    }
    await expect(page.getByText("无效图片暂不可用")).toBeVisible();
    const trigger = page.getByRole("button", { name: "预览正文图片" });
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "正文图片" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await snapshot("media-players");
  });
  await check("gallery-keyboard-zoom-download-focus", async () => {
    await choose("gallery");
    await expect(page.locator('[data-result-kind="image"]')).toHaveCount(2);
    const trigger = page.getByRole("button", {
      name: "打开图片预览：second.svg",
    });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAttribute("aria-label", "second.svg");
    await dialog.getByRole("button", { name: "放大图片" }).click();
    await expect(dialog.locator(".image-lightbox-zoom-value")).not.toHaveText(
      "100%",
    );
    await expect(
      dialog.getByRole("button", { name: "下一张图片" }),
    ).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(dialog).toHaveAttribute("aria-label", "second.svg");
    await page.keyboard.press("ArrowLeft");
    await expect(dialog).toHaveAttribute("aria-label", "image.svg");
    await expect(dialog.locator(".image-lightbox-zoom-value")).toHaveText(
      "100%",
    );
    await expect(
      dialog.getByRole("button", { name: "上一张图片" }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "下一张图片" }).click();
    await expect(dialog).toHaveAttribute("aria-label", "second.svg");
    await dialog.getByRole("button", { name: "缩小图片" }).click();
    await expect(dialog.locator(".image-lightbox-zoom-value")).not.toHaveText(
      "100%",
    );
    await dialog.getByRole("button", { name: "关闭图片预览" }).focus();
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
    ).toBe(true);
    await app.evaluate(
      ({ BrowserWindow }, savePath) => {
        globalThis.qaDownload = { state: "waiting" };
        BrowserWindow.getAllWindows()[0].webContents.session.once(
          "will-download",
          (_event, item) => {
            globalThis.qaDownload.state = "started";
            item.setSavePath(savePath);
            item.once(
              "done",
              (_e, state) => (globalThis.qaDownload.state = state),
            );
          },
        );
      },
      join(artifacts, "downloaded-second.svg"),
    );
    await dialog.getByRole("link", { name: "下载图片" }).click();
    await expect
      .poll(() => app.evaluate(() => globalThis.qaDownload.state))
      .toBe("completed");
    expect(
      readFileSync(join(artifacts, "downloaded-second.svg"), "utf8"),
    ).toContain("#b5365b");
    await snapshot("image-lightbox");
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });
  await check("image-status-no-empty-success", async () => {
    for (const status of ["running", "failed", "cancelled"]) {
      await choose("image-" + status);
      await expandProcess();
      await expect(page.locator('[data-result-kind="image"]')).toHaveCount(0);
      await expect(page.locator(".workflow-turn-body")).toContainText(
        {
          running: "正在生成图片",
          failed: "生成图片失败",
          cancelled: "已取消生成图片",
        }[status],
      );
    }
  });
  await check("user-attachments-preview-file-copy", async () => {
    await choose("attachments");
    const user = page.locator('[data-kind="user-message"]');
    await expect(user.locator("img")).toHaveCount(2);
    for (const value of [
      "evidence.ts",
      "附件链接",
      "验收技能",
      "引用文件",
      "页面批注",
    ])
      await expect(user).toContainText(value);
    await user.locator(".user-image-chip").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await user
      .getByRole("button")
      .filter({ hasText: "evidence.ts" })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toContainText("实际磁盘文件");
    await page.keyboard.press("Escape");
  });
  await check("user-expand-copy-reuse-doubleclick", async () => {
    await choose("long-user");
    const user = page.locator('[data-kind="user-message"]');
    await user.getByRole("button", { name: "展开", exact: true }).click();
    await expect(user.locator(".workflow-user-message-text")).toHaveClass(
      /is-expanded/,
    );
    await user.getByRole("button", { name: "收起", exact: true }).click();
    await user.getByRole("button", { name: "复制这条消息" }).click();
    await expect.poll(clipboard).toContain("长消息第 24 行");
    await user.getByRole("button", { name: "放回输入框" }).click();
    const composer = page.getByPlaceholder("随心输入");
    await expect(composer).toHaveValue(
      scenes.find((s) => s.id === "qa-long-user").prompt,
    );
    await expect(composer).toBeFocused();
    await composer.fill("");
    await user.locator(".user-message-bubble").dblclick();
    await expect(composer).toContainText("长消息第 24 行");
    await composer.fill("");
  });
  await check("selection-to-composer-and-session-draft", async () => {
    await choose("child");
    const article = page.locator(".workflow-assistant-answer");
    await article.evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e.querySelector("p"));
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    });
    await article.dispatchEvent("mouseup");
    await page.getByRole("button", { name: "添加到对话", exact: true }).click();
    const composer = page.getByPlaceholder("随心输入");
    await expect(composer).toHaveValue(/> 子任务已完成/);
    await choose("markdown");
    await composer.fill("另一任务草稿");
    await choose("child");
    await expect(composer).toHaveValue(/> 子任务已完成/);
    await composer.fill("");
  });
  await check("footer-real-copy-and-fork", async () => {
    await choose("child");
    await page.getByRole("button", { name: "复制回复" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(clipboard).toBe("子任务已完成，只属于 qa-child。");
    const before = await page.evaluate(() =>
      window.marloues.chat.listSessions(),
    );
    await page.getByRole("button", { name: "创建对话分支" }).focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => {
        const list = await page.evaluate(() =>
          window.marloues.chat.listSessions(),
        );
        return list.length;
      })
      .toBe(before.length + 1);
    const after = await page.evaluate(() =>
      window.marloues.chat.listSessions(),
    );
    const fork = after.find((s) => !before.some((b) => b.id === s.id));
    const read = await page.evaluate(
      (id) => window.marloues.chat.readThread(id),
      fork.id,
    );
    expect(JSON.stringify(read)).toContain("子任务已完成，只属于 qa-child。");
  });
  await check("history-pagination-virtualization-navigation", async () => {
    if (
      await page
        .locator('.thread-inspector-toggle[aria-pressed="true"]')
        .count()
    )
      await page
        .locator('.thread-inspector-toggle[aria-pressed="true"]')
        .click();
    const s = scenes.find((s) => s.history);
    await page
      .locator(".session-title-text")
      .filter({ hasText: s.title })
      .click();
    await expect(page.locator('[data-message-id="history-159"]')).toBeVisible();
    const scroll = page.locator(".messages-scroll");
    expect(await page.locator(".workflow-turn-frame").count()).toBeLessThan(
      100,
    );
    const navBounds = await page
      .locator(".workflow-message-navigation")
      .boundingBox();
    const scrollBounds = await scroll.boundingBox();
    expect(navBounds.x + navBounds.width).toBeLessThanOrEqual(
      scrollBounds.x + scrollBounds.width,
    );
    const before = await scroll.evaluate((e) => e.scrollTop);
    await page.locator(".workflow-message-navigation [aria-current]").hover();
    expect(await scroll.evaluate((e) => e.scrollTop)).toBe(before);
    await page
      .getByRole("navigation", { name: "消息导航", exact: true })
      .getByRole("button")
      .first()
      .click();
    await expect
      .poll(() => scroll.evaluate((e) => e.scrollTop))
      .toBeLessThan(before);
    await scroll.evaluate((e) => (e.scrollTop = 0));
    await expect(
      page.locator(".workflow-message-navigation button"),
    ).toHaveCount(160, { timeout: 15000 });
    await page
      .getByRole("navigation", { name: "消息导航", exact: true })
      .getByRole("button")
      .first()
      .click();
    await expect(
      page.locator('[data-message-id="history-0"]'),
    ).toBeInViewport();
    await snapshot("history-first-page");
    await choose("child");
    await page
      .locator(".session-title-text")
      .filter({ hasText: s.title })
      .click();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await expect(
      page.locator('[data-message-id="history-0"]'),
    ).toBeInViewport();
    await page.getByRole("button", { name: "滚动到底部", exact: true }).click();
    await expect(
      page.locator('[data-message-id="history-159"]'),
    ).toBeInViewport();
  });
  await check("fork-selected-history-boundary-workspace-reload", async () => {
    const source = scenes.find((s) => s.history);
    await page
      .locator(".session-title-text")
      .filter({ hasText: source.title })
      .click();
    await page.locator(".messages-scroll").evaluate((e) => {
      e.scrollTop = 0;
    });
    await expect(
      page.locator(".workflow-message-navigation button"),
    ).toHaveCount(160);
    await page
      .getByRole("navigation", { name: "消息导航", exact: true })
      .getByRole("button")
      .nth(10)
      .click();
    const turn = page.locator('[data-message-id="history-10"]');
    await expect(turn).toBeInViewport();
    const before = await page.evaluate(() =>
      window.marloues.chat.listSessions(),
    );
    await turn.getByRole("button", { name: "创建对话分支" }).focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.marloues.chat.listSessions()))
            .length,
      )
      .toBe(before.length + 1);
    const after = await page.evaluate(() =>
      window.marloues.chat.listSessions(),
    );
    const fork = after.find((s) => !before.some((b) => b.id === s.id));
    expect(fork.workspacePath).toBe(workspace);
    const verify = async () => {
      const read = await page.evaluate(
        (id) => window.marloues.chat.readThread(id),
        fork.id,
      );
      expect(read.turns).toHaveLength(11);
      expect(JSON.stringify(read)).toContain("历史回答 10");
      expect(JSON.stringify(read)).not.toContain("历史回答 11");
      expect(read.thread.cwd).toBe(workspace);
    };
    await verify();
    await page.reload();
    await expect(page.locator(".app-shell")).toBeVisible();
    await verify();
    await snapshot("fork-selected-history");
  });
  await check("composer-menus-escape-file-attachment", async () => {
    await choose("child");
    const add = page.getByRole("button", { name: "添加文件及更多内容" });
    await add.click();
    await expect(page.getByRole("menu", { name: "添加内容" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "添加内容" })).toHaveCount(0);
    await add.click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "上传文件" }).click();
    await (await chooser).setFiles(join(workspace, "evidence.ts"));
    await expect(page.locator(".composer-attachments")).toContainText(
      "evidence.ts",
    );
    await page.getByRole("button", { name: "移除文件", exact: true }).click();
    await expect(page.locator(".composer-attachments")).toHaveCount(0);
    await page.getByRole("button", { name: /^权限：/ }).click();
    await expect(
      page.getByRole("menu", { name: "权限模式" }).getByRole("menuitemradio"),
    ).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "权限模式" })).toHaveCount(0);
    await add.click();
    await page.getByRole("menuitem", { name: "引用工作区文件" }).click();
    await expect(page.getByPlaceholder("随心输入")).toHaveValue("@");
    await snapshot("composer-file-suggestion");
    await page.keyboard.press("Escape");
    await page.getByPlaceholder("随心输入").fill("");
  });
  for (const theme of ["light", "dark"])
    for (const width of [960, 1440])
      await check("layout-" + theme + "-" + width, async () => {
        await app.evaluate(
          ({ nativeTheme }, theme) => (nativeTheme.themeSource = theme),
          theme,
        );
        await page.setViewportSize({ width, height: 980 });
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await choose("markdown");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        expect(
          await page
            .locator(".messages-scroll")
            .evaluate((e) => e.scrollWidth - e.clientWidth),
        ).toBeLessThanOrEqual(2);
        await page
          .getByRole("button", { name: "展开表格" })
          .scrollIntoViewIfNeeded();
        await snapshot("layout-" + theme + "-" + width);
        await choose("patch-failed");
        await expandProcess();
        await snapshot("layout-diff-" + theme + "-" + width);
      });
  await lifecycleChecks({
    app,
    page,
    check,
    choose,
    snapshot,
    expect,
    workspace,
    expandProcess,
  });
  await boundaryChecks({
    app,
    page,
    check,
    choose,
    snapshot,
    expect,
    workspace,
    expandProcess,
  });
  await styleChecks({
    app,
    page,
    check,
    choose,
    snapshot,
    expect,
    workspace,
    expandProcess,
  });
  await attachmentChecks({ page, check, choose, snapshot, expect });
  await check("no-uncaught-renderer-errors", async () =>
    expect(errors).toEqual([]),
  );
} catch (e) {
  results.push({ id: "harness", status: "failed", error: String(e) });
  console.error(e);
  if (page) await snapshot("harness-failure");
} finally {
  if (app) await app.close();
  writeFileSync(
    join(artifacts, "results.json"),
    JSON.stringify(
      {
        startedAt,
        recordedAt: new Date().toISOString(),
        home,
        build: output,
        scenes: scenes.length,
        results,
        errors,
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify({
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    artifacts,
  }),
);
if (results.some((r) => r.status === "failed")) process.exitCode = 1;
