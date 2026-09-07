# 对话区集成与验证记录

更新时间：2026-09-06。实现位于 `/Users/xuzong/workspace/marloues-architecture-review-20260905`，分支 `codex/architecture-review-20260905`。改动已接入正式桌面入口；没有合并到主分支、打安装包或覆盖用户安装的应用。

本次交付包含组件、主进程数据流、IPC、持久化和桌面验证。原组件目录、规则表和源码指纹保留为实现前的参考快照；当前结果见本记录及 [机器可读验证记录](implementation-verification.json)。

## 正式调用路径

`WorkflowChatPage → WorkflowReadThreadTurnList → WorkflowMarkdownProvider → WorkflowTurnView → WorkflowAssistantTurn → 正文 / 过程 / 结果 / 操作栏`。

SDK / Binary 事件经过 `WorkflowThreadStore → readThread → TurnPresentationModel` 进入同一套组件；`workflow-turn-persistence.ts` 保存相同的展示片段。开发验收页复用此入口，正式桌面测试从普通输入框发送，未替换 preload API。

## 已集成的组件与行为

以下 renderer 路径以 `client/renderer/src/components/workflow-chat/` 为基准。

| 内容 | 实际组件和规则 |
| --- | --- |
| 工作计时 | `shared/conversation-timing.ts`、`TurnPresentationModel`：主进程记录首条有效工作和可靠 final 正文起点，冻结后正文仍可流式增长；只显示一处时长，并按过程/正文位置切换。没有可靠时间的历史不使用挂载时间补造。秒数向下取整，不足一秒不显示耗时。 |
| 状态与折叠 | `use-collapse-state.ts`、`content/conversation-ui-state.ts`：按 session/turn/item 保存显式展开选择；进入可靠 final 后可收起过程；取消保留过程和问题原文，短任务不误标完成。 |
| 表格、公式、图表 | `MarkdownTable.tsx`、`MarkdownContent.tsx`、`MermaidBlock.tsx`：宽表滚动与预览、Markdown/HTML 剪贴板、KaTeX、Mermaid 严格模式、防抖、过期结果失效、错误回退。生产 CSP 允许打包字体及 data 字体。 |
| 代码与写作 | `CodeBlock.tsx`、`InlineCode.tsx`：开放围栏不显示复制，闭合后保留组件实例；换行偏好持久化；启用 writingBlockMode 后，无语言/Markdown 围栏使用写作块；普通行内代码可复制，文件引用按目标解析。 |
| 引用与选区 | `MarkdownLink.tsx`、`AssistantAnswer.tsx`：相对路径使用所属会话 cwd，文件通过真实 IPC 读取并定位行号；外链协议过滤；完成正文的选区可以加到输入框。历史消息操作明确标为“放回输入框”。 |
| 媒体与弹窗 | `MarkdownMedia.tsx`、`ImageLightbox.tsx`、`ContentDialog.tsx`：图片/音频/视频加载与失败状态；画廊导航与缩放重置；Escape、Tab 焦点约束和触发按钮焦点恢复。 |
| 工具与结果 | 命令、文件、搜索、生图、协作、计划组件：保留工具身份、退出/取消状态、有效零 diff 文件、分步进度；未知事件保留原始内容。事件标记按显式类型展示。 |
| MCP 原始结果 | `activity/McpResult.tsx`、`shared/workflow-tool-result.ts`：六种内容类型、annotations、structuredContent、isError、_meta。结构化结果与等价 JSON 文本去重；完整 raw 信封在打开时格式化。 |
| SDK MCP 保真 | `main/core/runtime/sdk-mcp-result-bridge.ts`：在 SDK 压平结果之前捕获原始 MCP 响应，通过 SDK 元数据中的原始 tool-use ID 关联。连接复用现有配置与 Windows 命令规范化；结束、取消和启动异常清理客户端。 |
| MCP Apps | `activity/McpApp.tsx`、`main/services/conversation-app-service.ts`：发现 ui:// 资源、沙盒 iframe、2026-01-26 初始化、工具输入/结果通知、尺寸更新、受宿主权限控制的工具调用。主进程校验所属 session/turn/item 和工具可见性，一次性批准绑定调用参数。详情卸载时保留 iframe 草稿。 |
| 提问与回应 | `activity/QuestionCard.tsx`、`main/core/runtime/conversation-input.ts`：SDK AskUserQuestion、SDK MCP elicitation、Binary 用户输入请求接入同一宿主 broker；支持常规表单/选择/多选/数值/布尔字段及 URL 请求。IPC 校验身份、字段与重复回应；停止任务取消等待；终态记录不再提交。 |
| 滚动与导航 | `use-conversation-scroll.ts`、`ReadThreadTurnList.tsx`：阅读历史时不吸底；切任务隔离旧分页和 RAF；保留折叠锚点及每会话滚动位置；消息导航 hover 只预览，点击才定位。 |
| 操作与错误 | `TurnFooterView.tsx`、`use-copy-feedback.ts`、`TurnErrorCard.tsx`：异步复制/分支防重复、失败可重试、1500ms 复制反馈、时间戳独立；正文局部错误恢复；完成播报只在状态切换时触发。 |

