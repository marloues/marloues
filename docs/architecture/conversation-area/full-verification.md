# 对话区组件与交互验收

时间：2026-09-05T19:18:11.452Z。工作树：`/Users/xuzong/workspace/marloues-architecture-review-20260905`，分支：`codex/architecture-review-20260905`。

本次生产 Electron 回放 **41 个场景、108 项检查通过**；真实 SDK / MCP 桌面流程 **19 项通过**；浏览器组件交互 **15 项通过**；真实模型 **3 项通过**；单元测试 **131 文件 / 740 项通过**。
Node/Web 类型检查及 main/preload/renderer 生产构建通过；client lint 0 错误、1 个警告。三个桌面测试结果的 build 路径与当前构建相同。

这些数字表示已执行检查，不表示所有 Codex 私有状态均已对齐。下面逐类写出已验证动作和仍存在的边界；源文件清单只用于防漏，不以文件数量冒充组件覆盖率。

## 验证层与证据

- Electron 回放：41 个隔离保存的会话，经真实 main/preload/IPC、持久化和正式页面渲染；每个工具的内部详情也展开并记录。计时和稀有通知采用主进程受控快照发送，区别于模型执行验证。
- SDK 桌面：普通输入框 → 真实 SDK 进程 → 本地确定性 Anthropic 协议服务 → Read/MCP/表单/iframe/停止队列 → 持久化 → 完整重启。协议服务不等同真实模型。
- 真实模型：使用保存的 `deepseek-v4-flash` 配置和系统凭据后端，真正读取验收文件后在正文回答。
- 浏览器 fixture：用于流式 DOM、精确竞态和故意触发 renderer 异常；此层的文件/分支回调是 fixture，未冒充真实宿主。
- [机器记录](implementation-verification.json)、[原 31 场景执行账本](acceptance-execution.json)、[生产 Electron 检查](../../../client/test-results/conversation-complete/results.json)、[SDK 桌面](../../../client/test-results/conversation-app/results.json)、[浏览器](../../../client/test-results/conversation-details/results.json)、[真实模型](../../../client/test-results/conversation-app-live/results.json)。
- [样式规范对齐记录](style-alignment.md)：组件归属、主题变量、控件复用、三主题截图及验证边界。
- [附件排列规则复核](attachment-layout.md)：资源包条件、横向条与纵向卡片的区别、重叠/顺序/焦点滚动修复及专用文档预览差距。
- [截图与检查索引](../../../client/test-results/conversation-complete/index.html)：本轮 164 张截图，每张关联具体通过的检查并记录 SHA-256；没有混入历史失败截图。自动检查包括实际布局、控件可见性、焦点、剪贴板和操作结果；截图不是像素级 Codex 对比基准。

## 组件与交互清单

