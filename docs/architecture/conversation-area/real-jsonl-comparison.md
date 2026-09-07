# Codex 与 Marloues 真实对话区对照

2026-09-06T06:48:22.207Z，分支 `codex/architecture-review-20260905`。

已把真实 JSONL 接入正式 Electron 的 main → preload/IPC → ReadThreadTurnList → TurnView，并实际操作 Codex 26.901.41600 中同一条附件消息。原生实测 **6 条规则**，Marloues 对应通过 **6 条**。真实回放 **10/10**，完整对话区回归 **108/108 项，41 个场景（同一构建）**。这不代表全部组件和交互已对齐。

[两端截图与逐项结果](../../../client/test-results/conversation-real/index.html) · [原生操作证据](../../../client/test-results/conversation-real/native-comparison.json) · [回放检查](../../../client/test-results/conversation-real/results.json) · [源事件审计](../../../client/test-results/conversation-real/audit.json)

## 这轮按原生实测修正的规则

- 上传图片只显示一个缩略图，不把传输正文中的同路径文件引用再显示为附件标签。 对应检查：`recorded-checkpoint-attachment-input`，通过。
- 该轮显示用时 14分钟 34秒：观察到工作后启用计时，优先采用轮次开始时间，最终回答开始时冻结。 对应检查：`recorded-clock-frozen-and-placement`，通过。
- 用时是整个过程的展开标题；展开后仍在过程上方，不移进最终回答。 对应检查：`recorded-clock-frozen-and-placement`，通过。
- 工具查看过的图片在过程内按相邻图片分组，默认收起；第一组展开为两个 80px 缩略图。最终回答后的结果区不重复收集这些图片。 对应检查：`real-inspected-image-groups-and-result-placement`，通过。
- 打开图片组后方向键切换，首张不显示上一张，末张不显示下一张；Escape 关闭并回到原过程。 对应检查：`real-inspected-image-groups-and-result-placement`，通过。
- 收起整个过程再展开时，内部图片组恢复为收起状态。 对应检查：`real-inspected-image-groups-and-result-placement`，通过。

另外修复多文件传输清单只提取首个文件的问题；上传图片的传输引用去重不影响明确文件引用，也不修改协议中图片顺序。

## 对照范围

- 原任务：`01a07139-d2f3-7c43-8925-1a33eab15cab`，原轮次：`01a072f4-e659-7172-881f-8a83eaf349f1`，完成记录第 6058 行。
- 冻结文件：`/Users/xuzong/workspace/marloues-architecture-review-20260905/client/test-results/conversation-real/source.jsonl`；SHA-256：`724e263013bea8e0af87cb7b6f9e393a1fbefa41c70316e2989c221cf7947672`；读取截至第 6105 行。
- 33 个显示片段、2047 条结构化事件、9 类 item；此数量不是组件数。
- 未识别 item 0、已检查内容未支持 0、无效行 0、缺失最终回答 0。这些审计不证明全部嵌套字段已被解释。
- Codex 对话列约 737px，Marloues 约 736px；完整窗口和主题不同，不作全窗像素相等声明。
- Codex 截图和 AX 状态来自实际窗口，报告核对证据哈希；未伪造历史 token 或 UI 操作。

## 仍未对齐或覆盖

- 图片预览缩放：Codex 显示相对于图片原尺寸的适配比例（用户附件 46%，工具图片 81%）；Marloues 当前以适配后的大小为 100%。
- Codex 的用户附件预览有图片批注入口，Marloues 尚未提供等价交互。
- Marloues 已验证 Escape 后焦点回到触发按钮；Codex 端只确认预览关闭、回到原过程，尚未读取焦点目标以验证同等规则。
- 其他轮次、未出现的组件类型、真实流式增量、hover 和历史滚动均未因此得到完整覆盖。
- JSONL 主要记录完成的 item。记录时点的状态重建无法恢复未记录的逐 token 增量、历史 hover、点击和滚动；运行中时点只显示已记录内容。
- 3 条 AgentMessage 带有 questions；目前呈现日志内题目和选项文本，尚未映射 Codex 异步问题卡交互状态。
- parsed_cmd 尚未用于命令摘要，当前沿用 Marloues 命令分类；MCP 的 pluginId / readOnlyHint 尚未用于呈现。stdout / stderr 分流仍保留在源文件，显示使用 aggregated_output。
- 本日志包含 9 类结构化 item，不能因此宣称覆盖权限等待、动态工具、图像生成、协作代理、专用 PDF / Office 卡片等全部情况；合成场景回归不能替代这些类型的真实 Codex 对照。

## 复现

运行 `npm run test:conversation:build`、`npm run test:conversation:real`、`npm run test:conversation:complete`、`npm run test:conversation:real:report`。最后加 `npm run test:conversation:real -- --open` 保留实际 App 供检查。新日志可传 --source；原生基线需重新操作对应 Codex 消息采集。

构建：`/var/folders/12/vjlqhn9x2739vrkbs_z2s0m40000gn/T/marloues-conversation-build-GsTVrS`；回放目录：`/var/folders/12/vjlqhn9x2739vrkbs_z2s0m40000gn/T/marloues-real-codex-mFvc1k`。回放只读，使用独立数据目录，源日志不变。
