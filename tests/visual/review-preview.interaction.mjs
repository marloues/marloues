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
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(
    "http://localhost:5173/?workflowFixture=details&fixtureSection=components&fixtureTheme=light",
  );
  await page.getByRole("button", { name: "主题：浅色", exact: true }).waitFor();
  await page.evaluate(async () => {
    const source = await (await fetch("/src/main.tsx")).text();
    const dependency = (name) =>
      source.match(new RegExp(`"([^"]*/${name}\\.js[^"]*)"`))[1];
    const { default: React } = await import(dependency("react"));
    const { default: ReactDOM } = await import(dependency("react-dom_client"));
    const { createRoot } = ReactDOM;
    const { WorkflowResultCards } =
      await import("/src/components/workflow-chat/activity/ResultCards.tsx");
    document.getElementById("root").hidden = true;
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:80px;top:60px;right:80px;bottom:0;background:var(--surface-workspace)";
    document.body.append(host);
    const viewport = document.createElement("div");
    viewport.className = "messages-scroll";
    viewport.style.cssText =
      "position:absolute;inset:0;--interaction-dock-safe-area:180px;overflow:auto";
    host.append(viewport);
    const body = document.createElement("div");
    body.style.cssText =
      "height:1800px;padding:450px 32px 0;box-sizing:border-box";
    body.dataset.testContent = "true";
    viewport.append(body);
    const patch =
      "@@ -1,24 +1,24 @@\n" +
      Array.from(
        { length: 24 },
        (_, i) => `-const old${i} = false;\n+const next${i} = true;`,
      ).join("\n");
    const changes = [
      {
        path: "/workspace/README.md",
        kind: "update",
        diff: { text: patch, truncated: false },
      },
    ];
    createRoot(body).render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "div",
          { "data-single": true },
          React.createElement(WorkflowResultCards, {
            items: [
              {
                type: "fileChange",
                id: "single",
                status: "completed",
                changes,
              },
            ],
          }),
        ),
        React.createElement(
          "div",
          { "data-multiple": true, style: { marginTop: 360 } },
          React.createElement(WorkflowResultCards, {
            items: [
              {
                type: "fileChange",
                id: "multiple",
                status: "completed",
                changes: [
                  ...changes,
                  { ...changes[0], path: "/workspace/theme.css" },
                ],
              },
            ],
          }),
        ),
      ),
    );
    const dock = document.createElement("div");
    dock.dataset.testComposer = "true";
    dock.textContent = "输入区";
    dock.style.cssText =
      "position:absolute;inset:auto 0 0;height:180px;z-index:20;background:var(--surface-popover);border-top:1px solid var(--border)";
    host.append(dock);
  });
  const card = page.locator("[data-single] .workflow-result-diff-card");
  const popup = page.getByRole("region", { name: "审核预览：README.md" });
  await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await card.hover();
  const hoverColor = await card.evaluate((el) => {
    const sample = document.createElement("div");
    sample.style.backgroundColor = "var(--raised-1)";
    el.append(sample);
    const color = getComputedStyle(sample).backgroundColor;
    sample.remove();
    return color;
  });
  await expect(card).toHaveCSS("background-color", hoverColor);
  await expect(popup).toHaveAttribute("data-side", "top");
  const assertCentered = async (anchor) => {
    await expect
      .poll(async () => {
        const a = await anchor.boundingBox();
        const p = await popup.boundingBox();
        return Math.abs(a.x + a.width / 2 - p.x - p.width / 2);
      })
      .toBeLessThan(2);
  };
  await assertCentered(card);
  await expect(popup).toHaveCSS("width", "800px");
  await page.locator("[data-single]").evaluate((el) => {
    el.style.maxWidth = "500px";
    el.style.marginInline = "auto";
  });
  await expect(popup).toHaveCSS("width", "500px");
  expect((await popup.boundingBox()).width).toBeLessThanOrEqual(
    (await card.boundingBox()).width,
  );
  await assertCentered(card);
  await page.locator("[data-single]").evaluate((el) => {
    el.style.maxWidth = "";
    el.style.marginInline = "";
  });
  expect(
    (await popup.boundingBox()).y + (await popup.boundingBox()).height,
  ).toBeLessThan((await page.locator("[data-test-composer]").boundingBox()).y);
  await popup.hover();
  await expect(popup).toBeVisible();
  await page.screenshot({ path: "/tmp/marloues-review-preview-top.png" });
  console.log(
    "PASS default card surface is light; hover uses the previous surface; preview flips above the composer and stays centered",
  );
  await page.mouse.move(0, 0);
  await expect(popup).toHaveCount(0);
  await page.locator("[data-test-content]").evaluate((el) => {
    el.style.paddingTop = "24px";
  });
  await card.hover();
  await expect(popup).toHaveAttribute("data-side", "bottom");
  await assertCentered(card);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  console.log(
    "PASS preview chooses below near the top and Escape dismisses it",
  );
  await page.mouse.move(0, 0);
  await card.getByRole("button", { name: "审核文件变更" }).focus();
  await expect(popup).toBeVisible();
  await card.getByRole("button", { name: "审核文件变更" }).click();
  await expect(popup).toHaveCount(0);
  console.log(
    "PASS keyboard focus reveals the preview; reviewing dismisses it",
  );
  await page.mouse.move(0, 0);
  const row = page.locator("[data-multiple] .workflow-result-file-row").first();
  await row.hover();
  await expect(popup).toBeVisible();
  await assertCentered(row);
  await page.locator(".messages-scroll").evaluate((el) => {
    el.scrollTop = 1200;
  });
  await expect(popup).toHaveCount(0);
  console.log(
    "PASS multi-file rows use the same centered placement and hide after scrolling away",
  );
  await page.setViewportSize({ width: 560, height: 800 });
  await page.locator(".messages-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await card.hover();
  await expect(popup).toBeVisible();
  await expect
    .poll(async () => (await popup.boundingBox()).width)
    .toBeCloseTo((await card.boundingBox()).width, 0);
  const narrow = await popup.boundingBox();
  const narrowCard = await card.boundingBox();
  expect(narrow.x).toBeGreaterThanOrEqual(12);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(548);
  expect(narrow.x).toBeGreaterThanOrEqual(narrowCard.x);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(
    narrowCard.x + narrowCard.width,
  );
  await assertCentered(card);
  console.log(
    "PASS 800px preview target is capped by the card and window widths",
  );
  expect(errors).toEqual([]);
} catch (error) {
  console.log(
    await page.evaluate(() => {
      const anchor = document.querySelector(
        "[data-single] .workflow-result-diff-card",
      );
      const ancestors = [];
      for (let el = anchor; el; el = el.parentElement) {
        const css = getComputedStyle(el);
        ancestors.push({
          tag: el.tagName,
          class: el.className,
          rect: el.getBoundingClientRect().toJSON(),
          overflow: `${css.overflowX}/${css.overflowY}`,
          hidden: el.hidden,
          dock: css.getPropertyValue("--interaction-dock-safe-area"),
        });
      }
      return JSON.stringify(
        {
          ancestors,
          popups: [
            ...document.querySelectorAll(".workflow-result-file-popover"),
          ].map((el) => el.outerHTML.slice(0, 600)),
        },
        null,
        2,
      );
    }),
  );
  await page.screenshot({ path: "/tmp/marloues-review-preview-failure.png" });
  console.log(errors);
  throw error;
} finally {
  await browser.close();
}
