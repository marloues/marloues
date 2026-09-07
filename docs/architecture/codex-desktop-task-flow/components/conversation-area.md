# Codex 对话区：组件树、参数与显示交互

本文件单独整理消息列表及其内部的用户消息、助手答复、执行过程、状态、计划与产物，并包含维持阅读体验所需的滚动和消息导航。输入框、队列、标题栏及侧栏不在本文件范围内。

来源为本机 `/Applications/ChatGPT.app/Contents/Resources/app.asar` 中的 `openai-codex-electron 26.901.41600`，分析日期为 2026-09-05。以下中文组件名是分析标签，旁边的压缩符号是该版本的真实定位；参数来自资源包中的解构和调用点，不是恢复出的完整 TypeScript 接口。

## 1. 组件树

下图表达组件组合与职责层次，省略中间包装器、Provider、图标和国际化文本。条件分支不会全部同时出现，也不能把它当成某个时刻的完整 DOM 树。

```text
对话滚动容器 Fe
├─ 时间线 GO
│  └─ 新回复放置协调 UE
│     └─ 虚拟轮次列表 Ie
│        └─ 单轮列表行 IE（带错误边界）
│           └─ 单轮数据适配 Ji
│              └─ 单轮主体 _i
│                 ├─ 起始用户消息区
│                 │  └─ 类型分发 YT → 用户消息 Eg
│                 ├─ 执行过程区 tD
│                 │  ├─ 过程标题 / 折叠开关 YE
│                 │  ├─ 折叠开关前的特殊条目
│                 │  ├─ 可折叠活动 → 类型分发 YT
│                 │  │  ├─ 助手过程消息
│                 │  │  ├─ 单工具展开容器 S → 具体工具内容
│                 │  │  │  └─ 命令与日志 A / De / Oe
│                 │  │  └─ 探索汇总、MCP、子任务等活动
│                 │  └─ 持续保留的条目（追加用户消息、特定交互卡等）
│                 ├─ 最终助手答复 pE → YT → 正文及操作栏
│                 │  └─ 助手操作栏 zy
│                 ├─ 工作 / 等待状态 Li / Ii
│                 ├─ 差异入口 eT → 完成差异 rT
│                 ├─ 计划进度 hw / gw / Sw
│                 ├─ 计划正文 hE / gE
│                 ├─ 图片产物 UGn
│                 └─ 文件产物 OW
└─ 配套消息导航 Nt（与滚动区域协作，并非断言直接 DOM 子节点）
```

