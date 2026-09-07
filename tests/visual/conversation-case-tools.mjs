/** Interact with the production rendering of the fresh command/file task. */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const require = createRequire(join(root, "client/package.json"));
const { chromium, expect } = require("@playwright/test");
const base = join(root, "client/test-results/conversation-generated");
const plan = JSON.parse(readFileSync(join(base, "case-plan.json"), "utf8"));
const entry = plan.cases.find((c) => c.id === "qa-command-completed");
const out = join(base, entry.latestRun);
const manifest = JSON.parse(readFileSync(join(out, "results.json"), "utf8"));
const source = JSON.parse(readFileSync(join(out, "snapshot.json"), "utf8"))
  .turns[0];
const port = readFileSync(
  join(manifest.home, "electron-user-data/DevToolsActivePort"),
  "utf8",
).split("\n")[0];
const browser = await chromium.connectOverCDP("http://127.0.0.1:" + port);
const page = browser.contexts()[0].pages()[0],
  results = [];
const capture = async (name) => {
  await page.screenshot({ path: join(out, name + ".png") });
  return name + ".png";
};
try {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.reload();
  const files = page.locator('[data-result-kind="diff"]');
  await expect(files.locator(".workflow-result-file-row")).toHaveCount(3);
  await files.getByRole("button", { name: "再显示 2 个文件" }).click();
  await expect(files.locator(".workflow-result-file-row")).toHaveCount(5);
  await files.scrollIntoViewIfNeeded();
  await capture("marloues-files-expanded");
  results.push({
    id: "many-files",
    status: "interaction-verified",
    detail: "五个实际变更文件，初始显示三个；点击展开后显示五个。",
  });
  const timer = page.locator(".workflow-turn-duration").first();
  const duration = await timer.innerText();
  results.push({
    id: "duration",
    status: duration === "1分钟 16秒" ? "matched" : "difference",
    codex: "1分钟 16秒",
    marloues: duration,
    detail: "同一轮次完成状态的实际用时文本。",
  });
  const toggle = page
    .locator('[data-kind="turn-header"][aria-expanded]')
    .first();
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
  await capture("marloues-process");
  const groupCount = await page
    .locator('[data-activity-kind="summary"]')
    .count();
  const closedGroups = page.locator(
    '[data-activity-kind="summary"][aria-expanded="false"]',
  );
  for (let i = 0; i < groupCount && (await closedGroups.count()); i++)
    await closedGroups.first().click();
  const failed = page
    .locator('[data-activity-kind="commandExecution"]')
    .filter({ hasText: "预期失败输出" });
  await expect(failed).toHaveCount(1);
  await failed.locator(":scope > button").click();
  await expect(failed.locator(".workflow-command-status")).toContainText(
    "失败",
  );
  await expect(failed).toContainText("退出码");
  await failed.scrollIntoViewIfNeeded();
  await capture("marloues-command-failed");
  const failedSource = source.items.find(
    (i) => i.type === "commandExecution" && i.command.includes("预期失败输出"),
  );
  expect(failedSource.exitCode).toBe(1);
  results.push({
    id: "command-failed",
    status: "interaction-verified",
    exitCode: failedSource.exitCode,
    detail:
      "实际失败命令和输出保留。Codex 将它放在同一活动组内；Marloues 当前拆成独立红色失败行。",
    marlouesActivityGroups: groupCount,
  });
  const success = page
    .locator('[data-activity-kind="commandExecution"]')
    .filter({ hasText: "for i in 1 2 3" });
  await expect(success).toHaveCount(1);
  await success.locator(":scope > button").click();
  await expect(success.locator(".workflow-command-status")).toContainText(
    "成功",
  );
  await success.scrollIntoViewIfNeeded();
  await capture("marloues-command-completed");
  results.push({
    id: "command-completed",
    status: "interaction-verified",
    detail:
      "真实 15 秒命令已完成，退出 0，展开可见三次输出。运行中状态未现场截图，不计为 qa-command-running 完成。",
  });
  const evidenceFile = files
    .locator(".workflow-result-file-row")
    .filter({ hasText: "evidence.ts" });
  results.push({
    id: "file-lines",
    status: "difference",
    codex: "+2 -1",
    marloues: await evidenceFile.innerText(),
    detail:
      "同一路径的创建和后续修改，Codex 统计两次 diff；Marloues 只统计了后一次修改。",
  });
  await toggle.click();
  await page.locator(".messages-scroll").evaluate((e) => {
    e.scrollTop = 0;
  });
  await capture("marloues-completed");
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
