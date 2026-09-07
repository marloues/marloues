/** Rare host notifications use the real Electron IPC and production page.
 * These checks validate rendering and UI callbacks; they do not claim a model
 * generated the injected notifications. */
export async function boundaryChecks({
  app,
  page,
  check,
  choose,
  snapshot,
  expect,
  expandProcess,
}) {
  const event = async (payload) =>
    app.evaluate(
      ({ BrowserWindow }, payload) =>
        BrowserWindow.getAllWindows()[0].webContents.send(
          "chat:event",
          payload,
        ),
      payload,
    );
  const sessionId = "qa-child",
    turnId = "turn-child";
  await check("host-context-usage-levels-keyboard-tooltip", async () => {
    await choose("child");
    for (const [percentage, level] of [
      [20, "ok"],
      [85, "warning"],
      [98, "critical"],
    ]) {
      await event({
        type: "context.usage",
        sessionId,
        turnId,
        usage: {
          totalTokens: percentage * 1000,
          maxTokens: 100000,
          percentage,
        },
      });
      const ring = page.getByLabel("上下文用量 " + percentage + "%", {
        exact: true,
      });
      await expect(ring).toHaveClass(new RegExp("level-" + level));
      await ring.focus();
      await expect(page.locator(".context-usage-tooltip")).toBeVisible();
      await expect(page.locator(".context-usage-tooltip")).toContainText(
        percentage + "K",
      );
      await snapshot("context-" + level);
    }
  });
  await check("host-task-progress-active-failure-completion", async () => {
    await choose("child");
    for (const [index, status] of [
      "completed",
      "running",
      "creating",
    ].entries())
      await event({
        type: "execution.task.update",
        sessionId,
        turnId,
        taskId: "step-" + index,
        title: "真实组件步骤 " + index,
        status,
        timestamp: Date.now(),
        ordinal: index,
      });
    const progress = page.getByRole("button", { name: "第 2 / 3 步" });
    await progress.focus();
    await expect(page.getByRole("dialog", { name: "任务列表" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "任务列表" })).toContainText(
      "1/3",
    );
    await event({
      type: "execution.task.update",
      sessionId,
      turnId,
      taskId: "step-1",
      title: "真实组件步骤 1",
      status: "failed",
      timestamp: Date.now(),
    });
    await expect(page.getByRole("dialog", { name: "任务列表" })).toContainText(
      "真实组件步骤 1",
    );
    await event({
      type: "execution.task.update",
      sessionId,
      turnId,
      taskId: "step-2",
      title: "真实组件步骤 2",
      status: "completed",
      timestamp: Date.now(),
    });
    await snapshot("task-progress-failed-step");
  });
  await check("host-context-action-dismiss-source-isolation", async () => {
    await choose("child");
    await event({
      type: "context.compaction",
      sessionId,
      turnId,
      phase: "blocked",
      reason: "preflight",
      actionRequest: {
        id: "context-boundary",
        sessionId,
        reason: "context_too_large",
        title: "上下文验收提示",
        detail: "保留原正文",
        actions: [
          "create_small_model_branch",
          "new_session",
          "continue_anyway",
        ],
      },
    });
    await expect(
      page.getByRole("group", { name: "上下文验收提示" }),
    ).toBeVisible();
    for (const label of ["创建精简分支", "新会话", "继续发送"])
      await expect(
        page
          .getByRole("group", { name: "上下文验收提示" })
          .getByRole("button", { name: label, exact: true }),
      ).toBeEnabled();
    await choose("markdown");
    await expect(
      page.getByRole("group", { name: "上下文验收提示" }),
    ).toHaveCount(0);
    await choose("child");
    await page.getByRole("button", { name: "关闭上下文提示" }).click();
    await expect(
      page.getByRole("group", { name: "上下文验收提示" }),
    ).toHaveCount(0);
  });
  await check("composer-slash-keyboard-and-mention-selection", async () => {
    await choose("child");
    const input = page.getByPlaceholder("随心输入");
    await input.fill("/");
    await expect(page.getByRole("listbox", { name: "斜杠命令" })).toBeVisible();
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(input).toHaveValue(/\/compact/);
    await input.fill("@evidence");
    await expect(page.getByRole("listbox", { name: "输入建议" })).toBeVisible();
    await input.press("Enter");
    await expect(page.locator(".composer-attachments")).toContainText(
      "evidence.ts",
    );
    await page.getByRole("button", { name: "移除文件引用" }).click();
    await input.fill("");
    await snapshot("composer-after-reference-removal");
  });
  await check(
    "composer-browser-comment-group-preview-single-remove",
    async () => {
      await choose("child");
      const payloads = [1, 2].map((commentId) => ({
        type: "browserComment",
        commentId,
        ref: "qa-" + commentId,
        tagName: "DIV",
        text: "页面区域 " + commentId,
        comment: "批注 " + commentId,
        rect: { x: 0, y: 0, width: 100, height: 50 },
        viewport: { width: 800, height: 600 },
        scrollX: 0,
        scrollY: 0,
        attributes: {},
        pageUrl: "https://example.com/qa",
      }));
      for (const payload of payloads) {
        await page.evaluate(
          (payload) =>
            window.dispatchEvent(
              new CustomEvent("browser:send-to-agent", {
                detail: { pageId: "qa-page", type: "comment", payload },
              }),
            ),
          payload,
        );
        await expect(
          page.getByRole("button", {
            name: "页面批注，" + payload.commentId + " 条",
            exact: true,
          }),
        ).toBeVisible();
      }
      const trigger = page.getByRole("button", {
        name: "页面批注，2 条",
        exact: true,
      });
      await expect(trigger).toBeVisible();
      await trigger.click();
      await expect(
        page.locator(".composer-browser-review-popover"),
      ).toContainText("批注 2");
      await page.keyboard.press("Escape");
      await expect(
        page.locator(".composer-browser-review-popover"),
      ).toHaveCount(0);
      await trigger.click();
      await page.getByRole("button", { name: "移除第 1 条页面注释" }).click();
      await expect(
        page.getByRole("button", { name: "页面批注，1 条", exact: true }),
      ).toBeVisible();
      await snapshot("browser-comment-single-remaining");
    },
  );
  await check("composer-model-select-persist-escape", async () => {
    await choose("child");
    const trigger = page.locator(".model-chip");
    await trigger.click();
    const menu = page.getByRole("menu", { name: "选择模型" });
    await expect(menu.getByRole("menuitemradio")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await menu.getByRole("menuitemradio", { name: /验收模型二/ }).click();
    await expect(trigger).toContainText("验收模型二");
    await page.reload();
    await choose("child");
    await expect(trigger).toContainText("验收模型二");
    await trigger.click();
    await menu.getByRole("menuitemradio", { name: /验收模型一/ }).click();
    await snapshot("model-selector-persisted");
  });
  await check("composer-full-access-confirm-focus-escape-persist", async () => {
    await choose("child");
    const open = async () => {
      await page.getByRole("button", { name: /^权限：/ }).click();
      await page.getByRole("menuitemradio", { name: /完全访问/ }).click();
    };
    await open();
    const dialog = page.getByRole("alertdialog", {
      name: "要开启完全访问权限吗？",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "取消", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "确认", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "取消", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "权限：请求批准", exact: true }),
    ).toBeFocused();
    await open();
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await open();
    await dialog.getByRole("button", { name: "确认", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "权限：完全访问", exact: true }),
    ).toBeVisible();
    await page.reload();
    await choose("child");
    await expect(
      page.getByRole("button", { name: "权限：完全访问", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^权限：/ }).click();
    await page.getByRole("menuitemradio", { name: /^请求批准/ }).click();
    await snapshot("permission-mode-restored");
  });
  await check("generic-tool-cancel-unsupported-visible-retry", async () => {
    await choose("dynamic-running");
    await expandProcess();
    const row = page
      .locator('.workflow-activity-row-button[aria-expanded="false"]')
      .first();
    if (await row.count()) await row.click();
    const button = page.getByRole("button", { name: "取消", exact: true });
    await button.click();
    await expect(page.getByRole("alert")).toContainText(
      "does not support tool cancellation",
    );
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toBeEnabled();
    await snapshot("tool-cancel-unsupported");
  });
  await check(
    "host-permission-panel-file-preview-three-responses",
    async () => {
      await choose("child");
      await app.evaluate(({ ipcMain }) => {
        globalThis.__qaPermissionResponses = [];
        ipcMain.on("chat:permission-response", (_event, value) => {
          if (value.requestId.startsWith("qa-permission-"))
            globalThis.__qaPermissionResponses.push(value);
        });
      });
      for (const [index, label, approved, scope] of [
        [0, "拒绝", false, "once"],
        [1, "允许一次", true, "once"],
        [2, "允许此任务", true, "session"],
      ]) {
        const id = "qa-permission-" + index;
        await app.evaluate(
          ({ BrowserWindow }, id) =>
            BrowserWindow.getAllWindows()[0].webContents.send(
              "chat:permission-request",
              {
                id,
                sessionId: "qa-child",
                turnId: "turn-child",
                toolName: "Edit",
                reason: "验证权限入口",
                inputSummary: JSON.stringify({
                  file_path: "/qa/evidence.ts",
                  old_string: "const n = 1;",
                  new_string: "const n = 2;",
                }),
                options: {
                  allowOnce: true,
                  allowSession: true,
                  denyWithReason: true,
                },
              },
            ),
          id,
        );
        const dialog = page.getByRole("dialog", {
          name: "允许 Marloues 修改文件？",
        });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "允许一次", exact: true }),
        ).toBeFocused();
        const preview = dialog.getByRole("button", {
          name: "预览 evidence.ts 的变更",
        });
        await preview.focus();
        await expect(dialog.getByRole("tooltip")).toBeVisible();
        await expect(dialog.getByRole("tooltip")).toContainText("const n = 2;");
        await snapshot("permission-file-" + index);
        await dialog.getByRole("button", { name: label, exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect
          .poll(() =>
            app.evaluate(() => globalThis.__qaPermissionResponses.at(-1)),
          )
          .toEqual({ requestId: id, approved, scope });
      }
    },
  );
  await check(
    "host-context-actions-real-model-fork-new-and-retry-error",
    async () => {
      const actions = [
        ["switch_to_larger_model", "切换到大模型"],
        ["create_small_model_branch", "创建精简分支"],
        ["new_session", "新会话"],
        ["continue_anyway", "继续发送"],
      ];
      for (const [action, label] of actions) {
        await choose("child");
        const before = await page.evaluate(() =>
          window.marloues.chat.listSessions(),
        );
        await event({
          type: "context.compaction",
          sessionId,
          turnId,
          phase: "blocked",
          reason: "preflight",
          actionRequest: {
            id: "context-" + action,
            sessionId,
            reason: "context_too_large",
            title: "上下文动作验收",
            actions: [action],
            largerModel: { providerId: "qa-ui-provider", modelId: "qa-second" },
          },
        });
        const card = page.getByRole("group", { name: "上下文动作验收" });
        await card.getByRole("button", { name: label, exact: true }).click();
        await expect(card).toHaveCount(0);
        if (action === "switch_to_larger_model")
          await expect(page.locator(".model-chip")).toContainText("验收模型二");
        if (action === "create_small_model_branch")
          await expect
            .poll(
              async () =>
                (await page.evaluate(() => window.marloues.chat.listSessions()))
                  .length,
            )
            .toBe(before.length + 1);
        if (action === "new_session")
          await expect(page.locator(".chat-page-empty")).toBeVisible();
        if (action === "continue_anyway")
          await expect
            .poll(async () => {
              const read = await page.evaluate(() =>
                window.marloues.chat.readThread("qa-child"),
              );
              return read.turns[0]?.status;
            })
            .toBe("failed");
      }
      await snapshot("context-retry-failure");
    },
  );
  await check(
    "composer-skill-url-attachments-and-keyboard-newlines",
    async () => {
      await choose("child");
      const input = page.getByPlaceholder("随心输入");
      await input.fill("$qa-verify");
      await expect(
        page.getByRole("listbox", { name: "输入建议" }),
      ).toBeVisible();
      await input.press("Escape");
      await expect(page.getByRole("listbox", { name: "输入建议" })).toHaveCount(
        0,
      );
      await expect(input).toHaveValue("$qa-verify");
      await input.press("End");
      await expect(
        page.getByRole("listbox", { name: "输入建议" }),
      ).toBeVisible();
      await input.press("Enter");
      await expect(page.locator(".composer-attachments")).toContainText(
        "qa-verify",
      );
      await page.getByRole("button", { name: "移除技能" }).click();
      await input.fill("");
      await app.evaluate(({ clipboard }) =>
        clipboard.writeText("https://example.com/qa-attachment"),
      );
      await input.focus();
      await input.press("Meta+V");
      await expect(page.locator(".composer-attachments")).toContainText(
        "example.com",
      );
      await page.getByRole("button", { name: "移除链接" }).click();
      await input.fill("第一行");
      await input.press("Shift+Enter");
      await input.press("Control+Enter");
      await expect(input).toHaveValue("第一行\n\n");
      await input.fill("拼音候选");
      await input.evaluate((el) =>
        el.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            isComposing: true,
          }),
        ),
      );
      await expect(input).toHaveValue("拼音候选");
      await input.fill("");
      await snapshot("composer-attachments-keyboard");
    },
  );
  await check(
    "host-plan-prompt-dismiss-revise-implement-and-fresh",
    async () => {
      const itemEvent = async (payload) =>
        app.evaluate(
          ({ BrowserWindow }, value) =>
            BrowserWindow.getAllWindows()[0].webContents.send(
              "chat:item-event",
              { ...value, schemaVersion: 2 },
            ),
          payload,
        );
      let sequence = 0;
      const open = async () => {
        await choose("child");
        await page.getByPlaceholder("随心输入").fill("");
        const turnId = "qa-plan-prompt-" + sequence++;
        await itemEvent({
          type: "turn.start",
          sessionId,
          turnId,
          startedAt: Date.now(),
        });
        await itemEvent({
          type: "item.updated",
          sessionId,
          turnId,
          item: {
            type: "plan",
            id: "plan-" + turnId,
            text: "1. 验收计划第一步\n2. 验收计划第二步",
            settled: true,
          },
        });
        await itemEvent({
          type: "turn.complete",
          sessionId,
          turnId,
          result: "success",
          completedAt: Date.now(),
        });
        await expect(page.locator(".plan-implementation-prompt")).toBeVisible();
      };
      await open();
      await page
        .locator(".plan-implementation-prompt")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
      await expect(page.locator(".plan-implementation-prompt")).toHaveCount(0);
      await open();
      await page
        .getByRole("button", { name: "继续修改计划", exact: true })
        .click();
      await expect(page.getByPlaceholder("随心输入")).toHaveValue(
        "继续完善这个计划：",
      );
      await page.getByPlaceholder("随心输入").fill("");
      for (const label of ["执行计划", "清空上下文执行"]) {
        await open();
        const before = await page.evaluate(() =>
          window.marloues.chat.listSessions(),
        );
        const previous = await page.evaluate(() =>
          window.marloues.chat.readThread("qa-child"),
        );
        await page.getByRole("button", { name: label, exact: true }).click();
        await expect(page.locator(".plan-implementation-prompt")).toHaveCount(
          0,
        );
        let target = "qa-child";
        if (label === "清空上下文执行") {
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
          target = after.find((s) => !before.some((b) => b.id === s.id)).id;
        }
        await expect
          .poll(async () => {
            const read = await page.evaluate(
              (id) => window.marloues.chat.readThread(id),
              target,
            );
            return (
              read.turns[0]?.id !== previous.turns[0]?.id &&
              read.turns[0]?.status === "failed"
            );
          })
          .toBe(true);
      }
      await snapshot("plan-submit-provider-failure");
    },
  );
}
