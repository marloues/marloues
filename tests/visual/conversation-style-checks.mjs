/** Check resolved production styles against the app's current tokens, including
 * warm and custom accent updates. Theme values are controlled test inputs. */
export async function styleChecks({
  page,
  check,
  choose,
  snapshot,
  expect,
  expandProcess,
}) {
  const original = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    style: document.documentElement.getAttribute("style"),
  }));
  const token = async (locator, property, variable, pseudo) => {
    await expect
      .poll(() =>
        locator.evaluate(
          (element, { property, variable, pseudo }) => {
            const probe = document.createElement("span");
            probe.style.setProperty(property, `var(${variable})`);
            document.body.append(probe);
            const actual = getComputedStyle(element, pseudo).getPropertyValue(
              property,
            );
            const expected = getComputedStyle(probe).getPropertyValue(property);
            probe.remove();
            if (actual !== expected)
              console.debug(
                "style mismatch",
                property,
                variable,
                actual,
                expected,
              );
            return actual === expected
              ? "matched"
              : `${property} ${variable}: actual=${actual}; expected=${expected}`;
          },
          { property, variable, pseudo },
        ),
      )
      .toBe("matched");
  };
  const keyboardFocus = async (locator) => {
    await locator.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(locator).toBeFocused();
  };
  const show = async (locator, name) => {
    await locator.evaluate((element) =>
      element.scrollIntoView({ block: "start" }),
    );
    await snapshot(name);
  };
  try {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const theme of ["light", "dark", "warm"]) {
      await check("style-components-" + theme, async () => {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await choose("questions");
        const card = page.locator(".workflow-question-card").first();
        await token(card, "border-top-color", "--border");
        await token(card, "border-top-left-radius", "--card-radius");
        await token(card, "padding-top", "--space-4");
        await token(card.locator("h3"), "font-size", "--text-md");
        await token(
          card.locator('button[type="submit"]'),
          "background-color",
          "--primary-fill",
        );
        await token(
          card.locator('button[type="submit"]'),
          "color",
          "--primary-ink",
        );
        const input = card.getByLabel("文字", { exact: true });
        await token(input, "border-top-color", "--border");
        await token(input, "background-color", "--panel-2");
        await expect(input).toHaveCSS("height", "36px");
        const select = card.getByLabel("单选", { exact: true });
        await token(select, "border-top-left-radius", "--radius-md");
        await keyboardFocus(select);
        await token(select, "outline-color", "--accent");
        await expect(select).toHaveCSS("outline-style", "solid");
        await show(card, "style-question-" + theme);
        await choose("markdown");
        const writing = page.locator(".workflow-writing-block");
        await token(writing, "border-top-color", "--border");
        await token(writing, "border-top-left-radius", "--radius-md");
        const diagram = page.getByAltText("Mermaid 图表");
        await expect(diagram).toBeVisible({ timeout: 30000 });
        await expect(
          page.locator('[data-kind="mermaid-block"]'),
        ).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
        const data = await diagram.getAttribute("src");
        const geometry = await diagram.evaluate((element) => {
          const svg = new DOMParser().parseFromString(
            decodeURIComponent(element.src.split(",")[1]),
            "image/svg+xml",
          );
          const [, , width, height] = svg.documentElement
            .getAttribute("viewBox")
            .split(/\s+/)
            .map(Number);
          const nodes = Array.from(svg.querySelectorAll(".node"));
          return {
            width,
            height,
            nodeCount: nodes.length,
            // The simple three-node fixture must fit the viewBox, with legible
            // labels. Detect stale 2000px foreignObject measurement geometry.
            contained: nodes.every((node) => {
              const [x, y] = node
                .getAttribute("transform")
                .match(/[-\d.]+/g)
                .map(Number);
              const rect = node.querySelector("rect");
              return (
                x + Number(rect.getAttribute("width")) / 2 <= width &&
                y + Number(rect.getAttribute("height")) / 2 <= height
              );
            }),
            labelPixels: ((element.clientWidth - 32) / width) * 13,
          };
        });
        expect(geometry.nodeCount).toBe(3);
        expect(geometry.contained).toBe(true);
        expect(geometry.width).toBeLessThan(800);
        expect(geometry.height).toBeLessThan(180);
        expect(geometry.labelPixels).toBeGreaterThanOrEqual(11);
        const palette = await page.evaluate(() => {
          const context = document.createElement("canvas").getContext("2d");
          context.fillStyle = getComputedStyle(
            document.documentElement,
          ).getPropertyValue("--accent");
          context.fillRect(0, 0, 1, 1);
          return (
            "#" +
            Array.from(context.getImageData(0, 0, 1, 1).data)
              .slice(0, 3)
              .map((value) => value.toString(16).padStart(2, "0"))
              .join("")
          );
        });
        expect(decodeURIComponent(data)).toContain(palette);
        await show(
          page.locator('[data-kind="mermaid-block"]'),
          "style-mermaid-" + theme,
        );
        await choose("mcp");
        await expandProcess();
        const row = page.locator('[data-activity-kind="mcpToolCall"]').first();
        const toggle = row.locator("button[aria-expanded]").first();
        if ((await toggle.getAttribute("aria-expanded")) === "false")
          await toggle.click();
        const result = page.locator(".workflow-mcp-result").first();
        await token(result, "gap", "--space-3");
        await show(result, "style-mcp-result-" + theme);
        await choose("media");
        const image = page.locator(".workflow-markdown-image-button").first();
        await token(image, "border-top-left-radius", "--radius-md");
        await keyboardFocus(image);
        await token(image, "outline-color", "--accent");
        await show(image, "style-media-" + theme);
      });
      await check("style-dialog-and-navigation-" + theme, async () => {
        await choose("markdown");
        const trigger = page.getByRole("button", {
          name: "展开表格",
          exact: true,
        });
        await trigger.click();
        const dialog = page.getByRole("dialog", { name: "表格预览" });
        await token(dialog, "background-color", "--surface-popover");
        await token(dialog, "box-shadow", "--shadow-lg");
        await token(dialog, "background-color", "--overlay", "::backdrop");
        await token(dialog, "border-top-left-radius", "--card-radius");
        await snapshot("style-dialog-" + theme);
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
        const file = page.getByRole("button", {
          name: "本地文件",
          exact: true,
        });
        await token(file, "color", "--accent");
        await file.click();
        const preview = page.getByRole("dialog", { name: "evidence.ts" });
        await expect(preview.locator(".is-target-line")).toContainText(
          "const answer = 42",
        );
        await token(preview.locator("pre"), "color", "--text-2");
        await token(preview.locator("pre"), "font-family", "--font-mono");
        await token(
          preview.locator(".is-target-line"),
          "background-color",
          "--accent-soft",
        );
        await snapshot("style-file-preview-" + theme);
        await page.keyboard.press("Escape");
        await expect(file).toBeFocused();
        await page
          .locator(".session-title-text")
          .filter({ hasText: "验收 history " })
          .click();
        await expect(
          page.locator(".workflow-message-navigation"),
        ).toBeVisible();
        const nav = page.locator(".workflow-message-navigation");
        await nav.locator("summary").click();
        await token(
          nav.locator("nav"),
          "background-color",
          "--surface-popover",
        );
        await token(nav.locator("nav"), "border-top-color", "--border");
        await snapshot("style-navigation-" + theme);
        await nav.locator("summary").click();
      });
    }
    await check(
      "style-custom-accent-updates-current-diagram-and-focus",
      async () => {
        await choose("markdown");
        const diagram = page.getByAltText("Mermaid 图表");
        await expect(
          page.locator('[data-kind="mermaid-block"]'),
        ).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
        const before = await diagram.getAttribute("src");
        await page.evaluate(() => {
          document.documentElement.style.setProperty("--accent", "#a749bf");
          document.documentElement.style.setProperty(
            "--accent-soft",
            "rgb(167 73 191 / 0.14)",
          );
        });
        await expect
          .poll(() => diagram.getAttribute("src"), { timeout: 30000 })
          .not.toBe(before);
        await expect(
          page.locator('[data-kind="mermaid-block"]'),
        ).toHaveAttribute("aria-busy", "false", { timeout: 30000 });
        expect(decodeURIComponent(await diagram.getAttribute("src"))).toContain(
          "#a749bf",
        );
        await show(
          page.locator('[data-kind="mermaid-block"]'),
          "style-custom-accent-mermaid",
        );
        await choose("questions");
        const select = page
          .locator(".workflow-question-card")
          .first()
          .getByLabel("单选", { exact: true });
        await keyboardFocus(select);
        await expect(select).toHaveCSS("outline-color", "rgb(167, 73, 191)");
      },
    );
  } finally {
    await page.evaluate(({ theme, style }) => {
      if (theme) document.documentElement.dataset.theme = theme;
      if (style === null) document.documentElement.removeAttribute("style");
      else document.documentElement.setAttribute("style", style);
    }, original);
  }
}
