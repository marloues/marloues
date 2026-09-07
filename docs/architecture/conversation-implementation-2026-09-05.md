# 对话展示契约：第一轮实现记录

日期：2026-09-05。工作树：`/Users/xuzong/workspace/marloues-architecture-review-20260905`；分支：`codex/architecture-review-20260905`；起点：`edebdae45ce19f787125584750e636f56ecb30d3`。原 checkout 保持不变。

后续已完成真实长任务验收，并据现场补修上限续接、重定向误判、流式参数、工具输出与引导持久化、折叠和主动停止。最新结果为 125 个文件、689 项测试通过，详见[真实长任务验收记录](real-long-tasks-2026-09-05.md)。下文保留第一轮实现时的范围与验证结果，涉及“未进行真实调用”的描述仅指当时。

## 已落实的边界

用户定义能力和展示契约；Runtime 通过 Adapter 表达执行事实；对话页面根据宿主展示模型装配现有组件。此次先修复真实对话入口及其数据链路，沿用项目逆向 Codex 时已有的组件、分组规则和视觉样式。

```text
Binary 原生 item 通知 → Binary Adapter → item-updated 完整快照
Claude / 自研 Runtime → text-chunk 等增量事件
                         ↓
               WorkflowTurnItem 宿主契约
                         ↓
       readThread / 带版本的 IPC item 事件 / 保存历史
                         ↓
           buildTurnPresentationModel
                         ↓
       process（过程）/ document（答复）/ results（结果）
                         ↓
                   现有组件
```

这次借鉴 DSH 的“执行记录与展示投影分开、最终正文独立、过程按宿主规则折叠”，没有引入 DSH 依赖或照搬其 Runtime 循环。[DSH 源码研究](dsh-reference-2026-09-05.md) 固定了参考提交和具体落点。

## 行为变化

| 场景 | 修复后的行为 |
| --- | --- |
| 原生完整消息不断更新 | 按同一 ID 替换快照，不追加为重复文本；缺少角色的 delta 通知继承该消息已知的角色 |
| 原生 `final_answer` 与 item/completed | 前者保留为消息语义；后者推进 `settled`，不覆盖消息角色 |
| 真正的文本增量 | 按增量追加；连续相同字符也保留，不再用文本前缀猜测快照 |
| 过程与答复文字相同或互为前缀 | 保留两个不同 ID 的消息，展示模型决定归属 |
| 对话展开 | 真实入口使用展示模型，接入原有计划、审批、协作、图片、审查标记等组件 |
| 有明确答复并完成 | 可折叠过程；最终答复及结果卡片独立显示，复制回复只取展示模型的正文 |
| 没有答复，或有待处理审批／失败工具 | 保持过程可见；无原生 final 角色时，工具之前的文字不会被当作最终答复 |
| 回合级错误 | 通过展示模型进入独立错误卡片，错误原因保存并恢复，避免只有失败标签 |
| 失败文件编辑 | 保留在过程区，不再同时被过程区和结果区排除 |
| 长任务 | 普通过程保留 256 条实时窗口，早期审批、结果、计划、失败及显式最终答复额外保留 |
| 折叠历史 | 初始不挂载过程正文；已经展开过的过程保留最后可见快照，避免折叠时重挂整个长轨迹 |
| 历史恢复 | 保留已保存的消息语义，并尊重已保存的失败／取消状态；旧数据缺失的角色无法凭空恢复 |

## 代码落点

- `client/shared/agent-runtime.ts`：区分 `item-updated` 完整快照与 `text-chunk` 真正增量。
- `client/main/core/runtime/binary-event-adapter.ts`、`codex-item-adapter.ts`：原生字段映射、稳定 ID、消息角色继承、扩展 item 与 unknown 保留。
- `client/shared/adapters/workflow-item-event.ts`：带版本的 IPC 边界，显式区分同名的旧 reasoning 与新 reasoning，保留 usage/model 元数据。
- `client/main/ipc/handlers.ts`：统一发布 canonical item，IPC、IM 和持久化使用同一份已发布 item 集；其他 Runtime 的旧增量构建仍保留。
- `client/main/core/runtime/workflow-thread-store.ts`：完整快照 upsert、终态不覆盖角色、真正增量追加、恢复终态。
- `client/renderer/src/components/workflow-chat/turns/TurnView.tsx`：真实入口恢复展示模型，沿用虚拟回合列表、计时、用户消息和操作入口。
- `turn-presentation-model.ts`、`turn-layout/flow-helpers.ts`、`turn-collapse-rules.ts`：正文边界、过程顺序、折叠条件和失败可见性。
- `activity/AgentFlowSection.tsx`：过程首次展开时挂载，折叠时保存已挂载状态；CSS 显式处理 hidden，避免 grid 覆盖默认隐藏行为。

## 验证

- 全量单元测试：124 个文件、678 个测试通过（原基线 122 个文件、653 个测试）。新增 Adapter → readThread → 实际 TurnView 的集成回归、原生扩展类型映射、历史与 IPC、重复文字、失败与审批、长回合窗口及折叠历史场景。
- `npm run typecheck`：node / web 均通过。
- `npm run test:layout`：通过。
- 改动文件 ESLint、`git diff --check`：通过。
- Electron Vite 的 main、preload、renderer 生产构建：通过。通过程序 API 设置 `emptyOutDir: false`，输出到 `/tmp/marloues-conversation-build-20260905`，不清空任何输出目录。
- 原审查的 9 项探针现在显式读取固定 Git 基线，作为历史缺陷证据保留，不再用于判断当前代码正确与否。正确行为由单元／集成回归验证。

使用原 checkout 已有依赖完成检查，未重新安装依赖。未进行真实模型调用、真实 IM 发送、打包发布或 Electron 交互 E2E。界面自动化服务启动失败，未完成视觉、滚动锁定和连续交互对照；因此不能宣称已经与当前 Codex 界面完全一致。

## 后续架构工作

本轮完成了展示入口和消息语义链路的首批修复，没有完成整个 Runtime 架构重构。

1. 把能力声明收敛为一个描述来源，区分 native / patch / unsupported；接通已有 Binary 原生 fork。详见 [Runtime 可插拔审查](runtime-pluggability-review-2026-09-05.md)。
2. 消除主进程旧增量 builder、WorkflowThreadStore 和前端兼容状态之间的重复状态推进，增加事件序号与重放约束。此次保存终态修复不代表 F5 的多状态源问题已全部解决。
3. 修复会话截断、执行中路由漂移、无窗口任务与最终结果判断、请求级回调及分页。这些原审查发现仍需按各自验收场景实施。详见 [架构主报告](review-2026-09-05.md)。
4. 在可用的桌面环境下，以运行、完成、失败、取消、审批、引导、多模态和长历史做真实交互对照，再决定动画与滚动细节调整。

[原渲染审查](codex-rendering-review-2026-09-05.md) 保留了断点来源和 Git 历史，描述的是修复前基线。
