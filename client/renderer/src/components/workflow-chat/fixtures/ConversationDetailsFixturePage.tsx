import { MessageNavigationFixture } from "./MessageNavigationFixture";
import { ConversationInspectorFixture } from "./ConversationInspectorFixture";
import {
  componentInspectorSource,
  detailsInspectorFileSystem,
} from "./conversation-inspector-source";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useThemeStore } from "@/stores/theme-store";
import type { WorkflowReadThreadResponse } from "@shared/workflow-read-thread-contract";
import { workflowToolResult } from "@shared/workflow-tool-result";
import { WorkflowReadThreadTurnList } from "../turns/ReadThreadTurnList";
import { WorkflowMarkdownProvider } from "../content/MarkdownContext";
import { WorkflowToolCallRow } from "../activity/ToolCallRow";
import { WorkflowResultCards } from "../activity/ResultCards";
import { WorkflowImageGenerationRow } from "../activity/ImageGenerationRow";
import { useConversationScroll } from "../composer/use-conversation-scroll";
import { copyConversationContent } from "../content/clipboard";
import { MarkdownErrorBoundary } from "../content/MarkdownErrorBoundary";
import { ConversationComponentGallery } from "./ConversationComponentGallery";
import "./conversation-details-fixture.css";

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180"><rect width="480" height="180" fill="#e6edf2"/><circle cx="90" cy="90" r="44" fill="#355f76"/><text x="170" y="100" font-size="24" fill="#355f76">Marloues</text></svg>')}`;
const content = [
  "已经把对话内容接到 Marloues 的组件里。表格、图表和文件链接可以直接操作。",
  "### 结果一览\n\n| 内容 | 展示方式 | 状态 |\n| :--- | :--- | ---: |\n| 表格 | 横向滚动、展开、复制 | 完成 |\n| Mermaid | 图表 / 源码 | 完成 |\n| 公式 | $E = mc^2$ | 完成 |",
  "```ts\nconst message = { role: 'assistant', content: 'A deliberately long line to verify wrapping while streaming keeps the same code block and horizontal position.' };\n```",
  "```mermaid\nflowchart LR\n  A[用户输入] --> B[执行工具]\n  B --> C[展示结果]\n```",
  "阅读 [示例文件](./src/example.ts:3)，或访问 [项目网站](https://example.com)。",
  `![结果图片](${image})`,
  "有序步骤：\n\n1. 检查输入\n2. 展示结果\n\n- [x] 已接入正式对话区\n- [ ] 等待交互验收",
].join("\n\n");

