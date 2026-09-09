import { create } from "zustand";

export type AuxiliaryTabIntent =
  | { type: "outputs"; sessionId: string }
  | {
      type: "review";
      sessionId: string;
      path: string;
      diff: string;
    }
  | { type: "file"; sessionId: string; path: string }
  | {
      type: "terminal";
      sessionId: string;
      terminalSessionId?: string;
    }
  | {
      type: "browser";
      sessionId: string;
      pageId?: string;
      url?: string;
    }
  | {
      type: "subagent";
      sessionId: string;
      subagentId: string;
    };

interface AuxiliaryTabIntentState {
  seq: number;
  intent: AuxiliaryTabIntent | null;
  request: (intent: AuxiliaryTabIntent) => void;
  clear: (seq: number) => void;
}

export const useAuxiliaryTabIntentStore = create<AuxiliaryTabIntentState>(
  (set) => ({
    seq: 0,
    intent: null,
    request: (intent) => set((state) => ({ intent, seq: state.seq + 1 })),
    clear: (seq) =>
      set((state) => (state.seq === seq ? { intent: null } : state)),
  }),
);

export function openAuxiliaryTab(intent: AuxiliaryTabIntent): void {
  useAuxiliaryTabIntentStore.getState().request(intent);
}
