import { useMemo, useState } from "react";
import type {
  WorkflowReadThreadResponse,
  WorkflowTurn,
} from "@shared/workflow-read-thread-contract";
import { Button } from "@/components/ui";
import { WorkflowReadThreadTurnList } from "../turns/ReadThreadTurnList";
import { useConversationScroll } from "../composer/use-conversation-scroll";
import styles from "./MessageNavigationFixture.module.css";

export function MessageNavigationFixture() {
  const [narrow, setNarrow] = useState(false);
  const [session, setSession] = useState("A");
  const [first, setFirst] = useState(40);
  const [version, setVersion] = useState(0);
  const turns = useMemo<WorkflowTurn[]>(
    () =>
      Array.from({ length: 160 - first }, (_, offset): WorkflowTurn => {
        const index = offset + first;
        const topics = [
          "检查最近的修改",
          "统一公共组件样式",
          "查看文件与行号",
          "汇总当前会话的审核",
          "调整消息导航",
        ];
        return {
          id: `nav-${session}-${index}`,
          zone: "workspace",
          status: index === 159 ? "running" : "completed",
          error: null,
          items: [
            {
              id: `user-${index}`,
              type: "userMessage",
              content:
                index === 56
                  ? [
                      {
                        type: "image",
                        url: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2240%22%3E%3Crect width=%2280%22 height=%2240%22 fill=%22gray%22/%3E%3C/svg%3E",
                      },
                    ]
                  : [
                      {
                        type: "text",
                        text: `${session} · 消息 ${index + 1}：${topics[index % topics.length]}`,
                      },
                    ],
            },
            {
              id: `answer-${index}`,
              type: "agentMessage",
              phase: "final_answer",
              text: [
                `这是第 ${index + 1} 条消息的回复。${topics[index % topics.length]}，继续使用统一的组件和设计 token。`,
                "对话区足够宽时，左侧显示消息导航；打开辅助区或缩窄对话区时自动隐藏。",
                "悬浮可以预览问题与回复，点击短横线跳转。阅读历史时，新内容不会把页面拉回底部。",
                index === 159
                  ? `最新回复追加次数：${version}。${"继续更新内容。".repeat(version)}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        };
      }).reverse(),
    [first, session, version],
  );
  const readThread: WorkflowReadThreadResponse = useMemo(
    () => ({
      schemaVersion: 2,
      thread: {
        id: `nav-${session}`,
        title: "消息导航示例",
        preview: "",
        status: { type: "active" },
      },
      page: {
        order: "newest_first",
        limit: 160,
        nextCursor: first ? "older" : null,
        hasMore: first > 0,
      },
      turns,
    }),
    [session, first, turns],
  );
  const scroll = useConversationScroll({
    sessionKey: `nav-fixture-${session}`,
    contentSignal: turns,
    hasMore: first > 0,
    loadingMore: false,
    onLoadMore: async () => {
      setFirst(0);
    },
  });
  return (
    <div className={styles.demo}>
      <div className={styles.controls}>
        <Button
          variant={narrow ? "ghost" : "secondary"}
          size="sm"
          onClick={() => setNarrow(false)}
        >
          宽对话区
        </Button>
        <Button
          variant={narrow ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setNarrow(true)}
        >
          窄对话区
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVersion((value) => value + 1)}
        >
          追加回复
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSession((value) => (value === "A" ? "B" : "A"))}
        >
          切换示例会话
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => scroll.scrollToBottom()}
        >
          回到底部
        </Button>
        <span role="status">
          会话 {session} · {turns.length} 条消息 ·{" "}
          {scroll.isAtBottom ? "跟随最新回复" : "阅读历史"}
        </span>
      </div>
      <div className={`chat-page ${styles.canvas}`} data-narrow={narrow}>
        <div
          className="messages-scroll scrollbar-thin"
          ref={scroll.viewportRef}
          onScroll={scroll.handleScroll}
          aria-label="导航示例会话"
          tabIndex={-1}
        >
          <div className="messages-inner" ref={scroll.contentRef}>
            <WorkflowReadThreadTurnList
              readThread={readThread}
              isStreaming
              disableResponseTimer
              scrollParentRef={scroll.viewportRef}
              onNavigateMessage={scroll.stopStick}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