| 组件类别 | 本次实际验证 | 尚存边界 |
| --- | --- | --- |
| 轮次与渲染入口 | 同一规范化轮次展示正文、过程、结果、计时与状态。无起点隐藏；首个 final 冻结 5 秒，正文增长仍为 5 秒；折叠切换位置不重复；旧历史与 300 项过程。嵌套工具逐层展开并记录。（`render-qa-markdown`、`render-qa-media`、`render-qa-attachments`、`render-qa-attachment-layout` 等） | 场景回放验证展示规则；不能证明任意模型都会产生这些事件。 |
| Markdown 正文、引用和公式 | 标题、段落、引用、列表起点、任务框、中文/RTL、GFM、脚注、引用定义、公式、完成后的选区进入输入框。（`markdown-semantic-nodes`、`selection-to-composer-and-session-draft`、`B:formal turn → rich content, formula and Mermaid`） | 列明动作通过。 |
| 宽表格与预览 | 主体不被撑宽；预览横向滚动；复制 Markdown 和干净 HTML；Tab 约束、Escape、返回触发焦点。（`table-overflow-copy-preview-focus`、`B:table preview: focus trap, Escape, focus restoration`、`B:table copy contains Markdown and clean HTML`） | 列明动作通过。 |
| 代码、写作块、行内代码 | 复制正文、换行偏好和回到页面后的恢复；开放围栏到闭合保留 DOM；写作与代码模式区分。（`code-writing-inline-copy-wrap`、`B:streaming code keeps its DOM and wrap preference when the fence closes`） | 列明动作通过。 |
| Mermaid | 真实图表、源码切换、复制、预览；无效代码回退后恢复。（`mermaid-render-source-copy`、`B:invalid Mermaid retains code and successful diagrams can be restored`） | 语言前缀每一个长度及所有异步渲染竞态未穷举。 |
| 文件与链接 | 真实磁盘 IPC、相对路径、行号高亮、复制、缺失文件错误、未知协议回退。（`file-preview-success-error-line-copy`、`user-attachments-preview-file-copy`、`B:relative file link uses conversation cwd and highlights requested line`） | 远端宿主、私有资源协议尚无真实服务验收。 |
| 图片音视频和画廊 | 真实 SVG/WAV/WebM 解码、播放暂停、失败反馈和错误源换为有效源后恢复；多图方向键、缩放重置、Escape、焦点返回；Electron 下载完成后校验文件内容。（`media-loaded-play-pause-error-preview`、`host-media-failed-source-to-valid-source-recovers`、`gallery-keyboard-zoom-download-focus`、`image-status-no-empty-success` 等） | 网络媒体慢速/重定向/更换 src 的全部竞态未穷举。 |
| 用户消息与附件 | 长消息展开、复制、双击/按钮放回输入框；图片、文件、URL、技能、引用、批注；附件空消息保留。三主题/宽窄窗口下读取附件实际坐标，验证顺序、同排不重叠、长名截断和独立滚动；Tab 显露被裁切的标签，Enter 打开实际文件/行号，Escape 返回焦点。（`user-expand-copy-reuse-doubleclick`、`user-attachments-preview-file-copy`、`attachment-layout-light`、`attachment-layout-dark` 等） | 当前是文字复用，未实现带附件的历史原地编辑。PDF/Office 等专用预览及 Codex 条件文档卡片组尚未接入；普通 .ts 文件对应横向标签。 |
| 命令详情 | 运行/成功/失败/停止、退出码、命令独立时长、输出截断提示；输入输出复制、键盘折叠和重新进入。连续运行→完成保持收起选择，隐藏详情不留下可聚焦控件。（`command-state-running`、`command-state-completed`、`command-state-failed`、`command-state-cancelled` 等） | 真正脱离轮次的后台系统进程完成通知未单独端到端验证。 |
| 文件变更与结果 | pending/applied/failed/rejected/cancelled 不混为成功；多文件展开、diff 复制、hover 预览和 Review 入口；失败轮次保留已应用产物。（`patch-terminal-pending`、`patch-terminal-failed`、`patch-terminal-rejected`、`patch-terminal-cancelled` 等） | 没有批次回滚 UI/宿主能力；重命名、二进制、跨 cwd 的所有组合未穷举。 |
| 通用和专用工具 | Read/LS/Grep/计划/搜索/浏览器专用详情；通用工具四种状态；不支持单工具取消时显示原错误并允许重试。（`tool-specialized-details-plan`、`generic-tool-cancel-unsupported-visible-retry`、`render-qa-dynamic-running`、`render-qa-dynamic-failed` 等） | SDK 不支持单工具取消，真实成功取消路径只存在其他 runtime，本次未冒充成功。 |
| MCP 六类结果 | text/image/audio/resource_link/embedded_resource/unknown；结构化同值去重、不同值保留、annotations/_meta/raw 复制。（`mcp-six-content-raw-copy`、`render-qa-mcp`、`render-qa-mcp-failed`、`D:canonical readThread preserves tools, question and timing`） | OAuth 自管远端 MCP 的原始信封保真未验收。 |
| MCP 交互卡 | 真实 stdio 资源失败→重试→iframe；协议握手、输入/结果通知、拒绝/Escape/批准回传并真正执行工具；折叠后草稿保留。亮/暗/暖主题变量和强调色更新送入 iframe，切换不清空草稿。（`D:real MCP resource read failure → visible source error → retry original resource → ready iframe`、`D:MCP App tool permission: deny and Escape return rejection to original iframe`、`D:MCP resource discovery → sandbox iframe handshake → permission-gated real tool call`、`D:collapsing and remounting MCP details retains live iframe form state` 等） | Codex 私有 App、superseded、不可折叠策略和 iframe 任意内部草稿的重启恢复未实现等价。 |
| 提问与回答记录 | 文字/整数/数值/布尔/单选/多选校验，过期提交报错和草稿恢复；真实 SDK 问答、MCP 表单 accept/decline/cancel，停止后取消，终态不可再答。（`question-validation-all-fields-stale-submit`、`settled-question-readonly-unsupported-url`、`render-qa-question-kinds`、`render-qa-questions` 等） | 通用 kind 回退已检查；不等同支持全部八类 Codex 私有授权协议。 |
| 权限历史与当前审批 | 五种历史状态；实际文件 diff 预览与焦点；拒绝、允许一次、允许此任务经过真实 preload 回到主进程。（`permission-history-all-statuses`、`host-permission-panel-file-preview-three-responses`） | 三种全局审批按钮使用宿主通知回放；真实工具副作用批准闭环另由 MCP App 流程验证。 |
| 显式标记、未知项、协作 | 模型/工作区/压缩/评审/hook 等显式标记与 raw 展开；协作运行/完成/失败/停止，点击已知子任务进入对应会话。（`marker-raw-disclosure-survives-remount`、`collab-status-source-running`、`collab-status-source-completed`、`collab-status-source-failed` 等） | 私有 heartbeat、特殊资源指令只有回退；辅助区内子代理标签管理不属于本次对话正文范围。 |
| 错误与恢复 | 断流已有正文和产物保留，错误详情复制和持久化；局部 renderer 异常不影响相邻内容，重试与 contentKey 更新恢复。（`failed-turn-retains-body-and-applied-files`、`B:Markdown error boundary isolates failure, retries and resets on content key`、`D:missing credentials render the correct error and leave no running turn`） | 重连 1/5→2/5 不是独立原生 UI，尚未对齐 Codex 重连展示。 |
| 分页、虚拟化和导航 | 160 轮分页、虚拟化、点击离屏消息、hover 不滚动；切会话恢复阅读位置；旧分页不能改变新任务；右栏打开不遮挡导航。（`history-pagination-virtualization-navigation`、`fork-selected-history-boundary-workspace-reload`、`B:scroll: following output, reader detachment, per-session restore`、`B:scroll: stale history completion cannot move a newly selected session` 等） | 列明动作通过。 |
| 操作栏 | 复制、连续点击锁、分支失败反馈；真实分支按指定轮次截断，保留工作区并刷新恢复；操作可键盘触达。（`footer-real-copy-and-fork`、`fork-selected-history-boundary-workspace-reload`、`B:copy and fork ignore repeated clicks; fork failures are visible and retryable`） | 列明动作通过。 |
| 排队消息 | 实际 SDK 等待时排队、拖拽排序、菜单 Escape、编辑、单条取消；停止保留队列并显示暂停；继续生成已完成轮次；立即引导中断等待并将排队输入送入新的已完成答复。（`D:real running turn: queue two steers → drag reorder → menu Escape → edit → cancel one`、`D:real queue: interrupt keeps pending steer → paused banner → resume creates completed turn`、`D:real queued steer apply-now → interrupts pending SDK question → delivers new user input → completed answer`、`D:stop pending question → cancelled record; message navigation hover does not scroll`） | 列明动作通过。 |
| 输入框、附件与菜单 | 文件选择和移除、技能/文件建议、URL 剪贴板、批注分组、菜单关闭、IME 与换行；完全访问确认的焦点环、取消/确认/持久化。（`composer-menus-escape-file-attachment`、`composer-slash-keyboard-and-mention-selection`、`composer-browser-comment-group-preview-single-remove`、`composer-skill-url-attachments-and-keyboard-newlines` 等） | 移除全部批注的批量动作按用户限制未执行；只执行单条移除。 |
| 步骤、上下文和计划入口 | 上下文三个阈值与键盘提示；步骤进度与失败保留；上下文操作实际回调；计划关闭/修改/执行/新上下文执行。（`host-context-usage-levels-keyboard-tooltip`、`host-context-action-dismiss-source-isolation`、`host-context-actions-real-model-fork-new-and-retry-error`、`host-task-progress-active-failure-completion` 等） | 计划/上下文事件使用真实 IPC 回放；执行入口用缺凭据错误验证收尾，不声称模型执行了计划。创建精简分支当前实际为普通分支，没有摘要压缩。 |
| 模型选择 | 禁用模型过滤、切换后持久化、Escape 返回焦点、刷新恢复。（`composer-model-select-persist-escape`） | 列明动作通过。 |
| Marloues 样式规范与主题 | 局部样式放入相邻 CSS Modules；复用现有 Input/Button、primary 和 icon-button。亮/暗/暖主题下检查实际背景、边框、字体、圆角、焦点、弹窗遮罩、文件行高亮；Mermaid 缩放及减少动态效果下的布局正确；自定义强调色即时更新。错误边界样式及恢复、MCP iframe 草稿连续性另由各自测试层覆盖。（`style-components-light`、`style-dialog-and-navigation-light`、`style-components-dark`、`style-dialog-and-navigation-dark` 等） | 遵循 Marloues 现有规范；未制作 Codex 像素级对比。第三方 iframe 需主动消费宿主提供的标准变量。 |

