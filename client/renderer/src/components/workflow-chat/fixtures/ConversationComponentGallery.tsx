import { workflowShouldShowProcessItem } from "../turns/turn-collapse-rules";
import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy, FileText, Terminal } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DisclosureRow,
  Divider,
  Skeleton,
  Spinner,
  StateDot,
  Tooltip,
} from "@/components/ui";
import { WorkflowActivityRow } from "../activity/ActivityRow";
import { WorkflowResultCards } from "../activity/ResultCards";
import { WorkflowTurnItemRenderer } from "../activity/TurnItemRenderer";
import { ComposerTaskProgress } from "../composer/ComposerTaskProgress";
import { WorkflowMarkdownProvider } from "../content/MarkdownContext";
import { WorkflowMarkdownContent } from "../content/MarkdownContent";
import { copyConversationContent } from "../content/clipboard";
import { IoCard } from "../disclosure/IoCard";
import { WorkflowReasoningDisclosureRow } from "../activity/ReasoningDisclosureRow";
import { WorkflowToolDisclosureRow } from "../activity/ToolDisclosureRow";
import { WorkflowTurnView } from "../turns/TurnView";
import {
  componentActivityExamples,
  componentFixtureCwd,
  componentTurnExample,
  readComponentFixtureFile,
  turnExampleOptions,
  type TurnExample,
} from "./conversation-component-examples";
import styles from "./ConversationComponentGallery.module.css";

