# Marloues 对话区适配：组件、参数与显示规则

> 已接入正式 Marloues 桌面对话区，见[完整组件与交互验收](full-verification.md)、[代码集成记录](implementation.md)和[当前验证结果](implementation-verification.json)。以下适配规格和源码指纹保留为实现前快照；不能用历史“拟新增”判断现在的代码状态。

基线：`/Users/xuzong/workspace/marloues-architecture-review-20260905`，分支 `codex/architecture-review-20260905`，包含工作区未提交实现。参考是本机 Codex 安装包 `26.901.41600`。本页正文记录最初的适配规格，后续代码和验收另行记录。

**当前状态：正文组件、计时、折叠、提问、MCP 结果及 App 宿主已经落入产品代码，并经过完整 Electron 进程和真实模型调用验证。** 部分私有协议仍有边界，详见代码落地记录；这里的静态分支计数不表示全量对齐。

## 阅读入口

- [真实 JSONL 回放与对照进度](real-jsonl-comparison.md)：真实日志经过正式 App 的结果、截图，以及尚未完成的 Codex 实际 UI 对照；不以合成场景通过替代两端一致性。
- [当前实际验收报告](full-verification.md)：24 组组件与样式检查、实际交互、逐项证据及未覆盖边界。
- [样式规范对齐记录](style-alignment.md)：12 个相邻 CSS Modules、现有控件与主题变量复用、亮暗暖主题截图。
- [当前 31 场景执行账本](acceptance-execution.json)：与下面保留的历史验收计划分开。

- [组件职责与参数](components.md)：现有组件、缺失组件、交互责任，以及落实到项目的组件树。
- [分发分支映射](routes.md)：37 个消息分支、20 个 Markdown token、6 个 MCP 内容类型、5 个资源类型、8 个 elicitation 类型，每个都有处置。
- [细节规则 MR41–MR90](rules.md)：触发、显示、操作与失败处理；与[主规格 MR01–MR40](../marloues-conversation-area.md)一起使用。
- [拟扩展类型](contracts.ts)：Marloues 命名的 props 与展示决策草案，不参与产品编译。
- [验收场景](acceptance.json)：跨流式、终态、失败、虚拟化和异步交互的回放输入及预期；`executionStatus` 明确为未执行。
- [安装包证据](evidence.md)、[原始参数和 JSX 索引](components.json)、[可执行校验](verify.mjs)。
- [Marloues 实际源码索引](marloues-source.md)：64 份源文件/相关测试的路径与指纹；[校验结果](verification.json)区分静态通过和未执行 UI 场景。

## 覆盖口径

| 层级 | 本次覆盖 | 边界 |
|---|---|---|
| 消息路由 `YT` | 37/37 显式类型分支映射 | `return null` 也记录；不能把“本路由不渲染”解释成“整个对话区不存在”。 |
| Markdown 路由 `zua` | 20/20 switch 分支映射 | 另外记录 switch 之前的数学公式、directive、未知 token 回退。 |
| MCP 内容 `qn` | 6/6 分支映射 | 普通工具结果与交互式 MCP App 分开。 |
| 结果资源 `OW` | 5/5 分支映射 | 不把网页搜索摘要当成完整资源模型。 |
| MCP elicitation `tE` | 8/8 分支映射 | 回答记录、等待提示、授权卡与表单入口分别处理。 |
| 具体组件与 helper | 112 个函数、24 组证据、4 个安装包资源 | 包括嵌套回调里的 JSX；函数数不是 UI 组件总数。 |
| 轮次、计时、折叠、滚动 | 沿用主规格的真实 worktree 核对 | 本次纠正 MR17 的过度概括，增加正文及工具内部规则。 |

“分支覆盖”表示上述分发器的静态清单已逐项对应，**不表示 76 个分支在 Marloues 全部实现，也不表示所有 UI 状态已实测**。运行时注入的 `ChatGptCodeBlock`、MCP App HTML、可视化内容及平台打开目标属于动态实现边界：入口和回退已列出，外部内容本身不能用静态组件表穷举。没有把这些从对话区范围删掉。

范围包含消息内弹出的图片/表格预览、工具详情、结果与导航；输入框只讨论与消息编辑/选区/等待状态的接口。侧栏、设置、项目管理和完整浏览器/编辑器实现不在范围内。

## 三处必须修正的旧结论

1. **有 Markdown 不等于正文组件齐全。** Marloues 当前自定义的 Markdown 节点主要是 `pre/hr`；表格、链接、图片使用默认渲染，尚没有参考实现的表格弹层、媒体解析和专用链接分发。
2. **单工具没有一条通用的“运行默认展开”规则。** Codex `rx` 命令详情从 `collapsed` 开始；MCP `Vn` 还受已保存状态、自动展开参数和卡片是否允许折叠影响。公共 disclosure 的两阶段状态不能直接套给所有类型。
3. **结果卡不是只有 diff 和图片。** Codex `OW` 分发文件、网站、artifact session、Google Drive 和 appgen 资源。Marloues 当前 `WorkflowResultCards` 是文件变更摘要、图片与第一个浏览器结果，需要显式资源契约才能对应其他分支。

## 实施顺序与完成判据

| 批次 | 落点 | 完成判据 |
|---|---|---|
| 1：已有路径的规则修正 | `TurnPresentationModel`、各工具行、`TurnFooterView`、滚动 hook | 计时依据和位置唯一；取消不报成功；按工具类型处理展开；切任务后旧异步回调不改新任务。 |
| 2：正文组件 | `MarkdownContent`、`CodeBlock`，新增表格/公式/图表/链接/媒体子组件 | MR41–MR58、MR84 的回放通过；正文复制不夹带按钮文案；流式未闭合内容有明确回退。 |
| 3：工具和消息语义 | `TurnItemRenderer`、`ToolDetail`、用户消息和请求记录 | 结构化内容保留类型；问题和回答有身份；权限、工具输出和模型事件不混成普通文本。 |
| 4：能力依赖项 | MCP App、资源行、注释/可视化与协作入口 | 执行层提供对应契约才启用，缺能力时呈现明确回退；跨虚拟化和历史恢复可持续。 |

实现完成必须同时具备组件、数据契约、状态规则和相关回放结果。只新增一个空组件或改成相似名称，不算对齐。
