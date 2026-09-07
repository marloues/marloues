# Marloues 对话区：组件与行为规格

本规格以 **`codex/architecture-review-20260905` 专用 worktree 的实际工作区内容**为准，包括未提交文件；目录为 `/Users/xuzong/workspace/marloues-architecture-review-20260905`，Git HEAD 为 `edebdae45ce19f787125584750e636f56ecb30d3`。核对日期：2026-09-05。

**可以将已提取的 Codex 行为应用到 Marloues，主要工作是在现有组件和展示模型上补齐规则。** 当前已经接通 `WorkflowTurnView → buildTurnPresentationModel → WorkflowAssistantTurn`，消息语义、错误和结果也已进入这条路径。本文件替代此前 main 基线规格中的“现状、差距和实施顺序”判断。

交付范围为对话区的组件树、参数、**90 条适配规则**、数据扩展和实施清单。本文保存 MR01–MR40 的轮次主干规则；[对话区详细规格](conversation-area/README.md)补齐正文、代码、表格、媒体、工具详情和资源的 MR41–MR90，以及 76 个显式分支的逐项映射。本次更新规格与证据索引，未改动产品实现。参考安装包版本为 `26.901.41600`。

**范围与完成标准**：只核对对话区，包括正文及代码块/表格/公式/媒体、执行过程、工具详情、状态、产物、消息操作和滚动。本次已逐项映射消息 37 分支、Markdown 20 分支、MCP 内容 6 分支、资源 5 分支和 elicitation 8 分支，并补充公式、directive 和动态组件入口。静态映射完成不代表 Marloues 已全部实现或 UI 已全部验收；动态内容、宿主能力和未运行场景见[覆盖说明](conversation-area/README.md)。

## 1. 当前已经具备的基础

| 能力 | 当前实现 | 本次结论 |
|---|---|---|
| 实际页面接入展示模型 | `WorkflowReadThreadTurnList → WorkflowTurnView → WorkflowAssistantTurn` | 已接通，保留这条主路径。 |
| 过程、最终正文、结果分区 | `TurnPresentationModel.blocks` 的 `process/document/results` | 已接通；过程收起不再只留下另建的 summary 正文。 |
| 消息角色与流式生命周期分离 | native `phase` 保留语义，`settled` 表达完成；完整快照与真正 delta 分开 | 已实现，继续使用现有 phase，不必另造一份同义的 semanticRole。 |
| 错误透传与独立错误卡 | `WorkflowTurn.error → WorkflowMessageBlock.error → document(tone=error)` | 已实现，保留异常与正常正文并存的能力。 |
| 同 ID 更新与历史恢复 | adapter/store/persistence 保留消息角色、状态、工具结果及 steer 显示分段 | 已有链路；尚不能据此认定所有执行中断点都可重放。 |
| 长任务保留关键条目 | 普通过程实时窗口 256 条，早期审批、计划、图片、文件、失败项和显式 final 额外保留 | 已实现，后续新增计时不能只扫描裁剪后的窗口。 |
| 工具摘要、详情与命令复制 | `WorkflowActivityRenderer`、具体工具行和 `WorkflowCommandDetail` | 已接入，继续统一摘要与完整详情的职责。 |
| 虚拟化与布局间距 | Virtuoso；frame 内非末轮 28 px；正文容器 gap 16 px | 已实现，保留当前测量边界，不能回退到每轮的 `:last-child`。 |

