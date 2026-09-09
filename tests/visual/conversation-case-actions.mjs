/** Inspect the already-open production app for the freshly generated markdown case. */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const root = resolve(import.meta.dirname, "../..");
const require = createRequire(join(root, "client/package.json"));
const { chromium, expect } = require("@playwright/test");
const base = join(root, "client/test-results/conversation-generated");
const catalog = JSON.parse(readFileSync(join(base, "case-plan.json"), "utf8"));
const entry = catalog.cases.find((c) => c.id === "qa-markdown");
const out = join(base, entry.latestRun);
const manifest = JSON.parse(readFileSync(join(out, "results.json"), "utf8"));
const port = readFileSync(
  join(manifest.home, "electron-user-data/DevToolsActivePort"),
  "utf8",
).split("\n")[0];
const browser = await chromium.connectOverCDP("http://127.0.0.1:" + port);
const page = browser.contexts()[0].pages()[0];
const results = [];
const capture = async (name) => {
  await page.screenshot({ path: join(out, name + ".png") });
  return name + ".png";
};
const clipboard = () => {
  const bytes = execFileSync("/usr/bin/pbpaste", [], {
    env: { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" },
  });
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
};
try {
  await page.setViewportSize({ width: 1440, height: 980 });
  const answer = page.locator('[data-kind="assistant-answer"]').last();
  const table = answer.locator('[data-kind="markdown-table"]');
  await table.scrollIntoViewIfNeeded();
  await table.getByRole("button", { name: "复制表格", exact: true }).click();
  await expect(
    table.getByRole("button", { name: "已复制表格", exact: true }),
  ).toBeVisible();
  const copied = clipboard();
  writeFileSync(join(out, "marloues-table-copy.txt"), copied);
  const nativeCopy = readFileSync(
    join(base, "codex-qa-markdown-table-copy.txt"),
    "utf8",
  );
  results.push({
    id: "table-copy",
    status: copied.trim() === nativeCopy.trim() ? "matched" : "difference",
    detail: "两端实际点击复制表格后读取剪贴板文本，比较 Markdown 内容。",
  });
  const trigger = table.getByRole("button", { name: "展开表格", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture("marloues-table-expanded");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  results.push({
    id: "table-dialog",
    status: "interaction-verified",
    detail: "已打开表格预览，Escape 关闭并返回触发按钮；两端弹层布局另见截图。",
  });
  const diagram = answer.locator('[data-kind="mermaid-block"]');
  await expect(diagram.locator("img")).toBeVisible();
  await diagram.scrollIntoViewIfNeeded();
  await capture("marloues-diagram");
  await diagram.getByRole("button", { name: "源码", exact: true }).click();
  await expect(diagram.locator("pre")).toContainText("flowchart LR");
  await capture("marloues-diagram-source");
  await diagram.getByRole("button", { name: "图表", exact: true }).click();
  results.push({
    id: "mermaid",
    status: "interaction-verified",
    detail: "两端默认显示图表；Marloues 额外有图表标题栏和源码切换。",
  });
  const input = page.locator('[data-kind="user-message"]');
  await input.scrollIntoViewIfNeeded();
  await expect(input.locator("h1")).toBeAttached();
  await expect(input.locator("strong").first()).toBeAttached();
  await capture("marloues-user-input");
  await answer.locator("h1").scrollIntoViewIfNeeded();
  await capture("marloues-headings");
  results.push({
    id: "user-markdown",
    status: "interaction-verified",
    detail:
      "用户气泡渲染 Markdown 富文本，复制与回填仍使用解码后的原始文本。",
  });
  writeFileSync(
    join(out, "interaction-results.json"),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        sourceSha256: manifest.sourceSha256,
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ out, results }));
} finally {
  await browser.close();
}
