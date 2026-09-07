# 组件参数与职责

以下列出有助于实现的关键参数。实际提取到的参数名集合见 [catalog.json](catalog.json)。表中的组件职责来自调用点与函数体；它们不是官方公布的组件 API。`…` 表示还有其他参数或经 spread 传入的值。

## 页面、列表与单轮执行

| 组件 / 真实符号 | 关键输入 | 回调、输出与职责 | 证据 |
|---|---|---|---|
| 页面入口 `gs / $o` | `$o` 接收 `clientThreadId, conversationId, isArchivedPreview` | 组装任务页、标题、摘要与内容；归档预览影响交互能力 | [C01](evidence.md#c01) |
| 标题栏 `Fo` | `title, titleSuffix, projectName, cwd, projectIcon, canPin, pendingClientThreadId, hideHeaderIdentity` | 身份信息可按布局隐藏/移动；接收 `getConversationMarkdown` 等操作依赖 | [C02](evidence.md#c02) |
| 状态宿主 `NO` | `shouldResume, allowMissingConversation, isReadOnly, showComposer, showSummaryPanel, lockedCollaborationMode` | 将恢复/缺失任务状态转成具体布局；连接打开后台任务、PR 和子任务面板的动作 | [C03](evidence.md#c03) |
| 主布局 `RO` | `hasConversation, isResuming, isWriterConflict, isThreadHistoryLoading, hideThreadContent, composerSubmitDisabled, header, footerContent` | 组合加载、内容、输入区和提示；将输入区交给滚动容器的 footer slot | [C04](evidence.md#c04) |
| 时间线 `GO` | `conversationId, hostId, isReadOnly, initialScrollOffset, initialVirtualizedTurnListRestoreState, usesUnifiedTimeline` | 生成可见 entries；回报内容准备完成、占位空间与历史恢复状态 | [C05](evidence.md#c05) |
| 提交放置协调 `UE` | `entries, consumePendingLatestTurnSubmitPlacement, latestTurnFooter, synchronouslyMeasureLatestTurnUpdates` | 接收虚拟列表 API；协调新提交后的高度、视口和 response spacer | [C05](evidence.md#c05) |
| 虚拟列表 `Ie` | `entries, RowComponent, gapPx, initialRestoreState, retainedTurnKeys, preserveMeasuredTurnViewport` | `onApiChange` 提供 `getEntryGeometry / scrollToKey`；记录测量高度、可见区与恢复状态 | [C35](evidence.md#c35) |
| 单行 `IE` | `entry, latestTurnFooter, latestTurnFollowContentRef` | 将 entry 转成单轮 props，包裹错误边界并组合轮次尾部内容 | [C06](evidence.md#c06) |
| 单轮适配 `Ji` | `turn, turnState, turnRequests, historyEntityKey, turnSearchKey, isLatestTurn, isMostRecentTurn, isCollapsed` | 准备展示投影、停止来源和计时回退，向 `_i` 传递编辑/分支/折叠回调 | [C07](evidence.md#c07) |
| 单轮主体 `_i` | `turn, workedDurationMs, interruptedByThisClient, renderMcpApps, showFullTranscript, generatedImages, completedThreadGoal` | 布置用户、过程、最终答复、请求、计划和产物；计算具体可见性 | [C08](evidence.md#c08) |
| 类型分发器 `YT` | `item, conversationDetailLevel, isTurnInProgress, isTurnCancelled, renderMcpApps, toolActivityTurnKey, assistantAfter` | 依据 item.type 转交具体内容组件；同时接收用户和助手各自的操作栏策略 | [C09](evidence.md#c09) |

## 消息、过程与产物

| 组件 / 真实符号 | 关键输入 | 回调、输出与职责 | 证据 |
|---|---|---|---|
| 用户消息 `Eg` | `message, sentAtMs, collapsedLineCount, messageStatus, alwaysShowActions, compactActions, hideActions, turnId, messageContent` | `onEditMessage`；显示正文/自定义内容、状态、复制和编辑；编辑状态还与 turn ID 对应的外部状态关联 | [C10](evidence.md#c10) |
| 助手观察包装 `pE` | `item, historyEntityKey, isReadOnly, isHeartbeatAutomationRequest, isHeartbeatAutomationTurn, …` | 根据历史实体决定直接渲染或订阅条目更新；异步问题有额外 questionKey 包装 | [C11](evidence.md#c11) |
| 助手操作栏 `zy` | `copyText, getCopyText, getCopyHtml, onFork, forkDisabled, isForking, sentAtMs, alwaysShowActions, additionalActions, persistentAdditionalActions` | 复制支持纯文本/HTML；操作可由 hover/focus 显示；时间戳可单独显示 | [C12](evidence.md#c12) |
| 过程折叠 `tD` | `items, workedForItem, workedDurationMs, hasFinalAssistantStarted, isTurnCancelled, persistedCollapsed, forceExpanded, disableCollapse, preventAutoCollapse` | `onSetCollapsed`；分开处理可折叠、持续保留和开关前的条目；可内含子任务活动 | [C13](evidence.md#c13) |
| 过程标题 `YE` | `collapsedMessageCount, workedDurationMs, workedForItem, isCollapsed, previousTurnNumber, totalTurnCount` | `onToggle`；点击前保持时间线锚点，再发出切换动作 | [C13](evidence.md#c13)、[C34](evidence.md#c34) |
| 单工具展开容器 `S` | `defaultExpanded, indentContent, icon, summary, status, children` | `onExpand`；运行阶段和完成阶段分别管理展开状态，测量内容高度用于动画 | [C14](evidence.md#c14) |
| 命令正文 `A` | `shellName, cwd, command, output, isInProgress, variant, embeddedAppearance` | 命令/输出的独立复制入口、日志格式、折叠及内部滚动表现 | [C15](evidence.md#c15) |
| 命令容器/结果 `De / Oe` | `command, cwd, output, footer, surface`；结果接收 `isInProgress, isSuccess, exitCode, wasInterrupted` | 运行、成功、失败和中断的结果信息独立于输出文本 | [C15](evidence.md#c15) |
| 差异入口 `eT` | `item, isInProgress, inProgressDiffSummary, showRevertButton, deferOffscreenRendering` | 运行时摘要与完成后 diff 分支；完成分支 `rT` 处理文件统计、工作目录及展开后的内容 | [C16](evidence.md#c16) |
| 计划进度 `hw / gw / Sw` | `item, isComplete, donutAnimateOnMountDelayMs, tooltipPortalContainer` | 以进度/说明组件组合呈现，延迟动画和 tooltip 挂载位置可由上层指定 | [C17](evidence.md#c17) |
| 计划正文 `hE / gE` | `item, hideCodeBlocks, defaultCollapsed, historyEntityKey, …` | 计划内容有自己的折叠和历史观察路径，不能与 todo 进度混为一个组件 | [C17](evidence.md#c17) |
| 图片输出 `UGn` | `images, conversationImages, pendingImageCount, enableImageEditor, enableCanvas, canShareImage, turnId` | `onOpenImage, onImageEditSubmit, onImageShare, onImageInteraction`；可注入资源解析与更多操作 | [C18](evidence.md#c18) |
| 文件产物 `OW` | `resources, conversationId, turnId, cwd, hostId, messageId, inputMessageId, isAppgenEndCardEnabled` | `onFileOpen`；按资源构建产物展示，并携带来源身份 | [C19](evidence.md#c19) |
| 工作状态 `Li / Ii` | `clientUserMessageId, isVisible, icon, message` | 组合等待/思考槽位；文字不可见时仍可保留布局和图标占位 | [C32](evidence.md#c32) |

## 输入、队列与审批

| 组件 / 真实符号 | 关键输入 | 回调、输出与职责 | 证据 |
|---|---|---|---|
| 输入适配 `WO` | `composerPresentation, composerSubmitDisabled, isResuming, isThreadHistoryLoading, lockedCollaborationMode` | 将任务状态转成通用输入参数；连接 `onPrepareLatestTurnSubmitPlacement / onClearPendingLatestTurnSubmitPlacement` | [C20](evidence.md#c20) |
| 输入控制包装 `_$r` | `composerController, defaultPrompt, selectedProject, defaultCwd, beforeFirstTurn, prepareLocalSubmit, prepareLocalConversationAttachments` | `onLocalSubmitStart / onLocalSubmitError / onLocalConversationCreated` 等；准备提交和控制器，向总成传递状态 | [C20](evidence.md#c20) |
| 输入总成 `e$r` | `disabled, submitDisabled, isResponseInProgress, isThreadHandoffInProgress, onSubmitLocal, queuedFollowUpSubmission, onStop, isStopping` | 汇集编辑器、附件、队列、工具栏、请求与横幅；布局还受 `surfacePlacement / composerLayoutMode / radiusVariant / surfaceVariant` 控制 | [C21](evidence.md#c21) |
| 富文本编辑器 `qH` | `composerController, placeholder, ariaLabel, minHeight, singleLine, disableAutoFocus, focusRequestNonce, isFocusComposerTarget` | `onSubmit, onUserInput, onMentionActivate, onSuggestionHandler, onCompositionStateChange`；挂接已有 editor view | [C22](evidence.md#c22) |
| 附件托盘 `$Nr` | 图片、文件、粘贴文本、pending 附件、Appshot、评论、选中文本、引用标注等各自数组 | 不同类型有独立 remove/open/edit/navigate 回调；pending 和已完成附件分别处理 | [C23](evidence.md#c23) |
| 输入操作区 `zLr` | `submitButtonMode, isResumePending, isSubmitButtonLoading, isStopping, isQueueingEnabled, hasMessageContent, submitBlockReason, disabledReason` | `handleSubmit / onStop / onResume`；选择主操作、测量可用空间、布置模型/权限/上下文入口 | [C24](evidence.md#c24) |
| 主操作按钮 `Z3` | `isLoading, disabled, ariaLabel, Icon, keyboardShortcutLabel, blockedReason, blockedReasonOpenNonce, supportsMorphing` | `onClick`；按钮语义、原因反馈和图标/loading 切换，某些图标形变受功能开关控制 | [C25](evidence.md#c25) |
| 队列 `Ce` | `messages, isMessagePaused, isInterrupted, isSendNowDisabled, editingMessageId, isQueueingEnabled` | 编辑、删除、立即发送、打开旁聊、重排、切换队列及恢复中断队列各有回调 | [C26](evidence.md#c26) |
| 队列行 `we` | `messageId, messageText, imagePreviewSrc, isPaused, isEditing, isReorderable, isSendNowDisabled` | 用 ID 发出单条操作；拖动、编辑和暂停分别改变外观或操作文案 | [C26](evidence.md#c26) |
| 待处理请求外壳 `VBr` | `pendingRequest, firstBackgroundSubagentApproval, renderOwnSurface, showAutoReviewApprovalNudge, permissionsHostId` | 区分本任务和后台子任务请求；连接本地/子任务 follow-up 回调 | [C27](evidence.md#c27) |
| 请求分发器 `wBr` | `pendingRequest, approvalQuestionActor, conversationId, cwd, hostId` | 按 userInput、optionPicker、setup、approval、elicitation、permissionRequest、implementPlan 分发；计划入口接 `onSubmitLocalFollowup` | [C27](evidence.md#c27) |
| 工具栏 `pn` | `composerMode, isResponseInProgress, isWorktreeAvailable, variant, isHidden, showRuntimeControls, hideRunLocationDropdown, showWorkspaceDropdown` | `setComposerMode`；根据环境、项目和布局显示运行位置及分支等入口 | [C28](evidence.md#c28) |

## 布局与辅助组件

| 组件 / 真实符号 | 参数重点 | 职责 | 证据 |
|---|---|---|---|
| 摘要区 `ts / sT / uT` | 开启后台任务、子任务、PR 的回调；`isVisible, onForceShow, registerEnvironmentActionCommands` | 环境、产物、后台任务和来源等区块的组合；部分内容由内部状态读取 | [C29](evidence.md#c29) |
| 摘要弹层 `be` | `children, isOpen, onOpenChange, shouldPreventAutoFocus, trigger` | 开关受控；可阻止打开/关闭时的自动焦点移动，并处理与右侧标签页的焦点关系 | [C29](evidence.md#c29) |
| 滚动容器 `Fe` | `children, footer, responseSpacer, initialOffset, hasLiveMcpAppFrame, loadPastHiddenHistoryPages` | `onScroll / onUserScrollToTop`；协调底部输入区、新回答空间和内容阅读 | [C30](evidence.md#c30) |
| 消息导航 `Nt` | `items, getScrollElement, prefersReducedMotion, tooltipComponents, tooltipPortalContainer` | `onBookmarkChange / onNavigationClick / onPreviewItem / onRevealItem`；预览和实际跳转有不同入口 | [C31](evidence.md#c31) |

上面的 callback 名只说明组件边界，不能据此推断“回调触发即操作成功”。例如编辑用户消息会等待异步结果；队列点击立即发送后，真正发送仍由上一阶段分析的协调器处理。
