# 按现有用例执行 Codex 任务，再对照 Marloues

2026-09-06，工作区 `marloues-architecture-review-20260905`，分支 `codex/architecture-review-20260905`。

此流程把 `tests/fixtures/conversation-full/scenes.mjs` 中的既有场景转成实际任务，从安装的 Codex 输入框发送。随后冻结新生成的 JSONL，选取实际轮次，通过正式 Marloues 的 main → preload / IPC → 对话组件渲染，并在两款 App 中进行对应操作。

[第一批双侧截图与来源](../../../client/test-results/conversation-generated/index.html) · [全部用例进度](../../../client/test-results/conversation-generated/case-plan.json) · [原生证据及哈希](../../../client/test-results/conversation-generated/native-comparison.json)

## 本批执行

真实 Codex 任务为「Codex 与 Marloues 现场渲染对照」，ID `01a0758f-b52f-7a90-b6ae-a586876cc2c4`，版本 `26.901.41600`。原生截图来自安装的 App 窗口，使用系统辅助功能操作。初始 CSV 请求因连接重试而停止，未用于本批用例对照。

| 轮次 | 关联既有用例 | 实際操作 |
| --- | --- | --- |
| `01a07592-b226-7833-b4d6-33a1f688c486` | `qa-markdown` | 将既有 Markdown 内容作为任务输入；实际检查用户气泡、标题、表格复制与展开、Mermaid |
| `01a07597-9249-70d2-ac65-6b8c86db7a86` | `qa-command-completed`、`qa-command-failed`、`qa-patch-completed`、`qa-many-files`、`qa-tool-details` | 真实创建五个文件并修改 evidence.ts；运行 15 秒的成功命令和退出码 1 的失败命令；实际读取、列目录和搜索；展开命令及文件结果 |

本批共 7 组双侧截图，7/7 项数据导入和渲染检查通过，33 份证据文件记录并校验 SHA-256。数据检查通过不代表交互规则一致。

## 实测差异

- 用户输入的 Markdown 经 Codex 输入框转义后，Codex 气泡显示原有符号，Marloues 显示额外反斜杠。
- 同一工具轮次，Codex 显示 `1分钟16秒`，Marloues 显示 `1分钟17秒`。
- 同一路径先创建、后修改，Codex 的 evidence.ts 汇总为 `+2 −1`，Marloues 为 `+1 −1`。
- 退出码 1 的命令在 Codex 的合并活动组内，摘要为“已运行”；Marloues 将失败项拆成独立红色行。两端都保留真实输出和退出码，但详情结构不同。
- Mermaid 两端默认显示图表，Marloues 额外有标题栏和源码切换。
- 表格展开容器和按钮位置存在差异；两端实际复制的 Markdown 文本相同。
- 多文件展开均从三个增加到五个；顺序、路径显示与增删行统计有差异。

这些新发现尚未在产品代码中修复；本批增加的是任务采集、交互检查与报告流程。

## 未完成范围

既有 41 个场景中，本批只关联 6 个，另外 35 个未开始新的原生对照。关联场景也没有全部完成：Markdown 的代码复制、链接和脚注等，文件差异预览、撤销与审核，以及专用工具的其余详情仍未验证。

15 秒命令确实运行过，但未保存其运行中的 Codex 窗口，故 `qa-command-running` 仍未验证。附件、权限、取消、媒体、协作等必须分别触发真实状态；不能把合成场景的通过数当作原生对照结果。

## 复现入口

```sh
npm run test:conversation:case -- --case qa-markdown --open
npm run test:conversation:case:markdown
npm run test:conversation:case -- --case qa-command-completed --open
npm run test:conversation:case:tools
npm run test:conversation:case:report
```

采集命令读取 `client/test-results/conversation-generated/case-plan.json` 中的原始任务日志，也接受 `--source /absolute/path/to/rollout.jsonl --turn <turn-id>`。每次创建新的证据目录和独立 App 数据目录，不覆盖原始 JSONL。`--open` 保留实际 Marloues 窗口，后续交互脚本连接它。

新一轮对照必须先从 Codex 发送对应任务，再采集新日志及原生 UI 证据。采集脚本不会替代该步骤，也不会重新执行日志中的历史命令。重新采集后，需要重新完成双侧操作并保存基线；报告拒绝证据哈希不一致或来源轮次不一致的数据。
