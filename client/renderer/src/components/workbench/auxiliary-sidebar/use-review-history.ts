import { useEffect, useState } from "react";
import { useUnifiedChatStore } from "@/stores/unified-chat-store";

/** Finish all history pages, sharing any in-flight conversation request. */
export async function loadSessionReviewHistory(
  sessionId: string,
  signal: AbortSignal,
) {
  const get = useUnifiedChatStore.getState;
  const waitForRequest = () =>
    new Promise<void>((resolve) => {
      const finish = () => {
        unsubscribe();
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const unsubscribe = useUnifiedChatStore.subscribe((state) => {
        const paging = state.readThreadPaging[sessionId];
        if (!paging?.loadingMore && !paging?.loading) finish();
      });
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted) finish();
    });
  if (signal.aborted) return;
  if (get().readThreadPaging[sessionId]?.loading) await waitForRequest();
  if (signal.aborted) return;
  if (!get().readThreads[sessionId]) await get().loadReadThread(sessionId);
  if (signal.aborted) return;
  if (!get().readThreads[sessionId]) throw new Error("暂时无法读取会话变更。");
  while (!signal.aborted) {
    const paging = get().readThreadPaging[sessionId];
    if (!paging?.hasMore) break;
    if (paging.loadingMore || paging.loading) {
      await waitForRequest();
      continue;
    }
    await get().loadMoreReadThread(sessionId);
    if (signal.aborted) return;
    const next = get().readThreadPaging[sessionId];
    if (next?.hasMore && next.cursor === paging.cursor)
      throw new Error("较早的会话变更尚未加载完整。");
  }
}

/** Review shares the canonical cache and reacts if a host push exposes a history gap. */
export function useReviewHistory(sessionId: string | null, enabled: boolean) {
  const [retryKey, setRetryKey] = useState(0);
  const [result, setResult] = useState({ loading: false, error: "" });
  const cursor = useUnifiedChatStore((state) =>
    sessionId ? state.readThreadPaging[sessionId]?.cursor : undefined,
  );
  useEffect(() => {
    if (!enabled || !sessionId) {
      setResult({ loading: false, error: "" });
      return;
    }
    const controller = new AbortController();
    setResult({ loading: true, error: "" });
    void loadSessionReviewHistory(sessionId, controller.signal).then(
      () => {
        if (!controller.signal.aborted)
          setResult({ loading: false, error: "" });
      },
      (error) => {
        if (!controller.signal.aborted)
          setResult({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => controller.abort();
  }, [sessionId, enabled, retryKey, cursor]);
  return { ...result, retry: () => setRetryKey((value) => value + 1) };
}
