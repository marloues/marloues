/** Real Codex JSONL -> production IPC -> the normal Marloues conversation.
 * Canonical item checkpoints are not a recording of token deltas or UI actions. */
import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(join(root, "client/package.json"));
const { _electron: electron, expect } = require("@playwright/test");
const artifacts = join(root, "client/test-results/conversation-real");
mkdirSync(artifacts, { recursive: true });
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const frozen = join(artifacts, "source.jsonl");
const source = flag("--source");
if (source && resolve(source) !== frozen) copyFileSync(resolve(source), frozen);
if (!existsSync(frozen))
  throw new Error("Pass --source /absolute/path/to/rollout.jsonl");
const support = join(
  mkdtempSync(join(tmpdir(), "marloues-real-decoder-")),
  "real-support.cjs",
);
await require("esbuild").build({
  stdin: {
    contents:
      'export {parseSessionLog} from "./client/main/codex/session-log"; export {readStoredJsonlReplay} from "./client/main/codex/jsonl-replay-session";',
    resolveDir: root,
    loader: "ts",
  },
  outfile: support,
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  tsconfig: join(root, "client/tsconfig.node.json"),
  logLevel: "warning",
});
const { parseSessionLog, readStoredJsonlReplay } = require(support);
const preliminary = parseSessionLog(frozen);
if (!preliminary.audit?.lastCompletedLine)
  throw new Error("This source has no completed canonical UI turn");
const parsed = parseSessionLog(frozen, {
  throughLine: preliminary.audit.lastCompletedLine,
});
const audit = parsed.audit;
const nativeComparison = existsSync(join(artifacts, "native-comparison.json"))
  ? JSON.parse(readFileSync(join(artifacts, "native-comparison.json"), "utf8"))
  : null;
const nativeMatchesSource =
  nativeComparison?.sourceSha256 === audit.sourceSha256;
const sourceLines = readFileSync(frozen, "utf8").split(/\r?\n/);
const attachment = parsed.readThread.turns.find((turn) =>
  turn.items.some(
    (item) =>
      item.type === "userMessage" &&
      item.content.some((part) =>
        ["image", "localImage", "file"].includes(part.type),
      ),
  ),
);
if (!attachment) throw new Error("No real attachment turn in this source");
const attachmentId = attachment.id.split(":steer:")[0];
const evidence = audit.items.filter((item) => item.turnId === attachmentId);
const userLine = evidence.find(
  (item) => item.mappedType === "userMessage",
).line;
const finalLine = evidence.find(
  (item) =>
    item.mappedType === "agentMessage" &&
    JSON.parse(sourceLines[item.line - 1]).payload.item.phase ===
      "final_answer",
)?.line;
const endLine =
  sourceLines.findIndex((line) => {
    try {
      const p = JSON.parse(line).payload;
      return p?.type === "task_complete" && p.turn_id === attachmentId;
    } catch {
      return false;
    }
  }) + 1;
if (!finalLine || !endLine)
  throw new Error("Attachment turn has no complete final-answer checkpoints");
const short = [...parsed.readThread.turns]
  .filter(
    (turn) =>
      !turn.continuesPreviousTurn &&
      turn.timing?.workStartedAt &&
      turn.timing?.finalAnswerStartedAt,
  )
  .sort(
    (a, b) =>
      a.timing.finalAnswerStartedAt -
      a.timing.workStartedAt -
      (b.timing.finalAnswerStartedAt - b.timing.workStartedAt),
  )[0];
const checkpoints = [
  {
    id: "source-history",
    title: "Codex 实录 · 全部历史",
    throughLine: audit.lastCompletedLine,
  },
  {
    id: "attachment-input",
    title: "Codex 实录 · 附件输入",
    turnId: attachmentId,
    throughLine: userLine,
  },
  {
    id: "attachment-process",
    title: "Codex 实录 · 执行过程",
    turnId: attachmentId,
    throughLine: finalLine - 1,
  },
  {
    id: "attachment-answer",
    title: "Codex 实录 · 最终回答已记录",
    turnId: attachmentId,
    throughLine: finalLine,
  },
  {
    id: "attachment-complete",
    title: "Codex 实录 · 附件任务完成",
    turnId: attachmentId,
    throughLine: endLine,
  },
  {
    id: "short-complete",
    title: "Codex 实录 · 较短任务",
    turnId: short.id,
    throughLine: audit.lastCompletedLine,
  },
];
const sessions = checkpoints.map((point, index) => {
  const row = JSON.parse(sourceLines[point.throughLine - 1]);
  const clockAt = Date.parse(row.timestamp);
  return {
    id: "codex-replay-" + point.id,
    title: point.title,
    updatedAt: Date.now() + index,
    cwd: parsed.cwd,
    messages: [],
    codexReplay: {
      source: frozen,
      sourceSha256: audit.sourceSha256,
      throughLine: point.throughLine,
      turnId: point.turnId,
      clockAt,
    },
  };
});
const expected = Object.fromEntries(
  sessions.map((session) => [
    session.id,
    readStoredJsonlReplay(session, { limit: 10000 }),
  ]),
);
const home = mkdtempSync(join(tmpdir(), "marloues-real-codex-"));
for (const dir of ["config", "electron-user-data"])
  mkdirSync(join(home, dir), { recursive: true });
