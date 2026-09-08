import { create } from "zustand";

interface InspectorScope {
  sessionId?: string;
  cwd?: string | null;
}
export interface ReviewTarget extends InspectorScope {
  path: string;
  rawDiff: string;
  seq: number;
}
export interface FileTarget extends InspectorScope {
  path: string;
  line?: number;
  readFile?: (path: string) => Promise<string>;
  seq: number;
}
interface InspectorState {
  visibleAuxiliaryPanels: Record<string, string>;
  setAuxiliaryPanelSession: (ownerId: string, sessionId: string | null) => void;
  reviewTarget: ReviewTarget | null;
  fileTarget: FileTarget | null;
  openReview: (path: string, rawDiff: string, scope?: InspectorScope) => void;
  openFile: (path: string, options?: Omit<FileTarget, "path" | "seq">) => void;
  clearReview: () => void;
}
let revealSeq = 0;
/** Each intent is consumed once, then retained in that session's auxiliary tab. */
export const useInspectorStore = create<InspectorState>((set) => ({
  visibleAuxiliaryPanels: {},
  setAuxiliaryPanelSession: (ownerId, sessionId) =>
    set((state) => {
      if ((state.visibleAuxiliaryPanels[ownerId] ?? null) === sessionId)
        return state;
      const visibleAuxiliaryPanels = { ...state.visibleAuxiliaryPanels };
      if (sessionId) visibleAuxiliaryPanels[ownerId] = sessionId;
      else delete visibleAuxiliaryPanels[ownerId];
      return { visibleAuxiliaryPanels };
    }),
  reviewTarget: null,
  fileTarget: null,
  openReview: (path, rawDiff, scope) =>
    set({ reviewTarget: { ...scope, path, rawDiff, seq: ++revealSeq } }),
  openFile: (path, options) =>
    set({ fileTarget: { ...options, path, seq: ++revealSeq } }),
  clearReview: () => set({ reviewTarget: null }),
}));
