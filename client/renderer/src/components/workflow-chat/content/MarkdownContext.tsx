import { createContext, useContext, type ReactNode } from "react";

export type MarkdownContextValue = {
  sessionId?: string;
  turnId?: string;
  cwd?: string | null;
  writingBlockMode?: boolean;
  onAddSelection?: (text: string) => void;
};
const Context = createContext<MarkdownContextValue>({});
export const useMarkdownContext = () => useContext(Context);
export function WorkflowMarkdownProvider({
  value,
  children,
}: {
  value: MarkdownContextValue;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
