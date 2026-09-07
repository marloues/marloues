import { it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("electron", () => ({
  app: {
    getPath: () => {
      throw new Error("Electron userData is not configured yet");
    },
  },
}));
vi.mock("../../client/main/services/session-store", () => ({
  upsertSessionRecord: vi.fn(),
}));
it("initializes the imported legacy store inside an explicit app home before Electron is ready", async () => {
  const home = mkdtempSync(join(tmpdir(), "marloues-store-isolation-"));
  const dir = join(home, "electron-user-data");
  mkdirSync(dir);
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({
      sessions: [
        { id: "isolation", title: "独立会话", updatedAt: 1, messages: [] },
      ],
    }),
  );
  const original = process.env.MARLOUES_HOME;
  process.env.MARLOUES_HOME = home;
  try {
    const { store } = await import("../../client/main/store");
    expect(store.getSession("isolation")?.title).toBe("独立会话");
    store.renameSession("isolation", "已保存到独立目录");
    store.saveSync();
    expect(
      JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).sessions[0]
        .title,
    ).toBe("已保存到独立目录");
  } finally {
    if (original === undefined) delete process.env.MARLOUES_HOME;
    else process.env.MARLOUES_HOME = original;
  }
});
