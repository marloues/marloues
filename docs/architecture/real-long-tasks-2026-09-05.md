# 真实长任务验收记录

后续体验修正及 697 项测试记录见 [Codex 体验契约与真实任务验收](codex-experience-2026-09-05.md)。

2026-09-05；工作树 `/Users/xuzong/workspace/marloues-architecture-review-20260905`，分支 `codex/architecture-review-20260905`。使用正在运行的 Electron 应用、真实 Claude SDK adapter 和已配置的 DeepSeek 模型 `deepseek-v4-flash-vision-exp`。通过现有 Electron CDP 测试通道操作输入框、引导按钮和停止按钮，同时采集宿主事件、readThread、DOM 和截图；没有构造模型输出。

## 执行情况

| 实际任务 | 用时 | 工具调用 | 结果 |
| --- | ---: | ---: | --- |
| 仓库完整调用链审查 | 3 分 59 秒 | 62 | 达到 50 轮上限，中途结束；发现命令误拦截、流式标题问题 |
| 同会话继续审查，执行中追加要求并点击立即引导 | 5 分 15 秒 | 29 | 完成报告，执行了追加要求；暴露上限结束后的上下文丢失 |
| 修复后主动触发小轮数上限 | 6 秒 | 2 | 达到上限并保留原 SDK 会话 ID；测试后已将配置恢复为原值 50 |
| 修复后续接、真实命令和单元测试、执行中引导 | 1 分 13 秒 | 8 | 记住前一轮暗号，重定向命令执行成功，指定测试实际通过，追加要求进入最终报告 |
| 主动停止：修复前 | 25 秒 | 2 | 用户停止被显示为 SDK 错误／任务失败 |
| 主动停止：修复后 | 31 秒 | 6 | 正确收尾为 `aborted` / `cancelled` |
| 停止后续接 | 4 秒 | 0 | 保留停止前的上下文，准确回答原标记及已读文件名 |

工具调用数量按本次任务宿主 item 的不同 ID 统计，包含读取、命令和任务清单工具，不按 token 事件计数。前两段合计执行约 9 分 14 秒、91 次工具调用。原始提示词、事件、截图和统计保留在 `test-artifacts/real-long-tasks-20260905/`（本地验收产物，不加入源码提交）。

## 确认的问题与修复

### 1. 上限结束后，“继续”实际上丢失了原会话

现场：第一段因 `error_max_turns` 结束后，第二段明确表示无法访问前文并重新查目录。核查发现正常的 `options.resume` 已经接通，真正的断点是 `normalizeSdkMessage` 的错误分支没有携带 SDK 返回的 `session_id`。主进程因而无法保存正确的 Runtime 会话绑定。

