/** Real task observer for an already-running local Electron development app.
 * Usage: node tests/smoke/conversation-long-tasks.probe.mjs PROMPT_FILE RUN_NAME
 * Uses the normal composer; never fabricates runtime events or approvals.
 * Evidence is retained under test-artifacts; no cleanup/deletion is performed.
 */
import { createRequire } from "node:module";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const require = createRequire(join(root, "client/package.json"));
const { chromium } = require("playwright");
const [promptFile, runName, mode] = process.argv.slice(2);
if (!promptFile || !/^[a-z0-9-]+$/.test(runName ?? ""))
  throw new Error("Expected prompt file and simple run name");
const artifacts = join(
  root,
  "test-artifacts/real-long-tasks-20260905",
  runName,
);
mkdirSync(artifacts, { recursive: true });
const prompt = readFileSync(promptFile, "utf8");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url() === "http://127.0.0.1:5173/");
if (!page) throw new Error("Marloues development window is not open");
const errors = [];
page.on("pageerror", (error) =>
  errors.push({ time: Date.now(), message: error.message }),
);
page.on("crash", () => {
  writeFileSync(
    join(artifacts, "renderer-crash.json"),
    JSON.stringify({ time: Date.now(), errors }),
  );
});
page.on("console", (message) => {
  if (message.type() === "error")
    errors.push({ time: Date.now(), message: message.text() });
});

await page.evaluate(() => {
  window.__realTaskProbe?.unsubscribe?.forEach((fn) => fn());
  const probe = (window.__realTaskProbe = {
    sessionId: null,
    turnId: null,
    startedAt: Date.now(),
    events: [],
    eventCount: 0,
    snapshots: [],
    terminal: null,
    unsubscribe: [],
  });
  const record = (channel, event) => {
    probe.eventCount += 1;
    const compact = JSON.parse(
      JSON.stringify(event, (_key, value) =>
        typeof value === "string" && value.length > 2000
          ? `${value.slice(0, 2000)}…[probe truncated]`
          : value,
      ),
    );
    probe.events.push({ time: Date.now(), channel, event: compact });
    if (probe.events.length > 1000) probe.events.shift();
  };
  probe.unsubscribe.push(
    window.marloues.chat.onItemEvent((event) => {
      if (!probe.sessionId && event.type === "turn.start") {
        probe.sessionId = event.sessionId;
        probe.turnId = event.turnId;
      }
      if (event.sessionId !== probe.sessionId) return;
      record("item", event);
      if (event.type === "turn.complete" && event.final !== false)
        probe.terminal = { time: Date.now(), ...event };
    }),
  );
  probe.unsubscribe.push(
    window.marloues.chat.onEvent((event) => {
      if (event.sessionId === probe.sessionId) record("ui", event);
    }),
  );
  probe.unsubscribe.push(
    window.marloues.chat.onReadThread((snapshot) => {
      if (snapshot?.thread.id !== probe.sessionId) return;
      const turn = snapshot.turns.find((turn) => turn.id === probe.turnId);
      probe.snapshots.push({
        time: Date.now(),
        turnId: turn?.id,
        status: turn?.status,
        count: turn?.items.length,
        textChars: turn?.items
          .filter((item) => item.type === "agentMessage")
          .reduce((n, item) => n + item.text.length, 0),
      });
      if (probe.snapshots.length > 1000) probe.snapshots.shift();
    }),
  );
});

if (mode !== "continue")
  await page.getByRole("button", { name: /^新建会话/ }).click();
