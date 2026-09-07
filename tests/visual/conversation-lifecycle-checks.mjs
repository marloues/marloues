/** Consecutive canonical snapshots through the production main/preload channel.
 * This verifies display transitions with controlled timestamps, not model output.
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export async function lifecycleChecks({
  app,
  page,
  check,
  choose,
  snapshot,
  expect,
  workspace,
  expandProcess,
}) {
  const read = () =>
    page.evaluate(() => window.marloues.chat.readThread("qa-child"));
  const push = (value) =>
    app.evaluate(
      ({ BrowserWindow }, value) =>
        BrowserWindow.getAllWindows()[0].webContents.send(
          "chat:read-thread-update",
          value,
        ),
      value,
    );
  const prepare = async () => {
    await choose("child");
    const original = await read();
    const value = structuredClone(original);
    const turn = value.turns[0];
    const user = turn.items.find((i) => i.type === "userMessage");
    turn.items = user ? [user] : [];
    turn.status = "running";
    turn.error = null;
    turn.completedAt = null;
    turn.durationMs = null;
    turn.timing = {
      basis: "host-observed",
      workStartedAt: null,
      finalAnswerStartedAt: null,
    };
    return { original, value, turn, user };
  };
  const command = (id = "lifecycle-command") => ({
    type: "commandExecution",
    id,
    command: "printf lifecycle",
    cwd: workspace,
    status: "running",
    output: { text: "生命周期输出", truncated: false },
    settled: false,
  });
  const answer = (text = "最终正文", settled = false) => ({
    type: "agentMessage",
    id: "lifecycle-answer",
    phase: "final_answer",
    text,
    settled,
  });
  const rendered = () => page.locator('[data-message-id="turn-child"]');

  await check(
    "host-timing-hidden-freeze-five-seconds-and-placement",
    async () => {
      const { original, value, turn, user } = await prepare();
      try {
        await push(value);
        await expect(rendered().locator(".workflow-turn-duration")).toHaveCount(
          0,
        );
        const work = Date.now() - 2000;
        turn.items = [...(user ? [user] : []), command("timing-command")];
        turn.timing.workStartedAt = work;
        await push(value);
        await expandProcess();
        await expect(rendered().locator(".workflow-turn-duration")).toHaveCount(
          1,
        );
        await expect(
          rendered().locator(
            '[data-block-kind="document"] .workflow-turn-header',
          ),
        ).toHaveCount(0);
        turn.timing.finalAnswerStartedAt = work + 5000;
        turn.items.push(answer("最终正文第一段"));
        await push(value);
        await expandProcess();
        await expect(rendered().locator(".workflow-turn-duration")).toHaveText(
          "5秒",
        );
        await expect(
          rendered().locator(
            '[data-block-kind="document"] .workflow-turn-header',
          ),
        ).toHaveCount(0);
        await rendered().locator(".workflow-turn-header-button").click();
        await expect(
          rendered().locator(
            '[data-block-kind="document"] .workflow-turn-header',
          ),
        ).toHaveCount(0);
        await expect(rendered().locator(".workflow-turn-duration")).toHaveCount(
          1,
        );
        turn.items[turn.items.length - 1] = answer(
          "最终正文第一段\n\n最终正文继续增长",
        );
        await push(value);
        await expect(rendered()).toContainText("最终正文继续增长");
        await expect(rendered().locator(".workflow-turn-duration")).toHaveText(
          "5秒",
        );
        turn.status = "completed";
        turn.completedAt = work + 10000;
        turn.items[turn.items.length - 1].settled = true;
        await push(value);
        await expect(rendered().locator(".workflow-turn-duration")).toHaveText(
          "5秒",
        );
        await snapshot("timing-final-frozen-five-seconds");
      } finally {
        await push(original);
      }
    },
  );

  await check("host-timing-legacy-missing-and-long-trace", async () => {
    const { original, value, turn, user } = await prepare();
    try {
      turn.status = "completed";
      turn.completedAt = Date.now();
      turn.startedAt = Date.now() - 9000;
      turn.timing = undefined;
      turn.items = [
        ...(user ? [user] : []),
        command("legacy-command"),
        answer("旧历史没有可靠工作起点", true),
      ];
      await push(value);
      await expect(rendered()).toContainText("旧历史没有可靠工作起点");
      await expect(rendered().locator(".workflow-turn-duration")).toHaveCount(
        0,
      );
      await choose("markdown");
      await choose("child");
      await push(value);
      await expect(rendered().locator(".workflow-turn-duration")).toHaveCount(
        0,
      );
      turn.status = "running";
      turn.timing = {
        basis: "host-observed",
        workStartedAt: 1000,
        finalAnswerStartedAt: 6000,
      };
      turn.items = [
        ...(user ? [user] : []),
        command("oldest-command"),
        ...Array.from({ length: 300 }, (_, i) => ({
          type: "reasoning",
          id: "long-reasoning-" + i,
          summary: "过程 " + i,
          text: "过程 " + i,
          settled: true,
        })),
        answer("长过程最终正文"),
      ];
      await push(value);
      await expect(rendered()).toContainText("长过程最终正文");
      await expect(rendered().locator(".workflow-turn-duration")).toHaveText(
        "5秒",
      );
      await snapshot("timing-300-trace-items");
    } finally {
      await push(original);
    }
  });

  await check(
    "host-command-running-to-completed-keeps-collapse-and-focus",
    async () => {
      const { original, value, turn, user } = await prepare();
      try {
        const item = command();
        turn.items = [...(user ? [user] : []), item];
        await push(value);
        await expandProcess();
        const row = rendered().locator(
          '[data-activity-kind="commandExecution"]',
        );
        const toggle = row.locator("button[aria-expanded]");
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.click();
        await expect(row.locator(".workflow-command-status")).toContainText(
          "运行中",
        );
        await toggle.click();
        Object.assign(item, {
          status: "completed",
          exitCode: 0,
          durationMs: 4200,
          settled: true,
        });
        await push(value);
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(row.locator(".workflow-activity-detail")).toHaveCount(0);
        await toggle.focus();
        await toggle.press("Enter");
        await expect(row.locator(".workflow-command-status")).toContainText(
          "成功",
        );
        await toggle.press("Enter");
        await choose("markdown");
        await choose("child");
        await push(value);
        await expandProcess();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(
          row.locator(".workflow-activity-detail button"),
        ).toHaveCount(0);
        await snapshot("command-lifecycle-closed-after-completion");
      } finally {
        await push(original);
      }
    },
  );

  await check("host-media-failed-source-to-valid-source-recovers", async () => {
    const { original, value, turn, user } = await prepare();
    try {
      turn.status = "completed";
      const media = (name) =>
        answer(
          "![换源图片](" + pathToFileURL(join(workspace, name)).href + ")",
          true,
        );
      turn.items = [...(user ? [user] : []), media("does-not-exist.svg")];
      await push(value);
      await expect(rendered().getByText("换源图片暂不可用")).toBeVisible();
      turn.items[turn.items.length - 1] = media("image.svg");
      await push(value);
      const preview = rendered().getByRole("button", { name: "预览换源图片" });
      await expect(preview).toBeEnabled();
      await expect(rendered().getByText("换源图片暂不可用")).toHaveCount(0);
      await preview.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(preview).toBeFocused();
      await snapshot("media-recovered-after-source-change");
    } finally {
      await push(original);
    }
  });
}
