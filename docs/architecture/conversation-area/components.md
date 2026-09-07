# 对话区组件职责与参数

> 本表是实现前的组件规格。已落地的组件、实际参数入口和剩余差距见[代码落地记录](implementation.md)。

状态：**已有**表示职责已接入；**扩展**表示已有组件承接但规则有差距；**新增**表示需要新的可见组件职责；**能力**表示还需要运行时或宿主协议。这里的名字是 Marloues 的拟定组件名，Codex 压缩函数名只用于证据定位。

现有文件位于 `client/renderer/src/components/workflow-chat/`，可点击[实际源码索引](marloues-source.md)逐项查看；完整当前主树见[主规格](../marloues-conversation-area.md)。原始 Codex props、JSX 入参和文件范围见 [components.json](components.json)，本表给出应用到 Marloues 时有意义的参数。

## 轮次与正文

| 职责 / Marloues 归属 | 状态 | 参数与交互责任 | 来源 |
|---|---|---|---|
| 时间线 `ReadThreadTurnList` | 扩展 | `readThread, stateScopeKey, scrollParentRef`；稳定 turn key、分页、虚拟化；新增按消息 ID 定位和交互 pin。 | 主规格 W01/W10 |
| 单轮适配 `TurnView / buildTurnPresentationModel` | 扩展 | `message, isLastStreaming, liveItemWindow`；统一正文、过程、错误、结果、时间决策。 | 主规格 W01–W03 |
| 过程容器 `AssistantTurn / AgentFlowSection` | 扩展 | `model, expanded, entries`；保存用户展开选择；持续交互内容与可冻结过程分开。 | [D24](evidence.md#d24) |
| 用时 `WorkflowTurnDuration` | 扩展 | 由 `timing.mode/placement/basis` 决定位置与文案；每秒更新局限在组件内。 | 主规格 MR09–MR13 |
| 工作状态 `ThinkingPlaceholder` | 扩展 | `kind, visible, reserveSpace`；不要与等待问题/权限、工具状态重复。 | 主规格 MR07–MR08 |
| 助手正文 `AssistantAnswer / MarkdownContent` | 扩展 | 当前 `content, streaming`；增加宿主上下文、媒体与链接策略、流式 fence 状态、错误边界。 | [D02–D03](evidence.md#d02) |
| 标题、段落、强调、列表、引用、分隔线 | 已有/扩展 | 保留 ReactMarkdown/GFM；核对 RTL、中文段落、任务列表只读语义和首尾间距。无需每个标签新建文件。 | [D07–D08](evidence.md#d07) |
| 普通代码 `WorkflowCodeBlock` | 扩展 | 当前只有 `children`，内部提取语言/复制文本；拟接 `content, language, fenceOpen, wrapMode, stickyHeader`。 | [D04–D05](evidence.md#d04) |
| 流式代码 `PendingCodeBlock` | 已有/扩展 | 当前未闭合 fence 用纯文本；闭合后允许复制/高亮；交接时维持块身份和视口。 | [D03–D05](evidence.md#d03) |
| 写作块 `WorkflowWritingBlock` | 新增 | `content, streaming, canCopy, onAddSelection`；仅选定模式下的无语言/text/md/markdown fence；流式禁止添加选区。 | [D04–D05](evidence.md#d04) |
| 图表 `WorkflowMermaidBlock` | 新增 | `code, fenceOpen, theme, allowWide, onCopy, onDownload`；渲染键、上次尺寸、加载/错误回退。 | [D06](evidence.md#d06) |
| 公式 `WorkflowMath` | 新增 | `text, display`；异步公式 renderer；加载回退原文本；可复用成熟数学渲染库，不能把普通 code 当公式。 | [D08](evidence.md#d08) |
| 表格 `WorkflowMarkdownTable` | 新增 | `markdownSource, children, allowWide, onCopy`；横向滚动、复制、预览入口。 | [D07](evidence.md#d07) |
| 表格弹层 `WorkflowTablePreview` | 新增 | `open, content, onOpenChange`；独立滚动、焦点恢复；复用对话框基础设施，关闭图像缩放/下载控件。 | [D07](evidence.md#d07) |
| 链接 `WorkflowMarkdownLink` | 新增/能力 | `href, label, cwd, hostId, conversationId, onOpenFile, externalResourcePolicy`；按真实目标路由。 | [D09](evidence.md#d09) |
| 行内代码引用 `WorkflowInlineCode` | 新增/能力 | `content, precedingText, decorateText`；普通代码、文件/插件等引用有不同处理；引用点击与复制语义分开。 | [D04](evidence.md#d04) |
| 正文媒体 `WorkflowMarkdownMedia` | 新增/能力 | `src, alt, title, hostId, mediaCacheKey, presentation, allowWide`；解析本地/远端源，呈现图片、音频或视频。 | [D10](evidence.md#d10) |
| 媒体占位/不可用状态 | 新增 | `kind, status, label, layout`；保留可访问名称；何时占位依呈现模式，不能统一规定 loading 都留同样高度。 | [D10](evidence.md#d10) |
| 图片预览 `WorkflowImageLightbox` | 已有/扩展 | 已有 `image, images, onNavigate, onClose`，下载、键盘切换、缩放、焦点约束/恢复；结果卡调用目前未传完整 gallery。 | [D10/D18](evidence.md#d18) |
| 引用/折叠正文 `WorkflowContentDirective` | 新增/能力 | `name, attributes, rawText, children, context`；文件引用、详情块、后续提问、可视化按白名单处理。 | [D11](evidence.md#d11) |
| 选区/注释 `WorkflowResponseAnnotation` | 新增/能力 | `threadId, turnId, targetId, annotations, onAdd, onNavigate`；选区只绑定目标正文；编辑/滚动后仍能定位。 | [D02/D12](evidence.md#d02) |
| 正文错误边界 | 新增 | `contentKey, onRetry`；隔离渲染异常，不让整个轮次消失。 | [D03](evidence.md#d03) |

## 用户消息、操作与请求

| 职责 / Marloues 归属 | 状态 | 参数与交互责任 | 来源 |
|---|---|---|---|
| 用户气泡 `WorkflowUserMessage` | 扩展 | 当前 `text, content, createdAt, onCopy, onEdit`；补 message identity 和独立 delivery/status 信息。 | [D12](evidence.md#d12) |
| 附件条与图片缩略图 | 已有/扩展 | 图片、文件、上下文、注释、选中文字分组；空文本有附件仍显示；宿主文件入口保留行范围。 | [D01/D12](evidence.md#d01) |
| 行内编辑 `WorkflowUserMessageEditor` | 新增/能力 | `identity, initialContent, draft, submitting, onCancel, onChange, onSubmit`；失败保留原附件与草稿。当前 onEdit 只回填 composer。 | [D12](evidence.md#d12) |
| 消息状态/来源 `WorkflowMessageOrigin` | 新增/能力 | heartbeat、委派来源、目标回复、hook 阻止/反馈、goal；来源链接只调用受支持的导航。 | [D01/D23](evidence.md#d01) |
| 助手操作 `TurnFooterView` | 扩展 | 复制、分支、删除已有；补 `isForking, alwaysShowActions, timestampPolicy, getCopyHtml`；空栏不占位。 | [D02](evidence.md#d02) |
| 详情复制 `WorkflowDetailCopyButton` | 已有/扩展 | `value, label`；反馈只在复制成功后，计时器卸载清理；表格/正文使用独立 HTML payload。 | [D05/D07](evidence.md#d05) |
| 统计/引用尾部插槽 | 新增/能力 | 可选 review/hook/goal/memory 元信息，不由 footer 猜测；无数据不生成假的徽标。 | [D02](evidence.md#d02) |
| 回答记录 `WorkflowQuestionAnswerRecord` | 新增/能力 | `requestId, questionsAndAnswers, skipped, completed`；摘要计数、展开答案，与待回答表单分开。 | [D15](evidence.md#d15) |
| 权限记录 `WorkflowPermissionRequestRow` | 扩展 | 已区分 pending/denied/cancelled/timed_out；当前是历史状态展示，无批准按钮。表单仍由授权请求宿主负责。 | [D15](evidence.md#d15) |
| elicitation 卡 `WorkflowElicitationCard` | 新增/能力 | `requestId, kind, status, payload, onRespond`；工具建议、connector auth、URL action、表单与未知请求分支。 | [D15](evidence.md#d15) |
| 实时交接记录 `WorkflowTranscriptRecord` | 新增/能力 | `handoffId, entries, conversationId`；按说话者/条目顺序呈现，避免与正文重复播报。 | [D23](evidence.md#d23) |

## 工具、过程与结果

| 职责 / Marloues 归属 | 状态 | 参数与交互责任 | 来源 |
|---|---|---|---|
| 工具路由 `TurnItemRenderer` | 已有/扩展 | 当前 16 个 ProcessItem 类型入口；新增类型须先贯通共享契约及 adapter。 | [D01](evidence.md#d01) |
| 行/分组 `ActivityRow / ActivityGroup` | 扩展 | 展示职责复用；稳定组身份、类型对应的默认展开、显式用户选择。 | [D24](evidence.md#d24) |
| 折叠状态 `WorkflowToolDisclosure` | 新增 hook/组件边界 | `itemKey, policy, phase, hasContent, onExpand`；policy 区分命令、普通工具与可交互卡，不强制所有运行项展开。 | [D13–D14](evidence.md#d13) |
| 命令摘要 `CommandExecutionRow` | 扩展 | 读文件/搜索/列目录专用摘要，通用命令详情默认关闭；后台进程状态与轮次状态分离。 | [D13](evidence.md#d13) |
| 命令输出 `WorkflowCommandDetail` | 扩展 | 完整 command/cwd/output、独立复制已有；补可靠 `exitCode, interrupted, processId, durationMs`。 | [D13](evidence.md#d13) |
| 文件变更 `FileChangeRow` | 扩展 | patch applied/rejected/pending/streaming/stopped/auto-review-declined；每文件独立摘要与 diff。 | [D13](evidence.md#d13) |
| 文件预览与整轮 diff | 扩展 | `ResultCards` 当前按路径取最新 patch，前三项/展开更多，审核入口和 hover diff 已有；补无文本改动、回滚与锚点策略。 | [D17](evidence.md#d17) |
| 工具详情壳 `ToolDetailFrame` | 已有 | `title, statusKind, statusText, cancellable, isCancelling, onCancel`；取消按钮阻止冒泡并显示执行中状态。 | 本地 ToolDetailFrame |
| 通用详情 `ToolDetail` | 扩展 | 当前解析 input/output 为计划、工具搜索、网页搜索、生图、usage 或通用文本；补 typed content，不靠名称和 JSON 猜完所有类型。 | [D14](evidence.md#d14) |
| 计划 `PlanDetail / MarkdownDetail` | 扩展 | 现有步骤勾选与 Markdown；拟补总进度、current step、tooltip；proposed plan 不等同于 update_plan 工具结果。 | [D16](evidence.md#d16) |
| 网页搜索 `WebSearchRow / WebSearchDetail` | 扩展 | `action, query, queries, url, status`；按 search/open/find 展示，而非固定“搜索”。 | [D01](evidence.md#d01) |
| 工具搜索 / usage 详情 | 已有 | 沿用 parser 与 section；usage 是否出现在过程列表由 activity contract 决定，有 renderer 不等于默认可见。 | 本地 detail-sections |
| MCP 内容 `WorkflowToolContent` | 新增/能力 | `blocks, structuredContent`；text/image/audio/resource_link/embedded_resource/unknown 分别呈现，保留 annotations。 | [D14](evidence.md#d14) |
| 原始工具结果 `WorkflowRawToolResult` | 新增 | `callId, invocation, durationMs, result, open`；按需序列化，不让超大 JSON 常驻渲染。 | [D14](evidence.md#d14) |
| 交互卡 `WorkflowMcpAppSurface` | 新增/能力 | `appId, callId, resourceUri, html, status, minHeight, collapsible, onRetry`；loading/error/fallback/就绪、身份及状态保持。 | [D14](evidence.md#d14) |
| 自动审批评审 `WorkflowApprovalReview` | 新增/能力 | `reviews, outcome, reason`；与普通 permission 决策分开，可嵌入命令/MCP/patch。 | [D13/D20](evidence.md#d20) |
| 协作 `CollabAgentToolRow` | 扩展 | 已有协作行与子任务页；补消息来源、代理活动和事件列表，点击绑定源任务身份。 | [D22](evidence.md#d22) |
| 运行错误 `TurnErrorCard` | 扩展 | 现有独立错误卡保留；新增 reconnect/retry 元信息及错误详情；重试必须带源 turn ID。 | [D20–D21](evidence.md#d20) |
| 上下文压缩、模型切换等事件 | 扩展/能力 | 已有压缩/hook/review marker；补 model/personality/reroute/worktree-init 的中性事件记录。 | [D23](evidence.md#d23) |
| 生图 `ImageGenerationRow / ResultCards` | 扩展 | 现有 status/result/savedPath；补 pendingCount、批次身份、失败/取消与成功图分离。 | [D18](evidence.md#d18) |
| 资源列表 `WorkflowResourceList` | 新增/能力 | `resources, identity, cwd, hostId, onOpen`；5 类资源、展开更多、按资源种类提供操作。 | [D19](evidence.md#d19) |
| 文件/网站/远端文档等资源行 | 新增/能力 | `resource, capability, loading, error, onOpen, onCopyLink`；文件格式、宿主打开目标与远端 URL 分开。 | [D19](evidence.md#d19) |
| 导航 `WorkflowMessageNavigation` | 新增 | `items, activeId, onPreview, onNavigate`；hover 预览不滚动，确认后定位虚拟列表。 | 主规格 MR39 |
| 滚动 `useConversationScroll` | 扩展 | 消息提交放置、吸底、用户脱离、分页补偿、折叠锚点、会话令牌和恢复；由同一个 hook 协调。 | 主规格 MR32–MR38 |

## 落地后的职责树

下图带 `+` 的是拟新增职责，不代表代码已经存在。可以把小组件放在现有文件内部，不要求逐项拆文件。

```text
WorkflowTurnView → buildTurnPresentationModel
├─ WorkflowUserMessage
│  ├─ 附件/图片预览（已有）
│  ├─ + WorkflowMessageOrigin
│  └─ + WorkflowUserMessageEditor
└─ WorkflowAssistantTurn
   ├─ timing / indicator / process（扩展现有）
   ├─ TurnPresentationBlocks
   │  ├─ process → ActivityRenderer → TurnItemRenderer
   │  │  ├─ 命令 / patch / 搜索 / 计划 / 协作（扩展现有）
   │  │  ├─ ToolDetail → + WorkflowToolContent / RawToolResult
   │  │  └─ + QuestionAnswerRecord / ElicitationCard / ApprovalReview
   │  ├─ + persistent → WorkflowMcpAppSurface 等持续交互内容
   │  ├─ document → AssistantAnswer → MarkdownContent
   │  │  ├─ CodeBlock / PendingCodeBlock（扩展现有）
   │  │  ├─ + WritingBlock / MermaidBlock / Math
   │  │  ├─ + MarkdownTable → TablePreview
   │  │  ├─ + MarkdownLink / InlineCode / ContentDirective
   │  │  └─ + MarkdownMedia → ImageLightbox（复用已有）
   │  ├─ error → TurnErrorCard（扩展现有）
   │  └─ results → ResultCards + WorkflowResourceList
   └─ TurnFooterView（扩展操作与时间戳策略）
```