await page.getByPlaceholder("随心输入").fill(prompt);
await page.getByRole("button", { name: "发送消息", exact: true }).click();
const samples = [];
let lastReport = 0;
let screenshotSequence = 0;
let named = false;
let final;
const began = Date.now();
for (;;) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const sample = await page.evaluate(() => {
    const probe = window.__realTaskProbe;
    if (!probe) return { lostObserver: true };
    const visible = (element) =>
      (element.getClientRects().length > 0 ||
        (getComputedStyle(element).display === "contents" &&
          [...element.children].some(visible))) &&
      getComputedStyle(element).visibility !== "hidden";
    const scroll = document.querySelector(".messages-scroll");
    const turns = [
      ...document.querySelectorAll('[data-kind="workflow-turn"]'),
    ].map((turn) => ({
      expanded: turn.getAttribute("data-turn-expanded"),
      answers: [...turn.querySelectorAll('[data-kind="assistant-answer"]')]
        .filter(visible)
        .map((element) => element.innerText),
      blocks: [
        ...turn.querySelectorAll('[data-kind="turn-presentation-block"]'),
      ].map((element) => ({
        kind: element.getAttribute("data-block-kind"),
        visible: visible(element),
        chars: element.innerText.length,
      })),
      activityRows: [...turn.querySelectorAll('[data-kind="activity-row"]')]
        .filter(visible)
        .map((element) => ({
          kind: element.getAttribute("data-activity-kind"),
          text: element.innerText.slice(0, 120),
        })),
      errors: [...turn.querySelectorAll('[role="alert"]')]
        .filter(visible)
        .map((element) => element.innerText),
    }));
    return {
      time: Date.now(),
      elapsedMs: Date.now() - probe.startedAt,
      sessionId: probe.sessionId,
      turnId: probe.turnId,
      eventCount: probe.eventCount,
      events: probe.events.splice(0),
      snapshot: probe.snapshots.at(-1),
      terminal: probe.terminal,
      turns,
      pendingApprovals: [...document.querySelectorAll('[role="dialog"]')]
        .filter(visible)
        .map((element) => element.innerText.slice(0, 400)),
      scroll: scroll
        ? {
            top: scroll.scrollTop,
            height: scroll.scrollHeight,
            client: scroll.clientHeight,
          }
        : null,
    };
  });
  if (sample.events?.length)
    appendFileSync(
      join(artifacts, "events.jsonl"),
      sample.events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    );
  delete sample.events;
  samples.push(sample);
  writeFileSync(
    join(artifacts, "latest.json"),
    JSON.stringify(sample, null, 2),
  );
  if (sample.lostObserver)
    throw new Error("Renderer reloaded during live task; observer lost");
  if (sample.sessionId && !named) {
    if (mode !== "continue")
      await page.evaluate(
        ({ sessionId, title }) =>
          window.marloues.chat.updateSessionTitle(sessionId, title),
        { sessionId: sample.sessionId, title: `真实长任务验收 · ${runName}` },
      );
    writeFileSync(
      join(artifacts, "run.json"),
      JSON.stringify(
        {
          runName,
          prompt,
          sessionId: sample.sessionId,
          turnId: sample.turnId,
          startedAt: began,
        },
        null,
        2,
      ),
    );
    named = true;
  }
  if (Date.now() - lastReport >= 15000 || sample.terminal) {
    lastReport = Date.now();
    console.log(
      JSON.stringify({
        runName,
        elapsedSeconds: Math.round(sample.elapsedMs / 1000),
        events: sample.eventCount,
        snapshot: sample.snapshot,
        terminal: sample.terminal?.result,
        visibleAnswers: sample.turns.reduce(
          (n, turn) => n + turn.answers.length,
          0,
        ),
        visibleActivities: sample.turns.reduce(
          (n, turn) => n + turn.activityRows.length,
          0,
        ),
        approvals: sample.pendingApprovals,
      }),
    );
    await page.screenshot({
      path: join(
        artifacts,
        `screen-${String(screenshotSequence++).padStart(3, "0")}.png`,
      ),
    });
    writeFileSync(
      join(artifacts, "samples.json"),
      JSON.stringify(samples, null, 2),
    );
  }
  if (sample.terminal || Date.now() - began > 20 * 60 * 1000) {
    final = sample;
    break;
  }
}
const evidence = await page.evaluate(async () => {
  const probe = window.__realTaskProbe;
  return {
    snapshots: probe.snapshots,
    thread: probe.sessionId
      ? await window.marloues.chat.readThread(probe.sessionId)
      : null,
  };
});
writeFileSync(
  join(artifacts, "evidence.json"),
  JSON.stringify({ ...evidence, errors, final }, null, 2),
);
console.log(
  JSON.stringify({
    complete: true,
    runName,
    result: final?.terminal?.result ?? "timeout",
    artifacts,
    rendererErrors: errors.length,
  }),
);
// Only disconnect this observer's CDP socket. The user's Electron app stays open.
process.exit(final?.terminal?.result === "success" ? 0 : 2);
