# 对话区样式规范对齐

时间：2026-09-05T19:18:11.452Z。工作树：`/Users/xuzong/workspace/marloues-architecture-review-20260905`；分支：`codex/architecture-review-20260905`。

以 [Renderer CSS Architecture](../../../client/renderer/src/styles/README.md) 和 [tokens.css](../../../client/renderer/src/styles/tokens.css) 为准。对话行为参考 Codex，视觉继续使用 Marloues 的设计规范。

## 实际修改

- 将新增局部样式收进 **13 个相邻 CSS Modules**，从 markdown.css / workflow-activity.css 移出相应规则；共享命令元信息和消息操作规则回到原有 owner 文件。保留已有 workflow-* 语义类和测试入口。
- 颜色使用 surface-workspace / surface-popover / raised-1、text-1/2/3、border、accent/soft、danger；间距、字号、圆角、阴影和遮罩使用现有变量。移除临时十六进制颜色和未定义的 --border-color / --bg-primary。几何上限和原生控件高度保留为布局值。
- 问答输入复用 Input，提交/重试/许可等复用 Button，主操作复用现有 primary，图标操作复用 icon-button。亮色主按钮使用成对的 --primary-fill / --primary-ink。原生 select、checkbox、音视频继续保留原生交互。
- 补充 npm run test:conversation:preview 启动入口，固定在 client 工作区加载 Tailwind 内容扫描。修复从仓库根目录直接启动 Vite 时预览页缺少控件样式的问题；浏览器测试断言重试按钮的实际高度和边框。
- Mermaid 消费实际字体、背景和强调色；临时测量容器局部禁用过渡，解决减少动态效果时 2000px 旧尺寸造成的节点缩小、裁切和巨大留白。
- MCP Apps 的初始化及 ui/notifications/host-context-changed 通知传递标准语义变量；warm 对应协议 light 并传递实际暖色值。主题/强调色切换保留已挂载 iframe 和草稿。
- 用户附件条使用 UserMessage.module.css：文件控件整体 flex 布局，图标/文件名/行号不重叠；外层从右端滚动，内层保留顺序，键盘聚焦时完整显示。条件文档卡片尚有差距，见 [规则复核](attachment-layout.md)。

## 组件样式归属

| 文件 | 当前源码 |
| --- | --- |
| McpApp.module.css | [activity/McpApp.module.css](../../../client/renderer/src/components/workflow-chat/activity/McpApp.module.css) |
| McpResult.module.css | [activity/McpResult.module.css](../../../client/renderer/src/components/workflow-chat/activity/McpResult.module.css) |
| QuestionCard.module.css | [activity/QuestionCard.module.css](../../../client/renderer/src/components/workflow-chat/activity/QuestionCard.module.css) |
| CodeBlock.module.css | [content/CodeBlock.module.css](../../../client/renderer/src/components/workflow-chat/content/CodeBlock.module.css) |
| ContentDialog.module.css | [content/ContentDialog.module.css](../../../client/renderer/src/components/workflow-chat/content/ContentDialog.module.css) |
| InlineCode.module.css | [content/InlineCode.module.css](../../../client/renderer/src/components/workflow-chat/content/InlineCode.module.css) |
| MarkdownErrorBoundary.module.css | [content/MarkdownErrorBoundary.module.css](../../../client/renderer/src/components/workflow-chat/content/MarkdownErrorBoundary.module.css) |
| MarkdownLink.module.css | [content/MarkdownLink.module.css](../../../client/renderer/src/components/workflow-chat/content/MarkdownLink.module.css) |
| MarkdownMedia.module.css | [content/MarkdownMedia.module.css](../../../client/renderer/src/components/workflow-chat/content/MarkdownMedia.module.css) |
| MarkdownTable.module.css | [content/MarkdownTable.module.css](../../../client/renderer/src/components/workflow-chat/content/MarkdownTable.module.css) |
| MermaidBlock.module.css | [content/MermaidBlock.module.css](../../../client/renderer/src/components/workflow-chat/content/MermaidBlock.module.css) |
| ReadThreadTurnList.module.css | [turns/ReadThreadTurnList.module.css](../../../client/renderer/src/components/workflow-chat/turns/ReadThreadTurnList.module.css) |
| UserMessage.module.css | [turns/UserMessage.module.css](../../../client/renderer/src/components/workflow-chat/turns/UserMessage.module.css) |