## 实际验证结果

新增局部样式已按 Marloues 现有 CSS 架构收进 13 个相邻 CSS Modules，复用现有控件与语义变量。Mermaid 与 MCP App 跟随三主题和强调色；用户附件补齐正向排列、名称/图标/行号布局与键盘显露，详见 [样式规范对齐记录](style-alignment.md) 和 [附件规则复核](attachment-layout.md)。

本轮完整清单和逐项证据统一维护在 [组件与交互验收报告](full-verification.md)，[机器记录](implementation-verification.json) 和 [原 31 场景执行账本](acceptance-execution.json) 中。

- 正式 Electron 页面：**41 个保存场景、108 项显示、交互与样式检查通过**。包含逐层工具详情、媒体、权限、输入框、160 轮分页、导航、分支、连续计时与折叠状态；新增三主题/两种宽度的附件实际坐标、长名称与行号、独立滚动和键盘预览检查。
- 真实 SDK / MCP 桌面流程：**19 项通过**。包含提问与回答、MCP 资源失败重试、iframe 握手与真实工具批准/拒绝、表单 accept/decline/cancel、排队拖拽编辑与单条取消、停止/恢复/立即引导、刷新与完整进程重启。
- 浏览器组件交互：**15 项通过**。该层用于流式 DOM、精确滚动竞态及主动触发的局部 renderer 异常；文件和分支回调使用 fixture，与真实桌面结果区分。
- 保存的真实模型配置：**3 项通过**。在隔离 app home 中从普通输入框发送，经真实 SDK / Read 工具读取 `evidence.txt`，最终正文返回文件原文。
- 单元测试：**131 文件 / 740 项通过**。Node/Web 类型检查、main/preload/renderer 生产构建通过；client lint 0 错误、1 个现有未使用导入警告。

三个桌面测试使用同一份最新生产构建，均无未捕获 renderer 异常。浏览器错误边界测试故意产生的预期异常单独记录。截图、控件记录及实际检查 ID 见 [本轮证据索引](../../../client/test-results/conversation-complete/index.html)；历史失败图片保留，不用于当前通过结论。

此前真实模型测试的失败来自 Playwright Electron loader 添加的 `--use-mock-keychain` 和 `--password-store=basic`，导致原 safeStorage 密文无法解密。入口加载主进程前移除两个测试开关并断言使用正常系统凭据后端后，真实调用通过；用户原配置和密钥未被改写。

## 复跑

在 worktree 根目录运行：

```sh
npm run test:unit
npm run typecheck
npm run lint:client
npm run test:conversation:build
npm run test:conversation:complete
npm run test:conversation:desktop
npm run test:conversation:live
```

浏览器验证先启动 Vite：

```sh
npm run test:conversation:preview
npm run test:conversation:visual
```

可用 `MARLOUES_CHROMIUM_PATH` 指向本机 Chromium，`MARLOUES_DETAILS_URL` 指定预览地址。`npm run test:conversation:live` 默认读取 `.marloues-dev/config/settings.json` 中的默认模型，`MARLOUES_LIVE_CONFIG` 可指定另一份 Marloues 配置；密钥由正常 Electron 配置服务处理。

原参考证据可用 `node docs/architecture/conversation-area/verify.mjs --reference-only` 校验。该模式仍检查安装包版本、源码片段、规则和文档链接，但将当前源码相对历史快照的差异单独列出。不带该参数仍执行原指纹校验，不会将修改后的代码伪装成旧快照。

## 明确保留的差异

这些差异都在对话区范围内，没有从验收口径中删除：

- MCP Apps 只声明并实现当前宿主具备的能力，支持服务端工具调用；未开放的标准方法显式返回错误。Codex 的私有 App 类型、superseded/不可折叠策略、远程图标策略没有全量等价实现。
- 复杂/嵌套/带未知校验规则的 elicitation 显示“不支持，可跳过或取消”；没有假装支持全部八种 Codex 授权和表单协议。
- SDK 自管 OAuth 的远端 MCP 连接保留原连接方式；不套用需要显式凭据的结果桥接。这类连接的原始结构保真尚未验证。
- 远端文件宿主、Google Drive / appgen / artifact-session 等特殊资源、Codex 私有正文指令，以及历史消息原地编辑，需要 Marloues 对应能力才能完整对齐；当前提供可辨认的回退或“放回输入框”。
- MCP iframe 草稿在当前 renderer 生命周期内保留；重启验证覆盖工具记录、问题和计时，不承诺恢复 iframe 内任意应用草稿。已做亮暗暖主题、实际样式变量与 960/1440 宽度验证；跨平台、长时间压力和全部私有状态仍未穷举。

原 `acceptance.json` 保留历史计划；当前 31 个场景的实际状态已逐项写入 [执行账本](acceptance-execution.json)。已验证、部分验证及能力缺口明确分开，不能把本轮测试通过数解释成 Codex 对话区所有私有状态完全等价。
