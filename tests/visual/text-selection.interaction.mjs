import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(
  resolve(import.meta.dirname, "../../client/package.json"),
);
const { chromium, expect } = require("@playwright/test");
const browser = await chromium.launch(
  process.env.MARLOUES_CHROMIUM_PATH
    ? { executablePath: process.env.MARLOUES_CHROMIUM_PATH }
    : {},
);
const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(
    "http://localhost:5173/?workflowFixture=details&fixtureSection=content&fixtureTheme=light",
  );
  await page.getByRole("button", { name: "主题：浅色", exact: true }).waitFor();
  await page.evaluate(async () => {
    const source = await (await fetch("/src/main.tsx")).text();
    const dependency = (name) =>
      source.match(new RegExp(`"([^"]*/${name}\\.js[^"]*)"`))[1];
    const { default: React } = await import(dependency("react"));
    const { default: ReactDOM } = await import(dependency("react-dom_client"));
    const { WorkflowAssistantAnswer } =
      await import("/src/components/workflow-chat/turns/AssistantAnswer.tsx");
    const answerSource = await (
      await fetch("/src/components/workflow-chat/turns/AssistantAnswer.tsx")
    ).text();
    const contextPath = answerSource.match(
      /"([^"]*\/MarkdownContext\.tsx[^"]*)"/,
    )[1];
    const { WorkflowMarkdownProvider } = await import(contextPath);
    document.getElementById("root").hidden = true;
    const host = document.createElement("div");
    host.id = "selection-probe";
    host.style.cssText =
      "position:fixed;inset:20px;overflow:auto;padding:140px 20px 20px";
    document.body.append(host);
    function Probe() {
      const [draft, setDraft] = React.useState("");
      const [streaming, setStreaming] = React.useState(false);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          WorkflowMarkdownProvider,
          {
            value: {
              onAddSelection: (text) =>
                setDraft(
                  text
                    .split("\n")
                    .map((line) => `> ${line}`)
                    .join("\n"),
                ),
            },
          },
          React.createElement(WorkflowAssistantAnswer, {
            text: "选中这段回复中的文字，将引用添加到对话。\n\n第二段用于确认悬浮操作不占正文的空间。",
            hasLeadingContent: false,
            streaming,
          }),
        ),
        React.createElement(
          "p",
          { "data-outside": true },
          "外部内容不会出现选区操作。",
        ),
        React.createElement("textarea", {
          "aria-label": "体验输入框",
          value: draft,
          readOnly: true,
        }),
        React.createElement(
          "button",
          { onClick: () => setStreaming((value) => !value) },
          "切换流式状态",
        ),
      );
    }
    ReactDOM.createRoot(host).render(React.createElement(Probe));
  });
  const article = page.locator("#selection-probe article");
  const action = page.locator("[data-selection-action]");
  const button = page.getByRole("button", { name: "添加到对话", exact: true });
  const select = async (target = article.locator("p").first()) => {
    await target.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
  };
  const before = await article.boundingBox();
  const textBounds = await article
    .locator("p")
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().toJSON();
    });
  await page.mouse.move(textBounds.x + 1, textBounds.y + textBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    textBounds.x + 180,
    textBounds.y + textBounds.height / 2,
    { steps: 8 },
  );
  await expect(action).toHaveCount(0);
  await page.mouse.up();
  await expect(button).toBeVisible();
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await expect(action).toHaveCount(0);
  console.log(
    "PASS mouse selection reveals the action after release, without interrupting dragging",
  );
  await select();
  await expect(button).toBeVisible();
  await expect(action.getByRole("button")).toHaveCount(1);
  await expect(action).toHaveAttribute("data-side", "top");
  await expect(action).toHaveCSS("position", "fixed");
  expect((await article.boundingBox()).height).toBe(before.height);
  const rangeBounds = await page.evaluate(() => {
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width };
  });
  const box = await action.boundingBox();
  expect(
    Math.abs(box.x + box.width / 2 - rangeBounds.x - rangeBounds.width / 2),
  ).toBeLessThan(2);
  expect(box.y + box.height).toBeLessThan(rangeBounds.y);
  await page.screenshot({ path: "/tmp/marloues-selection-action.png" });
  await button.click();
  await expect(page.getByRole("textbox", { name: "体验输入框" })).toHaveValue(
    "> 选中这段回复中的文字，将引用添加到对话。",
  );
  await expect(action).toHaveCount(0);
  console.log(
    "PASS one centered floating action, unchanged answer layout and correct quoted text",
  );

  await select();
  await expect(button).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(action).toHaveCount(0);
  await select();
  await expect(button).toBeVisible();
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await expect(action).toHaveCount(0);
  await select(page.locator("[data-outside]"));
  await expect(action).toHaveCount(0);
  console.log(
    "PASS Escape, cleared selection and text outside the answer dismiss the action",
  );

  await select();
  await expect(button).toBeVisible();
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(action).toHaveCount(0);
  await page.locator("#selection-probe").evaluate((el) => {
    el.style.paddingTop = "0";
  });
  await select();
  await expect(action).toHaveAttribute("data-side", "bottom");
  await page.setViewportSize({ width: 320, height: 650 });
  await select();
  await expect(button).toBeVisible();
  const narrow = await action.boundingBox();
  expect(narrow.x).toBeGreaterThanOrEqual(12);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(308);
  console.log(
    "PASS keyboard activation, top-edge flip and narrow-window placement",
  );

  await page.getByRole("button", { name: "切换流式状态" }).click();
  await select();
  await expect(action).toHaveCount(0);
  console.log("PASS streaming answers do not expose the selection action");
  expect(errors).toEqual([]);
} catch (error) {
  console.log(
    JSON.stringify(
      await page.evaluate(() => {
        const range = window.getSelection()?.rangeCount
          ? window.getSelection().getRangeAt(0)
          : null;
        const parents = [];
        for (
          let el = document.querySelector("#selection-probe article");
          el;
          el = el.parentElement
        ) {
          const rect = el.getBoundingClientRect();
          const css = getComputedStyle(el);
          parents.push({
            tag: el.tagName,
            id: el.id,
            rect: rect.toJSON(),
            overflow: [css.overflowX, css.overflowY],
          });
        }
        return {
          selected: window.getSelection()?.toString(),
          range: range?.getBoundingClientRect().toJSON(),
          parents,
          actions: document.querySelector("[data-selection-action]")?.outerHTML,
        };
      }),
      null,
      2,
    ),
  );
  await page.screenshot({ path: "/tmp/marloues-selection-action-failure.png" });
  throw error;
} finally {
  await browser.close();
}
