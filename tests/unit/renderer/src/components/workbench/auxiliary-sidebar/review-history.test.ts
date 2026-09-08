import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSessionReviewHistory } from "@/components/workbench/auxiliary-sidebar/use-review-history";
import { useUnifiedChatStore } from "@/stores/unified-chat-store";
import type { WorkflowReadThreadResponse } from "@shared/workflow-read-thread-contract";

const snapshot: WorkflowReadThreadResponse = {
  schemaVersion: 2,
  thread: {
    id: "session-a",
    title: "A",
    preview: "",
    status: { type: "idle" },
  },
  page: {
    order: "newest_first",
    limit: 100,
    nextCursor: "older-1",
    hasMore: true,
  },
  turns: [],
};
const original = useUnifiedChatStore.getState();
const paging = {
  cursor: "older-1",
  hasMore: true,
  loading: false,
  loadingMore: false,
};
const setPaging = (value: Partial<typeof paging>) =>
  useUnifiedChatStore.setState({
    readThreadPaging: { "session-a": { ...paging, ...value } },
  });

describe("review history loading", () => {
  beforeEach(() =>
    useUnifiedChatStore.setState({
      readThreads: { "session-a": snapshot },
      readThreadPaging: { "session-a": { ...paging } },
      loadReadThread: vi.fn(),
      loadMoreReadThread: vi.fn(),
    }),
  );
  afterEach(() => useUnifiedChatStore.setState(original, true));
  it("loads every older page from the requested session", async () => {
    const load = vi.fn(async () => {
      if (load.mock.calls.length === 1) setPaging({ cursor: "older-2" });
      else setPaging({ hasMore: false });
    });
    useUnifiedChatStore.setState({ loadMoreReadThread: load });
    await loadSessionReviewHistory("session-a", new AbortController().signal);
    expect(load.mock.calls).toEqual([["session-a"], ["session-a"]]);
  });
  it("stops with a retryable error if a failed request makes no progress", async () => {
    const load = vi.fn(async () => {});
    useUnifiedChatStore.setState({ loadMoreReadThread: load });
    await expect(
      loadSessionReviewHistory("session-a", new AbortController().signal),
    ).rejects.toThrow("尚未加载完整");
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("shares an in-flight request instead of duplicating it", async () => {
    setPaging({ loadingMore: true });
    const pending = loadSessionReviewHistory(
      "session-a",
      new AbortController().signal,
    );
    setPaging({ loadingMore: false, hasMore: false });
    await pending;
    expect(
      useUnifiedChatStore.getState().loadMoreReadThread,
    ).not.toHaveBeenCalled();
  });
  it("cancels a wait when switching sessions or closing review", async () => {
    setPaging({ loadingMore: true });
    const controller = new AbortController();
    const pending = loadSessionReviewHistory("session-a", controller.signal);
    controller.abort();
    await pending;
    expect(
      useUnifiedChatStore.getState().loadMoreReadThread,
    ).not.toHaveBeenCalled();
  });
  it("stops requesting further pages after cancellation", async () => {
    const controller = new AbortController();
    const load = vi.fn(async () => {
      setPaging({ cursor: "older-2" });
      controller.abort();
    });
    useUnifiedChatStore.setState({ loadMoreReadThread: load });
    await loadSessionReviewHistory("session-a", controller.signal);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("reports a missing initial snapshot rather than an empty successful review", async () => {
    useUnifiedChatStore.setState({ readThreads: {}, readThreadPaging: {} });
    await expect(
      loadSessionReviewHistory("session-a", new AbortController().signal),
    ).rejects.toThrow("无法读取会话变更");
    expect(useUnifiedChatStore.getState().loadReadThread).toHaveBeenCalledWith(
      "session-a",
    );
  });
});
