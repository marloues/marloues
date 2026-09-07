import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowReadThreadResponse } from "@shared/workflow-read-thread-contract";
import { useUnifiedChatStore } from "../../client/renderer/src/stores/unified-chat-store";

vi.hoisted(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      marloues: { chat: {} },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  });
});

function snapshot(first: number, last: number): WorkflowReadThreadResponse {
  return {
    schemaVersion: 2,
    thread: {
      id: "history",
      title: "history",
      preview: "",
      status: { type: "idle" },
    },
    turns: Array.from({ length: first - last + 1 }, (_, i) => ({
      id: `turn-${first - i}`,
      status: "completed",
      items: [],
    })),
    page: {
      order: "newest_first",
      limit: 100,
      hasMore: last > 0,
      nextCursor: last > 0 ? `turn-${last}` : null,
    },
  };
}

describe("conversation history pagination through the renderer store", () => {
  beforeEach(() => {
    useUnifiedChatStore.setState({
      activeSessionId: "history",
      sessions: [],
      allSessions: [],
      readThreads: {},
      readThreadPaging: {},
      executionBySession: {},
      streamingSessionIds: {},
    });
  });

  it("loads the next cursor, preserves newest-first order and refreshes all cached turns", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(snapshot(159, 60))
      .mockResolvedValueOnce(snapshot(59, 0))
      .mockResolvedValueOnce(snapshot(159, 0));
    window.marloues.chat.readThread = read;
    await useUnifiedChatStore.getState().loadReadThread("history");
    await useUnifiedChatStore.getState().loadMoreReadThread("history");
    expect(read).toHaveBeenNthCalledWith(2, "history", {
      cursor: "turn-60",
      limit: 100,
    });
    expect(
      useUnifiedChatStore
        .getState()
        .readThreads.history?.turns.map((t) => t.id),
    ).toEqual(snapshot(159, 0).turns.map((t) => t.id));
    expect(
      useUnifiedChatStore.getState().readThreadPaging.history?.hasMore,
    ).toBe(false);
    await useUnifiedChatStore.getState().loadReadThread("history");
    expect(read).toHaveBeenNthCalledWith(3, "history", { limit: 160 });
  });

  it("keeps loaded old pages when the host pushes a new head, without resurrecting removed recent turns", () => {
    useUnifiedChatStore.getState().handleReadThread(snapshot(159, 0));
    const update = snapshot(160, 61);
    update.turns = update.turns.filter((t) => t.id !== "turn-158");
    useUnifiedChatStore.getState().handleReadThread(update);
    const stored = useUnifiedChatStore.getState();
    expect(stored.readThreads.history?.turns).toHaveLength(160);
    expect(stored.readThreads.history?.turns[0].id).toBe("turn-160");
    expect(stored.readThreads.history?.turns.at(-1)?.id).toBe("turn-0");
    expect(
      stored.readThreads.history?.turns.some((t) => t.id === "turn-158"),
    ).toBe(false);
    expect(stored.readThreadPaging.history?.hasMore).toBe(false);
  });

  it("does not splice a noncontiguous stale tail into a new page", () => {
    useUnifiedChatStore.getState().handleReadThread(snapshot(159, 0));
    useUnifiedChatStore.getState().handleReadThread(snapshot(400, 301));
    expect(
      useUnifiedChatStore.getState().readThreads.history?.turns,
    ).toHaveLength(100);
    expect(
      useUnifiedChatStore.getState().readThreadPaging.history?.cursor,
    ).toBe("turn-301");
  });

  it("finishes delayed pagination in its source session after switching away", async () => {
    useUnifiedChatStore.getState().handleReadThread(snapshot(159, 60));
    let resolve!: (value: WorkflowReadThreadResponse) => void;
    window.marloues.chat.readThread = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loading = useUnifiedChatStore
      .getState()
      .loadMoreReadThread("history");
    useUnifiedChatStore.getState().setActiveSession("other");
    resolve(snapshot(59, 0));
    await loading;
    expect(useUnifiedChatStore.getState().activeSessionId).toBe("other");
    expect(
      useUnifiedChatStore.getState().readThreads.history?.turns,
    ).toHaveLength(160);
    expect(useUnifiedChatStore.getState().readThreads.other).toBeUndefined();
    expect(
      useUnifiedChatStore.getState().readThreadPaging.history?.loadingMore,
    ).toBe(false);
  });
});