主题桥接：[conversation-theme.ts](../../../client/renderer/src/components/workflow-chat/content/conversation-theme.ts)。CSS、主题桥接和规范文件的 SHA-256 记录在 [机器证据](implementation-verification.json) 的 styleAlignment 中。

## 验证与截图

- 正式 Electron **7 项样式检查**：亮/暗/暖主题的实际背景、边框、字号、圆角、字体、键盘焦点、主按钮前景背景、弹窗遮罩/阴影、文件目标行；图表三个节点完整、标签可读、尺寸合理；自定义强调色即时生效。
- SDK / MCP：真实 stdio 资源和 iframe 握手后切换三主题及强调色，断言主题变量送达且草稿保留，再继续真实批准/拒绝工具流程。
- 浏览器 fixture：三主题下断言错误边界的计算样式；重试和正文标识更新仍能恢复。
- 附件布局另有 4 项生产 Electron 检查：三主题 × 两种宽度的原截图组合/长名称/多图实际坐标，以及键盘滚动、文件预览目标行、焦点返回；截图文件以 attachment- 开头。
- 完整回归：生产 Electron 108 项、SDK / MCP 19 项、浏览器 15 项、真实模型 3 项；单元 740 项。类型检查和生产构建通过；lint 0 错误，1 个现有警告。

| 主题 | 问答卡 | 图表 | 弹窗 | 文件预览 | MCP App | 错误恢复 |
| --- | --- | --- | --- | --- | --- | --- |
| light | [截图](../../../client/test-results/conversation-complete/style-question-light.png) | [截图](../../../client/test-results/conversation-complete/style-mermaid-light.png) | [截图](../../../client/test-results/conversation-complete/style-dialog-light.png) | [截图](../../../client/test-results/conversation-complete/style-file-preview-light.png) | [截图](../../../client/test-results/conversation-app/mcp-theme-light.png) | [截图](../../../client/test-results/conversation-details/error-boundary-light.png) |
| dark | [截图](../../../client/test-results/conversation-complete/style-question-dark.png) | [截图](../../../client/test-results/conversation-complete/style-mermaid-dark.png) | [截图](../../../client/test-results/conversation-complete/style-dialog-dark.png) | [截图](../../../client/test-results/conversation-complete/style-file-preview-dark.png) | [截图](../../../client/test-results/conversation-app/mcp-theme-dark.png) | [截图](../../../client/test-results/conversation-details/error-boundary-dark.png) |
| warm | [截图](../../../client/test-results/conversation-complete/style-question-warm.png) | [截图](../../../client/test-results/conversation-complete/style-mermaid-warm.png) | [截图](../../../client/test-results/conversation-complete/style-dialog-warm.png) | [截图](../../../client/test-results/conversation-complete/style-file-preview-warm.png) | [截图](../../../client/test-results/conversation-app/mcp-theme-warm.png) | [截图](../../../client/test-results/conversation-details/error-boundary-warm.png) |

截图来自运行中的正式 Electron 或标明的浏览器错误 fixture；计算样式与实际交互有自动断言，检查了代表性截图。没有把这些截图称为 Codex 像素级对比，也没有声称逐像素人工审阅了所有截图。第三方 iframe 需要主动使用标准变量，宿主不能强制改写任意外部应用内部样式。跨平台、全部 compact 配置仍未穷举。

完整检查 ID、执行层和保留差异见 [完整验收报告](full-verification.md)。报告仅在完整回放、同一构建的 SDK/真实模型及浏览器检查通过后生成。
