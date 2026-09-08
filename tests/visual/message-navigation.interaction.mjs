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
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
const check = async (name, action) => {
  await action();
  checks.push(name);
  console.log(`PASS ${name}`);
};
try {
  await page.goto(
    process.env.MARLOUES_NAVIGATION_URL ||
      "http://localhost:5173/?workflowFixture=details&fixtureSection=navigation&fixtureTheme=light",
  );
  const nav = page.getByRole("navigation", { name: "消息导航", exact: true });
  const scroll = page.getByLabel("导航示例会话", { exact: true });
  await check(
    "wide conversation shows left markers while keeping history virtualized",
    async () => {
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("button")).toHaveCount(120);
      const bounds = await nav.boundingBox();
      expect(bounds.height).toBeLessThanOrEqual(240);
      const content = await page.locator(".messages-inner").boundingBox();
      expect(bounds.x + bounds.width).toBeLessThan(content.x);
      expect(await page.locator(".workflow-turn-frame").count()).toBeLessThan(
        50,
      );
      await expect(nav.locator("summary")).toHaveCount(0);
    },
  );
  await check(
    "markers stay short at rest and form a wave around the hovered message",
    async () => {
      const ticks = nav.locator('button > [aria-hidden="true"]');
      const widths = () =>
        ticks.evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().width),
        );
      await page.mouse.move(800, 90);
      await expect
        .poll(async () =>
          (await widths()).every((width) => Math.abs(width - 8) < 0.1),
        )
        .toBe(true);
      const target = nav.getByRole("button").nth(100);
      await target.hover();
      await expect.poll(async () => (await widths())[100]).toBeCloseTo(32, 0);
      const wave = await widths();
      expect(wave[100]).toBeGreaterThan(wave[101]);
      expect(wave[101]).toBeGreaterThan(wave[102]);
      expect(wave[102]).toBeGreaterThan(wave[103]);
      expect(wave[103]).toBeGreaterThan(wave[104]);
      expect(wave[99]).toBeCloseTo(wave[101], 0);
      expect(wave[98]).toBeCloseTo(wave[102], 0);
      const current = await nav
        .locator("[aria-current]")
        .getAttribute("aria-label");
      await nav.getByRole("button").nth(102).hover();
      await expect.poll(async () => (await widths())[102]).toBeCloseTo(32, 0);
      await expect(nav.locator("[aria-current]")).toHaveAttribute(
        "aria-label",
        current,
      );
      await page.mouse.move(800, 90);
      await expect
        .poll(async () =>
          (await widths()).every((width) => Math.abs(width - 8) < 0.1),
        )
        .toBe(true);
    },
  );
  await check(
    "hover previews a prompt and reply without moving the conversation",
    async () => {
      const current = nav.locator("[aria-current]");
      await current.hover();
      const before = await scroll.evaluate((el) => el.scrollTop);
      await expect(page.getByRole("tooltip")).toContainText("这是第");
      await expect(page.getByRole("tooltip")).toContainText("消息");
      expect(await scroll.evaluate((el) => el.scrollTop)).toBe(before);
      await page.mouse.move(800, 90);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    },
  );
  await check(
    "click jumps to the selected virtual message and marks it current",
    async () => {
      const target = nav.getByRole("button", { name: /A · 消息 83：/ });
      await target.click();
      await expect(
        page.locator('[data-message-id="nav-A-82"]'),
      ).toBeInViewport();
      await expect(target).toHaveAttribute("aria-current", "location");
      await expect(
        page.getByRole("status").filter({ hasText: "会话 A" }),
      ).toContainText("阅读历史");
      await page.mouse.move(800, 90);
      await expect
        .poll(() =>
          target
            .locator('[aria-hidden="true"]')
            .evaluate((node) => node.getBoundingClientRect().width),
        )
        .toBeCloseTo(8, 0);
    },
  );
  await check(
    "streaming updates cannot pull a navigation jump back to the bottom",
    async () => {
      const before = await scroll.evaluate((el) => el.scrollTop);
      await page.getByRole("button", { name: "追加回复", exact: true }).click();
      await expect(
        page.locator('[data-message-id="nav-A-82"]'),
      ).toBeInViewport();
      await expect
        .poll(() => scroll.evaluate((el) => el.scrollTop))
        .toBeCloseTo(before, 0);
    },
  );
  await check(
    "arrow keys preview entries and Enter jumps; Escape dismisses preview",
    async () => {
      await nav.locator("[aria-current]").focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("tooltip")).toContainText("消息 84");
      await expect
        .poll(() =>
          nav
            .locator('button:focus > [aria-hidden="true"]')
            .evaluate((node) => node.getBoundingClientRect().width),
        )
        .toBeCloseTo(32, 0);
      await page.keyboard.press("Enter");
      await expect(
        page.locator('[data-message-id="nav-A-83"]'),
      ).toBeInViewport();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    },
  );
  await check(
    "narrow conversation hides the rail without changing browser width",
    async () => {
      await page.getByRole("button", { name: "窄对话区", exact: true }).click();
      await expect(nav).toHaveCount(0);
      await page.getByRole("button", { name: "宽对话区", exact: true }).click();
      await expect(nav).toBeVisible();
    },
  );
  await check(
    "opening the auxiliary region hides navigation when left whitespace no longer fits",
    async () => {
      await page
        .getByRole("button", { name: "打开辅助区", exact: true })
        .click();
      await expect(nav).toHaveCount(0);
      await page
        .getByRole("button", { name: "收起辅助区", exact: true })
        .click();
      await expect(nav).toBeVisible();
    },
  );
  await check(
    "an obscured conversation does not leave an interactive navigation portal",
    async () => {
      await page.locator(".chat-page").evaluate((node) => {
        node.inert = true;
        node.setAttribute("aria-hidden", "true");
      });
      await expect(nav).toHaveCount(0);
      await page.locator(".chat-page").evaluate((node) => {
        node.inert = false;
        node.removeAttribute("aria-hidden");
      });
      await expect(nav).toBeVisible();
    },
  );
  await check(
    "earlier history adds markers and still jumps to the right turn",
    async () => {
      await nav.getByRole("button").first().click();
      await expect(nav.getByRole("button")).toHaveCount(160);
      await nav.getByRole("button").first().click();
      await expect(
        page.locator('[data-message-id="nav-A-0"]'),
      ).toBeInViewport();
    },
  );
  await check(
    "switching sessions clears the old preview and indexes the new messages",
    async () => {
      await nav.getByRole("button").first().hover();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page
        .getByRole("button", { name: "切换示例会话", exact: true })
        .click();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await expect(nav.getByRole("button").first()).toHaveAccessibleName(
        /B · 消息 1：/,
      );
      await page.getByRole("button", { name: "回到底部", exact: true }).click();
      await expect(nav.locator("[aria-current]")).toHaveAccessibleName(
        /B · 消息 15[7-9]：/,
      );
    },
  );
  await check(
    "dark and narrow windows keep navigation from overlapping content",
    async () => {
      await page
        .getByRole("button", { name: "主题：深色", exact: true })
        .click();
      await expect(nav).toBeVisible();
      await page.setViewportSize({ width: 760, height: 900 });
      await expect(nav).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(760);
      await page.setViewportSize({ width: 1400, height: 950 });
      await expect(nav).toBeVisible();
    },
  );
  expect(errors).toEqual([]);
  console.log(`${checks.length} message navigation checks passed`);
} finally {
  await browser.close();
}
