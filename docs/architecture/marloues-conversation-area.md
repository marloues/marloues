# Marloues 对话区适配规格

> **基线更正（2026-09-05）**：本文原先只核对了主 checkout 的 `main`，遗漏了专用 worktree `/Users/xuzong/workspace/marloues-architecture-review-20260905`，分支 `codex/architecture-review-20260905`。两者 HEAD 同为 `edebdae`，但 worktree 含有未提交的实现改动，代码并不相同。下方原“现状、差距、实施顺序”仅描述 main，不能直接作为专用 worktree 的剩余工作清单。
>
> 已重新核对的更正：worktree 的 [WorkflowTurnView](/Users/xuzong/workspace/marloues-architecture-review-20260905/client/renderer/src/components/workflow-chat/turns/TurnView.tsx) 已调用 `buildTurnPresentationModel` 和 `WorkflowAssistantTurn`，并已传递纯文本与计时禁用策略；[展示模型](/Users/xuzong/workspace/marloues-architecture-review-20260905/client/renderer/src/components/workflow-chat/turns/turn-presentation-model.ts) 已包含独立错误 block 和过程折叠资格；[数据适配器](/Users/xuzong/workspace/marloues-architecture-review-20260905/client/shared/adapters/workflow-messages-to-read-thread.ts) 已透传 `turn.error`。这些内容不应再标为未接入或缺失。
>
> 专用 worktree 的[实现记录](/Users/xuzong/workspace/marloues-architecture-review-20260905/docs/architecture/conversation-implementation-2026-09-05.md) 已记录该轮工作。本文 40 条目标规则仍可作为对照目录，但完整的剩余差距需要以该 worktree 的实际改动重新核对；本次更正没有重跑其测试，也没有修改其产品代码。

状态：**设计规格，尚未修改产品代码**。核对日期：2026-09-05；Marloues 基线：`edebdae`，`client/package.json` 版本 `0.3.4`。行为参考为 Codex 安装包 `26.901.41600` 的[对话区分析](codex-desktop-task-flow/components/conversation-area.md)。

本规格把参考行为转换为 Marloues 的组件职责、参数、数据需求和验收条件。只涉及对话内容区及其滚动，问题/审批表单、输入框和侧栏仅作为外部状态与动作来源。

## 1. 适配结论与当前关键差距

Marloues 已有可复用的轮次列表、消息组件、Markdown、工具详情、结果卡、展示模型和折叠状态。应在这些模块上接通统一的展示链路，再补规则。

当前最重要的四个事实：

