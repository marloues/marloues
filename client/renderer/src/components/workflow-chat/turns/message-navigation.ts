import type { WorkflowTurn } from "@shared/workflow-read-thread-contract";

export interface MessageNavigationEntry {
  id: string;
  index: number;
  title: string;
  preview: string;
}

function previewText(text: string): string {
  return text
    .replace(/```[^\n]*\n/g, "")
    .replace(/```/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|\n)\s*(?:#{1,6}\s+|>\s*)/g, "$1")
    .replace(/(\*\*|__|~~)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Index the canonical turns without normalizing every historical tool item. */
export function messageNavigationEntries(
  turns: WorkflowTurn[],
): MessageNavigationEntry[] {
  return turns.map((turn, index) => {
    const user = turn.items.find((item) => item.type === "userMessage");
    const title =
      user?.type === "userMessage"
        ? user.content
            .filter((part) => part.type === "text")
            .map((part) => ("text" in part ? part.text : ""))
            .join(" ")
        : "";
    const messages = turn.items.filter(
      (item) => item.type === "agentMessage" && item.text.trim(),
    );
    const final = messages.filter(
      (item) => item.type === "agentMessage" && item.phase === "final_answer",
    );
    const answer = (final.length ? final : messages.slice(-1))
      .map((item) => (item.type === "agentMessage" ? item.text : ""))
      .join("\n");
    return {
      id: turn.id,
      index,
      title:
        previewText(title).slice(0, 200) ||
        (user ? "附件消息" : `第 ${index + 1} 轮`),
      preview:
        previewText(answer).slice(0, 400) ||
        (turn.status === "running" ? "正在处理这条消息…" : "本轮暂无回复正文"),
    };
  });
}

export interface NavigationBounds {
  left: number;
  top: number;
  bottom: number;
  width: number;
}

/** A 40px rail plus 16px clearance on either side must fit in existing whitespace. */
export function messageNavigationLayout(
  viewport: NavigationBounds,
  contentLeft: number,
  windowHeight: number,
  bottomInset = 0,
) {
  const top = Math.max(0, viewport.top);
  const bottom = Math.min(windowHeight, viewport.bottom - bottomInset);
  const availableHeight = bottom - top;
  if (
    viewport.width <= 0 ||
    contentLeft - viewport.left < 72 ||
    availableHeight < 180
  )
    return null;
  return {
    left: viewport.left + 16,
    top: top + availableHeight / 2,
    maxHeight: Math.min(240, availableHeight - 32),
    viewportTop: top,
    viewportBottom: bottom,
  };
}