export function ConversationComponentGallery() {
  const [group, setGroup] = useState(() => {
    const value = new URLSearchParams(window.location.search).get(
      "fixtureGroup",
    );
    return value === "activities" || value === "turns" ? value : "primitives";
  });
  return (
    <main>
      <WorkflowMarkdownProvider
        value={{
          sessionId: "component-gallery",
          turnId: "component-gallery-items",
          cwd: componentFixtureCwd,
          readFile: readComponentFixtureFile,
        }}
      >
        <div className={styles.gallery}>
          <div className={styles.intro}>
            <h1>对话区组件展示</h1>
            <p className={styles.description}>
              使用正式组件和示例数据。点击文件路径打开示例内容，点击展开行查看详情，切换主题检查样式。
              Markdown、表格、图表和媒体预览见“内容”，MCP
              内容和图片结果卡见“工具结果”。
            </p>
            <div className={styles.row} role="group" aria-label="组件分类">
              {[
                ["primitives", "公共展示组件"],
                ["activities", "消息与执行过程"],
                ["turns", "轮次状态与耗时"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={group === value ? "secondary" : "ghost"}
                  aria-pressed={group === value}
                  onClick={() => {
                    setGroup(value);
                    const url = new URL(window.location.href);
                    url.searchParams.set("fixtureGroup", value);
                    window.history.replaceState(null, "", url);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          {group === "primitives" ? (
            <PrimitiveExamples />
          ) : group === "activities" ? (
            <ActivityExamples />
          ) : (
            <TurnExamples />
          )}
        </div>
      </WorkflowMarkdownProvider>
    </main>
  );
}

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.example}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function PrimitiveExamples() {
  const [open, setOpen] = useState(false);
  const [clicks, setClicks] = useState(0);
  return (
    <section className={styles.section} aria-labelledby="gallery-primitives">
      <h2 id="gallery-primitives">公共展示组件</h2>
      <Example title="Card · 标题、说明、正文、页脚">
        <Card>
          <CardHeader>
            <CardTitle>检查结果</CardTitle>
            <CardDescription>
              卡片的颜色、边框和圆角来自公共组件。
            </CardDescription>
          </CardHeader>
          <CardContent>公共组件负责样式，业务组件负责内容和状态。</CardContent>
          <CardFooter>
            <Badge variant="success">已完成</Badge>
          </CardFooter>
        </Card>
      </Example>
      <Example title="文件链接 · 名称、目录层级与行号">
        <p className={styles.description}>
          默认显示文件名，自定义名称决定目录层级。悬浮查看完整路径，点击打开文件。
        </p>
        <WorkflowMarkdownContent
          content={[
            "默认名称：[/component-gallery/src/theme.ts](/component-gallery/src/theme.ts)",
            "自定义目录：[ui/index.ts](/component-gallery/src/ui/index.ts) · [runtime/index.ts](/component-gallery/src/runtime/index.ts)",
            "指定行：[/component-gallery/src/theme.ts:3](/component-gallery/src/theme.ts:3)",
            "自定义名称与格式：[**主题定义**](/component-gallery/src/theme.ts:3) · [`ui/index.ts`](/component-gallery/src/ui/index.ts)",
          ].join("\n\n")}
        />
      </Example>
      <Example title="DisclosureRow · 折叠、展开、运行、失败、静态">
        <DisclosureRow
          icon={<FileText />}
          title="查看检查详情"
          summary="受控展开"
          open={open}
          onOpenChange={setOpen}
        >
          <IoCard
            input="检查组件样式"
            output="颜色、字号与间距使用统一 token。"
          />
        </DisclosureRow>
        <DisclosureRow
          icon={<Terminal />}
          title="默认展开"
          summary="输入与输出"
          defaultOpen
        >
          <IoCard input="npm run typecheck:web" output="类型检查通过。" />
        </DisclosureRow>
        <DisclosureRow
          icon={<StateDot state="running" />}
          title="正在检查样式"
          summary="运行状态"
          state="running"
          expandable={false}
        />
        <DisclosureRow
          icon={<StateDot state="error" />}
          title="检查失败"
          summary="点击查看失败原因"
          summaryTone="danger"
          state="error"
          iconTone="danger"
        >
          <IoCard input="读取示例文件" output="示例文件不存在。" failed />
        </DisclosureRow>
        <DisclosureRow
          icon={<Check />}
          title="静态状态行"
          summary="没有可展开的详情"
          expandable={false}
        />
      </Example>
      <Example title="Badge / StateDot · 标签与状态点">
        <div className={styles.row}>
          <Badge>默认</Badge>
          <Badge variant="success">成功</Badge>
          <Badge variant="warning">警告</Badge>
          <Badge variant="danger">失败</Badge>
          <Badge variant="info">提示</Badge>
        </div>
        <div className={styles.row}>
          <span className={styles.status}>
            <StateDot state="running" />
            运行中
          </span>
          <span className={styles.status}>
            <StateDot state="success" />
            已完成
          </span>
          <span className={styles.status}>
            <StateDot state="error" />
            失败
          </span>
        </div>
      </Example>
      <Example title="Spinner / Skeleton · 加载与占位">
        <div className={styles.row}>
          <Spinner size="sm" label="小型加载" />
          <Spinner label="标准加载" />
          <Spinner size="lg" label="大型加载" />
        </div>
        <Skeleton width="80%" rounded />
        <Skeleton width="55%" rounded />
      </Example>
      <Example title="Button / Tooltip / Divider · 操作与提示">
        <div className={styles.row}>
          <Button onClick={() => setClicks((value) => value + 1)}>
            主操作
          </Button>
          <Button
            variant="outline"
            onClick={() => setClicks((value) => value + 1)}
          >
            次操作
          </Button>
          <Button
            variant="ghost"
            onClick={() => setClicks((value) => value + 1)}
          >
            轻量操作
          </Button>
          <Button disabled>不可用</Button>
          <Tooltip content="图标按钮的提示" side="bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="图标操作"
              onClick={() => setClicks((value) => value + 1)}
            >
              <Copy />
            </Button>
          </Tooltip>
        </div>
        <Divider />
        <div className={styles.verticalDivider}>
          <span>左侧</span>
          <Divider orientation="vertical" />
          <span>右侧</span>
        </div>
        <output className={styles.feedback} aria-live="polite">
          演示操作 {clicks} 次
        </output>
      </Example>
    </section>
  );
}

function ActivityExamples() {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.section} aria-labelledby="gallery-activities">
      <h2 id="gallery-activities">消息与执行过程</h2>
      <Example title="WorkflowActivityRow · 公共展开行的业务组合">
        <WorkflowActivityRow
          activityKind="gallery-activity"
          icon={<FileText />}
          label="组件样式检查"
          meta="3 项通过"
          open={open}
          onToggle={() => setOpen((value) => !value)}
          detail={<p>颜色、字号、间距均来自统一设计 token。</p>}
        />
      </Example>
      <Example title="ReasoningDisclosureRow / ToolDisclosureRow / IoCard · 消息行组合">
        <WorkflowReasoningDisclosureRow text="先检查公共样式，再查看组件在不同主题中的表现。" />
        <WorkflowToolDisclosureRow
          name="exec_command"
          summary="npm run typecheck:web"
          failed={false}
          running={false}
          detail={
            <IoCard input="npm run typecheck:web" output="类型检查通过。" />
          }
        />
      </Example>
      {componentActivityExamples
        .filter(({ item }) => workflowShouldShowProcessItem(item))
        .map(({ title, item }) => (
          <Example key={item.id} title={title}>
            <WorkflowTurnItemRenderer item={item} />
          </Example>
        ))}
      <Example title="WorkflowResultCards · 文件变更摘要">
        <WorkflowResultCards
          items={componentActivityExamples.flatMap(({ item }) =>
            item.type === "fileChange" ? [item] : [],
          )}
        />
      </Example>
      <Example title="ComposerTaskProgress · 步骤与文件统计">
        <ComposerTaskProgress
          tasks={[
            {
              id: "gallery-task-1",
              ordinal: 1,
              title: "检查公共组件",
              status: "completed",
              createdAt: 0,
              updatedAt: 0,
            },
            {
              id: "gallery-task-2",
              ordinal: 2,
              title: "验证主题",
              status: "running",
              createdAt: 0,
              updatedAt: 0,
            },
            {
              id: "gallery-task-3",
              ordinal: 3,
              title: "整理结果",
              status: "creating",
              createdAt: 0,
              updatedAt: 0,
            },
          ]}
          fileChangeSummary={{ filesChanged: 3, insertions: 24, deletions: 8 }}
        />
      </Example>
    </section>
  );
}

function TurnExamples() {
  const [example, setExample] = useState<TurnExample>("completed");
  return (
    <section className={styles.section} aria-labelledby="gallery-turns">
      <h2 id="gallery-turns">轮次状态与耗时</h2>
      <p className={styles.description}>
        包含用户消息、助手正文、过程分组、错误、耗时、Token
        用量和底部操作。历史示例覆盖只有起止时间及完全没有计时记录的情况。
      </p>
      <div className={styles.row} role="group" aria-label="轮次示例">
        {turnExampleOptions.map(([value, label]) => (
          <Button
            key={value}
            variant={example === value ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={example === value}
            onClick={() => setExample(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <TurnExampleView key={example} example={example} />
    </section>
  );
}

function TurnExampleView({ example }: { example: TurnExample }) {
  const message = useMemo(
    () => componentTurnExample(example, Date.now()),
    [example],
  );
  const [expanded, setExpanded] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [forks, setForks] = useState(0);
  return (
    <div className={styles.stack} data-turn-example={example}>
      <WorkflowTurnView
        message={message}
        sessionId="component-gallery"
        expanded={expanded}
        isLastStreaming={message.status === "running"}
        modelName="示例模型"
        onToggle={() => setExpanded((value) => !value)}
        onCopy={async (text) => {
          await copyConversationContent({ text });
          setFeedback("已复制示例内容");
        }}
        onFork={() => setForks((value) => value + 1)}
      />
      <output className={styles.feedback} aria-live="polite">
        {feedback || "复制可写入剪贴板；分支仅记录演示次数。"} 分支演示 {forks}{" "}
        次
      </output>
    </div>
  );
}