1. **实际页面使用 `WorkflowTurnView → MessageItemView`。** 已有 `buildTurnPresentationModel → WorkflowAssistantTurn → TurnPresentationBlocks` 没有接入这条页面主路径。组件文件和单元测试存在，不代表正式对话区已采用它们。[M01](#m01)、[M02](#m02)、[M04](#m04)
2. **当前整轮折叠只保留最后一条非空助手文本。** 展开时按 items 顺序渲染；折叠时另用一个 Markdown 节点显示 summary。计时、最终答复选择、产物和持续交互内容尚未统一编排。[M02](#m02)
3. **准确的“过程用时”缺少数据。** 对外契约有轮次开始/结束时间和 duration，但没有稳定的首次工作、最终答复开始时间；store 的 `updateItemTime` 当前为空实现。部分文本路径把 `phase` 写为 `updated/finalized`，其含义与 `commentary/final_answer` 不同。[M09](#m09)、[M10](#m10)
4. **已有不少细节可以直接保留。** 例如稳定 turn key、可见轮次才转换数据、用户附件分类、Markdown 增量分块，以及助手操作栏的 hover/focus-within 显示。[M01](#m01)、[M06](#m06)、[M07](#m07)、[M15](#m15)

本文使用以下状态：**沿用**＝相关实现已在当前路径使用；**待接入**＝有实现但当前对话主路径未使用；**调整**＝现有行为需要改变；**补数据**＝需要运行时/契约提供事实；**新增**＝未在本次检查的对话区找到对应接口。它们都是静态代码核对结论，不是 UI 测试结果。

## 2. 当前组件树与目标组件树

### 当前正式页面路径

```text
WorkflowChatPage
├─ useConversationScroll
└─ .messages-scroll → .messages-inner
   └─ WorkflowReadThreadTurnList（页面使用 ReadThreadTurnList 别名）
      ├─ useWorkflowCollapseState
      └─ Virtuoso（传入 scrollParentRef 时）
         └─ WorkflowTurnView
            ├─ WorkflowUserMessage
            ├─ AssistantTurnHeader
            ├─ expanded：MessageItemView × N
            │  ├─ agentMessage → WorkflowMarkdownContent
            │  ├─ reasoning → MessageThinkRow
            │  ├─ MCP / dynamic / search → MessageToolRow → ToolDetail
            │  └─ command / fileChange → MessageToolRow → MessageIoCard
            ├─ collapsed：最后一条助手文本 → WorkflowMarkdownContent
            ├─ 流式末轮且展开：MessageStatusRow
            └─ WorkflowTurnFooterView
```

`WorkflowTurnList` 也调用 `WorkflowTurnView`；`WorkflowThreadView` 和子任务界面经 `WorkflowReadThreadTurnList` 复用它。接线应保持这些入口一致。[M01](#m01)、[M02](#m02)、[M16](#m16)

### 目标组合（实现方案）

```text
WorkflowChatPage（提供会话、请求、动作与能力上下文）
├─ useConversationScroll（扩展定位和锚点接口）
└─ WorkflowReadThreadTurnList（保留 Virtuoso）
   └─ WorkflowTurnView（负责单轮适配）
      ├─ buildTurnPresentationModel（统一判定，改为保留 canonical 信息）
      ├─ WorkflowUserMessage（起始消息）
      └─ WorkflowAssistantTurn（现有，待接入）
         ├─ WorkflowTurnShell（调整为消费明确的显示决策）
         ├─ TurnPresentationBlocks（扩展分区）
         │  ├─ process → WorkflowTurnFlowSection
         │  │  └─ WorkflowActivityRenderer → 组 / 单工具 / 具体详情
         │  ├─ persistent → 追加用户消息 / 需要持续交互的卡片
         │  ├─ document → WorkflowAssistantAnswer → WorkflowMarkdownContent
         │  ├─ results → WorkflowResultCards
         │  └─ status / timing → 状态与计时呈现
         └─ WorkflowTurnFooterView

配套：WorkflowMessageNavigation（拟新增，负责预览与跳转）
配套：对话区交互状态（草稿、整段折叠、单工具展开、动作执行中）
```

目标树是设计，不是当前代码树。`persistent/status/timing` 属于拟扩展的 block 类型；导航和独立工具展开容器也尚未新增。

主路径最终只保留一套最终答复选择和状态判定。旧消息入口在适配边界转换数据，进入相同的模型和组件；不能让新旧两种 JSX 路径各自决定“什么是最终答复”。

## 3. Codex 职责如何映射到 Marloues

| 参考职责 | Marloues 落点 | 当前状态 | 适配决定 |
|---|---|---|---|
| 滚动容器 `Fe` | `WorkflowChatPage` 滚动 DOM + `useConversationScroll` | 沿用、调整 | 保留 24 px 基础阈值；补锚点、提交占位及异步恢复防串会话。 |
| 时间线 `GO / UE` | `WorkflowReadThreadTurnList` + 滚动 hook | 部分沿用 | 列表负责稳定条目和几何信息，hook 负责阅读位置；拟增加新回复放置接口。 |
| 虚拟列表 `Ie` | `Virtuoso` | 沿用、扩展 | 保留现有虚拟化；按需增加恢复/保留交互项的适配，不能把普通 overscan 当成保留能力。 |
| 单轮适配 `Ji` | `WorkflowTurnView` + `buildTurnPresentationModel` | 待接入 | 将主路径的散落判定移入模型；保留原始身份、错误和顺序。 |
| 单轮主体 `_i` | `WorkflowAssistantTurn / WorkflowTurnShell / TurnPresentationBlocks` | 待接入、调整 | 编排过程、最终正文、状态、产物和持续条目。 |
| 类型分发 `YT` | 现有 `MessageItemView`，目标复用 `WorkflowActivityRenderer / WorkflowTurnItemRenderer` | 调整 | 统一类型覆盖；Markdown 和详情组件继续复用，避免重复两套工具规则。 |
| 用户消息 `Eg` | `WorkflowUserMessage` | 沿用、调整 | 保留附件、预览、折叠和复制；扩展稳定身份及编辑草稿协议。 |
| 助手包装 `pE` | store 的 read-thread 订阅、不可变 item 更新及 memo | 部分沿用 | 使用 Marloues 的订阅机制；无需照搬 Codex 的历史实体订阅器。 |
| 助手操作栏 `zy` | `WorkflowTurnFooterView` | 沿用、调整 | 增加操作可用性、分支 busy、可选 HTML 复制及独立时间戳条件。 |
| 过程容器与标题 `tD / YE` | `TurnPresentationBlocks / WorkflowTurnFlowSection / AssistantTurnHeader` | 待接入、调整 | 标题消费模型决定的计时与折叠权限；不再在顶部固定输出所有状态。 |
| 单工具展开 `S` | `MessageToolRow`、`WorkflowActivityRow` 的展开行为 | 调整 | 拟抽取 `WorkflowToolDisclosure` 统一运行/完成两份展开状态；保留现有行外观。 |
| 命令详情 `A / De / Oe` | `WorkflowCommandDetail` + `command-presentation` | 主命令路径待接入 | 替代当前简化 IN/OUT 命令卡，保留独立复制和退出结果。 |
| diff `eT / rT` | `WorkflowResultCards` 内差异呈现及现有 review 入口 | 主路径待接入 | 运行中的编辑属于过程；完成 diff 属于结果；展开需保持锚点。 |
| 计划正文与进度 | `ToolDetail / PlanDetail`、现有 plan 类型 | 部分已有 | 保留详情能力，补独立计划 block；todo 进度与计划正文分别投影。 |
| 图片 `UGn`、产物 `OW` | `WorkflowResultCards / WorkflowImageLightbox` | 待接入、补数据 | 复用已完成图片/文件展示，补 pending、失败和资源身份模型。 |
| 工作状态 `Li / Ii` | `MessageStatusRow`、`WorkflowThinkingPlaceholder` | 调整 | 统一到一种状态选择结果；明确 hidden 与保留占位的区别。 |
| 消息导航 `Nt` | 拟新增 `WorkflowMessageNavigation` | 新增 | 使用 turn/item 身份导航，预览不滚动，确认跳转才改变位置。 |

代码定位集中列在[第 10 节](#sources)。原始职责与行为的版本证据见[Codex 对话区规格](codex-desktop-task-flow/components/conversation-area.md)。

## 4. 组件参数：现有契约与拟扩展项

下表“现有输入”为真实 props/函数参数；“拟扩展”均为设计，不表示当前代码接受这些参数。

| 组件或函数 | 现有关键输入 | 拟扩展或调整 |
|---|---|---|
| `WorkflowReadThreadTurnList` | `readThread, isStreaming, stateScopeKey, modelName, disableResponseTimer, plainTextAnswers, showFooterMetadata, scrollParentRef`；`onCopyMessage, onEditUserMessage, onFork, onDeleteMessage, renderBeforeTurn` | 接收 `presentationContext`；提供按稳定 key 获取位置/跳转的接口；将 canonical turn 交给适配层。 |
| `WorkflowTurnView` | `message, sessionId, expanded, isLastStreaming, disableResponseTimer, modelName, plainTextAnswers, showFooterMetadata` 及编辑/复制/分支/折叠回调 | 主入口改为保留 `WorkflowTurn` 事实数据；旧 `message` 仅在入口适配。让 `disableResponseTimer / plainTextAnswers` 等策略真正进入模型或正文组件。 |
| `buildTurnPresentationModel` | `message`；选项 `isLastStreaming, modelName, liveItemWindow` | 输入规范化的 canonical turn 与展示上下文；增加 `timing, indicator, collapse, actionPolicy`；分区前不能先裁掉事实数据。 |
| `WorkflowAssistantTurn` | `model, duration, expanded, sessionId, plainTextAnswers, showFooterMetadata`；`onToggle, onCopy, onFork, onDelete` | 逐步把外部 `duration` 合入 `model.timing`；`expanded` 只控制过程区；正文、错误、持续条目不随之消失。 |
| `TurnPresentationBlocks` | `model, expanded, plainTextAnswers, sessionId` | 现有三种 block 为 `process/document/results`；扩展 `persistent/status/timing` 或等价显式槽位，保持唯一排序来源。 |
| `WorkflowUserMessage` | `text, content, createdAt, onCopy, onEdit` | 增加 `threadId/turnId/itemId`、`editState`、`canEdit`；提交回调携带身份与完整内容，返回 Promise，成功后才清草稿。 |
| `WorkflowTurnFooterView` | `finalText, isRunning, messageId, createdAt, showFooterMetadata`；`onCopy, onFork, onDelete` | 增加 `canCopy, canFork, isForking, alwaysShowActions, getCopyHtml` 等明确策略；复制数据来自最终文档模型。 |
| `WorkflowActivityRenderer` | `kind: activityItem` 时接 `item`；`activityGroup` 时接 `group, expanded, defaultDetailExpanded, active, thinking` | 采用同一失败/运行状态归一化；组状态与单工具状态分离；动作能力由上下文提供。 |
| `WorkflowActivityRow` | `activityKind, icon, label, meta, detail, hasDetail, open, onToggle, iconTone` | 继续负责行展示；两阶段展开、动画测量和焦点隔离交给拟新增的公共 disclosure。 |
| `ToolDetail` | `item, failed, cancellable, isCancelling, onCancel` | 从真实动作状态传 `isCancelling`，不用固定 false；取消请求交上层并按 item 身份对账。 |
| `WorkflowCommandDetail` | `presentation: CommandPresentation` | 保留契约；由工具类型路由接入当前对话主路径。 |
| `WorkflowResultCards` | 声明 `items, sessionId, showFileChanges, userMessageId`；当前函数仅解构使用 `items/showFileChanges` | 让来源身份实际参与打开动作；扩展 pending 图片与通用资源展示模型，不能仅添加未使用 props。 |
| `WorkflowThinkingPlaceholder` | `label, visible` | 增加图标/语义状态和 `reserveSpace`；不可见时正确处理辅助技术可见性。 |
| `useConversationScroll` | `contentSignal, sessionKey, nearBottomThreshold, topLoadThreshold, hasMore, onLoadMore, loadingMore` | 增加 `captureAnchor/restoreAnchor`、提交占位、带 session/cursor 的恢复令牌；协调虚拟列表测量。 |

`WorkflowTurnView` 当前声明了 `disableResponseTimer` 和 `plainTextAnswers`，但函数体没有按它们选择计时或纯文本正文；这些参数在目标接线中必须产生可验证效果。[M02](#m02)

### 拟新增的两个组件边界

`WorkflowToolDisclosure` 接收 `itemKey, running, defaultExpanded, hasContent, onExpand, children`，从按 itemKey 保存的 UI 状态读取 `runningExpanded/settledExpanded`。它只负责显示、焦点和展开通知，不发工具调用。

`WorkflowMessageNavigation` 接收 `items: { turnId, itemId, preview }[]`、`activeKey`、`onPreview`、`onNavigate` 和 `reducedMotion`。导航通过列表接口执行；不能直接查找一个可能已经被虚拟化卸载的 DOM 节点。

## 5. 数据适配：哪些事实必须保留

推荐数据链路：运行时事件 → 主进程 store/adapter → read-thread 契约 → renderer store → 展示模型 → 组件。运行时之间的差异在 adapter 处消化，组件只消费中性契约。

| 数据 | 当前情况 | Marloues 目标与缺失回退 |
|---|---|---|
| `turn.id / item.id / thread.id` | 已有；列表 key 用 turn ID | 沿用。UI 状态按 thread + turn + item 组合定位；主运行轮次与 steer 展示片段需要明确关联。 |
| `zone / TurnPlacement` | shared 契约已有，支持工作区、IM、定时任务 | 保持 canonical 数据归属；对话组件不为渠道复制一套 items。 |
| `settled` 与执行状态 | 已有统一约定 | `settled` 只表示条目是否还可能更新；不能解释为成功或最终答复。失败、中断、结束三个语义分别保留。 |
| 最终答复语义 | `phase` 可缺失；store 的部分路径使用 `updated/finalized` | 拟增加独立 `semanticRole: commentary / final_answer / unspecified`，或统一现有 phase 语义；生命周期继续由 settled 表达。只根据可靠事件映射。 |
| 最终答复识别范围 | 缺少统一的 async delivery 和 structuredOutput 字段 | 能力支持时扩展；不支持时不模拟异步条目/结构化输出识别分支。 |
| 过程计时事实 | 只有轮次 `startedAt/completedAt/durationMs`；没有稳定 item 时间 | 拟增加首次有效工作和最终答复开始时间，携带时间来源。缺失时终态可显示明确的“总用时”，运行中不伪造冻结点。 |
| 停止来源 | 对话契约缺少本客户端停止标识 | 拟记录停止请求关联与原因；只有当前客户端确实发起并匹配到该轮时显示“你停止了”。其余使用“已停止”等中性文案。 |
| `turn.error` | canonical 有，但 `WorkflowMessageBlock` 未透传此字段 | 在模型入口保留错误；即使没有 agentMessage，也能生成错误 block。 |
| 同轮追加用户消息 | adapter 将 user items 汇总到顶部；store 的 steer 路径另拆展示片段 | 沿用已有 `continuationFragment/continuesPreviousTurn` 规则，并保留原始消息身份和顺序；遇到同一 canonical turn 内多条 user 时不得丢失插入位置。 |
| 待回答、审批、工具专属状态 | 页面/运行时另有相关状态；当前轮次 props 没有统一上下文 | 通过 `presentationContext` 提供带 ownerTurnId 的请求摘要与展示状态；表单仍由现有交互区处理。 |
| 图片与文件资源 | 有 `imageGeneration.status/result/savedPath`、fileChange 等 | 先适配现有产物；pending reset、通用资源、MCP App 持续显示依赖补充元数据。字段缺失时使用保守呈现。 |
| sleep、自动化引用、MCP App 能力 | 本次对话契约中未见完整对应能力 | 能力可用再启用相关规则；普通工具名含 wait 不能直接解释为 Codex 的 sleep item。 |

对旧历史和无语义 phase 的内核，拟采用明确回退：执行中显示流式正文及其实际工作状态，**不凭“出现助手文本”提前触发最终答复折叠**；终态才根据末尾有效助手文本序列选择最终文档。模型记录选择依据为 `semantic` 或 `terminal-fallback`，这项诊断留在开发层。

扩展 shared 契约时需同时经过 store、serializer、renderer adapter 和历史恢复；只往 React props 添加字段无法让重开任务后的结果一致。若字段变为必填或改变已有字段含义，需要设计 schema 兼容/升级；本规格不直接变更当前 v2。[M09](#m09)、[M10](#m10)

### 展示模型的拟扩展结构

以下为接口草案，未写入 shared 或 renderer 类型。`TurnPresentationModel` 现有 `prompt/runtime/chrome/process/blocks/metadata` 继续保留，新增决策集中在模型层。

```ts
type TurnTimingDecision = {
  mode: "hidden" | "working" | "worked" | "stopped" | "total";
  startAtMs: number | null;
  endAtMs: number | null;
  durationMs: number | null;
  placement: "none" | "before-process" | "before-answer" | "process-header";
  basis: "runtime" | "client-observed" | "turn-total" | "unavailable";
};

type TurnIndicatorDecision = {
  kind: "none" | "thinking" | "exploring" | "planning"
    | "waiting-user" | "waiting-permission" | "sleeping";
  visible: boolean;
  reserveSpace: boolean;
  label?: string;
};

type TurnCollapseDecision = {
  allowed: boolean;
  collapsed: boolean;
  reason: "no-process" | "answer-not-started" | "cancelled"
    | "forced-open" | "user-choice" | "default";
};
```

纯展示模型只计算事实与默认选择；点击、编辑草稿、复制反馈、工具展开选择由独立 UI 状态拥有。计时的每秒更新应局限在计时组件，不让整条历史每秒重新投影。

## 6. Marloues 显示与交互规则

本节是目标行为。每条均给出现状或依赖，不能把“目标”列读成已经实现。

### 内容编排与状态

| 编号 | Marloues 目标规则 | 当前差距与落点 |
|---|---|---|
| MR01 | 同一轮的正文、过程、错误和产物由一次模型投影决定；每个 item 在明确的区域消费。 | 主路径逐项渲染，模型路径未接入；改 `WorkflowTurnView`。[M02](#m02)、[M04](#m04) |
| MR02 | `failed`、`error`、`cancelled` 与正常完成分别归一化；终态不自动意味着成功。 | 主 `itemFailed` 对部分工具只认 `error`，会漏掉 `failed`；统一 helper，再让所有行消费它。[M03](#m03) |
| MR03 | 最终答复按语义选择，缺语义时只在终态执行回退；正文从过程区去重移出。 | 当前收起取最后一条文本；已有 flow helper 支持部分 phase，但不在主路径；接入并补限定条件。[M04](#m04) |
| MR04 | 保留流式 Markdown 的实例连续性；空占位到非空、完成、折叠过程均不能丢失正文。 | 当前展开与 summary 是两套正文节点；目标用独立 document 区域。跨父节点移动不能只靠相同 key 假定不会 remount。[M02](#m02)、[M15](#m15) |
| MR05 | 追加用户输入保留时间顺序；折叠过程时仍可看见需要保留的用户反馈。 | 已有 steer 片段基础；补原始同轮多 user 的投影，不能在 adapter 一律汇总到顶部。[M09](#m09)、[M10](#m10) |
| MR06 | 空最终正文也能显示 canonical 错误；未支持的 item 有可识别的回退条目。 | adapter 未带 turn.error，`MessageItemView` 未识别类型返回 null；在模型/路由补覆盖。[M03](#m03)、[M09](#m09) |
| MR07 | 具体工具、等待回答、等待授权、最终答复与通用 thinking 避免重复；等待槽位有明确优先级。 | 目前末轮展开就显示 `MessageStatusRow`；用 `indicator` 替换这个条件，补 ownerTurnId 请求上下文。[M02](#m02) |
| MR08 | visible=false 与不占空间分别表达；隐藏占位不向辅助技术重复播报。 | 可复用 `WorkflowThinkingPlaceholder` 的 invisible 外观，补 reserveSpace 与语义属性。[M05](#m05) |

状态优先级：先处理本客户端停止、明确 sleep 和专属等待等外层状态；普通工作选择依次判断等待用户强制槽位、是否仍运行、探索、计划、具体阻塞/最终答复/工具自有摘要、未完成助手消息、其余工具活动、thinking 回退。只能启用 Marloues 能可靠识别的分支。参考：[E26](codex-desktop-task-flow/evidence.md#e26)、[E27](codex-desktop-task-flow/evidence.md#e27)。

### 计时与折叠

| 编号 | Marloues 目标规则 | 当前差距与落点 |
|---|---|---|
| MR09 | 普通过程计时要求有有效工作与可靠起点；纯用户消息不产生过程用时。 | 当前 status row 从 turn start 直接计时；新增有效过程判定与 timing 数据。[M02](#m02)、[M03](#m03) |
| MR10 | 执行中的用时放在过程前；终态可放到最终答复前；过程收起时标题消费同一计时决策。 | 当前时长在固定 header，流式经过时间在底部 status row；调整 block/槽位编排。 |
| MR11 | 已识别最终答复开始时，可以冻结过程计时；缺时间则采用明确回退。 | 需要 `finalAnswerStartedAtMs` 等事实，不使用任意 agent chunk 或 `finalized` 推测。[M10](#m10) |
| MR12 | 计时差值不小于零，每秒更新；不足 1 秒显示工作文案；禁用计时策略必须生效。 | 当前中文时长至少显示 1 秒，`disableResponseTimer` 未被主单轮消费；调整计时组件。[M02](#m02)、[M03](#m03) |
| MR13 | “你停止了”只用于可归因于当前客户端的停止；steer 中断不冒充用户终止任务。 | 补停止来源；保留 store 现有 steer 路由的区别。[M10](#m10) |
| MR14 | 已有最终答复、非取消、存在可折叠过程时才允许自动收起；否则过程保持可读。 | 当前以整轮是否结束为主，运行中恒展开，cancelled 可因 activity=done 被归入默认收起；扩展折叠输入。[M08](#m08) |
| MR15 | 强制展开优先，其次用户选择，再次默认策略；终态不覆盖已作出的有效选择。 | 当前 reducer 部分保留显式选择，但 hook 的运行/首次完成分支另有优先级；需一起调整。[M08](#m08) |
| MR16 | 整段收起只影响 process；document、错误、persistent 和必要产物不被隐藏。 | 当前收起只剩 summary，需接入分区模型。[M02](#m02)、[M04](#m04) |
| MR17 | 单工具运行时默认展开，运行期手动选择与完成期选择分别保存。 | `DisclosureRowView` 只有一个默认 false 的 open；拟抽取公共 disclosure。[M03](#m03)、[M11](#m11) |
| MR18 | 单工具仅在关闭→打开时发 onExpand；关闭的保留 DOM 同时隔离点击、焦点和辅助技术访问。 | 当前主路径条件卸载内容；如改为测高动画，必须同时加 inert/aria-hidden 等行为。 |
| MR19 | 折叠和 diff 展开时保持所点标题的视口位置，补偿窗口以 250 ms 为参考。 | 当前 hook 主要处理吸底和分页高度补偿，未见这类标题锚点接口；拟新增接口。[M14](#m14) |

过程标题的计时来源优先级为显式过程计时、可用的时长回退、步骤/历史数量。`total` 回退明确使用总用时文案，与能够准确冻结的过程用时区分。折叠选择、单工具选择只要求在当前会话 UI 生命周期和虚拟卸载之间保持；跨应用重启保存不属于本次默认目标。

参考：[E31–E35](codex-desktop-task-flow/evidence.md#e31)、[C13](codex-desktop-task-flow/components/evidence.md#c13)、[C14](codex-desktop-task-flow/components/evidence.md#c14)、[C34](codex-desktop-task-flow/components/evidence.md#c34)。

### 活动分组、消息操作与产物

| 编号 | Marloues 目标规则 | 当前差距与落点 |
|---|---|---|
| MR20 | 连续活动按类型分组，standalone 截断；最新活跃组才显示进行中，文件统计按路径去重。 | 现有 activity contract、flow 和 summary helpers 可复用；需接入主路径，并核对分组边界。[M04](#m04)、[M11](#m11) |
| MR21 | “同一组展示”与“把多次 MCP 调用合并成一条摘要”分别判定；失败、资源、交互和评审信息不得因合并丢失。 | 现有分组规则较宽；精细合并缺元数据时保留独立调用，不以同名即合并。 |
| MR22 | 用户消息保留图片、文件、引用、评论等类别，空文本不删除有内容的消息。 | 沿用 `workflowUserMessagePresentation`；补空/特殊消息边界验收。[M06](#m06) |
| MR23 | 编辑按消息身份保存草稿，失败保留，成功再关闭；是否能编辑受能力和消息来源限制。 | 当前编辑只是把文本填回 composer 并聚焦，不是原消息编辑事务；拟扩展回调和 UI 状态。[M01](#m01)、[M06](#m06) |
| MR24 | 用户复制成功反馈 1500 ms；反馈期间不重复执行相同复制，失败不显示成功。 | 当前反馈 1200 ms、未阻止重复点击；作为明确的参考行为调整。[M06](#m06) |
| MR25 | 助手操作栏保留 hover/focus-within；无动作且无时间戳需求时不占一条空栏。 | hover/focus 已有；当前非空正文会生成外壳，需补动作可见性模型。[M07](#m07) |
| MR26 | 复制内容来自最终文档，不混入工具过程；有 HTML 能力才同时提供 HTML。 | 主 `finalText` 当前拼接所有 agentMessage；改用模型 document；默认继续支持纯文本。 |
| MR27 | 分支操作执行中禁用并展示 busy，避免重复发起；动作点击不触发行级行为。 | 当前 footer 直接调用异步 onFork，无 busy 状态；在动作 owner 保存状态。[M07](#m07) |
| MR28 | 命令与输出独立复制；退出码、失败和中断与输出正文分别显示。 | 复用 `WorkflowCommandDetail`；当前 command 主路径使用无独立复制的 MessageIoCard。[M03](#m03)、[M12](#m12) |
| MR29 | 文件变更运行摘要与完成结果分开；只在适当终态提供完成 diff。 | 模型/结果卡已有一部分，主路径待接入；取消和部分失败结果需明确选择。[M04](#m04)、[M13](#m13) |
| MR30 | 已完成图片、pending 占位、失败状态分别处理；停止可清占位但不删除已完成图片。 | 当前有已完成图片能力，主 item 路由不直接覆盖 imageGeneration；补结果接线和 pending 投影。[M03](#m03)、[M13](#m13) |
| MR31 | 计划正文与 todo 进度分开；轮次结束不把未完成步骤自动打勾。 | 复用 ToolDetail 的 PlanDetail；补顶层 plan block 与进度摘要，不替换任务上下文区的数据源。[M12](#m12) |
| MR32 | 根据资源元数据决定图片画廊、文件卡和 MCP App 的呈现；持续交互卡不随过程收起。 | `pptx` 画廊抑制、MCP App 自动展开等仅在有对应能力/元数据时启用，不先造空卡。 |

MR23 的产品默认方案是“具有原消息编辑能力时提供带身份的编辑提交”。暂不支持的入口保留为明确的“再次使用这段输入”，不能把回填 composer 宣称为已经修改原消息。附件和评论须随原消息内容一起处理。

参考：[E28–E30](codex-desktop-task-flow/evidence.md#e28)、[E36](codex-desktop-task-flow/evidence.md#e36)、[C10–C19](codex-desktop-task-flow/components/evidence.md#c10)。

### 滚动、长历史与样式

| 编号 | Marloues 目标规则 | 当前差距与落点 |
|---|---|---|
| MR33 | 贴底时跟随流式增长，读旧内容时保持阅读位置；沿用 24 CSS px 容差。 | 现有 hook 已实现基础跟随、距离缓存和 ResizeObserver；需补读旧内容时迟到高度的锚点策略。[M14](#m14) |
| MR34 | 区分用户主动滚动与程序补偿；键盘排除编辑控件/已处理事件，触摸移动达到阈值才改变意图。 | 当前 touchstart 即解除吸底，键盘只按键名判断；补 8 px 移动阈值及方向/输入目标判断。 |
| MR35 | 返回底部可见性考虑新回复占位；提交后的位置与正文增长由同一个滚动 owner 协调。 | 目前没有等价 response spacer 接口；新增几何协议，保持普通正向滚动布局即可。 |
| MR36 | 加载历史和恢复位置必须绑定 session/cursor；旧异步结果不能滚动新会话。 | 当前加载完成 finally/RAF 使用 viewportRef，未在此 hook 校验会话令牌；补检查与重入释放。 |
| MR37 | 保留稳定 turn key、虚拟化和按需转换；完整数据先确定分区，再对展示项做窗口化。 | 当前 live turn 先 `slice(-256)`，模型 helper 也有此窗口；避免截掉早期最终语义、待处理交互和有效工作依据。 |
| MR38 | 虚拟卸载不丢用户草稿/展开选择；需要持续运行的嵌入内容通过明确能力保留。 | 现有 overscan 为上 1200/下 1800 px，并非 retained-turn 协议；交互状态先移到列表外。 |
| MR39 | 用户消息导航区分悬停预览与确认跳转，并遵守减少动画偏好。 | 拟新增导航组件；列表 API 负责目标尚未渲染时的定位。 |
| MR40 | 沿用 Marloues 主题 token、字号、代码块与响应式布局；需要匹配的行为常量集中记录来源。 | shared contract 仍标注旧参考版本 `26.803.10989`；新规则逐项登记来源，不能只改版本号即宣称全部升级。[M15](#m15) |

历史加载阈值当前默认为 100 px；Codex 参考值为 64 px，跨隐藏页时还考虑视口高度。这里把“提前加载并保持锚点”定为功能要求，将 64 px、250 ms、260 ms 作为待验证的参考参数。Marloues 可以根据自身布局校准，但应集中管理并记录差异，避免多个组件各写一份值。

参考：[E38–E41](codex-desktop-task-flow/evidence.md#e38)、[E45](codex-desktop-task-flow/evidence.md#e45)、[C30–C35](codex-desktop-task-flow/components/evidence.md#c30)。

## 7. 状态归属与适配边界

| 状态类别 | 唯一 owner | 组件如何消费 |
|---|---|---|
| 执行事实、条目顺序、错误、时间 | 主进程 store + canonical 契约 | renderer 订阅并投影，不从 DOM/文案反推执行结果。 |
| 最终答复、过程分组、指示器、计时位置 | `buildTurnPresentationModel` 与其纯 helper | 组件读取判定结果，不重复猜测 phase、最后消息和 running。 |
| 折叠选择、工具两阶段选择、编辑草稿 | renderer 对话 UI 状态，以 thread/turn/item 定位 | 组件通过回调更新；虚拟列表卸载不清空，切换任务不串值。 |
| 复制反馈、分支/取消提交中 | 对应动作状态 | 成功、失败、请求中分别表达；回调 resolve 才表示该动作完成。 |
| 阅读锚点、新回复空间、测量状态 | `useConversationScroll` 与虚拟列表适配器 | 组件请求保留锚点，不各自无条件 scrollIntoView。 |
| 功能可用性 | 页面提供的能力上下文 | 无原消息编辑、HTML 复制、MCP App 等能力时采用明确回退。 |

`isStreaming` 继续用于响应及时性和当前活跃轮次判断；不能覆盖已确认的取消/失败事实，也不能作为“最终答复是否已经开始”的替代字段。已有防快照抖动策略需保留，并通过有序事件/快照对账解决，而不是让 JSX 长期强制显示 running。

## 8. 实施顺序与具体改动位置

### 第一步：接通唯一展示路径

调整 `ReadThreadTurnList.tsx / TurnView.tsx`，让正式页面调用模型与 `WorkflowAssistantTurn`；保持相同列表 key、父滚动容器和按可见项转换。扩展 `TurnPresentationBlocks`，将正文与过程分开。旧 `WorkflowTurnList`、`WorkflowThreadView`、子任务和 fixture 均走同一实现。

同时修正模型输入：保留错误、身份、原始用户顺序；不能直接把已丢字段的 `WorkflowMessageBlock` 当成完整 canonical 数据。已有 `codex-activity-contract` 中隐藏 reasoning 等选择也需按当前 Marloues 展示策略审视，接线不能意外让现有思考内容消失。

完成标准：真实 `ReadThreadTurnList` 入口可以区分 commentary、最终正文、过程、错误和结果；不能只证明直接渲染 `WorkflowAssistantTurn` 的测试通过。

### 第二步：统一规则与补足运行时事实

调整 `workflow-read-thread-contract.ts`、`workflow-thread-store.ts`、`read-thread-serializer.ts`、`workflow-messages-to-read-thread.ts` 及相关 runtime adapter，贯通语义类型、计时事实、停止来源和错误。更新 `turn-presentation-model* / turn-presentation / turn-collapse-*`，实现 MR01–MR21 的选择器。

完成标准：同一记录的实时流与历史回放产生一致的最终分区、时长依据和状态；无语义字段的内核走明确回退。对字段不足的历史，不补造无法证明的最终答复开始时间。

### 第三步：消息和工具交互

调整 `UserMessage.tsx / TurnFooterView.tsx / ActivityRow.tsx`，抽取公共 disclosure；复用 `CommandDetailCard.tsx / ToolDetail.tsx / ResultCards.tsx`。接通原消息编辑能力或使用明确的输入回填回退。补两阶段展开、复制反馈、busy 状态与完整类型路由。

完成标准：MR22–MR32 从真实页面操作入口生效，折叠不隐藏仍需交互的内容，失败不会丢草稿或继续转成功状态。

### 第四步：长历史与滚动协调

扩展 `use-conversation-scroll.ts` 和虚拟列表接口，补 session/cursor 令牌、标题锚点、提交空间以及保留项策略；之后添加消息导航。保持现有 Markdown 分块与主题，完成 MR33–MR40。

完成标准：图片迟到、过程折叠、顶部加载、切换会话和流式输出同时发生时，用户正在读的内容保持稳定。MCP App 等尚未具备的能力单独列为后续项，不阻塞基础对话区验收。

## 9. 验收用例与已有测试落点

以下为**待执行**的验收；本次没有运行产品测试或 UI 回放。

| 场景 | 应观察到的结果 | 规则 |
|---|---|---|
| 从真实列表渲染 commentary → command → final | 正文和过程各在所属区域，复制只含最终文档。 | MR01、MR03、MR26 |
| 无语义 phase 的内核持续输出 | 不在任意 text chunk 到来时提前收起过程；终态使用有记录的回退。 | MR03、MR11 |
| 纯文字问答，没有有效工具/过程 | 不出现虚构的过程用时或空过程开关。 | MR09、MR14 |
| 工具运行后开始 final，正文继续输出 | 有可靠时间时过程计时冻结，正文继续增长，通用 thinking 不重复。 | MR07、MR10、MR11 |
| 终态没有 agentMessage，但 turn.error 有内容 | 显示错误，仍能回看已有过程。 | MR02、MR06 |
| 工具返回 failed、error、cancelled 各一种 | 失败、中断分别呈现，不被画成成功。 | MR02、MR28 |
| 最终正文为空占位→非空→完成；同时收起过程 | 正文持续更新，内容和选区不因过程切换意外消失。 | MR04、MR16 |
| 运行时手动收起单工具，再完成 | 运行与完成阶段采用各自选择；整段折叠不覆盖单工具选择。 | MR15、MR17 |
| 收起保留 DOM 的工具详情，再按 Tab | 不进入隐藏控件；只读状态不重复播报。 | MR08、MR18 |
| 编辑历史用户消息后提交失败 | 草稿和附件仍在，可继续编辑；不会修改其他消息。 | MR22、MR23 |
| 连点复制/分支 | 复制反馈窗口内不重复执行，分支执行中只发一次。 | MR24、MR27 |
| 追加 steer 后停止或继续 | 用户消息顺序正确，不多一套状态头；steer 与人工停止文案不同。 | MR05、MR13 |
| 图片 pending→完成、pending→失败、pending→停止 | 各自正确收尾，已有完成图片保留。 | MR30 |
| 阅读旧历史时图片加载或展开 diff | 所读内容和点击标题位置稳定，不被吸到底部。 | MR19、MR33 |
| 历史分页未返回就切换任务 | 旧请求不会改变新任务的滚动位置。 | MR36 |
| 同一任务连续加载两页，hasMore 一直为 true | 加载门闩能释放，不只成功加载第一页。 | MR36 |
| 超过 256 个条目，早期仍有有效交互/计时依据 | 展示优化不删事实，必要条目仍可访问。 | MR37、MR38 |
| 再打开任务及在子任务界面查看相同记录 | 最终内容、状态、回退依据一致；能力差异有明确呈现。 | MR01、MR38 |
| 悬停导航预览，再确认跳到离屏消息 | 预览不改变位置，确认后可定位；减少动画设置生效。 | MR39 |

已有测试可扩展的落点：

- 数据：[workflow-messages-to-read-thread.test.ts](../../tests/unit/shared/adapters/workflow-messages-to-read-thread.test.ts)、[read-thread-serializer.test.ts](../../tests/unit/read-thread-serializer.test.ts)、[workflow-thread-store-rehydrate.test.ts](../../tests/unit/main/core/runtime/workflow-thread-store-rehydrate.test.ts)。
- 模型与布局：[turn-presentation-model.test.ts](../../tests/unit/renderer/src/components/workflow-chat/turns/turn-presentation-model.test.ts)、[turn-presentation-model-history.test.ts](../../tests/unit/renderer/src/components/workflow-chat/turns/turn-presentation-model-history.test.ts)、[flow-helpers.test.ts](../../tests/unit/renderer/src/components/workflow-chat/turns/turn-layout/flow-helpers.test.ts)。
- 交互基础：[turn-collapse-state.test.ts](../../tests/unit/renderer/src/components/workflow-chat/turns/turn-collapse-state.test.ts)、[UserMessage.test.tsx](../../tests/unit/renderer/src/components/workflow-chat/turns/UserMessage.test.tsx)、[AssistantTurn.test.tsx](../../tests/unit/renderer/src/components/workflow-chat/turns/AssistantTurn.test.tsx)、[CommandDetailCard.test.tsx](../../tests/unit/renderer/src/components/workflow-chat/activity/CommandDetailCard.test.tsx)。
- 渲染稳定性：[long-turn-performance.test.tsx](../../tests/unit/renderer/src/components/workflow-chat/turns/long-turn-performance.test.tsx)、[streaming-stability.test.tsx](../../tests/unit/renderer/src/components/workflow-chat/content/streaming-stability.test.tsx)。

需要新增真实列表接线与滚动回放测试。现有测试中有直接调用模型/`WorkflowAssistantTurn` 的静态渲染测试；它们无法证明正式页面接线，也不能验证 hover、焦点、计时冻结、异步失败和几何锚点。

<a id="sources"></a>

## 10. Marloues 源码依据

以下链接对应本次实际读取的代码。若后续实现改变文件，应同步更新“现状”列和基线；不以旧文档中的组件名称替代真实 import/call 关系。

<a id="m01"></a>

**M01 · 页面与列表入口**：[WorkflowChatPage.tsx](../../client/renderer/src/pages/WorkflowChatPage.tsx) 的 `ReadThreadTurnList` 调用、编辑回填、滚动 hook；[ReadThreadTurnList.tsx](../../client/renderer/src/components/workflow-chat/turns/ReadThreadTurnList.tsx) 的 `renderTurn`、`cachedNormalizedWorkflowMessage` 和 Virtuoso 参数。

<a id="m02"></a>

**M02 · 当前单轮主路径**：[TurnView.tsx](../../client/renderer/src/components/workflow-chat/turns/TurnView.tsx) 的 `WorkflowTurnView`、`summaryText`、`finalText`、`LIVE_TURN_ITEM_WINDOW` 和展开/收起 JSX。

<a id="m03"></a>

**M03 · 主条目路由与工具展开**：[message-view.tsx](../../client/renderer/src/components/workflow-chat/message-view.tsx) 的 `MessageItemView`、`DisclosureRowView`、`itemFailed`、`MessageIoCard`、`MessageStatusRow`。

<a id="m04"></a>

**M04 · 已有模型与分区链路**：[turn-presentation-model.ts](../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model.ts)、[模型类型](../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model-types.ts)、[模型 helper](../../client/renderer/src/components/workflow-chat/turns/turn-presentation-model-helpers.ts)、[AssistantTurn.tsx](../../client/renderer/src/components/workflow-chat/turns/AssistantTurn.tsx)、[TurnPresentationBlocks.tsx](../../client/renderer/src/components/workflow-chat/turns/TurnPresentationBlocks.tsx)、[flow-helpers.ts](../../client/renderer/src/components/workflow-chat/turns/turn-layout/flow-helpers.ts)。

<a id="m05"></a>

**M05 · 状态与外壳**：[turn-presentation.ts](../../client/renderer/src/components/workflow-chat/turns/turn-presentation.ts)、[TurnShell.tsx](../../client/renderer/src/components/workflow-chat/turns/TurnShell.tsx)、[AssistantTurnHeader.tsx](../../client/renderer/src/components/workflow-chat/turns/AssistantTurnHeader.tsx)、[ThinkingPlaceholder.tsx](../../client/renderer/src/components/workflow-chat/turns/ThinkingPlaceholder.tsx)。

<a id="m06"></a>

**M06 · 用户消息**：[UserMessage.tsx](../../client/renderer/src/components/workflow-chat/turns/UserMessage.tsx)、[user-message-contract.ts](../../client/renderer/src/components/workflow-chat/turns/user-message-contract.ts)；复制反馈、附件分类、编辑入口和本地展开状态。

<a id="m07"></a>

**M07 · 助手操作栏**：[TurnFooterView.tsx](../../client/renderer/src/components/workflow-chat/turns/TurnFooterView.tsx)；[workflow-message-turn.css](../../client/renderer/src/styles/components/workflow-message-turn.css) 的 `.message-footer` hover/focus-within 规则。

<a id="m08"></a>

**M08 · 整轮折叠状态**：[turn-collapse-rules.ts](../../client/renderer/src/components/workflow-chat/turns/turn-collapse-rules.ts)、[turn-collapse-state.ts](../../client/renderer/src/components/workflow-chat/turns/turn-collapse-state.ts)、[use-collapse-state.ts](../../client/renderer/src/components/workflow-chat/turns/use-collapse-state.ts)。

<a id="m09"></a>

**M09 · 数据契约与展示适配**：[workflow-read-thread-contract.ts](../../client/shared/workflow-read-thread-contract.ts) 的 `WorkflowTurn / WorkflowTurnItemBase / WorkflowAgentMessageItem / TurnPlacement`；[workflow-messages-to-read-thread.ts](../../client/shared/adapters/workflow-messages-to-read-thread.ts) 的 `WorkflowMessageBlock / workflowTurnToWorkflowMessage`。

<a id="m10"></a>

**M10 · 主进程事实与序列化**：[workflow-thread-store.ts](../../client/main/core/runtime/workflow-thread-store.ts) 的 `applyRuntimeEvent / appendAgentText / finalizeTurn / updateItemTime`；[read-thread-serializer.ts](../../client/main/core/runtime/read-thread-serializer.ts) 的 store 类型和 `serializeTurn`。

<a id="m11"></a>

**M11 · 活动分组与行**：[ActivityRenderer.tsx](../../client/renderer/src/components/workflow-chat/activity/ActivityRenderer.tsx)、[ActivityGroup.tsx](../../client/renderer/src/components/workflow-chat/activity/ActivityGroup.tsx)、[ActivityRow.tsx](../../client/renderer/src/components/workflow-chat/activity/ActivityRow.tsx)、[codex-activity-contract.ts](../../client/renderer/src/components/workflow-chat/activity/codex-activity-contract.ts)。

<a id="m12"></a>

**M12 · 具体工具详情**：[CommandDetailCard.tsx](../../client/renderer/src/components/workflow-chat/activity/CommandDetailCard.tsx) 的 `WorkflowCommandDetail`；[ToolDetail.tsx](../../client/renderer/src/components/workflow-chat/activity/ToolCallRowDetails/ToolDetail.tsx) 的参数和计划/工具详情分发。

<a id="m13"></a>

**M13 · 结果卡**：[ResultCards.tsx](../../client/renderer/src/components/workflow-chat/activity/ResultCards.tsx) 的 `WorkflowResultCards`，完成文件、图片及浏览器预览选择。

<a id="m14"></a>

**M14 · 正式页面滚动 hook**：[use-conversation-scroll.ts](../../client/renderer/src/components/workflow-chat/composer/use-conversation-scroll.ts) 的 `handleScroll`、输入监听、位置缓存、加载完成恢复和 ResizeObserver。另有 `use-scroll-anchor.ts`，但不是当前页面导入的 hook。

<a id="m15"></a>

**M15 · 本地样式与正文能力**：[conversation-page-contract.ts](../../client/shared/conversation-page-contract.ts)、[chat.css](../../client/renderer/src/styles/components/chat.css)、[workflow-message-turn.css](../../client/renderer/src/styles/components/workflow-message-turn.css)、[MarkdownContent.tsx](../../client/renderer/src/components/workflow-chat/content/MarkdownContent.tsx)。

<a id="m16"></a>

**M16 · 其他消费入口**：[WorkflowTurnList.tsx](../../client/renderer/src/components/workflow-chat/turns/WorkflowTurnList.tsx)、[ThreadView.tsx](../../client/renderer/src/components/workflow-chat/turns/ThreadView.tsx)、[SubagentWorkspace.tsx](../../client/renderer/src/components/workflow-chat/turns/SubagentWorkspace.tsx)、[WorkflowCodexFixturePage.tsx](../../client/renderer/src/components/workflow-chat/fixtures/WorkflowCodexFixturePage.tsx)。

## 11. 本次交付与验证范围

本次完成组件接线核对、参数映射、40 条 Marloues 目标规则、数据缺口与回退、实施顺序和 19 个验收场景。产品代码、运行时契约和样式均未修改。

文档验证覆盖本地链接、显式证据锚点与表格结构。原 Codex 静态证据与探针结果不构成 Marloues 的功能通过证明。本规格也不声称恢复了尚未分析的 Codex Markdown、代码块或 diff 编辑器内部；这些模块优先沿用 Marloues 现有实现。