结构来源：[C05](evidence.md#c05)、[C06](evidence.md#c06)、[C07](evidence.md#c07)、[C08](evidence.md#c08)、[C09](evidence.md#c09)、[C13](evidence.md#c13)、[C30](evidence.md#c30)、[C31](evidence.md#c31)、[C35](evidence.md#c35)。具体消息和产物的定位见下方参数表。

`Ji` 准备本轮展示需要的数据，`_i` 编排各区域，`YT` 根据条目类型选择渲染器。最终答复、过程消息与用户消息可能经过同一个分发器，但它们的位置、折叠策略和操作权限由所在上下文决定。

## 2. 列表、滚动与单轮参数

表中列出关键参数，省略号表示还有其他输入或透传项。组件也会读取 context、历史订阅及外部状态，不能只照抄这些 props 就复现全部行为。

| 组件 | 关键输入 | 回调与职责 | 定位 |
|---|---|---|---|
| 滚动容器 `Fe` | `children, footer, responseSpacer, initialOffset, hasLiveMcpAppFrame, loadPastHiddenHistoryPages` | `onScroll, onUserScrollToTop`；协调阅读位置、底部空间和历史加载。`footer` 是外部输入区的布局接口。 | [C30](evidence.md#c30) |
| 时间线 `GO` | `conversationId, hostId, isReadOnly, initialScrollOffset, initialVirtualizedTurnListRestoreState, usesUnifiedTimeline` | 构建 entries；回报可见内容准备完成、占位空间与恢复状态。 | [C05](evidence.md#c05) |
| 放置协调 `UE` | `entries, consumePendingLatestTurnSubmitPlacement, latestTurnFooter, synchronouslyMeasureLatestTurnUpdates` | 对接虚拟列表 API；协调新提交后的高度测量、视口和 response spacer。 | [C05](evidence.md#c05) |
| 虚拟列表 `Ie` | `entries, RowComponent, gapPx, initialRestoreState, retainedTurnKeys, preserveMeasuredTurnViewport` | `onApiChange` 提供 `getEntryGeometry / scrollToKey`；通过 `onRestoreStateChange, onViewportChange, onLatestTurnHeightChange` 回报布局状态。 | [C35](evidence.md#c35) |
| 单轮列表行 `IE` | `entry, latestTurnFooter, latestTurnFollowContentRef` | 转换 entry，组合轮次尾部内容与错误边界。 | [C06](evidence.md#c06) |
| 单轮适配 `Ji` | `turn, turnState, turnRequests, historyEntityKey, turnSearchKey, isLatestTurn, isMostRecentTurn, isCollapsed` | 准备投影、停止来源、计时回退；连接 `onSetCollapsed, onEditLastTurnMessage, onForkTurnMessage`。 | [C07](evidence.md#c07) |
| 单轮主体 `_i` | `turn, workedDurationMs, interruptedByThisClient, renderMcpApps, showFullTranscript, generatedImages, completedThreadGoal, isReadOnly, conversationDetailLevel, …` | 决定用户、过程、最终答复、状态、请求相关展示及产物的组合。 | [C08](evidence.md#c08) |
| 类型分发器 `YT` | `item, conversationDetailLevel, isTurnInProgress, isTurnCancelled, renderMcpApps, toolActivityTurnKey, assistantAfter, …` | 按条目类型渲染；接收用户与助手各自的操作策略。 | [C09](evidence.md#c09) |
| 消息导航 `Nt` | `items, getScrollElement, prefersReducedMotion, tooltipComponents, tooltipPortalContainer` | `onBookmarkChange, onNavigationClick, onPreviewItem, onRevealItem`；预览、书签和真正跳转分别处理。 | [C31](evidence.md#c31) |

## 3. 消息、过程与产物参数

| 组件 | 关键输入 | 回调与职责 | 定位 |
|---|---|---|---|
| 用户消息 `Eg` | `message, sentAtMs, collapsedLineCount, messageStatus, alwaysShowActions, compactActions, hideActions, turnId, messageContent` | `onEditMessage`；正文、自定义内容、状态、复制与编辑。编辑草稿还依赖按 turn ID 保存的外部状态。 | [C10](evidence.md#c10) |
| 助手包装 `pE` | `item, historyEntityKey, isReadOnly, isHeartbeatAutomationRequest, isHeartbeatAutomationTurn, …` | 直接渲染或订阅条目更新；异步问题还有 questionKey 包装。 | [C11](evidence.md#c11) |
| 助手操作栏 `zy` | `copyText, getCopyText, getCopyHtml, onFork, forkDisabled, isForking, sentAtMs, alwaysShowActions, additionalActions, persistentAdditionalActions` | 复制、分支、附加操作与时间戳；拥有独立的显示和禁用条件。 | [C12](evidence.md#c12) |
| 过程容器 `tD` | `items, workedForItem, workedDurationMs, hasFinalAssistantStarted, isTurnCancelled, persistedCollapsed, forceExpanded, disableCollapse, preventAutoCollapse` | `onSetCollapsed`；区分可折叠内容、持续保留内容和开关前内容。 | [C13](evidence.md#c13) |
| 过程标题 `YE` | `collapsedMessageCount, workedDurationMs, workedForItem, isCollapsed, previousTurnNumber, totalTurnCount` | `onToggle`；选择标题，切换前保持标题所在的时间线锚点。 | [C13](evidence.md#c13)、[C34](evidence.md#c34) |
| 工具展开容器 `S` | `defaultExpanded, indentContent, icon, summary, status, children` | `onExpand`；分别管理运行与非运行阶段的展开选择，测量内容高度。 | [C14](evidence.md#c14) |
| 命令正文 `A` | `shellName, cwd, command, output, isInProgress, variant, embeddedAppearance` | 命令和输出各自复制；处理日志格式及内部滚动。 | [C15](evidence.md#c15) |
| 命令容器及结果 `De / Oe` | 容器：`command, cwd, output, footer, surface`；结果：`isInProgress, isSuccess, exitCode, wasInterrupted` | 输出文本与执行结果分别呈现。 | [C15](evidence.md#c15) |
| 差异 `eT / rT` | `item, isInProgress, inProgressDiffSummary, showRevertButton, deferOffscreenRendering, …`；完成分支还使用任务、主机和工作目录上下文 | 运行摘要与完成 diff 分支；文件统计、展开和延后渲染。 | [C16](evidence.md#c16) |
| 计划进度 `hw / gw / Sw` | `item, isComplete, donutAnimateOnMountDelayMs, tooltipPortalContainer` | 进度指示、提示说明及动画时机。 | [C17](evidence.md#c17) |
| 计划正文 `hE / gE` | `item, hideCodeBlocks, defaultCollapsed, historyEntityKey, …` | 独立的正文折叠和历史观察路径；与 todo 进度分别处理。 | [C17](evidence.md#c17) |
| 图片产物 `UGn` | `images, conversationImages, pendingImageCount, enableImageEditor, enableCanvas, canShareImage, turnId` | `onOpenImage, onImageEditSubmit, onImageShare, onImageInteraction`；可注入资源解析器。 | [C18](evidence.md#c18) |
| 文件产物 `OW` | `resources, conversationId, turnId, cwd, hostId, messageId, inputMessageId, isAppgenEndCardEnabled` | `onFileOpen`；携带来源身份构建产物展示。 | [C19](evidence.md#c19) |
| 工作状态 `Li / Ii` | `clientUserMessageId, isVisible, icon, message` | 显示等待或思考槽位；文字不可见时仍可能保留布局。 | [C32](evidence.md#c32) |

回调代表组件向上层请求动作，不代表动作已经成功。例如用户消息编辑会等待异步结果，再决定是否退出编辑。

## 4. 一轮内容怎样排进对话区

实际链路是：原始 turn/items → 展示投影 → 区域分配 → 活动分组 → 组件可见性。以下规则解释为什么收到事件的顺序与最终画面不完全一致。

| 条件 | 显示处理 |
|---|---|
| 协议状态是 `completed` 或 `failed` | 都可映射为展示状态 `complete`；它只表示执行结束，错误仍须单独判断。`interrupted` 映射为 `cancelled`，`inProgress` 映射为 `in_progress`。 |
| 开始执行前的用户消息 | 分入起始用户区；heartbeat trigger 和 worktree 初始化另有处理，不能直接按数组前 N 项截取。 |
| 执行中追加用户消息 | 可留在本轮过程区，不一定另建一个视觉轮次。 |
| 多次更新 todo 或 diff | 取最后一份放到相应区域；计划提议、计划实施、模型切换等还有各自的位置。 |
| 出现未完成问题、审批或 elicitation | 从普通活动中分离；等待某服务器 elicitation 时，可抑制同服务器仍运行的 MCP 项，避免重复等待表现。请求表单自身属于输入侧边界。 |
| 选择最终助手答复 | 排除 async delivery；必要时向前越过已完成 reasoning、子任务活动等条目寻找符合资格的答复，不能取数组最后一项。 |
| 答复被选入最终区 | 从过程区移出；相邻 final_answer 在 searchItemId 相同且内容完全一致时可去重。 |
| 执行已终止但没有有效最终答复或结构化输出 | 尾部符合条件的 system error 可独立显示。 |
| 自动审批评审或 automation 更新 | 评审按 target item ID 关联工具；更新按 automation 身份合并，完成答复还可带相关引用。 |

来源：[E01](../evidence.md#e01)、[E24](../evidence.md#e24)、[E25](../evidence.md#e25)。

## 5. 状态提示怎样选择

工作指示器选择器按下列顺序判定，首个满足条件的分支生效。外层 `_i` 仍会进行最后的可见性控制。

| 优先级 | 条件 | 选择结果 |
|---|---|---|
| 1 | `forceThinking` | thinking 槽位；等待用户回答时可替换成等待回答的文字和图标。 |
| 2 | 轮次不在执行 | 不显示普通工作指示。 |
| 3 | 正在探索 | exploring。 |
| 4 | 有未完成 proposed plan | planning。 |
| 5 | 有阻塞请求、已识别的最终答复、活跃 web search 或动态工具自己的摘要 | 不再选择通用 thinking。 |
| 6 | 有未完成 assistant 消息 | thinking。 |
| 7 | 有其他活跃且非探索的工具 | 交由具体活动表示状态；否则回退 thinking。 |

这里的“已识别最终答复”要求 `phase === final_answer`，并且正文去空白后非空、消息已完成、存在 `structuredOutput` 三者至少满足一个。空的流式占位还不一定符合条件。

外层在本客户端停止、sleeping、某些授权等待、安全缓冲或待生成图片等状态下，会进一步抑制普通 thinking。`Ii` 有时只把文字设为 invisible 和 aria-hidden，并保留槽位；移除整行可能引起与原行为不同的布局变化。

来源：[E26](../evidence.md#e26)、[E27](../evidence.md#e27)、[E34](../evidence.md#e34)、[C32](evidence.md#c32)。

## 6. “用时”的出现、位置与结束

“用时”可能来自显式 worked-for 条目，也可能来自过程折叠标题的 duration 回退。判断一条计时项没有生成，不能据此断言对话区不会显示任何用时。

| 阶段或条件 | 规则与位置 |
|---|---|
| 确定计时起点 | 先要求有首次工作时间；在此基础上优先 `turnStartedAtMs`，缺失才用首次工作条目的时间。 |
| 存在 `sleep` item | 此路径不生成普通计时起点，同时禁用 duration 回退。 |
| 判断有没有有效过程 | user-message、realtime-transcript、worktree-init 和空项不算有效工作；计时边界之前必须有有效过程项。 |
| 执行中 | 边界取第一条 final_answer assistant 的位置，没有则取 items 末尾；计时项插在第一个有效过程项之前。 |
| 执行结束且未取消 | 边界取最后一条 assistant；生成的计时项插在它之前。没有 assistant 时不走此插入路径。 |
| 最终答复已符合识别条件且有时间戳 | 计时可在正文仍流式输出时冻结，结束时间取 `finalAssistantStartedAtMs`，不用等全文输出完成。 |
| 结束时间缺失 | 只有执行中才生成 working；终态可能不生成显式计时项，但过程标题仍可能使用 duration 回退。 |
| working 正在显示 | 无终点时每秒更新，差值至少为 0；不足 1 秒使用 Working 文案，达到 1 秒才显示 Working for 加时长。具体文字随语言变化。 |
| 由本客户端发起停止 | 普通非 Aeon 呈现路径有独立 stopped 项，使用“你在……后停止了”一类文案；历史 interrupted 不自动等同于本次本客户端停止。 |
| 过程标题选择文字 | 优先 worked-for item，其次 duration，再回退历史消息数量标题。 |

因此，同一轮执行可能依次表现为“过程前的计时 → 最终答复前的用时 → 收起过程标题上的用时”。这是条目插入位置、最终答复识别与折叠标题共同作用的结果。

来源：[E24](../evidence.md#e24)、[E27](../evidence.md#e27)、[E33](../evidence.md#e33)、[E34](../evidence.md#e34)、[E35](../evidence.md#e35)、[E44](../evidence.md#e44)。

## 7. 执行活动的合并与两级折叠

### 活动怎样分组

可识别的探索类命令会组成 exploration，reasoning 也可以并入。只有末尾仍有效的探索组结合执行状态满足条件时才显示 exploring，历史组会变为 explored。groupable 项连续累积，遇到 standalone 项就结束当前组。

同类 MCP 连续合并还要求调用已经完成且成功、允许分组、身份组合一致、没有 source、不是 computer-use、没有附属自动审批评审，也没有需要单独呈现的资源。不能只依据工具名称合并。文件和读取路径的摘要统计会去重，因此调用次数与文件数不是同一个指标。

仅含一项的摘要组有时会简化成独立活动，但活跃项、多文件或可视化 patch 等存在例外。来源：[E28](../evidence.md#e28)、[E29](../evidence.md#e29)、[E30](../evidence.md#e30)。

### 整段过程折叠

基础许可要求：最终答复已经开始、轮次未取消、存在可渲染过程项。允许后，折叠选择的优先级为：

```js
// 仅表达已定位到的选择逻辑；不是完整组件实现。
isCollapsed = !forceExpanded
  && (persistedCollapsed ?? !preventAutoCollapse);
```

即强制展开优先，其次已有用户选择，最后才使用自动默认值。`persistedCollapsed` 的名字不证明它跨重启保存，本次只确认了读取优先级。`preventAutoCollapse` 和 `disableCollapse` 也不是同一件事。

外层还会检查是否有可折叠内容及特殊单项等条件，再决定是否画出开关。追加用户消息、hook feedback、某些动态工具和需要持续显示的 MCP App 可留在 persistent 区；收起过程后，它们仍可能可见。

点击标题前会记录时间线锚点，切换后用 RAF 和 ResizeObserver 补偿位置变化，短窗口上限为 250 ms。来源：[E31](../evidence.md#e31)、[E32](../evidence.md#e32)、[C13](evidence.md#c13)、[C34](evidence.md#c34)。

### 单个工具展开

| 条件或动作 | 处理 |
|---|---|
| 工具状态为 running | 默认展开；用户在运行阶段主动收起后，使用该阶段的独立选择。 |
| 工具离开 running | 读取另一份展开状态，初值来自 `defaultExpanded`；不会简单继承运行阶段的展开结果。 |
| 由关闭变为打开 | 才调用 `onExpand`；没有 children 时不提供同样的展开控制。 |
| 收起内容 | 高度动画至 0，同时设置 `aria-hidden`、`inert` 和 `pointerEvents:none`。隐藏内容不能继续接受点击或键盘焦点。 |
| 内容高度变化 | 实际测量高度驱动动画；固定 max-height 不能等价替代。 |

整段过程与单工具各自管理状态，不能共享一个 `expanded`。命令卡的命令与输出各自可复制，成功、退出码、中断等结果也独立于日志文本。完成 diff 的展开同样需要保持时间线锚点。来源：[C14](evidence.md#c14)、[C15](evidence.md#c15)、[C16](evidence.md#c16)。

## 8. 用户消息与助手操作栏

| 动作或状态 | 具体规则 |
|---|---|
| 是否允许编辑用户消息 | 需要 `onEditMessage` 和 turn ID，并排除合成的实施计划消息。 |
| 进入编辑 | 按 turn ID 保存编辑状态；已有草稿时不直接被原文覆盖。 |
| 提交编辑 | 等待 `onEditMessage`；成功才清除编辑状态，失败分支保留草稿。 |
| 复制用户消息成功 | 显示已复制图标和可访问标签，1500 ms 后恢复；反馈期间不重复触发同一复制动作。 |
| 用户消息正文为空 | 还要考虑附件、评论与特殊提示；不能直接删除整条消息。 |
| 助手没有可用操作 | 若也不满足单独时间戳条件，操作栏返回 null。 |
| 助手操作栏没有强制常显 | 通常透明，在 group hover 或 focus-within 时显现；时间戳另有 hover 策略。 |
| 复制助手答复 | 可通过 `getCopyText / getCopyHtml` 获取纯文本和 HTML；不能用整个气泡 DOM 的 innerText 代替。 |
| 创建答复分支 | `forkDisabled` 或 `isForking` 时禁用；执行中显示 busy 状态，点击阻止冒泡。 |
| 助手条目发生更新 | `pE` 根据历史实体选择订阅或直接渲染；只读 async 条目等走直接渲染分支。 |

来源：[C10](evidence.md#c10)、[C11](evidence.md#c11)、[C12](evidence.md#c12)。

## 9. 图片、文件、计划与历史卡片

| 条件 | 具体规则 |
|---|---|
| 图片已有 src | 保留为完成图片。无 src 时，只有轮次仍在运行且图片状态为 `in_progress / inProgress` 才增加待生成占位。 |
| 图片生成期间收到 steering | 重置对应待生成占位计数，并避免同一次 steer 重复重置；完成图片仍保留。 |
| 本客户端已经停止 | 待生成占位数置 0；内部 `hasPendingItems` 仍可能为真。 |
| 最终资源包含 pptx | 该输出选择器抑制完成图片画廊，仍可保留待生成占位。 |
| 出现图片用量限制错误 | 可保留为活动错误，不能因为缺少 src 就一直显示生成中。 |
| 文件产物可打开 | `OW` 带任务、轮次、主机、工作目录及消息身份，通过 `onFileOpen` 通知上层。 |
| 查找历史计划 | 从后向前选非运行轮次的 plan，可按 key 过滤，并从一级标题提取标题。 |
| 历史轮次允许 MCP Apps | 最近三个可见非占位轮次得到 auto-expand 提示，更早轮次用 default；卡片最终是否展开仍由自身逻辑决定。 |

来源：[E36](../evidence.md#e36)、[E39](../evidence.md#e39)、[E43](../evidence.md#e43)、[C18](evidence.md#c18)、[C19](evidence.md#c19)。

## 10. 滚动、虚拟列表和阅读位置

滚动实现区分顶部和底部原点，部分布局采用反向 flex。表中的“离底部距离”是组件换算后的距离，不能在所有布局下直接用原生 scrollTop 代替。

| 条件 | 具体处理 |
|---|---|
| 离底部不超过 24 CSS px | 视为接近底部；跟随判断存在容差。 |
| 回答增长或容器尺寸变化 | ResizeObserver 和保存的距离参与补偿；区分阅读旧内容与贴底跟随，并考虑 response spacer。 |
| 判断返回底部按钮 | 有 response spacer 时，比较其高度加 24；否则使用 controller 的离底部状态。运行提示点也要求按钮可见。 |
| 用户滚动与布局变化同时发生 | 记录 wheel、触摸、键盘及指针输入的滚动意图，区别于程序滚动；意图时效为 1000 ms，触摸移动阈值为 8 px。 |
| 按键参与阅读滚动 | 方向键、Home/End、PageUp/PageDown 和 Space 有方向判定；排除已处理事件、repeat、输入控件、可编辑区域及按钮上的空格等情况。 |
| wheel 的 deltaMode 不同 | 行单位乘 16，页单位乘视口高度，像素单位保持原值。 |
| 接近历史顶部 | 普通阈值为 64 px；允许跨隐藏历史页时可取视口高度与 64 的较大值；还需满足分页状态。 |
| 程序滚回底部 | 此组件使用 260 ms 动画常量。 |
| 历史轮次离开可见区 | 虚拟列表记录稳定 key 和测量高度；`retainedTurnKeys` 允许额外保留离屏条目。 |
| 新回复需要定位 | `UE` 与虚拟列表交换几何信息并协调 response spacer，不只是给最后一条消息调用 scrollIntoView。 |
| 预览或跳到用户消息 | 导航轨道区分 preview、reveal/navigation 与 bookmark；支持 tooltip portal 和 reduced-motion 参数。 |

历史 entry 会按稳定身份和相等条件复用；占位项可带预计高度。较早历史可能是更早 turns，也可能是当前部分轮次缺少的 items。分页结果还需检查 cursor 等边界是否过期，避免晚到数据重复插入或错排。

来源：[E38](../evidence.md#e38)、[E39](../evidence.md#e39)、[E40](../evidence.md#e40)、[E41](../evidence.md#e41)、[E45](../evidence.md#e45)、[C05](evidence.md#c05)、[C31](evidence.md#c31)、[C35](evidence.md#c35)。

## 11. 已确认的样式声明

公共 spacing 基值为 `0.25rem`。browser、chrome-extension、electron 对应的 body 规则设有 `--thread-content-max-width:48rem`，共享 body 声明中还可见 `--markdown-wide-block-max-width:56rem`；其他布局及 utility 存在覆盖。

滚动区 compact 呈现使用渐变 mask，底部渐隐受 `--thread-scroll-padding-bottom` 影响。以上只是资源中的静态声明，最终宽度、间距与渐隐效果还取决于平台、主题、字号及实际元素的 CSS 级联。本次没有把这些值当成已经测得的 computed style。[C33](evidence.md#c33)

## 12. 证据与覆盖边界

关键资源与真实符号如下；证据链接中另有精确 UTF-16 偏移及片段哈希，可以回到安装包复核。

| 资源文件 | 本文涉及的主要符号 |
|---|---|
| `local-conversation-thread-d62147e79bfc.js` | `GO, UE, IE` |
| `conversation-source-92c561bb853b.js` | `Ie` |
| `local-conversation-turn-91afa1cb9913.js` | `Ji, _i, Li, Ii` |
| `subagent-activity-chip-group-aa63c0e54657.js` | `YT, Eg, pE, zy, tD, YE, eT, rT, hw, gw, Sw, hE, gE, OW` |
| `tool-activity-disclosure-950cab720962.js` | `S` |
| `exec-shell-container-eec3edff86fc.js` | `A, De, Oe` |
| `app-primary-139889e10fbd.js` | `UGn` |
| `thread-scroll-layout-e1ad7d066d92.js` | `Fe` |
| `thread-user-message-navigation-rail-app-58ae0a1a2c2b.js` | `Nt` |

本文是从已有证据整理出的独立对话区规格，属于该安装包版本的静态分析。既有函数探针只验证了部分判定函数，不能证明整屏交互或所有功能分支均已验证。

尚未穷举的对话区内部包括：Markdown 正文渲染器、表格、公式、代码块、引用、文件预览、diff 编辑器内部，以及各类 MCP App 自身的交互。本文已经确认它们的部分接入边界，但没有恢复这些子系统的全部组件与参数。

复刻时还需回放：编辑失败保留草稿、键盘聚焦操作栏、运行与完成阶段的两级折叠、收起内容的焦点隔离、答复开始时计时冻结，以及旧历史阅读与图片迟到/新输出同时发生的滚动。这些是待执行的 UI 验收场景。
