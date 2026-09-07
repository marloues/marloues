# 对话区分发分支逐项映射

本清单从安装包 AST 的 switch cases 生成；映射由源码阅读后填写。校验器检查映射没有漏项、重复或虚构分支。所有“能力”项仍属于对话区范围，当前是缺口。

## message：37 项

来源：`webview/assets/subagent-activity-chip-group-aa63c0e54657.js` → `YT` 的 `n.type`。

| 分支 | Marloues 归属 | 状态 | 显示与处置 |
|---|---|---|---|
| `external-event` | 展示模型 | 隐式事件 | 本路由返回 null；保留事件事实，不生成空气泡。 |
| `realtime-transcript` | WorkflowTranscriptRecord | 能力 | 新增有顺序的交接记录；需要 entries/handoffId。 |
| `user-message` | WorkflowUserMessage | 扩展 | 普通、heartbeat、委派、附件和 hook 状态分支分开。 |
| `assistant-message` | WorkflowAssistantAnswer | 扩展 | 正文、structured heartbeat 回退、操作栏和媒体上下文。 |
| `generated-image` | ImageGenerationRow / ResultCards | 扩展 | 特殊 failure 独立处理；无 src 且非运行态返回 null；运行中可有 pending 槽。 |
| `steered` | 展示模型的 steer 分段 | 隐式事件 | 路由不另生成活动行；保留插入顺序和前后片段。 |
| `image-view` | WorkflowImageViewRow | 扩展 | 活动行和图片预览分离，保留图片来源与会话身份。 |
| `web-search` | WorkflowWebSearchRow | 扩展 | action/query/result 与执行状态决定摘要。 |
| `worked-for` | WorkflowTurnDuration | 扩展 | 独立的工作时长条目；不能与消息 sentAt 时间戳混用。 |
| `reasoning` | WorkflowReasoningRow | 扩展 | 本地有 renderer，但默认 activity contract 隐藏，策略需明确。 |
| `exec` | WorkflowCommandExecutionRow | 扩展 | 读/搜索/列目录和通用命令分路；详情默认收起。 |
| `patch` | WorkflowFileChangeRow | 扩展 | 流式、待批准、已应用、拒绝、停止、自动评审拒绝分开。 |
| `userInput` | 等待状态与请求宿主 | 能力 | 本路由空；不可因此丢掉需要回答的请求，接 ownerTurnId。 |
| `user-input-response` | WorkflowQuestionAnswerRecord | 能力 | 回答数量、跳过与展开答案，不能归入普通权限记录。 |
| `mcp-server-elicitation` | WorkflowElicitationCard | 能力 | 见下方 8 类子路由。 |
| `permission-request` | WorkflowPermissionRequestRow | 扩展 | Codex 此路由只在未完成时显示等待；Marloues 保留终态历史是明确产品差异。 |
| `todo-list` | PlanDetail / 计划进度组件 | 扩展 | 待办步骤、完成比例和当前阶段；不要只渲染 raw JSON。 |
| `plan-implementation` | 单轮计划编排 | 能力 | 本路由空；需要在单轮计划区处理实施关系，不能假造为普通工具成功。 |
| `proposed-plan` | 单轮计划编排 | 能力 | 本路由空；提议计划与 todo/update_plan 不是同一语义。 |
| `stream-error` | WorkflowTurnErrorCard | 扩展 | 流式重连错误与详情，不吞掉已显示正文。 |
| `system-error` | WorkflowTurnErrorCard | 扩展 | 保留错误种类和 retryTurnId，允许独立错误卡。 |
| `auto-review-interruption-warning` | WorkflowApprovalReview | 能力 | 明确是评审中断提示，不能等同命令失败。 |
| `turn-diff` | WorkflowResultCards / 整轮 diff | 扩展 | 独立于单次 patch；原路由在特定 Work 展示模式不在此位置显示。 |
| `remote-task-created` | WorkflowMessageOrigin | 能力 | 任务创建引用和导航能力；没有远端任务协议时保留中性记录。 |
| `personality-changed` | WorkflowSessionEvent | 能力 | 人格变化事件，不能从正文推测。 |
| `forked-from-conversation` | WorkflowMessageOrigin | 能力 | 保留源任务身份和可用导航。 |
| `model-changed` | WorkflowSessionEvent | 能力 | fromModel/toModel。 |
| `model-rerouted` | WorkflowSessionEvent | 能力 | toModel/reason；与用户主动更换模型区分。 |
| `context-compaction` | WorkflowContextCompactionMarker | 扩展 | completed/source 决定显示，保留运行与完成区别。 |
| `worktree-init` | WorkflowSessionEvent | 能力 | 拆 worktree 输出和可选 setup 输出/结果。 |
| `mcp-tool-call` | ToolDetail / WorkflowToolContent | 扩展 | typed result、raw、remote logo 和可交互 App 分路。 |
| `automation-update` | WorkflowAutomationResult | 能力 | 专用任务变更结果；需要 arguments/result，不由字符串猜出成功。 |
| `dynamic-tool-call` | WorkflowToolCallRow | 扩展 | 保留动态工具及特化摘要接口，未知类型留 raw。 |
| `automatic-approval-review` | WorkflowApprovalReview | 能力 | 评审结果和原因，支持独立显示或附着工具。 |
| `strict-review-notice` | WorkflowApprovalReview | 能力 | 策略提示，不冒充一次审批请求。 |
| `multi-agent-action` | WorkflowCollabAgentToolRow | 扩展 | 多个代理动作的聚合和展开。 |
| `subagent-activity` | WorkflowCollabAgentToolRow | 扩展 | 代理身份、活动摘要和对应任务跳转。 |

