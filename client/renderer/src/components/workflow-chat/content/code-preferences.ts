import { create } from "zustand";

const KEY = "marloues.conversation.wrap-code";
function initialWrap() {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(KEY) === "true"
    );
  } catch {
    return false;
  }
}
export const useCodePreferences = create<{
  wrap: boolean;
  toggleWrap: () => void;
}>((set) => ({
  wrap: initialWrap(),
  toggleWrap: () =>
    set((state) => {
      const wrap = !state.wrap;
      try {
        localStorage.setItem(KEY, String(wrap));
      } catch {
        /* Session preference still works. */
      }
      return { wrap };
    }),
}));