## 本轮修复的实际问题

1. 隔离 app home 在 store 单例导入时尚未生效，会读到其他实例配置。
2. 拒绝/停止的文件编辑被过滤，工具组仍报已编辑；协作失败显示已创建。
3. 命令缺少退出码、独立用时与截断信息；单工具取消失败无可见反馈。
4. 错误 additionalDetails 在历史恢复时丢失，失败轮次隐藏已完成文件。
5. 分支丢失旧历史与工作区；现在按选定轮次截断并持久化。
6. 翻页只反复读取前 100 轮，快照更新丢旧页；页面旧吸底 effect 覆盖阅读位置恢复；右栏遮挡消息导航。
7. 队列菜单被滚动裁切；停止后 durable 队列没有发布暂停状态。
8. 权限模式弹窗未接管和约束键盘焦点；普通菜单缺 Escape。
9. 计划确认卡被输入框遮挡，现接入输入框 dock 高度预留。
10. 粘贴技能/文件引用时光标状态落后；Escape 后 keyup 和负索引重新打开建议。
11. 新增组件混入临时颜色、未定义变量和全局 CSS；现拆为相邻 CSS Modules 并接入现有主题与控件。主按钮使用现有 primary 样式的成对前景/背景色。
12. 减少动态效果的全局过渡影响 Mermaid 临时 SVG 尺寸测量，出现巨大留白、节点缩小和裁切；现在隔离测量样式，并检查三个节点的尺寸和边界。
13. MCP iframe 和 Mermaid 未跟随完整主题变量变化；现在读取 Marloues 实际主题并发送标准 MCP Apps 上下文更新，保留 iframe 草稿。
14. 附件顺序反转、文件标签内部 inline 布局导致重叠、名称重复；修复滚动容器与标签布局，Tab 会显露完整控件。新增真实坐标与键盘检查，防止仅断言能显示/能点击而漏掉布局问题。

