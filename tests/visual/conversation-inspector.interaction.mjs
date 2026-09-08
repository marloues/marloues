import { createRequire } from "node:module";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const require = createRequire(resolve(root, "client/package.json"));
const { chromium, expect } = require("@playwright/test");
const browser = await chromium.launch(
  process.env.MARLOUES_CHROMIUM_PATH
    ? { executablePath: process.env.MARLOUES_CHROMIUM_PATH }
    : {},
);
const page = await browser.newPage({ viewport: { width: 1450, height: 950 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        window.__copiedInspectorText = text;
      },
    },
  });
});
const checks = [];
const check = async (name, action) => {
  await action();
  checks.push(name);
  console.log(`PASS ${name}`);
};
const checkSplitPane = async (panel, label, toggleLabel) => {
  const split = panel.locator("[data-split-pane]");
  const separator = panel.getByRole("separator", { name: label });
  const aside = split.locator("[data-split-pane-aside]");
  const content = split.locator("[data-split-pane-content]");
  const toggle = panel.getByRole("button", { name: toggleLabel, exact: true });
  const width = async () => (await aside.boundingBox()).width;
  const drag = async (delta) => {
    const box = await separator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + delta, box.y + 60, {
      steps: 5,
    });
    await page.mouse.up();
  };
  const initialWidth = await width();
  await drag(-70);
  await expect.poll(width).toBeCloseTo(initialWidth + 70, 0);
  await drag(30);
  await expect.poll(width).toBeCloseTo(initialWidth + 40, 0);
  await drag(-1000);
  expect((await content.boundingBox()).width).toBeGreaterThanOrEqual(159);
  await expect(separator).toBeVisible();

  const box = await separator.boundingBox();
  const root = await split.boundingBox();
  const minimum = Number(await separator.getAttribute("aria-valuemin"));
  const atMinimum = root.x + root.width - minimum - box.width / 2;
  await page.mouse.move(box.x + box.width / 2, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(atMinimum, box.y + 60, { steps: 8 });
  await expect.poll(width).toBeCloseTo(minimum, 0);
  await page.mouse.move(atMinimum + 20, box.y + 60);
  await expect(aside).toBeVisible();
  await page.mouse.move(atMinimum + 60, box.y + 60);
  await page.mouse.up();
  await expect(aside).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toBeFocused();
  await expect(panel).toBeVisible();
  expect((await content.boundingBox()).width).toBeCloseTo(root.width, 0);
  expect(await page.evaluate(() => document.body.style.cursor)).toBe("");
  expect(await page.evaluate(() => document.body.style.userSelect)).toBe("");
  await toggle.click();
  await expect(aside).toBeVisible();
  await expect.poll(width).toBeCloseTo(minimum, 0);
  await separator.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(width).toBeCloseTo(minimum + 16, 0);
  const beforeCancel = await width();
  const cancelBox = await separator.boundingBox();
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + 60);
  await page.mouse.down();
  await page.mouse.move(cancelBox.x - 50, cancelBox.y + 60);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(width).toBeCloseTo(beforeCancel, 0);
  // Restore a comfortable width for the following file/review checks.
  await drag(beforeCancel - initialWidth);
};
try {
  await page.goto(
    process.env.MARLOUES_INSPECTOR_URL ||
      "http://localhost:5173/?workflowFixture=details&fixtureSection=components&fixtureTheme=light&fixtureGroup=activities",
  );
  const reviewButton = page.getByRole("button", {
    name: "审核文件变更",
    exact: true,
  });
  await check(
    "activity gallery omits plans and approvals but retains task progress",
    async () => {
      await expect(reviewButton).toBeVisible();
      for (const title of ["任务计划", "等待审批", "已更新计划"]) {
        await expect(page.getByText(title, { exact: true })).toHaveCount(0);
      }
      await expect(
        page.getByText("ComposerTaskProgress · 步骤与文件统计", {
          exact: true,
        }),
      ).toBeVisible();
    },
  );
  await check(
    "review remains a visible button before and during hover",
    async () => {
      await expect(reviewButton).toBeVisible();
      await reviewButton.hover();
      await expect(reviewButton).toHaveCSS("opacity", "1");
      await expect(reviewButton).toHaveCSS("border-top-style", "solid");
      await page.mouse.move(0, 0);
      await expect(reviewButton).toBeVisible();
    },
  );
  await check(
    "input and output reveal independent floating copy actions",
    async () => {
      const toggle = page.getByRole("button", {
        name: /运行命令.*npm run test:unit/,
      });
      if ((await toggle.getAttribute("aria-expanded")) !== "true")
        await toggle.click();
      const card = page
        .locator('[data-kind="message-tool-io"]')
        .filter({ hasText: "正在检查组件交互…" });
      const sections = card.locator(":scope > [data-floating-actions-host]");
      await card.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await expect(
        sections.locator("[data-floating-actions]").first(),
      ).toHaveCSS("opacity", "0");
      await expect(
        sections.locator("[data-floating-actions]").last(),
      ).toHaveCSS("opacity", "0");
      for (const [index, label, text] of [
        [0, "复制输入", "npm run test:unit"],
        [1, "复制输出", "正在检查组件交互…"],
      ]) {
        const section = sections.nth(index);
        await section.hover();
        await expect(section.locator("[data-floating-actions]")).toHaveCSS(
          "opacity",
          "1",
        );
        await section.getByRole("button", { name: label, exact: true }).click();
        expect(await page.evaluate(() => window.__copiedInspectorText)).toBe(
          text,
        );
        await page
          .getByRole("button", { name: "组件展示", exact: true })
          .focus();
        await page.mouse.move(0, 0);
        await expect(section.locator("[data-floating-actions]")).toHaveCSS(
          "opacity",
          "0",
        );
      }
    },
  );
  await check(
    "manual review launch aggregates the whole session before any card is clicked",
    async () => {
      await page
        .getByRole("button", { name: "打开辅助区", exact: true })
        .click();
      await reviewButton.hover();
      await expect(
        page.getByRole("region", {
          name: "审核预览：example.css",
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "审核", exact: true })
        .last()
        .click();
      await expect(
        page.getByText("会话变更 · 3 个文件", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("此文件共 2 次修改，按发生顺序展示。"),
      ).toBeVisible();
    },
  );
  await check(
    "card reuses and activates the manually opened review tab",
    async () => {
      await reviewButton.click();
      await expect(
        page.getByRole("tab", { name: "审核", exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("tab", { name: "审核", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("button", { name: "example.css", exact: true }),
      ).toHaveAttribute("aria-current", "true");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    },
  );
  const review = page.getByRole("tabpanel", { name: "审核", exact: true });
  await check(
    "expanded auxiliary region suppresses hover previews; collapsing and reopening updates that immediately",
    async () => {
      const preview = page.getByRole("region", {
        name: "审核预览：example.css",
        exact: true,
      });
      await page.mouse.move(0, 0);
      await reviewButton.hover();
      await expect(preview).toHaveCount(0);
      await page
        .getByRole("button", { name: "收起辅助区", exact: true })
        .click();
      await page.mouse.move(0, 0);
      await reviewButton.hover();
      await expect(preview).toBeVisible();
      await page
        .getByRole("button", { name: "打开辅助区", exact: true })
        .click();
      await expect(review).toBeVisible();
      await expect(preview).toHaveCount(0);
    },
  );
  await check(
    "review split resizes, protects content minimum, collapses past the tree minimum and reopens",
    async () => {
      await checkSplitPane(review, "调整审核目录宽度", "审核文件目录树");
    },
  );
  await check(
    "review directory selects a different file and shows its actual diff",
    async () => {
      await review
        .getByRole("button", { name: "src/theme.ts", exact: true })
        .click();
      await expect(
        review.getByRole("button", { name: "src/theme.ts", exact: true }),
      ).toHaveAttribute("aria-current", "true");
      await review
        .getByRole("button", { name: "复制差异", exact: true })
        .click();
      expect(await page.evaluate(() => window.__copiedInspectorText)).toContain(
        "+  text: 'var(--text-1)',",
      );
    },
  );
  await check(
    "review filter preserves matched directory hierarchy",
    async () => {
      await review.getByRole("textbox", { name: "筛选文件" }).fill("ui/index");
      await expect(
        review.getByRole("button", { name: "src/ui/index.ts", exact: true }),
      ).toBeVisible();
      await expect(
        review.getByRole("button", { name: "example.css", exact: true }),
      ).toHaveCount(0);
      await review.getByRole("textbox", { name: "筛选文件" }).fill("");
    },
  );
  await check(
    "review opens the selected file in the same auxiliary region",
    async () => {
      await review
        .getByRole("button", { name: "打开此文件", exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name: "文件", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".workflow-file-preview")).toContainText(
        "组件展示页的示例文件",
      );
      await expect(
        page
          .getByRole("tabpanel", { name: "文件" })
          .getByRole("list", { name: "文件目录" }),
      ).toBeVisible();
    },
  );
  await check(
    "file links reuse file tab and locate the requested line",
    async () => {
      const reads = page.locator('[data-kind="file-read-row"]');
      await expect(reads.getByText("已读取", { exact: true })).toHaveCount(0);
      await expect(
        reads.getByRole("button", { name: "查看读取详情" }),
      ).toHaveCount(0);
      await expect(reads.locator("[aria-expanded]")).toHaveCount(0);
      const fileLink = page.getByRole("button", {
        name: "theme.ts:3",
        exact: true,
      });
      await expect(fileLink).not.toHaveAttribute("title");
      await fileLink.hover();
      const tooltip = page.getByRole("tooltip");
      await expect(tooltip).toHaveText("/component-gallery/src/theme.ts:3");
      await expect(tooltip).toHaveCSS("position", "fixed");
      await expect(fileLink).toHaveAttribute(
        "aria-describedby",
        await tooltip.getAttribute("id"),
      );
      await page.keyboard.press("Escape");
      await expect(tooltip).toHaveCount(0);
      await fileLink.focus();
      await expect(tooltip).toHaveText("/component-gallery/src/theme.ts:3");
      await fileLink.click();
      await expect(tooltip).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: "文件", exact: true }),
      ).toHaveCount(1);
      await expect(page.locator(".is-target-line")).toContainText(
        "text: 'var(--text-1)'",
      );
      await expect(
        page.getByRole("button", { name: "src/theme.ts", exact: true }),
      ).toBeVisible();
    },
  );
  await check(
    "file split shares drag-to-collapse behavior without closing the auxiliary tab",
    async () => {
      await checkSplitPane(
        page.getByRole("tabpanel", { name: "文件" }),
        "调整文件目录宽度",
        "文件目录树",
      );
      await expect(page.locator(".is-target-line")).toContainText(
        "text: 'var(--text-1)'",
      );
    },
  );
  await check(
    "hover previews stay suppressed with either the file or review tab active",
    async () => {
      const preview = page.getByRole("region", {
        name: "审核预览：example.css",
        exact: true,
      });
      await page.mouse.move(0, 0);
      await reviewButton.hover();
      await expect(preview).toHaveCount(0);
      await page.getByRole("tab", { name: "审核", exact: true }).click();
      await expect(preview).toHaveCount(0);
      await page.getByRole("tab", { name: "文件", exact: true }).click();
      await page.mouse.move(0, 0);
      await reviewButton.hover();
      await expect(preview).toHaveCount(0);
      await page
        .getByRole("button", { name: "收起辅助区", exact: true })
        .click();
      await page.mouse.move(0, 0);
      await reviewButton.hover();
      await expect(preview).toBeVisible();
      const cardWidth = await reviewButton.evaluate(
        (button) =>
          button.closest(".workflow-result-diff-card").getBoundingClientRect()
            .width,
      );
      await expect
        .poll(async () => (await preview.boundingBox()).width)
        .toBeCloseTo(
          Math.min(800, cardWidth, page.viewportSize().width - 24),
          0,
        );
      await page
        .getByRole("button", { name: "打开辅助区", exact: true })
        .click();
      await expect(preview).toHaveCount(0);
      await page.mouse.move(0, 0);
      await expect(preview).toHaveCount(0);
    },
  );
  await check(
    "file content and directory stay visible while switching files",
    async () => {
      const files = page.getByRole("tabpanel", { name: "文件" });
      await files.getByRole("button", { name: "ui", exact: true }).click();
      await files
        .getByRole("button", { name: "src/ui/index.ts", exact: true })
        .click();
      await expect(files.locator(".workflow-file-preview")).toContainText(
        "UI 组件入口示例",
      );
      await expect(files.getByRole("list", { name: "文件目录" })).toBeVisible();
      await files
        .getByRole("button", { name: "复制文件内容", exact: true })
        .click();
      expect(await page.evaluate(() => window.__copiedInspectorText)).toBe(
        "// UI 组件入口示例\nexport { Button } from './button';\n",
      );
    },
  );
  await check(
    "tabs and file selection are isolated between session scopes",
    async () => {
      await page.getByRole("button", { name: "内容", exact: true }).click();
      await expect(
        page.getByRole("tab", { name: "审核", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "示例文件:3", exact: true })
        .click();
      await expect(page.locator(".is-target-line")).toContainText(
        "const answer = 42;",
      );
      await page.getByRole("button", { name: "组件展示", exact: true }).click();
      await expect(
        page.getByRole("tab", { name: "审核", exact: true }),
      ).toHaveCount(1);
      await expect(page.locator(".workflow-file-preview")).toContainText(
        "UI 组件入口示例",
      );
    },
  );
  await check(
    "late file responses cannot overwrite a newer selection",
    async () => {
      await page.evaluate(async () => {
        const { useInspectorStore } =
          await import("/src/stores/inspector-store.ts");
        useInspectorStore.getState().openFile("/component-gallery/slow.ts", {
          sessionId: "component-gallery",
          readFile: () =>
            new Promise((resolve) =>
              setTimeout(() => resolve("stale response"), 150),
            ),
        });
      });
      await page
        .getByRole("button", { name: "theme.ts:3", exact: true })
        .click();
      await expect(page.locator(".is-target-line")).toContainText(
        "text: 'var(--text-1)'",
      );
      await page.waitForTimeout(200);
      await expect(page.locator(".workflow-file-preview")).not.toContainText(
        "stale response",
      );
    },
  );
  await check(
    "failed file reads show an error and the next selection recovers",
    async () => {
      await page
        .getByRole("button", { name: "missing-example.txt", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText("示例文件不存在");
      await page
        .getByRole("button", { name: "theme.ts:3", exact: true })
        .click();
      await expect(page.locator(".is-target-line")).toContainText(
        "text: 'var(--text-1)'",
      );
      await expect(page.getByRole("alert")).toHaveCount(0);
    },
  );
  await check(
    "dark theme and narrow auxiliary layout keep both panes usable",
    async () => {
      await page
        .getByRole("button", { name: "主题：深色", exact: true })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole("list", { name: "文件目录" })).toBeVisible();
      await expect(page.locator(".workflow-file-preview")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
      await page
        .getByRole("button", { name: "文件目录树", exact: true })
        .click();
      await expect(page.getByRole("list", { name: "文件目录" })).toHaveCount(0);
      await page
        .getByRole("button", { name: "文件目录树", exact: true })
        .click();
    },
  );
  await check(
    "closing only the last tab collapses the auxiliary region and keeps it closed",
    async () => {
      await page.setViewportSize({ width: 1450, height: 950 });
      await page
        .getByRole("button", { name: "关闭审核视图", exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name: "文件", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "收起辅助区", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "关闭文件视图", exact: true })
        .click();
      const reopen = page.getByRole("button", {
        name: "打开辅助区",
        exact: true,
      });
      await expect(reopen).toBeVisible();
      await expect(reopen).toBeFocused();
      await expect(
        page.getByRole("navigation", { name: "选择辅助视图" }),
      ).toBeHidden();
      await page
        .getByRole("button", { name: "主题：浅色", exact: true })
        .click();
      await page.getByRole("button", { name: "内容", exact: true }).click();
      await page.getByRole("button", { name: "组件展示", exact: true }).click();
      await expect(reopen).toBeVisible();
      await expect(page.getByRole("tab")).toHaveCount(0);
    },
  );
  await check(
    "manual reopening leaves the empty launcher available",
    async () => {
      await page
        .getByRole("button", { name: "打开辅助区", exact: true })
        .click();
      const launcher = page.getByRole("navigation", { name: "选择辅助视图" });
      await expect(launcher).toBeVisible();
      await page
        .getByRole("button", { name: "主题：暖色", exact: true })
        .click();
      await expect(launcher).toBeVisible();
      await launcher.getByRole("button", { name: "审核", exact: true }).click();
      await expect(
        page.getByRole("tabpanel", { name: "审核", exact: true }),
      ).toBeVisible();
    },
  );
  await check(
    "closing the last expanded tab restores the conversation; a file click can reopen it",
    async () => {
      await page
        .getByRole("button", { name: "展开辅助区至主视图区", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "收回辅助区至右栏", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "关闭审核视图", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "打开辅助区", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "theme.ts:3", exact: true })
        .click();
      await expect(
        page.getByRole("tabpanel", { name: "文件", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "展开辅助区至主视图区", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".is-target-line")).toContainText(
        "text: 'var(--text-1)'",
      );
    },
  );
  expect(errors).toEqual([]);
  console.log(`${checks.length} inspector interaction checks passed`);
} finally {
  await browser.close();
}