来源：[W01](#w01)、[W02](#w02)、[W03](#w03)、[W04](#w04)、[W05](#w05)、[W11](#w11)。本次重跑相关现有测试：**6 个文件、44 项通过**；覆盖范围见第 9 节。

## 2. Marloues 当前组件树

这是当前源码的职责与调用关系，省略 Provider、图标、国际化和部分条件包装。

```text
WorkflowChatPage
├─ useConversationScroll
└─ .messages-scroll → .messages-inner
   └─ WorkflowReadThreadTurnList
      ├─ useWorkflowCollapseState
      └─ Virtuoso（有 scrollParentRef 时）
         └─ .workflow-turn-frame（稳定 turn ID、data-last-turn）
            └─ WorkflowTurnView
               ├─ buildTurnPresentationModel
               ├─ WorkflowUserMessage
               ├─ WorkflowTurnDuration（文件内组件）
               └─ WorkflowAssistantTurn
                  ├─ WorkflowTurnShell
                  │  ├─ AssistantTurnHeader
                  │  └─ WorkflowThinkingPlaceholder（按模型选择）
                  ├─ TurnPresentationBlocks
                  │  ├─ process → WorkflowTurnFlowSection
                  │  │  └─ WorkflowAgentFlowSection
                  │  │     ├─ 过程助手文本 → WorkflowAssistantAnswer
                  │  │     └─ WorkflowActivityRenderer
                  │  │        ├─ WorkflowActivityGroup
                  │  │        └─ WorkflowTurnItemRenderer
                  │  │           ├─ WorkflowCommandExecutionRow
                  │  │           │  └─ WorkflowCommandDetail
                  │  │           ├─ WorkflowToolCallRow → ToolDetail
                  │  │           ├─ 文件、图片、搜索、协作、审批行
                  │  │           └─ 审查、压缩、hook、unknown 标记
                  │  ├─ document → WorkflowAssistantAnswer
                  │  │  └─ WorkflowMarkdownContent / 纯文本
                  │  ├─ document(tone=error) → WorkflowTurnErrorCard
                  │  └─ results → WorkflowResultCards
                  │     └─ 文件差异 / 图片与预览 / 浏览器结果
                  └─ WorkflowTurnFooterView
```

`WorkflowTurnList`、`WorkflowThreadView` 和子任务界面继续复用此单轮链路。`message-view.tsx` 不再是这里的主条目路由，不能用其中旧 `DisclosureRowView/itemFailed` 的行为判断当前页面。[W01](#w01)、[W02](#w02)、[W06](#w06)

后续组件边界以[完整职责表](conversation-area/components.md)为准：除工具 disclosure 与消息导航，还需要表格、媒体、公式/图表、结构化工具内容等职责。已有组件继续复用，小职责可放在原文件内部，不要求全部拆成独立文件。

## 3. 参考职责到项目组件的映射

| Codex 参考职责 | Marloues 组件/模块 | 应用方式 |
|---|---|---|
| 时间线与虚拟列表 `GO / UE / Ie` | `WorkflowReadThreadTurnList`、Virtuoso、`useConversationScroll` | 沿用列表；补提交放置、锚点和需要保留的交互内容接口。 |
| 单轮适配 `Ji` | `WorkflowTurnView`、`buildTurnPresentationModel` | 已实现；继续集中派生计时、指示器和折叠决策。 |
| 单轮编排 `_i` | `WorkflowAssistantTurn / WorkflowTurnShell / TurnPresentationBlocks` | 已实现三分区；需要时扩展持续交互区及计时槽位。 |
| 类型分发 `YT` | `WorkflowActivityRenderer / WorkflowTurnItemRenderer`、正文分支 | 沿用中性 item 契约和具体渲染器。 |
| 用户消息 `Eg` | `WorkflowUserMessage` | 保留附件、复制、预览；补带消息身份的编辑协议。 |
| 助手观察与操作 `pE / zy` | read-thread 订阅、memo、`WorkflowTurnFooterView` | 继续用本地订阅体系；补操作策略与 busy 状态。 |
| 整段过程折叠 `tD / YE` | `process.canCollapse`、`WorkflowAgentFlowSection`、`AssistantTurnHeader` | 已具备过程隔离和惰性挂载；补答复开始阶段的策略、用户选择优先级及锚点。 |
| 单工具展开 | `WorkflowActivityRow` + 拟新增 `WorkflowToolDisclosure` | 行负责外观；状态策略按命令、普通工具、两阶段工具和交互卡分别指定。不能把 `S` 的默认值套给所有类型。 |
| 命令详情 `A / De / Oe` | `WorkflowCommandExecutionRow / WorkflowCommandDetail / commandPresentation` | 已接入；保留完整命令、独立复制和运行/失败/停止状态。 |
| diff、计划、图片、资源 | `WorkflowResultCards`、`ToolDetail`、各专用行、`WorkflowImageLightbox` | 沿用当前内容能力，补 pending/停止/资源来源模型。 |
| 工作状态 `Li / Ii` | `workflowTurnPresentation / WorkflowThinkingPlaceholder` | 补显式等待上下文、槽位可见性和占位策略。 |
| 滚动与消息导航 `Fe / Nt` | `useConversationScroll` + 拟新增 `WorkflowMessageNavigation` | 保留当前基础滚动，增加特定场景控制。 |

这里采用的是职责映射，不要求把 Codex 的压缩符号或内部组件划分搬进项目。

## 4. 真实参数与拟扩展契约

“现有参数”来自当前 worktree。“拟扩展”仅为设计；本次没有新增相应 props。

| 组件/函数 | 现有关键参数与回调 | 拟扩展 |
|---|---|---|
| `WorkflowReadThreadTurnList` | `readThread, isStreaming, stateScopeKey, modelName, scrollParentRef, disableResponseTimer, plainTextAnswers, showFooterMetadata`；复制、编辑、分支、删除、`renderBeforeTurn` 回调 | 统一 `presentationContext`；按 key 获取几何/跳转/恢复的接口。 |
| `WorkflowTurnView` | `message, sessionId, expanded, isLastStreaming` 及计时、正文策略、动作回调 | 沿用适配入口；新规则从模型获取。当前已消费 disableResponseTimer 并传递 plainTextAnswers。 |
| `buildTurnPresentationModel` | `message`；`isLastStreaming, modelName, liveItemWindow` | 增加计时事实和请求上下文；完整事实计算与展示窗口分开。 |
| `WorkflowAssistantTurn` | `model, duration, expanded, sessionId, plainTextAnswers, showFooterMetadata`；`onToggle, onCopy, onFork, onDelete` | 将计时模式/位置归入模型；继续保证非过程内容不随折叠消失。 |
| `WorkflowTurnShell` | `model, children, duration, expanded, onToggle, modelName` | header 与状态槽消费明确决策；不重复计算执行状态。 |
| `TurnPresentationBlocks` | `model, expanded, plainTextAnswers, sessionId` | 可扩展 persistent 内容和计时位置；不再新增第二份答复选择。 |
| `WorkflowUserMessage` | `text, content, createdAt, onCopy, onEdit` | `threadId/turnId/itemId`、受控 draft、edit capability、异步提交状态。 |
| `WorkflowTurnFooterView` | `finalText, isRunning, messageId, createdAt, showFooterMetadata`；`onCopy, onFork, onDelete` | `isForking, forkDisabled, alwaysShowActions`；可选 `getCopyHtml` 和独立时间戳策略。 |
| `WorkflowAgentFlowSection` | `entries, expanded, isStreaming`；group/item/assistant 三类 render 回调 | 保留已展开过程的最后快照；为持续交互项提供独立分区，而非全部冻结在隐藏快照中。 |
| `WorkflowActivityGroup` | `group, defaultDetailExpanded, expanded, active, thinking, toEntries, renderCommandGroup, renderItem` | 组的稳定身份与用户选择；不能因 group ID 随新 item 变化而覆盖已作选择。 |
| `WorkflowActivityRow` | `activityKind, icon, label, meta, detail, hasDetail, open, onToggle, iconTone` | 保持展示职责；展开生命周期交公共 disclosure。 |
| `WorkflowToolCallRow / WorkflowCommandExecutionRow` | 各接 `item`；内部各持有 `open` | 按稳定 item key 保存用户选择，是否分运行/完成两阶段由类型策略决定。ToolCallRow 已有 isCancelling 和重复取消保护，沿用。 |
| `WorkflowCommandDetail` | `presentation: CommandPresentation` | 沿用；退出码如需独立展示，从 canonical 字段补入 presentation。 |
| `ToolDetail` | `item, failed, cancellable, isCancelling, onCancel` | 沿用取消与详情接口；明确当前任务身份，避免仅依赖活动任务。 |
| `WorkflowResultCards` | 声明 `items, sessionId, showFileChanges, userMessageId`；函数实际使用 `items/showFileChanges` | 补资源身份的实际消费、pending 图片和能力策略。 |
| `WorkflowThinkingPlaceholder` | `label, visible` | `kind, reserveSpace` 和辅助技术语义；隐藏与卸载分别表达。 |
| `useConversationScroll` | `contentSignal, sessionKey, nearBottomThreshold, topLoadThreshold, hasMore, onLoadMore, loadingMore` | 锚点捕获/恢复、带会话令牌的异步补偿、response spacer 和导航接口。 |

真实组件定位见[源码索引](#sources)。拟新增组件的最小边界：

- `WorkflowToolDisclosure`：`itemKey, policy, phase, hasContent, onExpand, children`；policy 分命令、普通、两阶段和交互卡，保存用户选择，不发起工具执行。详见 [contracts.ts](conversation-area/contracts.ts)。
- `WorkflowMessageNavigation`：稳定 `turnId/itemId` 列表、预览文本、`onPreview, onNavigate, reducedMotion`；由列表适配器定位离屏目标。

## 5. 保留当前规则，并补足明确的数据缺口

### 当前展示模型

`TurnPresentationModel` 已包含 `prompt/runtime/chrome/process/documentText/blocks/metadata`，其中 `process` 已有 `canCollapse`。当前行为可准确归纳为：

```text
WorkflowTurn → WorkflowMessageBlock（已保留 error）
  → presentationMessage（窗口化并保留关键项）
  → workflowTurnLayout（角色选择、过程顺序、结果来源）
  → leading process / document / trailing process / error / results
  → WorkflowAssistantTurn
```

角色选择优先 `commentary/final_answer/final`。无语义 phase 时，只有尾部助手文本序列才进入 fallback；如果后面还有非静默工具或审批，就不把前面的说明当最终答复。**目前该 fallback helper 自身不区分运行与终态**；不要把它描述成已经具备“仅在终态回退”。[W03](#w03)

当前 `canCollapse` 要求：不在运行、activity 为 done、没有轮次错误、有最终文本或属于 continuation 前段、没有未解决/失败审批。历史命令失败经重试恢复且整轮成功时，允许折叠，失败记录仍在过程内。`WorkflowAssistantTurn` 用 `expanded || !canCollapse` 保证不允许折叠时强制显示过程。[W02](#w02)、[W03](#w03)

本次源码中 `canCollapse` 没有单独的 `status !== cancelled` 判断。后续若要求所有取消轮次默认展开，应显式制定并覆盖该分支，而不能只把 activity=done 当成正常成功。

### 需要补的数据

| 事实 | 当前可用内容 | 拟扩展与回退 |
|---|---|---|
| 消息语义 | native phase 已保留；非 native 增量可没有 phase | 沿用 phase 和 settled 的分工。有可靠角色事件才补角色；无角色期间不以任意非空文本触发“最终答复开始后自动折叠”。 |
| 首次有效工作时间 | 轮次 startedAt/completedAt/durationMs；item 时间未完整输出 | 拟新增 firstWorkAtMs，记录来源。只有确认有效工作后才启动过程计时。 |
| 最终答复开始时间 | 没有稳定的对应字段 | 拟新增 finalAnswerStartedAtMs；以语义 final 达到可展示条件时的事件时间记录。旧历史缺失时不造冻结点。 |
| 计时可信度 | 当前组件缺时间时用挂载时刻作为回退起点 | 记录 runtime/client-observed/turn-total/unavailable。终态可显示“总用时”；挂载时刻不能伪装成历史执行时间。 |
| 停止归因 | 有 cancelled/steer 分段，但没有本客户端停止来源契约 | 增加停止原因和请求关联。只有同一客户端明确发起并对账成功才使用“你停止了”。 |
| 等待用户/权限/其他阻塞 | 有 permissionRequest、页面外部请求状态 | 注入带 ownerTurnId 的请求摘要。输入区继续处理表单，对话区只决定状态和需要保留的内容。 |
| 原消息编辑 | 当前回调把文本填回 composer | 若执行层支持，增加带 thread/turn/item 身份、完整内容的编辑提交；否则产品动作称为“再次使用输入”。 |
| 图片资源与生成批次 | 有 status/result/savedPath、图片活动行和完成结果卡 | 增加 pending 批次/steer reset、取消结果和资源来源；没有这些字段时保留当前活动状态，不造通用资源能力。 |
| MCP App、sleep、异步交付、structuredOutput | 当前对话契约没有完整对应字段 | 按能力启用。普通名为 wait 的工具不能直接当作 sleep item；不启用依赖缺失字段的规则。 |

新增时间或归因事实必须沿 adapter → store → read-thread serializer → 持久化/恢复 → renderer model 贯通。现有错误和 phase 链路已经做完，不应再次被列为缺失项。[W04](#w04)、[W05](#w05)

### 模型扩展草案（尚未写入代码）

```ts
type TurnTimingDecision = {
  mode: "hidden" | "working" | "worked" | "stopped" | "total";
  startedAtMs: number | null;
  endedAtMs: number | null;
  durationMs: number | null;
  placement: "none" | "before-process" | "before-answer" | "process-header";
  basis: "runtime" | "client-observed" | "turn-total" | "unavailable";
};

type TurnIndicatorDecision = {
  kind: "none" | "thinking" | "exploring" | "planning"
    | "waiting-user" | "waiting-permission" | "sleeping";
  visible: boolean;
  reserveSpace: boolean;
};
```

不需要重建 `TurnPresentationModel`。在现有模型增加 timing/indicator 等决策即可；每秒时钟仍局限在计时组件。用户选择、草稿和动作 busy 属于 UI 状态，不写回运行时执行事实。

## 6. 40 条 Marloues 规则与当前状态

“已具备”表示当前对应路径已实现，不代表所有 UI 组合已验收；“部分”列明剩余条件；“待补”是新工作。规则编号延续上一份规格，内容按此 worktree 重新核对。

### 内容与状态

| 编号 | Marloues 规则 | 当前状态与下一步 |
|---|---|---|
| MR01 | 单轮由同一个模型选择正文、过程、错误和结果，入口共用。 | **已具备**。保留真实 TurnView 接线，不再安排“接通模型”工作。[W01–W03](#w01) |
| MR02 | 结束、成功、失败和取消分别表达，迟到的开始事件不能覆盖同调用终态。 | **部分**。工具错误和快照乱序已有修复；逐类型补齐取消文案，例如图片取消目前仍可能回退“已生成图片”。[W04](#w04)、[W06](#w06) |
| MR03 | 语义角色优先；缺角色时保留明确 fallback，不把工具之前的说明当最终答复。 | **已有核心**。补选择依据，并在“提前折叠/冻结计时”处要求可靠 final 语义；fallback 是否仅终态执行作为明确策略。[W03](#w03) |
| MR04 | 正文独立于过程；过程开关不切换成另一套 summary 正文。 | **已具备分区**。继续做流式、选区和挂载连续性 UI 验收，不能仅凭 key 相同断言永不重挂。[W02](#w02) |
| MR05 | 追加用户输入按发生顺序显示，steer 与其前后片段的身份和关系可恢复。 | **已有 steer 分段及持久化**。通用 adapter 仍汇总同一 turn 内 user items，多 user 原始记录的路径需单独覆盖。[W04](#w04)、[W05](#w05) |
| MR06 | 无最终正文时仍可显示轮次错误；未知条目保留可检查的回退呈现。 | **已具备**。error block 与 unknown renderer 已接通；不要重复实现。[W03](#w03)、[W06](#w06) |
| MR07 | 具体工具、等待用户/权限、最终答复和通用 thinking 不重复争抢状态槽。 | **部分**。现有 presentation 已区分 active-flow/answering/thinking；补 ownerTurnId 请求上下文和优先级。[W03](#w03) |
| MR08 | “不可见但保留位置”与“不渲染”分别表示；隐藏槽位正确处理辅助技术语义。 | **部分**。已有 invisible；补 reserveSpace/aria 等语义与测试。[W03](#w03) |

### 计时与过程折叠

| 编号 | Marloues 规则 | 当前状态与下一步 |
|---|---|---|
| MR09 | 过程计时需有有效工作和可靠起点；纯用户消息不生成过程用时。 | **待补**。当前主要按 turn start 或挂载时刻计时，补有效工作依据。[W01](#w01)、[W03](#w03) |
| MR10 | 运行时计时在过程前；结束后可在答复前；折叠标题使用同一时长决策。 | **待补**。当前 duration 传给 header；增加明确 placement，不在多个组件分别计算。 |
| MR11 | 可靠 final 开始时冻结过程时长，正文仍可继续流式输出。 | **补数据**。现有 running 时钟通常随整轮执行；增加 finalAnswerStartedAtMs 和回退依据。 |
| MR12 | 每秒更新时间，非负；不足 1 秒先显示工作文案；计时禁用必须生效。 | **部分**。独立计时组件与 disableTimer 已生效；正数不足 1 秒当前显示至少 1 秒，调整格式和零值语义。[W01](#w01) |
| MR13 | 只有本客户端明确发起停止才显示“你停止了”；steer 中断不冒充人工终止。 | **部分**。已有取消及 steer 区别；补客户端归因。旧历史继续使用中性停止文案。 |
| MR14 | 折叠许可依最终答复、过程、取消/错误/等待状态判断。 | **部分**。当前完成后的资格已实现；补“可靠 final 已开始但仍输出”的阶段和显式 cancelled 规则。[W02](#w02)、[W03](#w03) |
| MR15 | 强制展开优先，其次用户选择，最后默认自动策略；新快照不覆盖用户意图。 | **部分**。已有显式选择存储；hook 的 running/首次完成特判和 group.id 更新还需统一优先级。[W07](#w07) |
| MR16 | 折叠只隐藏过程，正文、错误、结果继续显示；必要交互内容持续保留。 | **已有三分区**。已有审批可阻止折叠；仅在需要“其他过程收起、该卡仍可操作”时扩展 persistent 分区。[W02](#w02) |
| MR17 | 单工具展开按类型决定；通用命令默认收起，普通 MCP 受保存选择/autoExpand 影响，交互卡还受 collapsible 限制。 | **修正旧概括**。不是所有 running 工具都应展开；需要两阶段的类型才分别保存状态。当前 open=false 不能一概算缺陷。[D13–D14](conversation-area/evidence.md#d13)、[W06](#w06) |
| MR18 | 只在关闭→打开时通知 onExpand；折叠动画中的隐藏内容不可聚焦或点击。 | **待补动画协议**。当前单工具关闭卸载详情，整段过程用 hidden 保留快照；这两种既有策略本身不能说成隐藏内容仍可聚焦。增加动画时再一并加 inert/aria-hidden。[W02](#w02)、[W06](#w06) |
| MR19 | 过程/diff 展开收起保持点击标题的视口位置。 | **待补锚点接口与回放**。参考 250 ms 补偿窗口，不把它当作全应用固定动画时长。[W10](#w10) |

### 活动、操作与产物

| 编号 | Marloues 规则 | 当前状态与下一步 |
|---|---|---|
| MR20 | 连续 groupable 活动分组，standalone 截断，最新活动组呈现运行状态，摘要保留分类。 | **已有核心**。读取/搜索/查找摘要、失败和活动标题已统一；继续核对去重统计和稳定 group key。[W06](#w06) |
| MR21 | 分组展示与合并多次调用不是同一规则；失败、来源、资源和评审不能被合并丢失。 | **部分**。现有状态会拆分运行/失败项；更精细的 MCP 合并需元数据，缺失时保留独立调用。 |
| MR22 | 保留图片、附件、引用、评论与文本的分类；有附件的空正文消息仍显示。 | **已具备基础**，沿用用户消息投影和预览组件。[W08](#w08) |
| MR23 | 原消息编辑按身份保存草稿，提交成功才退出，失败保留完整内容。 | **待补真正编辑契约**。当前仍是回填 composer；没有编辑能力时明确称“再次使用输入”。[W08](#w08) |
| MR24 | 用户消息复制成功反馈 1500 ms，期间防重复动作，失败不显示成功。 | **微调**。当前为 1200 ms，缺反馈期间重复点击保护；统一反馈 owner 和卸载清理。 |
| MR25 | 助手操作栏支持 hover 和 focus-within；没有操作与时间戳时不留空栏。 | **已有显隐基础**。补独立时间戳策略与空栏判定，保留键盘可见性。[W09](#w09)、[W11](#w11) |
| MR26 | 复制最终答复只取模型 document；HTML 复制按能力启用。 | **纯文本已正确接入** `model.documentText`；HTML 为可选扩展，不再列“混入所有过程正文”为现存缺陷。[W02](#w02)、[W09](#w09) |
| MR27 | 分支执行中 busy/禁用，避免重复；行内按钮不触发外层行为。 | **待补**。footer 的 onFork 仍直接执行，未管理分支进行中状态。[W09](#w09) |
| MR28 | 命令和输出各自复制，运行、失败、停止分别显示，原执行命令不因摘要简化而修改。 | **已有核心**。继续沿用 commandPresentation/WorkflowCommandDetail；需要退出码时显式传入，不解析文案推断。[W06](#w06) |
| MR29 | 文件编辑运行/失败属于过程，成功完成可进入 diff 结果；历史失败不抹掉成功重试。 | **已有核心**。补跨取消/部分完成场景和 diff 锚点验收。[W03](#w03)、[W06](#w06) |
| MR30 | 图片活动、完成图、失败/取消、pending 画廊占位分别投影；停止保留完成图片。 | **部分**。图片行、详情和完成卡已接入；补 pending 批次及取消文案，不再安排“接入 imageGeneration”。[W06](#w06)、[W12](#w12) |
| MR31 | 计划正文和 todo 进度分别表示，结束不自动把未完成步骤打勾。 | **部分**。已有 plan 类型和详情；独立进度摘要/最新计划选择按现有任务上下文模型接入。 |
| MR32 | MCP App 持续显示、图片与 pptx 资源协调等按可识别能力启用。 | **按能力扩展**。通用资源/嵌入 App 未完整具备时不造空组件，也不复制 Codex 的全部开关。 |

### 滚动、虚拟化与样式

| 编号 | Marloues 规则 | 当前状态与下一步 |
|---|---|---|
| MR33 | 贴底跟随，读旧内容时保持位置，使用 24 CSS px 容差。 | **已有基础**。当前有距离缓存、意图区分和 ResizeObserver；补迟到高度与折叠叠加的回放，不能把已有滚动全列为未做。[W10](#w10) |
| MR34 | 用户滚动与程序补偿分开；键盘排除输入控件/已处理事件，触摸达到位移阈值后再改变意图。 | **部分**。当前 touchstart 就解除吸底、键盘按键名判断；补输入目标、方向、8 px 位移及必要的意图窗口。 |
| MR35 | 提交位置与返回底部按钮统一考虑 response spacer 和虚拟测量。 | **待补**。保留正向滚动布局；增加明确的列表/hook 协议，无需照搬反向 flex。 |
| MR36 | 分页及恢复绑定 session/cursor，过期异步结果不改变新任务位置，连续分页可重试。 | **待定向验证/完善**。hook 的 finally/RAF 未见会话令牌检查，加载门闩主要随 hasMore 变化；补同会话连续页和切换任务用例。[W10](#w10) |
| MR37 | 完整执行事实不被展示窗口删除；长任务关键项保留。 | **关键保留已实现**。新增工作计时/全量统计需读完整事实，不能把“窗口外保留少数项”等同于完整语义摘要。[W03](#w03) |
| MR38 | 虚拟卸载不丢草稿/手动展开选择，必要嵌入内容按能力保留。 | **部分**。已有稳定 turn key、虚拟化和整段折叠快照；单工具 open 仍是局部状态，overscan 不等于任意离屏保留。[W01](#w01)、[W06](#w06) |
| MR39 | 消息导航的预览不滚动，确认才跳转，离屏目标可定位并尊重减少动画设置。 | **拟新增** `WorkflowMessageNavigation` 与列表导航接口。 |
| MR40 | 主题与布局沿用 Marloues；行为常量集中记录来源和实际采用值。 | **已有本地样式**，保留 28 px 轮次间距与 16 px 内容间距。旧参考版本常量不能只改版本号就宣称完整升级。[W11](#w11) |

## 7. 把“用时不固定”转换为本地可执行决策

在模型层增加 `selectTurnTiming` 一类纯 helper，组件只负责显示。以下为目标判定，不是当前组件已有行为。

| 输入场景 | timing 决策 | 画面 |
|---|---|---|
| 只有用户输入，尚无有效过程 | hidden | 由工作状态槽反馈，不造过程时长。 |
| 首次工作已发生，起点可靠，尚未开始可靠 final | working，before-process | 过程上方显示工作中；达到 1 秒才显示数值。 |
| 可靠 final 已开始，仍在输出正文 | worked，结束时间取 finalAnswerStartedAtMs | 计时冻结，正文继续输出；不再重复普通 thinking。 |
| 已终止、有明确过程结束时间且未取消 | worked，before-answer | 用时在最终答复前；过程收起时由标题消费同一决策。 |
| 终态仅有 turn duration | total，按最终布局放置 | 使用“总用时”，不声称这是最终答复开始前的过程耗时。 |
| 当前客户端停止已对账 | stopped | 对应停止文案；没有来源证据则保持中性。 |
| 只有挂载时间或数据缺失 | hidden 或明确的本次观察时长 | 不把重新打开任务的时刻当真实执行起点。 |

若将来具备 sleep 语义，按该 item 类型关闭普通过程计时及不适用的回退。阶段判定需保留 `phase`、内容是否有效、`settled` 和时间事实，不能只看 `runtime.running`。

单工具与整段过程的展开优先级也应独立：

```text
整段：不允许折叠 → 展开
      强制展开 → 展开
      已有用户选择 → 使用选择
      其余 → 使用阶段默认值

单工具：不可折叠交互卡 → 展开
        强制状态 → 对应状态
        已保存用户选择 → 使用选择
        命令 → 默认收起
        普通工具 → 类型默认值
        明确采用两阶段的工具 → 当前阶段保存值 ?? 该阶段默认值
```

成功重试后的历史失败、成功 continuation 前段允许收起，是 Marloues 已经形成并经过回归的行为，应保留。新增“可靠 final 开始即可折叠”时，不得绕过未解决审批与错误的可读性要求。

## 8. 剩余实施清单与状态归属

### P1：精确状态与计时

修改落点：现有 `turn-presentation-model* / turn-presentation / TurnView / TurnShell`；需要时增加 `turn-timing.ts`、`turn-indicator.ts` 纯 helper。运行时补时间和停止来源，贯穿 store、serializer 与 persistence。

验收：MR07–MR16；可靠 final、无 phase fallback、取消、steer、纯文本和缺历史时间都产生明确结果。**这里的第一步是补决策与事实，不是再次接通展示模型。**

### P2：组件交互一致性

修改落点：`ActivityRow / ToolCallRow / CommandExecutionRow / ImageGenerationRow`，新增公共 disclosure；`UserMessage / TurnFooterView` 补编辑状态、复制反馈和分支 busy。继续复用现有具体详情。

验收：MR17–MR18、MR22–MR31。现有命令独立复制、ToolCallRow 取消保护和正文复制均继续使用，不重写相同能力。

### P3：滚动与长列表协调

修改落点：`use-conversation-scroll / ReadThreadTurnList`；补会话令牌、标题锚点、提交占位、列表导航和按身份保存的交互状态。保留现有 Markdown 增量分块、列表测量边界、隐藏过程惰性挂载及间距修复。

验收：MR19、MR33–MR40。现有滚动真实验收记录可作已有证据，新增高度/分页/虚拟卸载组合另做回放。

### P4：按能力接入特殊产物

仅在 adapter 能提供事实时增加通用资源卡、MCP App、sleep、异步交付、structuredOutput 等路径。相应 capability 由执行层给出，对话区不依工具名猜测。

| 状态 | owner |
|---|---|
| 执行顺序、角色、结果、错误、时间、停止原因 | runtime adapter / store / canonical 契约 |
| 正文选择、过程分组、计时模式和位置、工作指示、折叠资格 | 展示模型与纯 helper |
| 草稿、整段/单工具用户选择、复制反馈、分支进行中 | renderer 对话 UI 状态，按 thread/turn/item 身份存储；按需区分工具阶段 |
| 可见区、锚点、response spacer、导航、过期恢复令牌 | 滚动 hook 与虚拟列表适配器 |
| 编辑、分享、嵌入 App 等是否可用 | 页面注入的能力上下文 |

## 9. 本次验证与后续验收

本次重新运行当前 worktree 的现有测试：

| 测试文件 | 主要覆盖 |
|---|---|
| [conversation-contract.integration.test.tsx](../../tests/unit/conversation-contract.integration.test.tsx) | adapter → store/IPC/恢复 → 实际 TurnView；错误、角色、steer、结果、长窗口。 |
| [binary-event-adapter.test.ts](../../tests/unit/main/core/runtime/binary-event-adapter.test.ts) | native 消息更新与 adapter 语义。 |
| [turn-presentation-model.test.ts](../../tests/unit/renderer/src/components/workflow-chat/turns/turn-presentation-model.test.ts) | 展示模型分区与正文。 |
| [turn-collapse-state.test.ts](../../tests/unit/renderer/src/components/workflow-chat/turns/turn-collapse-state.test.ts) | 默认折叠及已有选择。 |
| [long-turn-performance.test.tsx](../../tests/unit/renderer/src/components/workflow-chat/turns/long-turn-performance.test.tsx) | 历史过程惰性挂载与长任务渲染规模。 |
| [tool-presentation.test.ts](../../tests/unit/renderer/src/components/workflow-chat/activity/tool-presentation.test.ts) | 工具变体、摘要、失败和停止状态。 |

结果为 **6 个文件、44 项通过**。这些是单元/集成及静态渲染检查，本次没有重新运行 Electron UI 交互。既有[真实任务验收](codex-experience-2026-09-05.md)记录了其他测试与现场观察，应与本次结果分开引用。

后续重点验收：

| 场景 | 预期与对应规则 |
|---|---|
| 工具开始→可靠 final 开始→正文流完 | 用时在正确阶段冻结、位置正确，正文连续；MR09–MR12。 |
| 同样序列但内核没有 phase | 明确走 fallback，不伪造 final 时间；MR03、MR11。 |
| 旧历史没有起点，重新打开 | 不显示从组件挂载开始计算的历史“用时”；MR09、MR12。 |
| cancelled 有正文；steer 中断后继续 | 默认折叠和停止文案符合明确规则；MR13–MR16。 |
| 命令、普通 MCP、不可折叠交互卡分别开始→手动选择→完成 | 各类型遵守自己的策略，用户选择不会被无关快照覆盖；MR17。 |
| 已收起详情按 Tab；展开内容继续增长 | 隐藏控件不可进入，标题锚点稳定；MR18–MR19。 |
| 输入控件按方向键；轻触但没有拖动 | 不错误解除吸底；MR34。 |
| 旧历史阅读期间加载图片或展开 diff | 阅读位置稳定；MR19、MR33。 |
| 第一页返回后 hasMore 仍为 true，再加载一页 | 门闩释放并能继续加载；MR36。 |
| 分页未返回就切换任务 | 旧 finally/RAF 不改变新任务位置；MR36。 |
| 工具/草稿离开虚拟可见区，再返回 | 用户选择和草稿保留；MR23、MR38。 |
| 原消息编辑失败、连续点击复制或分支 | 草稿保留，反馈与 busy 防止重复请求；MR23–MR27。 |
| 图片 running→cancelled，或 steer 后继续生成 | 不误报完成，pending 与完成图分别处理；MR30。 |
| 早期计时依据在 256 条窗口之外 | 时长依据与全量统计不因窗口改变；MR37。 |
| 消息导航悬停预览，再确认跳转 | 预览不动阅读位置，离屏消息可定位；MR39。 |

<a id="sources"></a>

## 10. 当前 worktree 源码索引

为避免 HEAD 相同却读取不同工作区，附[源码指纹](marloues-conversation-area-evidence.json)，记录本次相关源码与测试文件的路径和 SHA-256。它证明所核对的文件版本，不代表所有 UI 行为通过。

<a id="w01"></a>

**W01 · 实际入口与计时**：[WorkflowChatPage.tsx](../../client/renderer/src/pages/WorkflowChatPage.tsx)、[ReadThreadTurnList.tsx](../../client/renderer/src/components/workflow-chat/turns/ReadThreadTurnList.tsx)、[TurnView.tsx](../../client/renderer/src/components/workflow-chat/turns/TurnView.tsx)、[turn-status.ts](../../client/renderer/src/components/workflow-chat/turns/turn-status.ts)。

<a id="w02"></a>

**W02 · 分区与折叠后的挂载**：[AssistantTurn.tsx](../../client/renderer/src/components/workflow-chat/turns/AssistantTurn.tsx)、[TurnShell.tsx](../../client/renderer/src/components/workflow-chat/turns/TurnShell.tsx)、[TurnPresentationBlocks.tsx](../../client/renderer/src/components/workflow-chat/turns/TurnPresentationBlocks.tsx)、[TurnFlowSection.tsx](../../client/renderer/src/components/workflow-chat/turns/TurnFlowSection.tsx)、[AgentFlowSection.tsx](../../client/renderer/src/components/workflow-chat/activity/AgentFlowSection.tsx)。

<a id="w03"></a>

**W03 · 显示规则**：[turn-presentation-model.ts](../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model.ts)、[模型类型](../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model-types.ts)、[窗口与辅助判定](../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model-helpers.ts)、[turn-layout.ts](../../client/renderer/src/components/workflow-chat/turns/turn-layout/turn-layout.ts)、[flow-helpers.ts](../../client/renderer/src/components/workflow-chat/turns/turn-layout/flow-helpers.ts)、[turn-presentation.ts](../../client/renderer/src/components/workflow-chat/turns/turn-presentation.ts)、[ThinkingPlaceholder.tsx](../../client/renderer/src/components/workflow-chat/turns/ThinkingPlaceholder.tsx)。

<a id="w04"></a>

**W04 · 运行时和持久化**：[binary-event-adapter.ts](../../client/main/core/runtime/binary-event-adapter.ts)、[codex-item-adapter.ts](../../client/main/core/runtime/codex-item-adapter.ts)、[workflow-thread-store.ts](../../client/main/core/runtime/workflow-thread-store.ts)、[workflow-turn-persistence.ts](../../client/main/core/runtime/workflow-turn-persistence.ts)、[read-thread-serializer.ts](../../client/main/core/runtime/read-thread-serializer.ts)。

<a id="w05"></a>

**W05 · 对话数据契约**：[workflow-read-thread-contract.ts](../../client/shared/workflow-read-thread-contract.ts)、[workflow-messages-to-read-thread.ts](../../client/shared/adapters/workflow-messages-to-read-thread.ts)、[workflow-item-event.ts](../../client/shared/adapters/workflow-item-event.ts)。

<a id="w06"></a>

**W06 · 工具与活动组件**：[ActivityRenderer.tsx](../../client/renderer/src/components/workflow-chat/activity/ActivityRenderer.tsx)、[TurnItemRenderer.tsx](../../client/renderer/src/components/workflow-chat/activity/TurnItemRenderer.tsx)、[ActivityGroup.tsx](../../client/renderer/src/components/workflow-chat/activity/ActivityGroup.tsx)、[ActivityRow.tsx](../../client/renderer/src/components/workflow-chat/activity/ActivityRow.tsx)、[ToolCallRow.tsx](../../client/renderer/src/components/workflow-chat/activity/ToolCallRow.tsx)、[CommandExecutionRow.tsx](../../client/renderer/src/components/workflow-chat/activity/CommandExecutionRow.tsx)、[CommandDetailCard.tsx](../../client/renderer/src/components/workflow-chat/activity/CommandDetailCard.tsx)、[command-presentation.ts](../../client/renderer/src/components/workflow-chat/activity/command-presentation.ts)、[ImageGenerationRow.tsx](../../client/renderer/src/components/workflow-chat/activity/ImageGenerationRow.tsx)、[codex-activity-contract.ts](../../client/renderer/src/components/workflow-chat/activity/codex-activity-contract.ts)。

<a id="w07"></a>

**W07 · 用户折叠选择**：[turn-collapse-rules.ts](../../client/renderer/src/components/workflow-chat/turns/turn-collapse-rules.ts)、[turn-collapse-state.ts](../../client/renderer/src/components/workflow-chat/turns/turn-collapse-state.ts)、[use-collapse-state.ts](../../client/renderer/src/components/workflow-chat/turns/use-collapse-state.ts)。

<a id="w08"></a>

**W08 · 用户消息与编辑入口**：[UserMessage.tsx](../../client/renderer/src/components/workflow-chat/turns/UserMessage.tsx)、[user-message-contract.ts](../../client/renderer/src/components/workflow-chat/turns/user-message-contract.ts)、[WorkflowChatPage.tsx](../../client/renderer/src/pages/WorkflowChatPage.tsx) 的 onEditUserMessage。

<a id="w09"></a>

**W09 · 助手操作与正文**：[TurnFooterView.tsx](../../client/renderer/src/components/workflow-chat/turns/TurnFooterView.tsx)、[AssistantAnswer.tsx](../../client/renderer/src/components/workflow-chat/turns/AssistantAnswer.tsx)、[MarkdownContent.tsx](../../client/renderer/src/components/workflow-chat/content/MarkdownContent.tsx)。

<a id="w10"></a>

**W10 · 滚动**：[use-conversation-scroll.ts](../../client/renderer/src/components/workflow-chat/composer/use-conversation-scroll.ts)。这里核对的是正式页面调用的 hook，不是另一个旧 use-scroll-anchor 实现。

<a id="w11"></a>

**W11 · 布局与常量**：[workflow-message-turn.css](../../client/renderer/src/styles/components/workflow-message-turn.css)、[workflow-activity.css](../../client/renderer/src/styles/components/workflow-activity.css)、[conversation-page-contract.ts](../../client/shared/conversation-page-contract.ts)。

<a id="w12"></a>

**W12 · 产物**：[ResultCards.tsx](../../client/renderer/src/components/workflow-chat/activity/ResultCards.tsx)、[ToolDetail.tsx](../../client/renderer/src/components/workflow-chat/activity/ToolCallRowDetails/ToolDetail.tsx)。

主干原始参考可在[Codex 组件证据](/Users/xuzong/workspace/marloues/docs/architecture/codex-desktop-task-flow/components/evidence.md)和[显示规则证据](/Users/xuzong/workspace/marloues/docs/architecture/codex-desktop-task-flow/evidence.md)复核。正文与工具内部现已单独补充 [112 个函数证据](conversation-area/evidence.md)和[组件参数表](conversation-area/components.md)。本次恢复的是职责和显示条件；不声称复制了第三方解析器、编辑器或动态 App 的完整内部实现。