writeFileSync(
  join(home, "electron-user-data/config.json"),
  JSON.stringify({ settings: { maxSessions: 500 }, sessions }),
);
writeFileSync(
  join(home, "config/workspaces.json"),
  JSON.stringify({
    currentWorkspaceId: "real-codex",
    workspaces: [
      {
        id: "real-codex",
        name: "Codex 真实会话对照",
        path: parsed.cwd,
        lastOpenedAt: Date.now(),
      },
    ],
  }),
);
writeFileSync(
  join(home, "config/settings.json"),
  JSON.stringify({
    agentSettings: {
      providers: [],
      mcpServers: [],
      disabledSkills: [],
      skillDirectories: [],
      autoMemoryEnabled: false,
      desktopNotificationsEnabled: false,
      activeRuntimeId: "sdk",
    },
  }),
);
writeFileSync(join(artifacts, "audit.json"), JSON.stringify(audit, null, 2));
writeFileSync(
  join(artifacts, "snapshot.json"),
  JSON.stringify(parsed.readThread),
);
const { output } = JSON.parse(
  readFileSync(
    join(root, "client/test-results/conversation-details/build.json"),
    "utf8",
  ),
);
for (const [from, to] of [
  [join(root, "client/node_modules"), join(output, "node_modules")],
  [join(root, "node_modules"), join(output, "main/node_modules")],
]) {
  try {
    symlinkSync(from, to);
  } catch (error) {
    if (error.code !== "EEXIST" || realpathSync(from) !== realpathSync(to))
      throw error;
  }
}
const manifest = {
  recordedAt: new Date().toISOString(),
  originalSource: source || "previous frozen source.jsonl",
  frozenSource: frozen,
  sourceSha256: audit.sourceSha256,
  sourceThreadId: parsed.sessionId,
  sourceThroughLine: audit.throughLine,
  home,
  build: output,
  checkpoints,
  coverage: {
    turns: parsed.readThread.turns.length,
    canonicalRecords: audit.items.length,
    unknown: audit.items.filter((item) => item.mappedType === "unknown"),
    unsupportedContent: audit.items.filter(
      (item) => item.unsupportedContent.length,
    ),
    retainedInSourceFields: [
      ...new Set(audit.items.flatMap((item) => item.retainedInSourceFields)),
    ],
  },
  codexUi: {
    status: nativeMatchesSource
      ? "native-attachment-comparison-recorded"
      : "no-matching-native-baseline",
    note: "See native-comparison.json for the observed same-message rules and remaining gaps. JSONL checkpoints do not contain token deltas or historical UI clicks.",
  },
};
writeFileSync(
  join(artifacts, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
const results = [],
  errors = [];
let app, page;
const capture = async (name) => {
  await page.screenshot({ path: join(artifacts, name + ".png") });
  return name + ".png";
};
const choose = async (point) => {
  await page
    .locator(".session-title-text")
    .filter({ hasText: checkpoints.find((p) => p.id === point).title })
    .click();
  await expect(
    page.getByRole("region", { name: "真实会话回放" }),
  ).toHaveAttribute(
    "data-replay-line",
    String(checkpoints.find((p) => p.id === point).throughLine),
  );
};
const check = async (id, callback) => {
  try {
    const evidence = await callback();
    results.push({ id, status: "passed", evidence: evidence ?? [] });
    console.log("PASS " + id);
  } catch (error) {
    results.push({
      id,
      status: "failed",
      error: String(error),
      evidence: [await capture("FAIL-" + id)],
    });
    console.error("FAIL " + id + " " + String(error));
  }
};
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
      NODE_PATH:
        join(root, "node_modules") + ":" + join(root, "client/node_modules"),
    },
    timeout: 30000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
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
  await check("canonical-source-through-production-ipc", async () => {
    for (const session of sessions) {
      const actual = await page.evaluate(
        (id) => window.marloues.chat.readThread(id, { limit: 10000 }),
        session.id,
      );
      const shape = (snapshot) =>
        snapshot.turns.map((turn) => ({
          id: turn.id,
          status: turn.status,
          timing: turn.timing,
          durationMs: turn.durationMs,
          items: turn.items.map((item) => ({
            id: item.id,
            type: item.type,
            phase: item.phase,
          })),
        }));
      expect(shape(actual)).toEqual(shape(expected[session.id]));
      expect(actual.replay.sourceSha256).toBe(audit.sourceSha256);
    }
  });
  for (const point of checkpoints.filter(
    (point) => point.id !== "source-history",
  )) {
    await check("recorded-checkpoint-" + point.id, async () => {
      await choose(point.id);
      const snapshot = expected["codex-replay-" + point.id];
      const turn = snapshot.turns[0];
      await expect(
        page.locator('[data-message-id="' + turn.id + '"]'),
      ).toBeAttached();
      await page.locator(".messages-scroll").evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect(page.locator(".composer textarea")).toHaveCount(0);
      const hasFinal = turn.items.some(
        (item) => item.type === "agentMessage" && item.phase === "final_answer",
      );
      if (point.id === "attachment-input") {
        await expect(
          page.locator(".workflow-user-message-images img"),
        ).toHaveCount(1);
        await expect(
          page.locator(".workflow-user-attachment-pill"),
        ).toHaveCount(0);
        expect(hasFinal).toBe(false);
      }
      if (point.id === "attachment-process") expect(hasFinal).toBe(false);
      if (
        point.id === "attachment-answer" ||
        point.id === "attachment-complete"
      )
        expect(hasFinal).toBe(true);
      return [await capture(point.id)];
    });
  }
  await check("real-attachment-preview-focus-and-widths", async () => {
    const evidence = [];
    for (const width of [1440, 960]) {
      await page.setViewportSize({ width, height: 980 });
      await choose("attachment-input");
      const image = page.locator(".user-image-chip").first();
      await expect
        .poll(() =>
          image
            .locator("img")
            .evaluate((e) => e.complete && e.naturalWidth > 0),
        )
        .toBe(true);
      await image.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect
        .poll(() =>
          page
            .getByRole("dialog")
            .locator("img")
            .evaluate((e) => e.complete && e.naturalWidth > 0),
        )
        .toBe(true);
      evidence.push(await capture("real-attachment-preview-" + width));
      await page.keyboard.press("Escape");
      await expect(image).toBeFocused();
      expect(
        await page
          .locator(".messages-scroll")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      evidence.push(await capture("real-attachment-" + width));
    }
    return evidence;
  });
  await check("recorded-clock-frozen-and-placement", async () => {
    await page.setViewportSize({ width: 1440, height: 980 });
    await choose("attachment-process");
    // Capture actual header text and ensure re-rendering does not advance the clock.
    const selectors =
      '.workflow-turn-header, .workflow-process-disclosure, [data-kind="turn-status"]';
    await expect(page.locator(".workflow-turn-header").first()).toBeVisible();
    const before = await page.locator(selectors).allTextContents();
    expect(before.length).toBeGreaterThan(0);
    await page.reload();
    await expect(
      page.getByRole("region", { name: "真实会话回放" }),
    ).toBeVisible();
    await expect
      .poll(() => page.locator(selectors).allTextContents())
      .toEqual(before);
    await choose("attachment-complete");
    const toggle = page
      .locator('[data-kind="turn-header"][aria-expanded]')
      .first();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const header = page.locator(".workflow-turn-header").first();
    expect(
      await header.evaluate((element) => {
        const turn = element.closest('[data-kind="assistant-turn"]');
        const process = turn.querySelector('[data-block-kind="process"]');
        const answer = turn.querySelector('[data-block-kind="document"]');
        return Boolean(
          process &&
          answer &&
          element.compareDocumentPosition(process) &
            Node.DOCUMENT_POSITION_FOLLOWING &&
          !answer.contains(element),
        );
      }),
    ).toBe(true);
    if (nativeMatchesSource) {
      const baseline = nativeComparison.observations.find(
        (row) => row.id === "duration",
      );
      await expect(header.locator(".workflow-turn-duration")).toHaveText(
        baseline.nativeDurationLabel.replace(/^用时 /, ""),
      );
    }
    await header.scrollIntoViewIfNeeded();
    return [await capture("real-process-expanded")];
  });
  await check("real-inspected-image-groups-and-result-placement", async () => {
    const evidence = [];
    for (const width of [1440, 960]) {
      await page.setViewportSize({ width, height: 980 });
      await choose("attachment-complete");
      const processToggle = page
        .locator('[data-kind="turn-header"][aria-expanded]')
        .first();
      if ((await processToggle.getAttribute("aria-expanded")) !== "true")
        await processToggle.click();
      await expect(page.locator(".workflow-result-image-card")).toHaveCount(0);
      const group = page.locator('[data-activity-kind="imageView"]').first();
      const toggle = group.locator(":scope > button");
      await expect(toggle).toContainText("已查看 2 张图像");
      if ((await toggle.getAttribute("aria-expanded")) !== "true")
        await toggle.click();
      const thumbs = group
        .getByRole("group", { name: "已检查的图像" })
        .getByRole("button");
      await expect(thumbs).toHaveCount(2);
      await toggle.scrollIntoViewIfNeeded();
      for (const thumb of await thumbs.all()) {
        await expect
          .poll(() =>
            thumb
              .locator("img")
              .evaluate((e) => e.complete && e.naturalWidth > 0),
          )
          .toBe(true);
        const box = await thumb.boundingBox();
        expect(box.width).toBe(80);
        expect(box.height).toBe(80);
      }
      evidence.push(await capture("real-inspected-images-" + width));
      await thumbs.first().click();
      const dialog = page.getByRole("dialog");
      const firstSrc = await dialog.locator("img").getAttribute("src");
      await expect(
        dialog.getByRole("button", { name: "上一张图片" }),
      ).toHaveCount(0);
      await page.keyboard.press("ArrowLeft");
      await expect(dialog.locator("img")).toHaveAttribute("src", firstSrc);
      evidence.push(await capture("real-inspected-preview-" + width));
      await page.keyboard.press("ArrowRight");
      await expect(dialog.locator("img")).not.toHaveAttribute("src", firstSrc);
      const lastSrc = await dialog.locator("img").getAttribute("src");
      await expect(
        dialog.getByRole("button", { name: "下一张图片" }),
      ).toHaveCount(0);
      await page.keyboard.press("ArrowRight");
      await expect(dialog.locator("img")).toHaveAttribute("src", lastSrc);
      await page.keyboard.press("Escape");
      await expect(thumbs.first()).toBeFocused();
      await processToggle.click();
      await expect(group).toHaveCount(0);
      await processToggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(thumbs).toHaveCount(0);
      await toggle.click();
      await expect(thumbs).toHaveCount(2);
      await toggle.click();
      await expect(thumbs).toHaveCount(0);
      await processToggle.click();
      await expect(page.locator(".workflow-user-attachment-pill")).toHaveCount(
        0,
      );
      expect(
        await page
          .locator(".messages-scroll")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      await page.locator(".messages-scroll").evaluate((e) => {
        e.scrollTop = 0;
      });
      evidence.push(await capture("real-completed-collapsed-" + width));
    }
    return evidence;
  });
  await check("read-only-import-rejects-execution", async () => {
    const result = await page.evaluate(async (id) => {
      try {
        await window.marloues.chat.send({
          sessionId: id,
          text: "should not execute",
          clientMessageId: "replay-rejected",
        });
        return "unexpected-success";
      } catch (error) {
        return String(error);
      }
    }, sessions[0].id);
    expect(result).toContain("只读");
    expect(errors).toEqual([]);
  });
} finally {
  writeFileSync(
    join(artifacts, "results.json"),
    JSON.stringify(
      { ...manifest, recordedAt: new Date().toISOString(), results, errors },
      null,
      2,
    ),
  );
  const files = results.flatMap((result) =>
    result.evidence.map((file) => ({
      file,
      check: result.id,
      status: result.status,
      sha256: createHash("sha256")
        .update(readFileSync(join(artifacts, file)))
        .digest("hex"),
    })),
  );
  writeFileSync(
    join(artifacts, "screenshots.json"),
    JSON.stringify(files, null, 2),
  );
  if (
    app &&
    process.argv.includes("--open") &&
    results.every((result) => result.status === "passed")
  ) {
    await page.setViewportSize({ width: 1440, height: 980 });
    await choose("attachment-complete");
    await page.locator(".messages-scroll").evaluate((e) => {
      e.scrollTop = 0;
    });
    console.log(
      "OPEN " + JSON.stringify({ home, build: output, pid: app.process().pid }),
    );
    await new Promise((resolve) => app.on("close", resolve));
  } else if (app) await app.close();
}
if (results.some((result) => result.status === "failed")) process.exitCode = 1;
console.log(
  JSON.stringify({
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    artifacts,
  }),
);
