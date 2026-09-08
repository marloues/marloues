import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const require = createRequire(resolve(root, "client/package.json"));
const { chromium, expect } = require("@playwright/test");
const output = resolve(root, "client/test-results/conversation-details");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch(
  process.env.MARLOUES_CHROMIUM_PATH
    ? { executablePath: process.env.MARLOUES_CHROMIUM_PATH }
    : {},
);
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
const expectedErrors = [];
const recordError = (text) => {
  if (
    text.includes("QA_MARKDOWN_BOUNDARY_FAILURE") ||
    text.includes("The above error occurred in the <FixtureFault> component")
  )
    expectedErrors.push(text);
  else errors.push(text);
};
page.on("pageerror", (error) => recordError(error.message));
page.on("console", (message) => {
  if (message.type() === "error") recordError(message.text());
});
await page.addInitScript(() => {
  window.marloues = {
    app: { platform: "darwin", markRendererReady: async () => {} },
    fs: {
      readFile: async (path) => {
        window.__fixtureReadPath = path;
        return "line one\nline two\nconst answer = 42;\nline four";
      },
    },
  };
});
const steps = [];
async function check(name, action) {
  await action();
  steps.push(name);
  process.stdout.write(`PASS ${name}\n`);
}
try {
  await page.goto(
    process.env.MARLOUES_DETAILS_URL ||
      "http://127.0.0.1:5191/?workflowFixture=details",
  );
  await expect(
    page.getByRole("button", { name: "展开表格", exact: true }),
  ).toBeVisible();
  await check(
    "content actions float on hover or keyboard focus without changing layout",
    async () => {
      for (const kind of [
        "markdown-table",
        "workflow-code-block",
        "mermaid-block",
      ]) {
        const block = page.locator(`[data-kind="${kind}"]`).first();
        const actions = block.locator(":scope > [data-floating-actions]");
        await block.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await expect(actions).toHaveCSS("opacity", "0");
        await expect(actions).toHaveCSS("pointer-events", "none");
        await expect(actions).toHaveCSS("position", "absolute");
        const before = await block.boundingBox();
        await block.hover();
        await expect(actions).toHaveCSS("opacity", "1");
        const after = await block.boundingBox();
        expect(after.height).toBeCloseTo(before.height, 0);
        const controls = await actions.boundingBox();
        expect(controls.x + controls.width).toBeLessThanOrEqual(
          after.x + after.width,
        );
        expect(controls.y).toBeGreaterThanOrEqual(after.y);
        expect(controls.y - after.y).toBeLessThan(10);
        await page.mouse.move(0, 0);
        await expect(actions).toHaveCSS("opacity", "0");
        await actions.getByRole("button").first().focus();
        await expect(actions).toHaveCSS("opacity", "1");
        await page.keyboard.press("Tab");
        await page.getByRole("button", { name: "内容", exact: true }).focus();
      }
    },
  );
  await check(
    "table fills the conversation width without a separate actions row",
    async () => {
      const block = page.locator('[data-kind="markdown-table"]');
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await block.scrollIntoViewIfNeeded();
        const geometry = await block.evaluate((el) => {
          const root = el.getBoundingClientRect();
          const table = el.querySelector("table").getBoundingClientRect();
          const scroll = el.querySelector(".workflow-table-scroll");
          return {
            rootWidth: root.width,
            tableWidth: table.width,
            tableTop: table.top - root.top,
            overflow: document.documentElement.scrollWidth > innerWidth,
            scrollWidth: scroll.clientWidth,
          };
        });
        expect(geometry.tableWidth).toBeGreaterThanOrEqual(
          geometry.rootWidth - 1,
        );
        expect(geometry.tableTop).toBeCloseTo(0, 0);
        expect(geometry.overflow).toBe(false);
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.rootWidth);
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    },
  );
  await check("formal turn → rich content, formula and Mermaid", async () => {
    await expect(page.locator('[data-kind="workflow-turn"]')).toHaveCount(1);
    await expect(page.locator(".katex").first()).toBeVisible();
    await expect(page.getByAltText("Mermaid 图表")).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByRole("button", { name: "预览结果图片", exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: resolve(output, "content.png"),
      fullPage: true,
    });
  });
  await check(
    "table preview: focus trap, Escape, focus restoration",
    async () => {
      const button = page.getByRole("button", {
        name: "展开表格",
        exact: true,
      });
      await page.locator('[data-kind="markdown-table"]').hover();
      await button.click();
      await expect(
        page.getByRole("dialog", { name: "表格预览" }),
      ).toBeVisible();
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest("dialog")),
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(button).toBeFocused();
    },
  );
  await check("table copy contains Markdown and clean HTML", async () => {
    await page.getByRole("button", { name: "复制表格", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "已复制表格", exact: true }),
    ).toBeVisible();
    const value = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return {
        text: await (await items[0].getType("text/plain")).text(),
        html: await (await items[0].getType("text/html")).text(),
      };
    });
    expect(value.text).toContain("| 内容 |");
    expect(value.html).toContain("<table");
    expect(value.html).not.toContain("<button");
  });
  await check(
    "relative file link uses conversation cwd and highlights requested line",
    async () => {
      await page
        .getByRole("button", { name: "示例文件:3", exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name: "文件", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "src/example.ts", exact: true }),
      ).toHaveAttribute("aria-current", "true");
      await expect(page.locator(".is-target-line")).toContainText(
        "const answer = 42;",
      );
      await expect(page.getByRole("list", { name: "文件目录" })).toBeVisible();
      await page
        .getByRole("button", { name: "收起辅助区", exact: true })
        .click();
    },
  );
  await check("image lightbox opens and restores focus", async () => {
    const button = page.getByRole("button", {
      name: "预览结果图片",
      exact: true,
    });
    await button.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  });
  await check(
    "streaming code keeps its DOM and wrap preference when the fence closes",
    async () => {
      await page.getByRole("button", { name: "开始流式代码" }).click();
      await expect(
        page.getByRole("button", { name: "复制代码", exact: true }),
      ).toHaveCount(0);
      await page.locator('[data-kind="workflow-code-block"]').hover();
      await page
        .getByRole("button", { name: "代码自动换行", exact: true })
        .click();
      await page.evaluate(() => {
        window.__codeBlock = document.querySelector(
          '[data-kind="workflow-code-block"]',
        );
      });
      await page.getByRole("button", { name: "追加代码" }).click();
      await expect(page.locator(".workflow-code-block-body")).toContainText(
        "const third = 3;",
      );
      expect(
        await page.evaluate(
          () =>
            window.__codeBlock ===
            document.querySelector('[data-kind="workflow-code-block"]'),
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "结束流式代码" }).click();
      await expect(
        page.getByRole("button", { name: "复制代码", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "代码自动换行" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        await page.evaluate(
          () =>
            window.__codeBlock ===
            document.querySelector('[data-kind="workflow-code-block"]'),
        ),
      ).toBe(true);
    },
  );
  await check(
    "copy and fork ignore repeated clicks; fork failures are visible and retryable",
    async () => {
      await page
        .getByRole("button", { name: "复制回复", exact: true })
        .evaluate((button) => {
          button.click();
          button.click();
          button.click();
        });
      await expect(page.getByTestId("action-count")).toHaveText(
        "复制 1 / 分支 0",
      );
      await page.getByLabel("分支失败").check();
      await page
        .getByRole("button", { name: "创建对话分支", exact: true })
        .evaluate((button) => {
          button.click();
          button.click();
        });
      await expect(
        page.getByRole("button", { name: "正在创建分支" }),
      ).toBeDisabled();
      await expect(page.getByRole("alert")).toContainText("分支暂不可用");
      await expect(page.getByTestId("action-count")).toHaveText(
        "复制 1 / 分支 1",
      );
      await page.getByLabel("分支失败").uncheck();
      await page.locator('[data-kind="assistant-turn"]').hover();
      await page
        .getByRole("button", { name: "创建对话分支", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByTestId("action-count")).toHaveText(
        "复制 1 / 分支 2",
      );
    },
  );
  await check(
    "invalid Mermaid retains code and successful diagrams can be restored",
    async () => {
      await page.getByRole("button", { name: "错误图表" }).click();
      await expect(page.getByText("图表暂时无法渲染，已保留源码")).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator(".workflow-code-block-body")).toContainText(
        "this is invalid",
      );
      await page.getByRole("button", { name: "恢复内容" }).click();
      await expect(page.getByAltText("Mermaid 图表")).toBeVisible();
    },
  );
  await check("MCP blocks render from the formal tool details", async () => {
    await page.getByRole("button", { name: "工具结果", exact: true }).click();
    await page.locator('[data-activity-kind="mcpToolCall"] > button').click();
    await expect(page.locator('[data-kind="mcp-result"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "资源报告" })).toHaveAttribute(
      "href",
      "https://example.com/report",
    );
    await expect(page.getByText("其他工具内容", { exact: true })).toBeVisible();
    await expect(page.getByText("结构化结果", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "预览工具返回图片", exact: true }),
    ).toBeEnabled();
    await expect(page.locator("audio")).toHaveCount(1);
    await page
      .locator('[data-activity-kind="imageGeneration"] > button')
      .click();
    await expect(
      page.locator('[data-activity-kind="imageGeneration"]'),
    ).not.toContainText("已生成图片");
    await page.screenshot({
      path: resolve(output, "tools.png"),
      fullPage: true,
    });
  });
  await check(
    "result gallery: navigation resets zoom and closing restores the original trigger",
    async () => {
      const trigger = page.locator(".workflow-result-image-button").first();
      await trigger.click();
      const initialSrc = await page
        .locator(".image-lightbox-stage img")
        .getAttribute("src");
      await page.getByRole("button", { name: "放大图片", exact: true }).click();
      await expect(page.locator(".image-lightbox-zoom-value")).not.toHaveText(
        "100%",
      );
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(".image-lightbox-zoom-value")).toHaveText(
        "100%",
      );
      expect(
        await page.locator(".image-lightbox-stage img").getAttribute("src"),
      ).not.toBe(initialSrc);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    },
  );
  await check(
    "scroll: following output, reader detachment, per-session restore",
    async () => {
      await page.getByRole("button", { name: "滚动", exact: true }).click();
      const viewport = page.getByTestId("scroll-viewport");
      await expect(page.getByTestId("scroll-state")).toContainText("吸底 true");
      await page.getByRole("button", { name: "流式追加" }).click();
      await expect
        .poll(() =>
          viewport.evaluate(
            (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
          ),
        )
        .toBeLessThan(2);
      await viewport.hover();
      await page.mouse.wheel(0, -700);
      await expect(page.getByTestId("scroll-state")).toContainText(
        "吸底 false",
      );
      await expect
        .poll(() =>
          viewport.evaluate(
            (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
          ),
        )
        .toBeGreaterThan(500);
      const top = await viewport.evaluate((el) => el.scrollTop);
      await page.getByRole("button", { name: "流式追加" }).click();
      await expect
        .poll(() => viewport.evaluate((el) => el.scrollTop))
        .toBe(top);
      const distance = await viewport.evaluate(
        (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
      );
      // Trigger a real read position update so it is persisted after the append.
      await viewport.evaluate((el) => {
        el.scrollTop -= 1;
      });
      await expect
        .poll(() =>
          viewport.evaluate(
            (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
          ),
        )
        .toBe(distance + 1);
      await page.getByRole("button", { name: "切换会话" }).click();
      await expect(page.getByTestId("scroll-state")).toContainText(
        "会话 B / 吸底 true",
      );
      await page.getByRole("button", { name: "切换会话" }).click();
      await expect(page.getByTestId("scroll-state")).toContainText(
        "会话 A / 吸底 false",
      );
      await expect
        .poll(() =>
          viewport.evaluate(
            (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
          ),
        )
        .toBe(distance + 1);
    },
  );
  await check(
    "scroll: stale history completion cannot move a newly selected session",
    async () => {
      const viewport = page.getByTestId("scroll-viewport");
      await viewport.evaluate((el) => {
        el.scrollTop = 0;
      });
      await expect(page.getByTestId("scroll-state")).toContainText("加载 等待");
      await page.getByRole("button", { name: "切换会话" }).click();
      await expect(page.getByTestId("scroll-state")).toContainText("会话 B");
      const top = await viewport.evaluate((el) => el.scrollTop);
      await page.getByRole("button", { name: "完成历史加载" }).click();
      await expect(page.getByTestId("scroll-state")).toContainText("加载 1");
      await expect
        .poll(() => viewport.evaluate((el) => el.scrollTop))
        .toBe(top);
    },
  );
  await check(
    "scroll: editing keys and a touch tap do not detach the bottom lock",
    async () => {
      await page.getByRole("button", { name: "回到底部" }).click();
      await expect(page.getByTestId("scroll-state")).toContainText("吸底 true");
      const viewport = page.getByTestId("scroll-viewport");
      await viewport.evaluate((el) => {
        el.querySelector("input").dispatchEvent(
          new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
        );
        el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
      });
      await expect(page.getByTestId("scroll-state")).toContainText("吸底 true");
      await viewport.focus();
      await page.keyboard.press("PageUp");
      await expect(page.getByTestId("scroll-state")).toContainText(
        "吸底 false",
      );
    },
  );
  await check(
    "scroll: collapse preserves the control position while reading history",
    async () => {
      const viewport = page.getByTestId("scroll-viewport");
      const toggle = viewport.getByRole("button", {
        name: "展开详情",
        exact: true,
      });
      await viewport.evaluate(async (el) => {
        el.scrollTo({
          top:
            el.querySelector('[data-row="25"]').offsetTop - el.offsetTop - 100,
          behavior: "instant",
        });
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      await expect(page.getByTestId("scroll-state")).toContainText(
        "吸底 false",
      );
      // Playwright may finish the preceding native PageUp animation while
      // moving the pointer. Measure at the actual click, before React collapses.
      await toggle.evaluate((button) =>
        button.addEventListener(
          "click",
          () => {
            window.__anchorTop = button.getBoundingClientRect().top;
          },
          { once: true, capture: true },
        ),
      );
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect
        .poll(async () =>
          Math.abs(
            (await toggle.boundingBox()).y -
              (await page.evaluate(() => window.__anchorTop)),
          ),
        )
        .toBeLessThan(2);
    },
  );
  await check(
    "Markdown error boundary isolates failure, retries and resets on content key",
    async () => {
      await page.getByRole("button", { name: "异常恢复", exact: true }).click();
      await expect(
        page.getByText("正文已经恢复", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "触发正文异常", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        "这段内容暂时无法显示",
      );
      // Catch a fixture started outside the client workspace: Tailwind's
      // existing relative content paths otherwise omit primitive styles.
      await expect(
        page.getByRole("button", { name: "重试", exact: true }),
      ).toHaveCSS("height", "32px");
      await expect(
        page.getByRole("button", { name: "重试", exact: true }),
      ).toHaveCSS("border-top-width", "1px");
      const previousTheme = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        classes: document.documentElement.className,
        style: document.documentElement.getAttribute("style"),
      }));
      for (const theme of ["light", "dark", "warm"]) {
        await page.evaluate((theme) => {
          const root = document.documentElement;
          root.dataset.theme = theme;
          root.style.removeProperty("color-scheme");
          root.classList.toggle("dark", theme === "dark");
          root.classList.toggle("light", theme !== "dark");
        }, theme);
        expect(
          await page.getByRole("alert").evaluate((element) => {
            const probe = document.createElement("span");
            probe.style.cssText =
              "background:var(--raised-1);color:var(--text-2);border-radius:var(--radius-md);font-size:var(--text-base)";
            document.body.append(probe);
            const actual = getComputedStyle(element),
              expected = getComputedStyle(probe);
            const matches = [
              "backgroundColor",
              "color",
              "borderTopLeftRadius",
              "fontSize",
            ].every((property) => actual[property] === expected[property]);
            probe.remove();
            return matches;
          }),
        ).toBe(true);
        // Wait for the shared Button's theme-color transition before recording
        // the screenshot, and verify its foreground follows its container.
        await expect
          .poll(() =>
            page
              .getByRole("button", { name: "重试", exact: true })
              .evaluate(
                (button) =>
                  getComputedStyle(button).color ===
                  getComputedStyle(button.parentElement).color,
              ),
          )
          .toBe(true);
        await page.screenshot({
          path: resolve(output, "error-boundary-" + theme + ".png"),
        });
      }
      await page.evaluate(({ theme, classes, style }) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.className = classes;
        if (style === null) document.documentElement.removeAttribute("style");
        else document.documentElement.setAttribute("style", style);
      }, previousTheme);
      await expect(
        page.getByText("过程和已生成产物始终保留", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "解除测试故障", exact: true })
        .click();
      await page.getByRole("button", { name: "重试", exact: true }).click();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(
        page.getByText("正文已经恢复", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "触发正文异常", exact: true })
        .click();
      await expect(page.getByRole("alert")).toBeVisible();
      await page
        .getByRole("button", { name: "更新正文标识", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(
        page.getByText("正文已经恢复", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: resolve(output, "error-boundary-recovered.png"),
      });
    },
  );
  expect(errors).toEqual([]);
} catch (error) {
  await page.screenshot({
    path: resolve(output, "failure.png"),
    fullPage: true,
  });
  process.stderr.write(
    `${error.stack}\nBrowser errors: ${JSON.stringify(errors)}\n`,
  );
  process.exitCode = 1;
} finally {
  writeFileSync(
    resolve(output, "results.json"),
    JSON.stringify(
      { passed: steps, errors, expectedErrors, success: !process.exitCode },
      null,
      2,
    ),
  );
  await browser.close();
}
