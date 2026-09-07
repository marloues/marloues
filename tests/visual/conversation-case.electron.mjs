/** Existing case -> a fresh Codex task -> unchanged JSONL -> production Marloues. */
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "../..");
const require = createRequire(join(root, "client/package.json"));
const { _electron: electron, expect } = require("@playwright/test");
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const catalogPath = join(
  root,
  "client/test-results/conversation-generated/case-plan.json",
);
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const caseId = flag("--case") || "qa-markdown";
const testCase = catalog.cases.find((c) => c.id === caseId);
if (!testCase) throw new Error("Unknown existing fixture case: " + caseId);
const runId = caseId + "-" + new Date().toISOString().replace(/[:.]/g, "-");
const artifacts = join(
  root,
  "client/test-results/conversation-generated/runs",
  runId,
);
mkdirSync(artifacts, { recursive: true });
const frozen = join(artifacts, "source.jsonl");
copyFileSync(flag("--source") || catalog.sourceJsonl, frozen);
const support = join(
  mkdtempSync(join(tmpdir(), "marloues-case-decoder-")),
  "support.cjs",
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
const parsed = parseSessionLog(frozen);
if (!parsed.audit) throw new Error("No canonical Codex records yet");
const turn = flag("--turn")
  ? parsed.readThread.turns.find((t) => t.id === flag("--turn"))
  : parsed.readThread.turns.find((t) =>
      t.items.some(
        (i) =>
          i.type === "userMessage" &&
          i.content.some((p) => p.type === "text" && p.text.includes(caseId)),
      ),
    );
if (!turn)
  throw new Error("No actual user message for this case in the source log");
const sourceRows = readFileSync(frozen, "utf8").split(/\r?\n/).filter(Boolean);
const sourceSha256 = createHash("sha256")
  .update(readFileSync(frozen))
  .digest("hex");
const clockAt = Date.parse(JSON.parse(sourceRows.at(-1)).timestamp);
const session = {
  id: "codex-case-" + caseId,
  title: "Codex 现场用例 · " + caseId,
  cwd: parsed.cwd,
  updatedAt: Date.now(),
  messages: [],
  codexReplay: {
    source: frozen,
    sourceSha256,
    throughLine: parsed.audit.throughLine,
    turnId: turn.id,
    clockAt,
  },
};
const home = mkdtempSync(join(tmpdir(), "marloues-case-"));
for (const dir of ["config", "electron-user-data"])
  mkdirSync(join(home, dir), { recursive: true });
writeFileSync(
  join(home, "electron-user-data/config.json"),
  JSON.stringify({ settings: { maxSessions: 500 }, sessions: [session] }),
);
writeFileSync(
  join(home, "config/workspaces.json"),
  JSON.stringify({
    currentWorkspaceId: "generated-case",
    workspaces: [
      {
        id: "generated-case",
        name: "现有用例 · Codex 真实执行",
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
  } catch (error) {
    if (error.code !== "EEXIST" || realpathSync(src) !== realpathSync(dst))
      throw error;
  }
}
const expected = readStoredJsonlReplay(session, { limit: 10000 });
const finals = turn.items.filter(
  (i) => i.type === "agentMessage" && i.phase === "final_answer",
);
const manifest = {
  recordedAt: new Date().toISOString(),
  caseId,
  caseTitle: testCase.title,
  fixtureSource: catalog.source,
  sourceThreadId: parsed.sessionId,
  sourceTurnId: turn.id,
  sourceStatus: turn.status,
  sourceSha256,
  frozenSource: frozen,
  throughLine: parsed.audit.throughLine,
  build: output,
  home,
  hasActualAnswer: finals.length > 0,
  status: finals.length
    ? "captured-awaiting-native-comparison"
    : "awaiting-actual-answer",
  sourceItems: turn.items.map((i) => ({
    id: i.id,
    type: i.type,
    phase: i.phase,
  })),
  checks: [],
  errors: [],
};
writeFileSync(
  join(artifacts, "snapshot.json"),
  JSON.stringify(expected, null, 2),
);
writeFileSync(
  join(artifacts, "audit.json"),
  JSON.stringify(parsed.audit, null, 2),
);
let app, page;
const capture = async (name) => {
  await page.screenshot({ path: join(artifacts, name + ".png") });
  return name + ".png";
};
const check = async (id, body) => {
  try {
    const evidence = await body();
    manifest.checks.push({ id, status: "passed", evidence: evidence || [] });
    console.log("PASS " + id);
  } catch (error) {
    manifest.checks.push({
      id,
      status: "failed",
      error: String(error),
      evidence: [await capture("FAIL-" + id)],
    });
    console.log("FAIL " + id + " " + error);
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
  page.on("pageerror", (e) => manifest.errors.push(e.message));
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
  await page
    .locator(".session-title-text")
    .filter({ hasText: session.title })
    .click();
  await expect(
    page.getByRole("region", { name: "真实会话回放" }),
  ).toBeVisible();
  await check("actual-source-through-production-ipc", async () => {
    const actual = await page.evaluate(
      (id) => window.marloues.chat.readThread(id, { limit: 10000 }),
      session.id,
    );
    expect(actual.turns).toEqual(expected.turns);
    expect(actual.replay.sourceSha256).toBe(sourceSha256);
    await expect(page.locator(".composer textarea")).toHaveCount(0);
  });
  await check("actual-input-and-output-rendered", async () => {
    await expect(page.locator('[data-kind="user-message"]')).toHaveCount(1);
    if (!finals.length)
      await expect(page.locator('[data-kind="assistant-answer"]')).toHaveCount(
        0,
      );
    else {
      const answer = page.locator('[data-kind="assistant-answer"]').last();
      await expect(answer).toBeVisible();
      expect((await answer.innerText()).trim().length).toBeGreaterThan(0);
    }
    return [await capture("marloues-overview")];
  });
  if (finals.length && caseId === "qa-markdown")
    await check("existing-markdown-case-real-output", async () => {
      const answer = page.locator('[data-kind="assistant-answer"]').last();
      for (const selector of [
        "h1",
        "h2",
        "blockquote",
        "table",
        'ol[start="4"]',
        'input[type="checkbox"]',
      ])
        await expect(answer.locator(selector).first()).toBeAttached();
      const evidence = [];
      for (const [label, selector] of [
        ["headings", "h1"],
        ["table", "table"],
        ["code", "pre"],
        ["diagram", ".mermaid"],
      ]) {
        const node = answer.locator(selector).first();
        if (await node.count()) {
          await node.scrollIntoViewIfNeeded();
          evidence.push(await capture("marloues-" + label));
        }
      }
      return evidence;
    });
  await check("no-renderer-errors", async () =>
    expect(manifest.errors).toEqual([]),
  );
} finally {
  writeFileSync(
    join(artifacts, "results.json"),
    JSON.stringify(manifest, null, 2),
  );
  const current = JSON.parse(readFileSync(catalogPath, "utf8"));
  const entry = current.cases.find((c) => c.id === caseId);
  Object.assign(entry, {
    status: manifest.status,
    sourceTurnId: turn.id,
    latestRun: "runs/" + runId,
    checks: manifest.checks.map((c) => ({ id: c.id, status: c.status })),
  });
  writeFileSync(catalogPath, JSON.stringify(current, null, 2));
  console.log(
    JSON.stringify({
      caseId,
      status: manifest.status,
      artifacts,
      sourceTurnId: turn.id,
      checks: manifest.checks.length,
    }),
  );
  if (
    app &&
    process.argv.includes("--open") &&
    manifest.checks.every((c) => c.status === "passed")
  ) {
    console.log("OPEN " + JSON.stringify({ pid: app.process().pid, home }));
    await new Promise((resolve) => app.on("close", resolve));
  } else if (app) await app.close();
}
if (manifest.checks.some((c) => c.status === "failed")) process.exitCode = 1;
