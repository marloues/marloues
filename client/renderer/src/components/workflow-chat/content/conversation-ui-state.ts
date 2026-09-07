import { useCallback, type SetStateAction } from "react";
import { create } from "zustand";
import { useMarkdownContext } from "./MarkdownContext";

// UI state follows source identity across virtualized rows and task switches.
// It is deliberately memory-only: conversation drafts never enter localStorage.
const useConversationState = create<{
  values: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
}>((set) => ({
  values: {},
  set: (key, value) =>
    set((state) => ({ values: { ...state.values, [key]: value } })),
}));
export function useConversationStateValue<T>(
  key: string,
  fallback: T,
): [T, (value: SetStateAction<T>) => void] {
  const value = useConversationState(
    (state) => (state.values[key] as T | undefined) ?? fallback,
  );
  const setter = useCallback(
    (next: SetStateAction<T>) => {
      const state = useConversationState.getState();
      const current = (state.values[key] as T | undefined) ?? fallback;
      state.set(
        key,
        typeof next === "function" ? (next as (value: T) => T)(current) : next,
      );
    },
    [key, fallback],
  );
  return [value, setter];
}
export function useItemDisclosure(itemId: string, fallback = false) {
  const { sessionId, turnId } = useMarkdownContext();
  return useConversationStateValue(
    JSON.stringify([sessionId ?? "local", turnId ?? "", itemId, "open"]),
    fallback,
  );
}