## markdown：20 项

来源：`webview/assets/app-initial-86767c3d23e5.js` → `zua` 的 `e.type`。

| 分支 | Marloues 归属 | 状态 | 显示与处置 |
|---|---|---|---|
| `space` | MarkdownContent | 已有 | 不产生可见块。 |
| `hr` | WorkflowHorizontalRule | 已有 | 独立分隔线；核对间距。 |
| `heading` | ReactMarkdown h1–h6 | 已有 | 级别保留；方向与间距按正文样式。 |
| `paragraph` | ReactMarkdown p | 扩展 | 正文段落；纯媒体段落还需单图/网格/宽度规则。 |
| `text` | MarkdownContent | 已有 | 流式尾部与稳定块；文本装饰和淡入另行处理。 |
| `escape` | ReactMarkdown | 已有 | 显示文本而非把转义符当控件。 |
| `strong` | ReactMarkdown strong | 已有 | 强调样式。 |
| `em` | ReactMarkdown em | 已有 | 强调样式。 |
| `del` | remarkGfm | 已有 | 删除线。 |
| `codespan` | WorkflowInlineCode | 扩展 | 普通行内代码或可导航引用。 |
| `br` | ReactMarkdown br | 已有 | 换行。 |
| `link` | WorkflowMarkdownLink | 新增 | 文件/任务/应用/外部目标分发。 |
| `image` | WorkflowMarkdownMedia | 新增 | 图片、音频、视频及本地文件解析。 |
| `code` | WorkflowCodeBlock | 扩展 | 普通/写作/Mermaid/开放 fence。 |
| `blockquote` | ReactMarkdown blockquote | 已有 | 引用内继续渲染块。 |
| `list` | remarkGfm 列表 | 已有 | 有序起点和任务列表样式。 |
| `list_item` | remarkGfm 列表项 | 已有 | 任务 checkbox 为 disabled 只读显示。 |
| `table` | WorkflowMarkdownTable | 新增 | 基础表格已有；独立复制、宽表与预览尚缺。 |
| `html` | MarkdownContent 策略 | 扩展 | Codex 默认保留原 HTML 文本，单独识别 br；basic-html 是另一个受控模式，不是任意 HTML 执行。 |
| `def` | Markdown 解析层 | 已有 | 定义不单独生成正文块；保证跨块引用可解析。 |