## 原 Codex 场景的验收状态

| 编号 | 场景 | 状态 | 仍缺少的部分 |
| --- | --- | --- | --- |
| CA01 | 有效工作到最终答复 | 列明步骤通过 | 见对应动态检查。 |
| CA02 | 历史缺时间、裁剪窗口 | 列明步骤通过 | 见对应动态检查。 |
| CA03 | 命令展开生命周期 | 列明步骤通过 | 见对应动态检查。 |
| CA04 | MCP 普通/交互卡 | 部分验证 | 未实现 Codex 不可折叠 App 策略。 |
| CA05 | 取消与 steer | 列明步骤通过 | 见对应动态检查。 |
| CA06 | 流式代码闭合 | 列明步骤通过 | 见对应动态检查。 |
| CA07 | 代码与写作块 | 部分验证 | 功能检查通过；流式选区所有边界尚未穷举。 |
| CA08 | Mermaid 未完成和错误 | 部分验证 | 未穷举语言前缀和所有异步覆盖竞态。 |
| CA09 | 宽表与复制 | 列明步骤通过 | 见对应动态检查。 |
| CA10 | 列表、方向与公式 | 部分验证 | 真实字体/RTL/公式通过，延迟加载中间状态未逐个截取。 |
| CA11 | 跨块引用与异常恢复 | 列明步骤通过 | 见对应动态检查。 |
| CA12 | 文件与外链 | 部分验证 | 缺少远端宿主集成。 |
| CA13 | 媒体加载与失败 | 部分验证 | 真实文件媒体失败→换源恢复通过；远端慢速媒体与 default/scrollable 私有模式未穷举。 |
| CA14 | 图片画廊 | 部分验证 | 已完成画廊和停止回退通过，逐图到达时所有 pending 组合未穷举。 |
| CA15 | 附件空消息与来源 | 部分验证 | 私有 heartbeat/委派来源缺少完整产品语义。 |
| CA16 | 原地编辑失败恢复 | 部分验证 | 按允许的降级明确为放回输入框；不具备附件历史原地编辑能力。普通文件横向标签已做真实布局/键盘检查，PDF/Office 等专用预览及条件文档卡片组尚未接入。 |
| CA17 | 复制、分支和时间戳 | 部分验证 | 操作资格、锁、分支失败和真实截断通过；剪贴板系统拒绝权限分支未模拟。 |
| CA18 | 后台命令及异常退出 | 部分验证 | 没有真实脱离轮次的后台进程完成验收。 |
| CA19 | patch 状态与多文件 | 部分验证 | 无原批次回滚能力；二进制/重命名/跨 cwd 组合未穷举。 |
| CA20 | MCP 六类内容与去重 | 部分验证 | 六内容和原始信封通过；超大 raw 性能及跨评审连续调用组合未穷举。 |
| CA21 | MCP App 资源恢复 | 部分验证 | 失败重试和折叠草稿通过；superseded/remote-logo 私有策略未实现。 |
| CA22 | 提问与回答记录 | 部分验证 | 通用 kind 回退通过，不能等同八类私有协议均已接入。 |
| CA23 | 计划进度与协作 | 部分验证 | 实际进度与已知子任务导航通过；多真实代理并行模型执行未在本套触发。 |
| CA24 | 错误与重连 | 部分验证 | 缺独立重连次数 UI 与旧重试回调的整机回放。 |
| CA25 | 五类资源与展开 | 部分验证 | 无五种 Codex 私有资源宿主。 |
| CA26 | 正文指令和播报 | 部分验证 | 无完整 Codex 私有正文指令/heartbeat 协议。 |
| CA27 | 分页与切任务 | 列明步骤通过 | 见对应动态检查。 |
| CA28 | 折叠、离屏和消息导航 | 部分验证 | 正文、折叠、iframe 和导航分别通过，未穷举它们的所有并发组合。 |
| CA29 | 显式事件与未知项 | 部分验证 | 通用显式标记/raw 通过；worktree 两阶段私有事件未全量接入。 |
| CA30 | 模式、主题和降动效 | 部分验证 | 960/1440、亮暗暖主题、实际样式变量、键盘焦点及 reduced-motion 图表布局通过；全部 compact 配置和跨平台尚未穷举。 |
| CA31 | 覆盖验收口径 | 列明步骤通过 | 静态参考校验与动态验收分开记录；不使用组件数量制造对齐百分比。 |

