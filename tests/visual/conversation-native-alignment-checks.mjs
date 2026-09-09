import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../client/package.json", import.meta.url),
);
const { expect } = require("@playwright/test");

/** Assertions from the actual Codex screenshots, applied to the same frozen turns. */
export async function verifyNativeAlignment(page, caseId, capture) {
  const images = [];
  if (caseId === "qa-markdown") {
    const user = page.locator(".workflow-user-message-text");
    await expect(user.locator("h1")).toHaveText("标题一级");
    await expect(user.locator("strong").first()).toContainText("粗体");
    const visible = await user.textContent();
    expect(visible).not.toContain("\\#");
    expect(visible).not.toContain("\\\n");
    expect(visible).not.toContain("&#x20;");
    expect(visible).not.toContain("**粗体**");
    await user.scrollIntoViewIfNeeded();
    images.push(await capture("aligned-user-input"));

    const diagram = page.locator('[data-kind="mermaid-block"]');
    await expect(diagram.locator("img")).toBeVisible({ timeout: 20000 });
    await diagram.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(diagram.locator(".workflow-code-block-header")).toHaveCount(0);
    const toolbar = diagram.locator("[data-copy-exclude]");
    await expect(toolbar).toHaveCSS("opacity", "0");
    await expect(diagram).toHaveCSS("border-top-width", "0px");
    const graphSize = await diagram.locator("img").boundingBox();
    expect(graphSize.width).toBeLessThan(500);
    images.push(await capture("aligned-mermaid"));
    await diagram.hover();
    await expect(toolbar).toHaveCSS("opacity", "1");
    await diagram.getByRole("button", { name: "源码", exact: true }).click();
    await expect(diagram.locator("pre")).toContainText("flowchart LR");
    await diagram.getByRole("button", { name: "图表", exact: true }).click();

    const table = page.locator('[data-kind="markdown-table"]').first();
    const trigger = table.getByRole("button", {
      name: "展开表格",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "表格预览", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("table")).toHaveCSS("border-top-width", "0px");
    const preview = dialog.locator(".workflow-table-preview");
    expect(
      await preview.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    const close = await dialog
      .getByRole("button", { name: "关闭表格预览" })
      .boundingBox();
    expect(close.y).toBeLessThan(60);
    expect(close.x).toBeGreaterThan(page.viewportSize().width - 80);
    images.push(await capture("aligned-table-preview"));
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await page.setViewportSize({ width: 760, height: 980 });
    await trigger.click();
    expect(
      await preview.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
    images.push(await capture("aligned-table-narrow"));
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 980 });

    const composerInput = page.locator(".composer-rich-input");
    const composerContent = composerInput.locator(".cm-content");
    await expect(page.locator(".composer textarea")).toHaveCount(0);
    await composerContent.click();
    await composerContent.evaluate((element) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData(
        "text/html",
        "<h1>草稿标题</h1><p><strong>粗体草稿</strong></p>",
      );
      clipboardData.setData("text/plain", "草稿标题\n\n粗体草稿");
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    const composerHeading = composerContent.locator(".cm-composer-heading-1");
    await expect(composerHeading).toContainText("草稿标题");
    expect(await composerHeading.evaluate((node) => node.innerText)).toBe(
      "草稿标题",
    );
    const composerStrong = composerContent.locator(".cm-composer-strong");
    await expect(composerStrong).toContainText("粗体草稿");
    expect(await composerStrong.evaluate((node) => node.innerText)).toBe(
      "粗体草稿",
    );
    await expect(
      composerContent.locator(".cm-composer-hidden").first(),
    ).toBeHidden();
    expect(
      await composerContent.evaluate((node) => node.innerText),
    ).not.toContain("#");
    expect(
      await composerContent.evaluate((node) => node.innerText),
    ).not.toContain("**");
    await composerInput.scrollIntoViewIfNeeded();
    images.push(await capture("aligned-composer-rich-input"));
    await composerContent.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
  } else if (caseId === "qa-command-completed") {
    await expect(page.locator(".workflow-turn-duration").first()).toHaveText(
      "1分钟 16秒",
    );
    const files = page.locator('[data-result-kind="diff"]');
    await expect(files.locator(".workflow-result-file-row")).toHaveCount(3);
    await files.getByRole("button", { name: "再显示 2 个文件" }).click();
    await expect(files.locator(".workflow-result-file-path")).toHaveText([
      "outputs/empty.bin",
      "outputs/evidence.ts",
      "outputs/fifth.txt",
      "outputs/fourth.txt",
      "outputs/third.txt",
    ]);
    const evidence = files
      .locator(".workflow-result-file-row")
      .filter({ hasText: "outputs/evidence.ts" });
    await expect(evidence.locator(".workflow-result-diff-stats")).toHaveText(
      "+2-1",
    );
    await files.scrollIntoViewIfNeeded();
    images.push(await capture("aligned-files-and-duration"));
    const turn = page
      .locator('[data-kind="turn-header"][aria-expanded]')
      .first();
    if ((await turn.getAttribute("aria-expanded")) === "false")
      await turn.click();
    const groups = page.locator('[data-activity-kind="summary"]');
    await expect(groups).toHaveCount(1);
    if ((await groups.first().getAttribute("aria-expanded")) === "false")
      await groups.first().click();
    const failed = page
      .locator('[data-activity-kind="commandExecution"]')
      .filter({ hasText: "预期失败输出" });
    await expect(failed.locator(".workflow-activity-row-text")).toContainText(
      "已运行",
    );
    await failed.locator(":scope > button").click();
    await expect(failed.locator(".workflow-command-status")).toContainText(
      "失败",
    );
    await expect(failed.locator(".workflow-command-metadata")).toContainText(
      "退出码 1",
    );
    await expect(failed.locator(".workflow-command-code").last()).toContainText(
      "预期失败输出",
    );
    await failed.scrollIntoViewIfNeeded();
    images.push(await capture("aligned-failed-command"));
  } else throw new Error("No native comparison assertions for " + caseId);
  return images;
}
