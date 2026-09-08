import { describe, expect, it } from "vitest";
import type { WorkflowTurn } from "@shared/workflow-read-thread-contract";
import {
  messageNavigationEntries,
  messageNavigationLayout,
} from "@/components/workflow-chat/turns/message-navigation";
const turn = (items: WorkflowTurn["items"], id = "one"): WorkflowTurn => ({
  id,
  items,
  zone: "workspace",
  status: "completed",
  error: null,
});

describe("message navigation previews", () => {
  it("uses the prompt and final reply, excluding intermediate tool output", () => {
    const [entry] = messageNavigationEntries([
      turn([
        {
          type: "userMessage",
          id: "user",
          content: [{ type: "text", text: "查看 user_name 的定义" }],
        },
        {
          type: "agentMessage",
          id: "progress",
          phase: "commentary",
          text: "正在读取工具结果",
        },
        {
          type: "agentMessage",
          id: "answer",
          phase: "final_answer",
          text: "### 完成\n\n已修改 **组件**，见 [文件](src/ui.ts)。",
        },
      ]),
    ]);
    expect(entry).toEqual({
      id: "one",
      index: 0,
      title: "查看 user_name 的定义",
      preview: "完成 已修改 组件，见 文件。",
    });
  });
  it("uses the latest commentary until a final answer is available", () => {
    const [entry] = messageNavigationEntries([
      turn([
        {
          type: "agentMessage",
          id: "old",
          phase: "commentary",
          text: "第一步",
        },
        {
          type: "agentMessage",
          id: "new",
          phase: "commentary",
          text: "第二步",
        },
      ]),
    ]);
    expect(entry.preview).toBe("第二步");
  });
  it("provides an attachment label and a running preview when text is absent", () => {
    const [entry] = messageNavigationEntries([
      {
        ...turn([
          {
            type: "userMessage",
            id: "user",
            content: [{ type: "image", url: "test.png" }],
          },
        ]),
        status: "running",
      },
    ]);
    expect(entry.title).toBe("附件消息");
    expect(entry.preview).toBe("正在处理这条消息…");
  });
  it("preserves turn identity when earlier history is prepended", () => {
    const original = messageNavigationEntries([
      turn([], "older"),
      turn([], "target"),
    ]);
    const expanded = messageNavigationEntries([
      turn([], "first"),
      turn([], "older"),
      turn([], "target"),
    ]);
    expect(original[1].id).toBe(expanded[2].id);
    expect(expanded[2].index).toBe(2);
  });
  it("bounds long previews and never uses raw tool output as the summary", () => {
    const [entry] = messageNavigationEntries([
      turn([{ type: "agentMessage", id: "long", text: "内容".repeat(500) }]),
    ]);
    expect(entry.preview).toHaveLength(400);
    expect(messageNavigationEntries([turn([])])[0].preview).toBe(
      "本轮暂无回复正文",
    );
  });
});

describe("message navigation fits existing conversation whitespace", () => {
  const viewport = { left: 240, top: 80, bottom: 980, width: 1100 };
  it("uses the actual left gutter and stays above the composer", () => {
    expect(messageNavigationLayout(viewport, 400, 1000, 240)).toEqual({
      left: 256,
      top: 410,
      maxHeight: 240,
      viewportTop: 80,
      viewportBottom: 740,
    });
  });
  it("hides when an auxiliary pane shrinks the conversation even on a wide display", () => {
    expect(
      messageNavigationLayout({ ...viewport, width: 650 }, 272, 1000),
    ).toBeNull();
  });
  it("requires enough clearance and never changes the message width", () => {
    expect(messageNavigationLayout(viewport, 311, 1000)).toBeNull();
    expect(messageNavigationLayout(viewport, 312, 1000)).not.toBeNull();
  });
  it("hides for an invisible conversation or insufficient vertical room", () => {
    expect(
      messageNavigationLayout({ ...viewport, width: 0 }, 400, 1000),
    ).toBeNull();
    expect(messageNavigationLayout(viewport, 400, 200)).toBeNull();
  });
});