## mcp-content：6 项

来源：`webview/assets/mcp-tool-item-content-639a5760eb4c.js` → `qn` 的 `n.type`。

| 分支 | Marloues 归属 | 状态 | 显示与处置 |
|---|---|---|---|
| `image` | WorkflowToolContent → ImageLightbox | 能力 | mimeType/base64 图片和 annotations。 |
| `audio` | WorkflowToolContent → audio | 能力 | 控件与 metadata 预加载；保留注释。 |
| `resource_link` | WorkflowToolContent 资源说明 | 能力 | Codex 此 renderer 呈现资源名称/说明；不要凭类型声称一定有可点击下载。 |
| `embedded_resource` | WorkflowToolContent 嵌入资源 | 能力 | URI、MIME、annotations、text/blob 内容。 |
| `unknown` | WorkflowUnknownRawJson | 扩展 | 格式化 raw，并限制详情滚动区。 |
| `text` | DetailBlock | 扩展 | plaintext 展示，不默认把工具文本当 Markdown；保留 annotations。 |

## resource：5 项

来源：`webview/assets/subagent-activity-chip-group-aa63c0e54657.js` → `OW` 的 `e.type`。

| 分支 | Marloues 归属 | 状态 | 显示与处置 |
|---|---|---|---|
| `artifact-session` | WorkflowResourceRow | 能力 | artifactRef + conversationId；打开宿主产物。 |
| `file` | WorkflowResourceRow | 新增/能力 | path、格式和打开目标；不同于“已编辑文件 diff”摘要。 |
| `google-drive` | WorkflowResourceRow | 能力 | resourceKind/title/url 与云端文档打开策略。 |
| `appgen-app` | WorkflowResourceRow | 能力 | 专用 app 结果或通用资源行，受 end-card 开关控制。 |
| `website` | WorkflowResourceRow | 扩展/能力 | target/url 和打开目标；当前第一个 webSearch/js 卡不能代表全部网站产物。 |

## elicitation：8 项

来源：`webview/assets/subagent-activity-chip-group-aa63c0e54657.js` → `tE` 的 `o.elicitation.kind`。

| 分支 | Marloues 归属 | 状态 | 显示与处置 |
|---|---|---|---|
| `toolSuggestion` | WorkflowElicitationCard | 能力 | 未完成时工具建议专用卡。 |
| `connectorAuth` | WorkflowElicitationCard | 能力 | 未完成时连接授权专用卡。 |
| `urlAction` | WorkflowElicitationCard | 能力 | 未完成时 URL action 专用卡。 |
| `formElicitation` | 请求宿主 + 回答记录 | 能力 | 活动区等待提示；实际表单通过请求 ID 关联。 |
| `generic` | 请求宿主 + 回答记录 | 能力 | generic 请求，不伪造为 permission。 |
| `mcpToolCall` | 请求宿主 + 回答记录 | 能力 | 工具请求的等待/回应分开。 |
| `openaiForm` | 请求宿主 + 回答记录 | 能力 | 受支持表单。 |
| `unsupportedOpenAIForm` | 请求宿主 + 明确回退 | 能力 | 不支持的表单保留状态和原始描述，不能静默丢弃。 |

## switch 之外的正文分支

- `math`：`rda → $la`，公式 renderer 异步加载，原始公式文本作 fallback。Marloues 需要新增 `WorkflowMath`。
- directive：`$ua → aua`，根据受支持指令表分发；业务指令在 `Zzt` 和助手 `Oy` 中注册。文件引用、折叠正文、选区注释、自动化引用、可视化须分别确认能力。
- 未知 token：不能识别时保留 `raw` 文本（如果存在），不是一律丢弃。
- 动态注入：`NFt` 可进入 `ChatGptCodeBlock`，MCP 可加载 App HTML。此处只约定入口、身份、状态和 fallback，不把外部实现当成已恢复的静态组件。
