# 具体显示处理

展示由“原始条目 → 展示消息 → 区域分配 → 活动分组 → 组件状态”几步决定。下面的条件针对已经定位到的普通本地任务路径；部分步骤带功能开关。

## 消息投影与位置

来源：[E01](evidence.md#e01)、[E24](evidence.md#e24)、[E25](evidence.md#e25)。

| 编号 | 规则 | 对画面的影响 |
|---|---|---|
| V01 | 协议 `completed`、`failed` 都投影为 `complete`；`interrupted` 为 `cancelled`；`inProgress` 为 `in_progress` | `complete` 表示该展示轮次不再执行，不能拿来画“成功”图标；仍要看错误。 |
| V02 | 起始 user-message 分到用户区；heartbeat trigger 用户消息也单独保留；worktree-init 不立即结束起始消息收集 | 顶部消息区不是按原始 items 的固定前 N 项切分。 |
| V03 | 执行开始后出现的追加用户消息进入过程区 | 同一轮中间可以出现用户输入，它不必另起一个独立轮次。 |
| V04 | todo 与 diff 取最后一份；proposed plan、plan implementation、model changed、model rerouted 分别有独立位置 | 过程流的事件顺序不等于最终所有卡片的线性位置。 |
| V05 | 未完成的问题、审批和 elicitation 从普通活动中分离；等待某服务器的 elicitation 时，可隐藏同服务器仍在运行的 MCP 调用项 | 防止同时出现“这个工具正在运行”和重复的等待交互。 |
| V06 | 从符合资格的 assistant 消息中选择最终展示项，排除 async delivery；必要时越过已完成 reasoning、子任务活动、elicitation 或特定图片错误寻找 final_answer | 数组最后一个 item 不一定是最终答复。 |
| V07 | 被选作最终答复的消息从过程区移出；相同 searchItemId 且内容完全相等的相邻 final_answer 重复项可被去重 | 最终答复不会再以同一份内容留在折叠过程里。 |
| V08 | 已终止且没有非空最终答复或结构化输出时，尾部符合条件的 system error 单列 | 空回答和失败需要独立兜底显示。 |
| V09 | automation update 按 automation ID 等标识保留较新的结果；完成答复可带 automation citations，无答复时可单独显示更新卡 | 某些工具结果会合并到答复附件，而不是一直占据过程行。 |
| V10 | 自动审批评审依 target item ID 附到对应工具活动；部分拒绝及尾部警告保留为单独条目 | 评审和工具输出需要关联，不能按收到顺序无差别画两张卡。 |

## “思考中”“探索中”“等待你回答”

来源：[E26](evidence.md#e26)、[E27](evidence.md#e27)、[E28](evidence.md#e28)、[E29](evidence.md#e29)。

工作指示器选择器的优先级可以直接写成下面的判定表；外层组件还会进一步决定是否显示该槽位。

| 编号 | 从上往下首先满足的条件 | 选择器结果 |
|---|---|---|
| V11 | `forceThinking` | 使用 thinking 槽位。等待用户回答时会走这里，再把文字/图标替换为等待回答。 |
| V12 | 轮次不在执行，且没有上述强制条件 | none。 |
| V13 | 正在探索 | exploring。 |
| V14 | 有未完成 proposed plan | planning。 |
| V15 | 有阻塞请求、可识别的最终答复、活跃 web search 或动态工具自己的摘要 | none，避免通用 thinking 与具体状态重复。 |
| V16 | 未完成 assistant 消息 | thinking。 |
| V17 | 有其他活跃且非探索的工具活动 | none，由具体活动负责表现；否则回退 thinking。 |
| V18 | 外层已进入本客户端停止、sleeping、某些授权等待、安全缓冲或待生成图片等状态 | 普通 thinking 的最终可见性另有门控，不能只调用上述选择器就画 spinner。 |

“可识别的最终答复”不是单看 phase。`kGn` 要求 `phase === final_answer`，同时满足正文去空白后非空、消息已完成或存在 structuredOutput 三者之一。空的、尚未完成的 final_answer 占位和已经开始展示的答复并不等价。[E34](evidence.md#e34)

## 活动行为什么会合并、变短或换标题

来源：[E28](evidence.md#e28)、[E29](evidence.md#e29)、[E30](evidence.md#e30)。

| 编号 | 规则 | 对画面的影响 |
|---|---|---|
| V19 | 可识别的探索类 exec 可合成 exploration 组；reasoning 能并入当前探索组；读文件的某些特殊路径被排除 | “读文件、搜索、列目录”不必每个都永久占一行。不是所有 exec 都归为探索。 |
| V20 | 只有末尾仍有效的探索组结合轮次状态和其他活跃项，才标成 exploring；前面的组成为 explored | 历史探索不会随着整轮仍在运行而一直转圈。 |
| V21 | groupable 活动连续累积；遇到 standalone 项先结束当前组；连续 standalone strict-review-notice 还有去重分支 | 分组边界受条目种类影响，不是每隔固定数量折叠。 |
| V22 | 同类 MCP 连续合并要求：已完成、成功、可分组、无 source、非 computer-use、无附属自动审批评审、无需单独呈现的资源；身份组合也必须一致 | 不能把同名工具的全部调用合成一行；有交互内容或失败时尤其不同。 |
| V23 | 只有“最新可见组、轮次在运行、活动片段尚未关闭”同时成立时，摘要槽位才尝试呈现 active/thinking；否则 summary | 过程摘要会随最终答复和后续消息出现而变化。 |
| V24 | 摘要中的文件与读取路径用 Set 去重；工具调用和搜索等分别统计；自动审批失败按 ID 去重 | “读了 3 个文件”不一定等于执行了 3 次读取命令。 |
| V25 | 仅有一项的 summary 组可简化成 standalone；仍活跃的项及多文件/可视化 patch 有例外 | 相似内容有时是一条普通活动，有时是汇总卡，存在具体条件。 |

## 折叠与保留的交互

来源：[E27](evidence.md#e27)、[E31](evidence.md#e31)、[E32](evidence.md#e32)、[E35](evidence.md#e35)。

| 编号 | 条件 | 结果 |
|---|---|---|
| V26 | 最终答复已开始、未取消、存在可渲染过程项 | 才允许普通过程折叠；三者任一不满足，选择器返回不允许且不折叠。 |
| V27 | 已允许折叠 | `isCollapsed = !forceExpanded && (persistedCollapsed ?? !preventAutoCollapse)`；先尊重强制展开，再使用已有选择，再用自动默认值。 |
| V28 | 有活动中的子任务、强制展开或其他阻止自动折叠的上下文 | 外层将相应条件传入折叠选择器；“默认不折叠”和“完全禁止折叠”含义不同。 |
| V29 | 特定动态工具、需持续显示的 MCP App、steering/hook feedback 用户消息 | 可划入 persistent 区，留在可折叠内容之外；某些开头实时转录另放到开关前；折叠过程不一定让所有过程卡片都消失。 |
| V30 | 没有可折叠内容、禁用折叠，或只有 context-compaction 这类特殊单项 | 组件进一步限制折叠开关的呈现；允许折叠的基础条件为真，不保证最终一定画出同一款开关。 |
| V31 | 折叠标题有 worked-for item | 优先使用它；没有才用 durationMs；两者都没有再使用历史消息数量标题；“用时”有不同数据来源，也可能被消息数量标题替代。 |

`persistedCollapsed` 是组件收到的已有折叠选择。本次定位确认了使用优先级，没有把这个名称推断成“跨重启永久保存”。其持久化范围需要另行追踪和验证。

## “用时”的完整判定链

来源：[E24](evidence.md#e24)、[E27](evidence.md#e27)、[E33](evidence.md#e33)、[E34](evidence.md#e34)、[E35](evidence.md#e35)、[E44](evidence.md#e44)。

| 编号 | 条件 | 处理 |
|---|---|---|
| V32 | 轮次没有首次工作时间，或者包含 `sleep` item | 普通计时项的起点置空；含 sleep 时此路径也禁用 durationMs 回退。 |
| V33 | 有起点且计时边界前有有效过程项 | 才尝试生成 worked-for；user-message、realtime-transcript、worktree-init 及空项不计入此有效过程判断。 |
| V34 | 轮次正在运行 | 边界取第一个 final_answer assistant 的位置，没有则取 items 末尾；计时项插在第一个有效过程项之前。 |
| V35 | 轮次不在执行且未取消 | 边界取最后一条 assistant 消息；生成的计时项插在它之前；没有 assistant 就不走这个插入路径。 |
| V36 | 最终答复有时间戳，且已满足最终答复识别条件 | 运行中的 worked-for 可以已经变成 worked；结束时间取 `finalAssistantStartedAtMs`，不是等待正文全部流完。 |
| V37 | 没有结束时间 | 仅在 `in_progress` 下生成 working；终态缺少必要结束时间时，该 helper 不生成 worked-for。后续折叠标题仍可能使用 durationMs。 |
| V38 | working 计时项正在显示 | 无终点时每秒更新，差值至少为 0；不足 1 秒用 Working 文案，达到 1 秒才用 Working for；worked/stopped 用各自文案。 |
| V39 | 被取消且此次停止由本客户端发起，普通非 Aeon 呈现路径 | 组件有独立 stopped 项，使用“你在…后停止了”这一类文案；不能把所有历史 interrupted 都归为当前用户刚点击停止。 |

这解释了原问题中的三种现象：运行期间计时项在过程前，完成之后可移到最终答复前，过程收起后还能由折叠标题来呈现。**缺少条件时不生成计时项**，也不等于整张页面绝不会出现 durationMs 回退的用时。

用時起点也有回退链：已知存在工作后，优先 `turnStartedAtMs`，缺失才用首次工作条目时间。字段叫 `finalAssistantStartedAtMs`，但事件层在 agentMessage 开始时就更新它；展示层另行用 phase、内容和完成状态判定，不能只凭字段名理解行为。

## 图片、计划和历史卡片

来源：[E25](evidence.md#e25)、[E36](evidence.md#e36)、[E39](evidence.md#e39)、[E43](evidence.md#e43)。

| 编号 | 条件 | 处理与可见效果 |
|---|---|---|
| V40 | generated-image 已有 src | 保留为完成图片；无 src 时，只有轮次运行且图片状态为 in_progress/inProgress 才增加待生成占位。 |
| V41 | 生成图片期间有 steering 用户消息或 steered 标记 | 重置对应的待生成占位计数，并避免同一次 steer 重复重置；之前已经完成的图片仍保留。 |
| V42 | 本客户端已发起停止 | pendingPlaceholderCount 置 0，但 hasPendingItems 仍可能为真；内部仍有未完成图片，不代表还要显示等待中的空白图片卡。 |
| V43 | 最终资源包含 pptx | 此输出选择器抑制已经完成的图片画廊，仍可保留待生成占位；幻灯片工作流的图片不一定另外展示成一整组图片产物。 |
| V44 | 图片出现 image_gen 用量限制错误 | 分组器保留为活动错误；通常的图片则进入独立输出列表，运行时还可能同时参与过程；失败图片不能仅当作“src 为空，继续等”。 |
| V45 | 查找历史计划 | 从后向前选择非运行轮次里的 plan；可按指定 key 过滤；从一级标题提取标题；编辑/查看计划所用内容与当前正在流式生成的计划不是同一个选择规则。 |
| V46 | 构建可见历史轮次且允许 MCP Apps | 最近三个可见非占位轮次使用 auto-expand 提示，更早轮次用 default；进行中的固定内容只附在最近轮次；相同卡片在历史位置和当前轮次的位置可能有不同默认展开方式；auto-expand 是传入模式，最终卡片仍有自己的逻辑。 |

这里尚未穷举 Markdown、表格、公式、代码块、引用、文件预览、diff 编辑器内部、鼠标 hover 和键盘焦点的所有细节。这些属于后续可独立继续提取的组件规则，不能用本表替代它们的 UI 验收。