export function ConversationDetailsFixturePage() {
  const [section, setSection] = useState(() => {
    const value = new URLSearchParams(window.location.search).get(
      "fixtureSection",
    );
    return [
      "components",
      "content",
      "tools",
      "navigation",
      "scroll",
      "recovery",
    ].includes(value ?? "")
      ? value!
      : "content";
  });
  const [theme, setTheme] = useState(() => {
    const value = new URLSearchParams(window.location.search).get(
      "fixtureTheme",
    );
    return value === "light" || value === "warm" ? value : "dark";
  });
  useEffect(() => {
    const root = document.documentElement;
    const { mode, isDark } = useThemeStore.getState();
    const previous = {
      theme: root.dataset.theme,
      preference: root.dataset.themePreference,
      scheme: root.style.colorScheme,
      classes: ["dark", "light", "warm"].filter((value) =>
        root.classList.contains(value),
      ),
    };
    root.dataset.theme = theme;
    root.dataset.themePreference = theme;
    root.style.colorScheme = theme === "dark" ? "dark" : "light";
    root.classList.remove("dark", "light", "warm");
    root.classList.add(theme);
    // 同步依赖主题状态的预览（如 diff），不调用会持久化偏好的 setMode。
    useThemeStore.setState({ mode: theme, isDark: theme === "dark" });
    return () => {
      if (previous.theme === undefined) delete root.dataset.theme;
      else root.dataset.theme = previous.theme;
      if (previous.preference === undefined)
        delete root.dataset.themePreference;
      else root.dataset.themePreference = previous.preference;
      root.style.colorScheme = previous.scheme;
      root.classList.remove("dark", "light", "warm");
      root.classList.add(...previous.classes);
      useThemeStore.setState({ mode, isDark });
    };
  }, [theme]);
  const [streaming, setStreaming] = useState(false);
  const [source, setSource] = useState(content);
  const [copies, setCopies] = useState(0);
  const [forks, setForks] = useState(0);
  const [forkFailure, setForkFailure] = useState(false);
  const readThread = useMemo<WorkflowReadThreadResponse>(
    () => ({
      schemaVersion: 2,
      thread: {
        id: "details-fixture",
        title: "对话区组件",
        preview: "",
        cwd: "/fixture",
        status: { type: streaming ? "active" : "idle" },
      },
      page: {
        order: "newest_first",
        limit: 10,
        nextCursor: null,
        hasMore: false,
      },
      turns: [
        {
          id: "details-turn",
          zone: "workspace",
          status: streaming ? "running" : "completed",
          error: null,
          startedAt: 1788591600000,
          completedAt: streaming ? undefined : 1788591612000,
          durationMs: 12000,
          items: [
            {
              type: "userMessage",
              id: "prompt",
              content: [
                { type: "text", text: "展示对话区组件，并验证它们的交互。" },
              ],
              settled: true,
            },
            {
              type: "agentMessage",
              id: "answer",
              phase: "final_answer",
              text: source,
              settled: !streaming,
            },
          ],
        },
      ],
    }),
    [source, streaming],
  );
  return (
    <ConversationInspectorFixture
      source={
        section === "components"
          ? componentInspectorSource
          : {
              sessionId: "details-fixture",
              readThread,
              workspacePath: "/fixture",
              fileSystem: detailsInspectorFileSystem,
            }
      }
    >
      <div className="conversation-details-fixture">
        <header>
          <strong>Marloues / 对话区验收</strong>
          <nav aria-label="验收页面">
            {[
              ["components", "组件展示"],
              ["content", "内容"],
              ["tools", "工具结果"],
              ["navigation", "消息导航"],
              ["scroll", "滚动"],
              ["recovery", "异常恢复"],
            ].map(([id, label]) => (
              <Button
                key={id}
                variant={section === id ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={section === id}
                onClick={() => {
                  setSection(id);
                  updateFixtureQuery("fixtureSection", id);
                }}
              >
                {label}
              </Button>
            ))}
          </nav>
          <div
            className="fixture-theme-controls"
            role="group"
            aria-label="预览主题"
          >
            {(
              [
                ["dark", "深色"],
                ["light", "浅色"],
                ["warm", "暖色"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={theme === value ? "secondary" : "ghost"}
                size="sm"
                aria-label={`主题：${label}`}
                aria-pressed={theme === value}
                onClick={() => {
                  setTheme(value);
                  updateFixtureQuery("fixtureTheme", value);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </header>
        {section === "components" ? (
          <ConversationComponentGallery />
        ) : section === "content" ? (
          <>
            <div className="fixture-controls">
              <button
                onClick={() => {
                  setSource("```ts\nconst first = 1;\n\nconst second = 2;");
                  setStreaming(true);
                }}
              >
                开始流式代码
              </button>
              <button
                onClick={() =>
                  setSource((value) => value + "\nconst third = 3;")
                }
              >
                追加代码
              </button>
              <button
                onClick={() => {
                  setSource((value) => value + "\n```\n\n完成。");
                  setStreaming(false);
                }}
              >
                结束流式代码
              </button>
              <button
                onClick={() => {
                  setSource(content);
                  setStreaming(false);
                }}
              >
                恢复内容
              </button>
              <button
                onClick={() => setSource("```mermaid\nthis is invalid\n```")}
              >
                错误图表
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={forkFailure}
                  onChange={(e) => setForkFailure(e.target.checked)}
                />
                分支失败
              </label>
              <output data-testid="action-count">
                复制 {copies} / 分支 {forks}
              </output>
            </div>
            <main>
              <WorkflowReadThreadTurnList
                readThread={readThread}
                isStreaming={streaming}
                disableResponseTimer
                onCopyMessage={async (text) => {
                  setCopies((value) => value + 1);
                  await copyConversationContent({ text });
                }}
                onFork={async () => {
                  setForks((value) => value + 1);
                  await new Promise((resolve) => setTimeout(resolve, 300));
                  if (forkFailure) throw new Error("分支暂不可用，请重试");
                }}
              />
            </main>
          </>
        ) : section === "tools" ? (
          <main>
            <WorkflowMarkdownProvider
              value={{ sessionId: "details-fixture", cwd: "/fixture" }}
            >
              <WorkflowToolCallRow
                item={{
                  type: "mcpToolCall",
                  id: "mcp-result",
                  tool: "result_preview",
                  server: "demo",
                  status: "completed",
                  settled: true,
                  result: workflowToolResult({
                    content: [
                      {
                        type: "text",
                        text: "**工具内容**\n\n| 名称 | 结果 |\n| --- | --- |\n| 读取 | 成功 |",
                      },
                      {
                        type: "image",
                        mimeType: "image/svg+xml",
                        data: btoa(
                          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="teal"/></svg>',
                        ),
                      },
                      {
                        type: "audio",
                        mimeType: "audio/wav",
                        data: "UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==",
                      },
                      {
                        type: "resource_link",
                        uri: "https://example.com/report",
                        name: "资源报告",
                      },
                      {
                        type: "resource",
                        resource: {
                          uri: "file:///fixture/src/example.ts",
                          mimeType: "text/plain",
                          text: "const answer = 42;",
                        },
                      },
                      { type: "future-content", detail: "保留未知类型" },
                    ],
                    structuredContent: { count: 2, ok: true },
                  }),
                }}
              />
              <WorkflowImageGenerationRow
                item={{
                  type: "imageGeneration",
                  id: "cancelled-image",
                  status: "cancelled",
                  revisedPrompt: "一张海报",
                  settled: true,
                }}
              />
              <WorkflowResultCards
                items={[
                  {
                    type: "imageGeneration",
                    id: "gallery-a",
                    status: "completed",
                    result: image,
                    settled: true,
                  },
                  {
                    type: "imageGeneration",
                    id: "gallery-b",
                    status: "completed",
                    result: image.replace("355f76", "8b4d60"),
                    settled: true,
                  },
                ]}
              />
            </WorkflowMarkdownProvider>
          </main>
        ) : section === "navigation" ? (
          <MessageNavigationFixture />
        ) : section === "recovery" ? (
          <RecoveryFixture />
        ) : (
          <ScrollFixture />
        )}
      </div>
    </ConversationInspectorFixture>
  );
}

function updateFixtureQuery(key: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(null, "", url);
}

let fixtureFault = false;
function FixtureFault() {
  if (fixtureFault) throw new Error("QA_MARKDOWN_BOUNDARY_FAILURE");
  return <p>正文已经恢复</p>;
}
function RecoveryFixture() {
  const [version, setVersion] = useState(0);
  const [, refresh] = useState(0);
  return (
    <main>
      <button
        onClick={() => {
          fixtureFault = true;
          refresh((v) => v + 1);
        }}
      >
        触发正文异常
      </button>
      <button
        onClick={() => {
          fixtureFault = false;
        }}
      >
        解除测试故障
      </button>
      <button
        onClick={() => {
          fixtureFault = false;
          setVersion((v) => v + 1);
        }}
      >
        更新正文标识
      </button>
      <p>过程和已生成产物始终保留</p>
      <MarkdownErrorBoundary contentKey={String(version)}>
        <FixtureFault />
      </MarkdownErrorBoundary>
    </main>
  );
}

function ScrollFixture() {
  const [session, setSession] = useState("A");
  const [rows, setRows] = useState({ A: 40, B: 40 });
  const [loaded, setLoaded] = useState(0);
  const [pending, setPending] = useState(false);
  const releaseLoad = useRef<() => void>();
  const [expanded, setExpanded] = useState(true);
  const scroll = useConversationScroll({
    sessionKey: `fixture-${session}`,
    contentSignal: rows,
    hasMore: true,
    loadingMore: pending,
    onLoadMore: () => {
      setPending(true);
      return new Promise<void>((resolve) => {
        releaseLoad.current = () => {
          setRows((value) => ({
            ...value,
            [session]: value[session as "A" | "B"] + 10,
          }));
          setLoaded((value) => value + 1);
          setPending(false);
          resolve();
        };
      });
    },
  });
  return (
    <>
      <div className="fixture-controls">
        <button
          onClick={() => setSession((value) => (value === "A" ? "B" : "A"))}
        >
          切换会话
        </button>
        <button
          onClick={() =>
            setRows((value) => ({
              ...value,
              [session]: value[session as "A" | "B"] + 5,
            }))
          }
        >
          流式追加
        </button>
        <button onClick={() => releaseLoad.current?.()}>完成历史加载</button>
        <button onClick={() => scroll.scrollToBottom()}>回到底部</button>
        <output data-testid="scroll-state">
          会话 {session} / 吸底 {String(scroll.isAtBottom)} / 加载{" "}
          {pending ? "等待" : loaded}
        </output>
      </div>
      <div
        className="fixture-scroll"
        ref={scroll.viewportRef}
        onScroll={scroll.handleScroll}
        tabIndex={0}
        data-testid="scroll-viewport"
      >
        <div ref={scroll.contentRef}>
          <input
            aria-label="滚动区域输入框"
            placeholder="编辑时 Home 不应影响吸底"
          />
          {Array.from({ length: rows[session as "A" | "B"] }, (_, index) => (
            <section key={index} data-row={index}>
              <p>
                会话 {session} · 消息 {index + 1}
              </p>
              {index === 25 ? (
                <>
                  <button
                    aria-expanded={expanded}
                    onClick={() => setExpanded((value) => !value)}
                  >
                    展开详情
                  </button>
                  {expanded ? (
                    <div style={{ height: 300 }}>工具详情</div>
                  ) : null}
                </>
              ) : (
                <p>正在检查交互状态，阅读历史时保持当前位置。</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