## 完整源文件索引

以下导出符号是代码导航索引，含组合组件和辅助函数。归类不等于每个可选参数的所有组合都已执行。

| 文件 | 归类 | 对应检查组/说明 |
| --- | --- | --- |
| [workflow-chat/ScrollToBottomButton.tsx](../../../client/renderer/src/components/workflow-chat/ScrollToBottomButton.tsx) | covered-by-listed-checks | history |
| [workflow-chat/ViewportCulling.tsx](../../../client/renderer/src/components/workflow-chat/ViewportCulling.tsx) | compatibility-not-mounted | 仅遗留导出/fixture 引用，未作为当前主会话入口运行。 |
| [activity/ActivityDetail.tsx](../../../client/renderer/src/components/workflow-chat/activity/ActivityDetail.tsx) | covered-by-listed-checks | markers |
| [activity/ActivityGroup.tsx](../../../client/renderer/src/components/workflow-chat/activity/ActivityGroup.tsx) | covered-by-listed-checks | route |
| [activity/ActivityRenderer.tsx](../../../client/renderer/src/components/workflow-chat/activity/ActivityRenderer.tsx) | covered-by-listed-checks | route |
| [activity/ActivityRow.tsx](../../../client/renderer/src/components/workflow-chat/activity/ActivityRow.tsx) | covered-by-listed-checks | route |
| [activity/AgentFlowSection.tsx](../../../client/renderer/src/components/workflow-chat/activity/AgentFlowSection.tsx) | covered-by-listed-checks | route |
| [activity/CollabAgentToolRow.tsx](../../../client/renderer/src/components/workflow-chat/activity/CollabAgentToolRow.tsx) | covered-by-listed-checks | markers |
| [activity/CommandDetailCard.tsx](../../../client/renderer/src/components/workflow-chat/activity/CommandDetailCard.tsx) | covered-by-listed-checks | commands |
| [activity/CommandExecutionRow.tsx](../../../client/renderer/src/components/workflow-chat/activity/CommandExecutionRow.tsx) | covered-by-listed-checks | commands |
| [activity/DetailCopyButton.tsx](../../../client/renderer/src/components/workflow-chat/activity/DetailCopyButton.tsx) | covered-by-listed-checks | commands |
| [activity/FileChangeRow.tsx](../../../client/renderer/src/components/workflow-chat/activity/FileChangeRow.tsx) | covered-by-listed-checks | files |
| [activity/ImageGenerationRow.tsx](../../../client/renderer/src/components/workflow-chat/activity/ImageGenerationRow.tsx) | covered-by-listed-checks | media |
| [activity/ImageLightbox.tsx](../../../client/renderer/src/components/workflow-chat/activity/ImageLightbox.tsx) | covered-by-listed-checks | media |
| [activity/MarkerRows.tsx](../../../client/renderer/src/components/workflow-chat/activity/MarkerRows.tsx) | covered-by-listed-checks | markers |
| [activity/McpApp.tsx](../../../client/renderer/src/components/workflow-chat/activity/McpApp.tsx) | covered-by-listed-checks | apps |
| [activity/McpResult.tsx](../../../client/renderer/src/components/workflow-chat/activity/McpResult.tsx) | covered-by-listed-checks | mcp |
| [activity/PermissionRequestRow.tsx](../../../client/renderer/src/components/workflow-chat/activity/PermissionRequestRow.tsx) | covered-by-listed-checks | permission |
| [activity/QuestionCard.tsx](../../../client/renderer/src/components/workflow-chat/activity/QuestionCard.tsx) | covered-by-listed-checks | questions |
| [activity/ReasoningRow.tsx](../../../client/renderer/src/components/workflow-chat/activity/ReasoningRow.tsx) | hidden-by-contract | 正式过程按 Codex 活动规则过滤 reasoning；不能算作已显示的推理正文。 |
| [activity/ResultCards.tsx](../../../client/renderer/src/components/workflow-chat/activity/ResultCards.tsx) | covered-by-listed-checks | files |
| [activity/ToolCallRow.tsx](../../../client/renderer/src/components/workflow-chat/activity/ToolCallRow.tsx) | covered-by-listed-checks | tools |
| [ToolCallRowDetails/ToolDetail.tsx](../../../client/renderer/src/components/workflow-chat/activity/ToolCallRowDetails/ToolDetail.tsx) | covered-by-listed-checks | tools |
| [ToolCallRowDetails/ToolDetailFrame.tsx](../../../client/renderer/src/components/workflow-chat/activity/ToolCallRowDetails/ToolDetailFrame.tsx) | covered-by-listed-checks | tools |
| [ToolCallRowDetails/detail-sections.tsx](../../../client/renderer/src/components/workflow-chat/activity/ToolCallRowDetails/detail-sections.tsx) | covered-by-listed-checks | tools |
| [activity/TurnItemRenderer.tsx](../../../client/renderer/src/components/workflow-chat/activity/TurnItemRenderer.tsx) | covered-by-listed-checks | route |
| [activity/WebSearchRow.tsx](../../../client/renderer/src/components/workflow-chat/activity/WebSearchRow.tsx) | covered-by-listed-checks | tools |
| [composer/ComposerAttachmentChips.tsx](../../../client/renderer/src/components/workflow-chat/composer/ComposerAttachmentChips.tsx) | covered-by-listed-checks | composer |
| [composer/ComposerShell.tsx](../../../client/renderer/src/components/workflow-chat/composer/ComposerShell.tsx) | covered-by-listed-checks | composer |
| [composer/ComposerSuggestionPopover.tsx](../../../client/renderer/src/components/workflow-chat/composer/ComposerSuggestionPopover.tsx) | covered-by-listed-checks | composer |
| [composer/ComposerTaskProgress.tsx](../../../client/renderer/src/components/workflow-chat/composer/ComposerTaskProgress.tsx) | covered-by-listed-checks | progress |
| [composer/ContextUsageRing.tsx](../../../client/renderer/src/components/workflow-chat/composer/ContextUsageRing.tsx) | covered-by-listed-checks | progress |
| [composer/SandboxInstallBanner.tsx](../../../client/renderer/src/components/workflow-chat/composer/SandboxInstallBanner.tsx) | covered-by-listed-checks | composer |
| [composer/SlashCommandPopover.tsx](../../../client/renderer/src/components/workflow-chat/composer/SlashCommandPopover.tsx) | covered-by-listed-checks | composer |
| [content/CodeBlock.tsx](../../../client/renderer/src/components/workflow-chat/content/CodeBlock.tsx) | covered-by-listed-checks | code |
| [content/ContentDialog.tsx](../../../client/renderer/src/components/workflow-chat/content/ContentDialog.tsx) | covered-by-listed-checks | table |
| [content/InlineCode.tsx](../../../client/renderer/src/components/workflow-chat/content/InlineCode.tsx) | covered-by-listed-checks | code |
| [content/MarkdownContent.tsx](../../../client/renderer/src/components/workflow-chat/content/MarkdownContent.tsx) | covered-by-listed-checks | body |
| [content/MarkdownContext.tsx](../../../client/renderer/src/components/workflow-chat/content/MarkdownContext.tsx) | covered-by-listed-checks | body |
| [content/MarkdownErrorBoundary.tsx](../../../client/renderer/src/components/workflow-chat/content/MarkdownErrorBoundary.tsx) | covered-by-listed-checks | errors |
| [content/MarkdownLink.tsx](../../../client/renderer/src/components/workflow-chat/content/MarkdownLink.tsx) | covered-by-listed-checks | links |
| [content/MarkdownMedia.tsx](../../../client/renderer/src/components/workflow-chat/content/MarkdownMedia.tsx) | covered-by-listed-checks | media |
| [content/MarkdownTable.tsx](../../../client/renderer/src/components/workflow-chat/content/MarkdownTable.tsx) | covered-by-listed-checks | table |
| [content/MermaidBlock.tsx](../../../client/renderer/src/components/workflow-chat/content/MermaidBlock.tsx) | covered-by-listed-checks | mermaid |
| [workflow-chat/conversation-icons.tsx](../../../client/renderer/src/components/workflow-chat/conversation-icons.tsx) | covered-by-listed-checks | route |
| [fixtures/BeforeContractTurnView.tsx](../../../client/renderer/src/components/workflow-chat/fixtures/BeforeContractTurnView.tsx) | test-only | 验收或旧对比页，不计入正式对话组件覆盖。 |
| [fixtures/ConversationComparisonPage.tsx](../../../client/renderer/src/components/workflow-chat/fixtures/ConversationComparisonPage.tsx) | test-only | 验收或旧对比页，不计入正式对话组件覆盖。 |
| [fixtures/ConversationDetailsFixturePage.tsx](../../../client/renderer/src/components/workflow-chat/fixtures/ConversationDetailsFixturePage.tsx) | test-only | 验收或旧对比页，不计入正式对话组件覆盖。 |
| [fixtures/TaskContextFixturePage.tsx](../../../client/renderer/src/components/workflow-chat/fixtures/TaskContextFixturePage.tsx) | test-only | 验收或旧对比页，不计入正式对话组件覆盖。 |
| [fixtures/WorkflowCodexFixturePage.tsx](../../../client/renderer/src/components/workflow-chat/fixtures/WorkflowCodexFixturePage.tsx) | test-only | 验收或旧对比页，不计入正式对话组件覆盖。 |
| [workflow-chat/message-view.tsx](../../../client/renderer/src/components/workflow-chat/message-view.tsx) | compatibility-not-mounted | 仅遗留导出/fixture 引用，未作为当前主会话入口运行。 |
| [task-context/TaskContextPanel.tsx](../../../client/renderer/src/components/workflow-chat/task-context/TaskContextPanel.tsx) | auxiliary-scope | 任务上下文/子代理辅助区壳不计入正文；其共享正文渲染器另有验证。 |
| [task-context/TaskContextSections.tsx](../../../client/renderer/src/components/workflow-chat/task-context/TaskContextSections.tsx) | auxiliary-scope | 任务上下文/子代理辅助区壳不计入正文；其共享正文渲染器另有验证。 |
| [task-context/ThreadSummaryPrimitives.tsx](../../../client/renderer/src/components/workflow-chat/task-context/ThreadSummaryPrimitives.tsx) | auxiliary-scope | 任务上下文/子代理辅助区壳不计入正文；其共享正文渲染器另有验证。 |
| [turns/AssistantAnswer.tsx](../../../client/renderer/src/components/workflow-chat/turns/AssistantAnswer.tsx) | covered-by-listed-checks | body |
| [turns/AssistantTurn.tsx](../../../client/renderer/src/components/workflow-chat/turns/AssistantTurn.tsx) | covered-by-listed-checks | route |
| [turns/AssistantTurnHeader.tsx](../../../client/renderer/src/components/workflow-chat/turns/AssistantTurnHeader.tsx) | covered-by-listed-checks | route |
| [turns/MessageErrorCard.tsx](../../../client/renderer/src/components/workflow-chat/turns/MessageErrorCard.tsx) | covered-by-listed-checks | errors |
| [turns/QueuedSteersPanel.tsx](../../../client/renderer/src/components/workflow-chat/turns/QueuedSteersPanel.tsx) | covered-by-listed-checks | queue |
| [turns/ReadThreadTurnList.tsx](../../../client/renderer/src/components/workflow-chat/turns/ReadThreadTurnList.tsx) | covered-by-listed-checks | history |
| [turns/SubagentWorkspace.tsx](../../../client/renderer/src/components/workflow-chat/turns/SubagentWorkspace.tsx) | auxiliary-scope | 任务上下文/子代理辅助区壳不计入正文；其共享正文渲染器另有验证。 |
| [turns/ThinkingPlaceholder.tsx](../../../client/renderer/src/components/workflow-chat/turns/ThinkingPlaceholder.tsx) | covered-by-listed-checks | route |
| [turns/ThreadView.tsx](../../../client/renderer/src/components/workflow-chat/turns/ThreadView.tsx) | compatibility-not-mounted | 仅遗留导出/fixture 引用，未作为当前主会话入口运行。 |
| [turns/TurnErrorCard.tsx](../../../client/renderer/src/components/workflow-chat/turns/TurnErrorCard.tsx) | covered-by-listed-checks | errors |
| [turns/TurnFlowSection.tsx](../../../client/renderer/src/components/workflow-chat/turns/TurnFlowSection.tsx) | covered-by-listed-checks | route |
| [turns/TurnFooterView.tsx](../../../client/renderer/src/components/workflow-chat/turns/TurnFooterView.tsx) | covered-by-listed-checks | footer |
| [turns/TurnPresentationBlocks.tsx](../../../client/renderer/src/components/workflow-chat/turns/TurnPresentationBlocks.tsx) | covered-by-listed-checks | route |
| [turns/TurnProcessDisclosure.tsx](../../../client/renderer/src/components/workflow-chat/turns/TurnProcessDisclosure.tsx) | covered-by-listed-checks | route |
| [turns/TurnShell.tsx](../../../client/renderer/src/components/workflow-chat/turns/TurnShell.tsx) | covered-by-listed-checks | route |
| [turns/TurnView.tsx](../../../client/renderer/src/components/workflow-chat/turns/TurnView.tsx) | covered-by-listed-checks | route |
| [turns/UserMessage.tsx](../../../client/renderer/src/components/workflow-chat/turns/UserMessage.tsx) | covered-by-listed-checks | user |
| [turns/WorkflowTurnList.tsx](../../../client/renderer/src/components/workflow-chat/turns/WorkflowTurnList.tsx) | compatibility-not-mounted | 仅遗留导出/fixture 引用，未作为当前主会话入口运行。 |
| [pages/WorkflowChatCards.tsx](../../../client/renderer/src/pages/WorkflowChatCards.tsx) | covered-by-listed-checks | progress |
| [pages/WorkflowChatModelSelector.tsx](../../../client/renderer/src/pages/WorkflowChatModelSelector.tsx) | covered-by-listed-checks | model |
| [interaction/PermissionRequestPanel.tsx](../../../client/renderer/src/components/workbench/interaction/PermissionRequestPanel.tsx) | covered-by-listed-checks | permission |
| [interaction/PermissionFilePreview.tsx](../../../client/renderer/src/components/workbench/interaction/PermissionFilePreview.tsx) | covered-by-listed-checks | permission |

## 复跑

在此 worktree 中依次执行：

```sh
npm run test:conversation:build
npm run test:conversation:complete
npm run test:conversation:desktop
npm run test:conversation:live
npm run test:conversation:visual
npm run typecheck
npm run test:unit
npm run lint:client
node docs/architecture/conversation-area/verify.mjs --reference-only
npm run test:conversation:report
```

浏览器测试先用 npm run test:conversation:preview 启动 5191 上的 Vite 对话 fixture，脚本固定在 client 工作区运行以正确生成 Tailwind 控件样式；可通过 MARLOUES_CHROMIUM_PATH 指定 Chromium。UI 测试顺序运行，避免共享系统剪贴板造成相互干扰。报告生成器拒绝将 QA_FILTER 的局部结果当作完整回放；历史失败图片保留，当前结论只取 results.json 中本轮记录。

批量删除动作未执行；未合并分支、覆盖安装版或发布。Windows/Linux、所有私有资源服务和所有并发组合仍不在已通过证明内。
