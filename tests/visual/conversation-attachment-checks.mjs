/** Layout and keyboard regressions in the production Electron conversation.
 * Read actual geometry; visibility alone missed reversed items and overlapping
 * inline file controls. Inputs come from the real persisted-session fixture. */
import { attachmentLongFilename } from "../fixtures/conversation-full/scenes.mjs";

export async function attachmentChecks({
  page,
  check,
  choose,
  snapshot,
  expect,
}) {
  const original = {
    viewport: page.viewportSize(),
    theme: await page.evaluate(() => document.documentElement.dataset.theme),
  };
  const strips = () =>
    page.locator(
      '[data-kind="user-message-images"], [data-kind="user-message-attachments"]',
    );
  const pills = () => page.locator(".workflow-user-attachment-pill");
  const contained = async (locator) => {
    await expect
      .poll(() =>
        locator.evaluate((element) => {
          const strip = element.closest('[role="region"]');
          const e = element.getBoundingClientRect();
          const s = strip.getBoundingClientRect();
          return e.left >= s.left - 1 && e.right <= s.right + 1;
        }),
      )
      .toBe(true);
  };
  const layout = async () => {
    const faults = await page
      .locator('[data-kind="user-message"]')
      .evaluate((user) => {
        const errors = [];
        const rect = (e) => e.getBoundingClientRect();
        const u = rect(user);
        const imageStrip = user.querySelector(
          '[data-kind="user-message-images"]',
        );
        const attachmentStrip = user.querySelector(
          '[data-kind="user-message-attachments"]',
        );
        if (rect(imageStrip).bottom > rect(attachmentStrip).top + 1)
          errors.push("images overlap references");
        for (const strip of [imageStrip, attachmentStrip]) {
          const s = rect(strip);
          if (s.left < u.left - 1 || s.right > u.right + 1)
            errors.push("strip escapes message");
          if (getComputedStyle(strip).scrollbarWidth !== "none")
            errors.push("visible scrollbar");
          const items = [
            ...strip.querySelectorAll(
              ".user-image-chip, .workflow-user-attachment-pill",
            ),
          ];
          for (let i = 1; i < items.length; i++) {
            if (rect(items[i - 1]).right > rect(items[i]).left)
              errors.push("reversed or overlapping items");
            if (Math.abs(rect(items[i - 1]).top - rect(items[i]).top) > 1)
              errors.push("unexpected item wrap");
          }
        }
        for (const pill of user.querySelectorAll(
          ".workflow-user-attachment-pill",
        )) {
          const p = rect(pill);
          const children = [...pill.children];
          if (p.height < 30 || p.height > 34) errors.push("wrong pill height");
          for (let i = 0; i < children.length; i++) {
            const c = rect(children[i]);
            if (
              c.width < 1 ||
              c.left < p.left ||
              c.right > p.right + 1 ||
              c.top < p.top ||
              c.bottom > p.bottom + 1
            )
              errors.push("pill content escapes or disappears");
            if (Math.abs(c.top + c.height / 2 - (p.top + p.height / 2)) > 1)
              errors.push("pill content not aligned");
            if (i && rect(children[i - 1]).right > c.left)
              errors.push("overlapping pill content");
          }
        }
        for (const container of [
          document.documentElement,
          user.closest(".messages-scroll"),
          user.closest(".messages-inner"),
        ]) {
          if (!container) throw new Error("Missing conversation container");
          if (container.scrollWidth > container.clientWidth + 1)
            errors.push("page or conversation overflow");
        }
        return errors;
      });
    expect(faults).toEqual([]);
  };
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const theme of ["light", "dark", "warm"]) {
      await check("attachment-layout-" + theme, async () => {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        for (const width of [1440, 960]) {
          await page.setViewportSize({ width, height: 980 });
          await choose("attachments");
          await expect(
            pills().locator(".workflow-user-content-label"),
          ).toHaveText([
            "evidence.ts",
            "附件链接",
            "验收技能",
            "@引用文件",
            "页面注释",
          ]);
          await expect(pills().first()).toHaveText("evidence.ts");
          await layout();
          await snapshot(`attachment-original-${theme}-${width}`);
          await choose("attachment-layout");
          await expect(
            pills().first().locator(".workflow-user-content-label"),
          ).toHaveText(attachmentLongFilename);
          await expect(pills().first()).toHaveAttribute(
            "title",
            new RegExp(attachmentLongFilename.replaceAll(".", "\\.")),
          );
          const label = pills().first().locator(".workflow-user-content-label");
          const line = pills().first().locator(".workflow-user-content-detail");
          await expect(line).toHaveText("2");
          expect(
            await line.evaluate((e) => e.scrollWidth <= e.clientWidth),
          ).toBe(true);
          expect(
            await label.evaluate((e) => e.scrollWidth > e.clientWidth),
          ).toBe(true);
          await expect(
            pills().nth(1).locator(".workflow-user-content-detail"),
          ).toHaveText("2");
          await expect(
            page.locator(".user-image-chip img").first(),
          ).toHaveAttribute("alt", "image.svg");
          await expect(
            page.locator(".user-image-chip img").nth(1),
          ).toHaveAttribute("alt", "second.svg");
          await layout();
          if (width === 960) {
            for (const strip of await strips().all())
              expect(
                await strip.evaluate((e) => e.scrollWidth > e.clientWidth),
              ).toBe(true);
          }
          await snapshot(`attachment-overflow-${theme}-${width}`);
        }
      });
    }
    await check("attachment-layout-keyboard-preview-and-scroll", async () => {
      await page.setViewportSize({ width: 960, height: 980 });
      await choose("attachment-layout");
      for (const strip of await strips().all()) {
        await strip.focus();
        await page.keyboard.press("End");
        const before = await strip.evaluate((e) => e.scrollLeft);
        await page.keyboard.press("ArrowLeft");
        await expect
          .poll(() => strip.evaluate((e) => e.scrollLeft))
          .toBeLessThan(before);
        await page.keyboard.press("Tab");
        const first = strip.locator("button, a").first();
        await expect(first).toBeFocused();
        await contained(first);
      }
      await page.keyboard.press("Enter");
      const longFile = page.getByRole("dialog", {
        name: attachmentLongFilename,
      });
      await expect(longFile).toContainText("长名称的实际磁盘文件");
      await page.keyboard.press("Escape");
      await expect(pills().first()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(pills().nth(1)).toBeFocused();
      await contained(pills().nth(1));
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("dialog").locator(".is-target-line"),
      ).toContainText("const answer = 42");
      await snapshot("attachment-file-line-preview");
      await page.keyboard.press("Escape");
      await expect(pills().nth(1)).toBeFocused();
      const firstImage = page.locator(".user-image-chip").first();
      await firstImage.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog").locator("img")).toHaveAttribute(
        "src",
        /image\.svg$/,
      );
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("dialog").locator("img")).toHaveAttribute(
        "src",
        /second\.svg$/,
      );
      await page.keyboard.press("Escape");
      await expect(firstImage).toBeFocused();
      await layout();
      await snapshot("attachment-keyboard-focus");
    });
  } finally {
    if (original.viewport) await page.setViewportSize(original.viewport);
    await page.evaluate((theme) => {
      if (theme) document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
    }, original.theme);
  }
}