修复：错误结果也保留 `sdkSessionId`，交由既有 Runtime 绑定和 resume 路径处理。没有取消或提高用户正常的轮数上限。SDK 的每种 result 均包含可用于续接的会话 ID，符合其[官方会话文档](https://code.claude.com/docs/en/agent-sdk/sessions)。

实测：把轮数临时设为 2，触发真实上限后恢复为 50。下一条消息未重新提供暗号，模型仍准确回答“银杏-742913”；日志记录 `claude.resume`，保存的原生会话 ID 前后一致。

### 2. 普通只读命令的 `2>/dev/null` 被当作系统写入

现场：`cd … 2>/dev/null && git status`、`find src -type d 2>/dev/null` 等多次返回 `Command redirects output to an operating-system path.`。

原因：解析器只知道存在重定向，却拿整个命令参数集合判断系统路径；`/dev/null` 被直接判成危险写入，甚至 `cat /etc/hosts > /tmp/hosts-copy` 也会误判读取路径。

修复：记录实际重定向目标；输出重定向只检查该目标；精确识别 `/dev/null`，保留其他系统路径和真实修改的风险判断。补充 descriptor 重定向 `2>&1` 的解析。测试仍验证 `/etc/hosts`、`/dev/disk0`、路径穿越及实际权限修改不会被放行。

实测：修复版真实执行带 `2>/dev/null` 的 Git 命令，退出码 0，返回工作树修改记录。

### 3. 流式参数尚未完整，页面先展示原始 JSON

现场：读取工具参数过程中，命令行短暂显示 `正在运行 {"raw":"…`。第一段 2 秒间隔采样中有 10 个样本出现此现象。

修复：SDK 的 tool start / input delta 明确携带 `isReady: false`，block stop 才置为 ready；IPC 和 readThread 都保留 pending；命令投影仅采用明确的 `cmd` / `command` / `script` 字段，不能把任意 JSON 当作命令。尚未就绪时显示“正在准备命令”。

实测：修复后的任务没有采到原始 JSON 命令标题。回归测试覆盖捕获到的半截参数形态，避免只依赖采样频率。

### 4. 实时展示与落盘记录不一致，工具结果和引导消息丢失

这是本轮最直接的架构证据：两条消息组装链路并没有真正统一。

- 第一段 live readThread 有 62 条工具记录，全部有输出；落盘只有 42 条带输出，重启后确认剩下 42 条。
- 第二段点击立即引导后，live readThread 有独立的引导用户消息和后续分段；重启后只剩原始输入及合并后的 assistant 记录，引导消息消失。
- 第二段 live 的 29 条工具输出，落盘后只有 17 条。

原因：`WorkflowThreadStore` 和 IPC 内部 legacy builder 分别组装消息；legacy 转换器只接受字符串结果，SDK 的 text-block 数组被丢弃；主进程只转发 steer 事件，没有把显示分段作为持久化单元。

修复：新增 `storedMessagesForRuntimeTurn`，正常终态保存直接来自宿主 readThread 的同一组显示分段；保存稳定 turn ID、引导用户输入、continuation 元数据和完整 items。重建历史时恢复这些字段。工具结果共享归一化：文本块变为可读文本，其他结构化结果保留 JSON 表达。

实测：修复后上限任务及续接任务一共 3 个显示分段、33 个 item；完整退出并重启主进程后，JSON 契约字段逐项一致，包括 ID、顺序、状态、错误、工具输出和引导分段。续接任务 8 条工具记录的 8 条输出全部保存；引导标记“杉木-586204”保留在用户消息及最终答复中。

旧记录当时没有保存的输出或引导消息，不能靠这次代码修改补回来；原始现场保留在测试证据中。本次尚未把所有执行中的事件变成可在意外退出后重放的持久化日志。

### 5. 已完成的引导前过程不能折叠，成功重试也受历史失败影响

现场的引导把一次执行分成多个显示段。前段没有独立 final，原来的 `canCollapse` 强制保留展开；另外，只要任意历史工具失败，即使后续任务成功也不能收起。

修复：成功完成的 continuation 前段可以折叠；有最终答复且整体成功时，历史命令失败仍保留在可展开的过程内。整体失败、未解决／失败审批仍保持可见。回归覆盖失败后成功重试、引导分段和失败审批，实际任务验证了完成后的正文独立展示。

### 6. 用户主动停止被 SDK 的错误结果覆盖

现场：点击“停止任务”后，SDK 返回了 `error_during_execution` 和 `result_type=user … stop_reason=tool_use`，界面显示任务失败。此时宿主已经明确记录了 `stopRequested`。

修复：仅在宿主已请求停止／取消时，由 adapter 以该意图收尾为终态 `aborted`；SDK 因中断而返回或抛出的错误不再冒充任务失败。保留初始化时获取的原生会话 ID，方便停止后的续接。没有把“立即引导”的中间边界当作终止。

实测：重新执行读取任务并点击同一个停止按钮，约 0.2 秒内收尾，readThread 为 `cancelled`，没有错误卡片。错误结果和抛异常两条路径都有回归测试。

随后实际发送一条不含原标记的续接消息，模型准确回答“松柏-391628”以及停止前读过的 `workflow-thread-store.ts`。应用里保留“真实长任务验收 · 停止与续接”供检查。

## 验证及范围

- 125 个测试文件、689 项单元测试通过。
- Node / Web 类型检查、改动文件 ESLint、布局检查通过。
- Electron main / preload / renderer 生产构建通过，使用 `emptyOutDir: false`。
- 真模型任务中实际运行了指定的 4 组回归测试，成功退出；修复后的正文包含引导验收要求。
- 真实 SDK 上限续接、即时引导、主进程重启恢复、主动停止均已执行。

有两点不能从此次实验扩大推断：只测试了当前已配置的 SDK + DeepSeek 组合，尚未对 Binary / 自研 Runtime 做相同真实任务矩阵；也没有验证待审批交互、多模态、百回合分页和完整 Codex 视觉一致性。滚动曾在引导切段的时机回到底部，普通运行中向上阅读也有保持位置的样本，尚不能据此认定所有滚动竞态已解决。

首个采集脚本在任务末尾一次性导出大量累计事件时触发了 renderer crash。改为有界缓冲、分批写盘后，后续所有任务没有 renderer error；此次崩溃不能直接归因于产品正常使用。第一段的完整事件导出因此缺失，截图、逐次采样、失败输出及恢复后的宿主快照仍然保留。

架构方向仍然是：Runtime adapter 上报执行事实和原生会话绑定；宿主维护展示契约；UI 与持久化消费同一份契约。下一步优先消除剩余的重复状态推进，再补执行中持久化与跨 Runtime 验收，不能仅用更像 Codex 的样式代替这些约束。

## 查看结果

应用已保持运行，当前打开“真实长任务验收 · 修复后”。上限失败、同会话续接、引导输入及最终报告都保留在真实对话中。另有“真实长任务验收 · 问题复现”和“真实长任务验收 · 停止误报复现”作为修改前现场。

关键证据：`test-artifacts/real-long-tasks-20260905/summary.json`、`architecture-resume/persisted-shape.json`、`architecture-resume/after-process-restart.json`、`fixed-long-task/restart-comparison.json`、`fixed-long-task/final-ui.png`、`cancel-fixed/evidence.json`、`cancel-resume/evidence.json`。采集器为 `tests/smoke/conversation-long-tasks.probe.mjs`，必须连接真实运行中的 Electron 开发窗口。
