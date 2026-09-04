# Runtime Ports & Kits — 可插拔架构设计稿

> 状态：**草案，待评审**。评审通过后再动代码。
> 北极星：让 marloues 的 shell 成为 runtime-正交的固定资产——任何 runtime 可拔、自建 runtime 可零影响接入。

## 0. 北极星与成功测试

**北极星**：marloues 的 shell（renderer + IPC + workflow + config + security 基建 + `client/shared/`）对任何具体 runtime / 第三方 agent SDK **零依赖**。runtime 是可拆插件。将来做自建 runtime 时，拔掉 Pi/Claude/Codex 而 shell 改 0 个共享文件。

**成功测试（唯一验收标准）**：

```bash
rm -rf client/main/core/runtime/kits/{claude,codex,pi}
npm uninstall @anthropic-ai/claude-agent-sdk @openai/codex @earendil-works/pi-coding-agent
# 删掉 manager.ts 里对应注册行
# 预期：tsc 通过，app 用唯一自建 kit 仍编译运行
```

达不到这条，"可插拔"就是名义的。

## 1. 现状盘点

### 1.1 已有的 port（`client/shared/`，底子是有的）

| 文件 | 角色 | 现状 |
| --- | --- | --- |
| `agent-runtime.ts` | `AgentRuntime` SPI（引擎伞形） | ✅ 已全接通 IPC |
| `agent-backend-adapter.ts` | 线程后端 port | 与 `AgentRuntime` 线程方法重叠，待合并 |
| `workflow-thread-data-source.ts` | read-thread/subscribe port | ✅ |
| `workflow-read-thread-contract.ts` | read-thread 响应契约 | ✅ |
| `ui-protocol.ts` | UIEvent 契约 | ✅ |
| `security-policy.ts` | 安全策略 | ✅ |
| `adapters/*` | 共享投影（runtime-event→turn-item 等） | ✅ |
| `types.ts` | `RuntimeKind`/`RuntimeCapabilities`/`RuntimeDescriptor` | ✅ |

### 1.2 阻塞"拔掉"的硬耦合（已验证）

`client/shared/` 与 runtime 共享目录硬 import 第三方 SDK：

- `runtime/sdk-command-sandbox.ts` / `sdk-browser-mcp.ts` / `sdk-terminal-mcp.ts` → `@anthropic-ai/claude-agent-sdk`
- `core/sdk/claude-sdk.ts` → `@anthropic-ai/claude-agent-sdk`
- `core/config/options-builder.ts` → 拼 Claude-SDK 平台包名
- `client/main/codex/` 整个子系统 → `@openai/codex`（散在顶层，不在 kit）
- `runtime/steer-queue.ts` → import `claude-runtime-utils`（共享基建依赖 claude 命名文件）

身份分叉：

- `ipc/handlers.ts`：`runtimeId === "sdk"` 特判 runtimeThreadId
- `core/security/security-host.ts:579`：`if (runtimeId === "binary")` 特判

死代码：`runtime/claude-normalizer.ts`（零引用）。

## 2. 目标 port 集（共享接口，签名 runtime-中立）

Shell 直面一个伞形 + 五个子 port；**MessageAdapter 不入共享 port**（见 §3）。

### 2.1 `AgentRuntime`（伞形，shell 主入口，保持现有签名）

```ts
// client/shared/agent-runtime.ts —— 已存在，保持
interface AgentRuntime {
  readonly name: string;
  readonly capabilities: RuntimeCapabilities;        // 现 8 项布尔
  initialize(): Promise<void>;
  destroy(): Promise<void>;
  sendMessage(opts: SendMessageOpts): Promise<RuntimeEventStream>; // 核心事件流出口
  respondApproval(requestId, approved, scope, reason?): void;
  listTools(): Promise<ToolDefinition[]>;
  // 可选方法委托给子 port（见 2.2）
}
```

### 2.2 子 port（kit 内部组合；shell 少数场景直连，如 ModelAdapter 给 picker）

```ts
ModelAdapter     getAvailableModels(): Promise<ModelOption[]>
                 setModel?(modelId): Promise<void>
                 resolveBackend?(settings): BackendConfig   // 统一配置源

SteerAdapter     steerTurn?(opts): Promise<ChatSendReceipt>
                 interruptTurn?(turnId): Promise<void>
                 applyPendingSteerNow?/cancelSteerMessage?/reorderSteers?/getOutboxSnapshots?

SessionAdapter   listThreads/createThread/deleteThread/clearThread/forkThread?/truncateThread?
                 readThread?(input)/subscribeThread?(input)   // 合并 agent-backend-adapter + workflow-thread-data-source

PermissionAdapter setPermissionMode?(mode)
                 requestApproval/issuePermit   // 按 security-profile 分叉，不按 runtimeId

ToolAdapter      registerTool?/cancelTool?(id)
```

**硬规则**：所有签名只用 `client/shared/` 类型（`RuntimeEvent`/`Thread`/`ModelOption`/`ToolDefinition`…），**禁止任何 SDK 类型**（`AgentSessionEvent`/`SDKMessage`/`ThreadEvent`）出现在这些接口里——否则反向耦合，违背"无 SDK 可实现"。

### 2.3 MessageAdapter —— kit 内部模式，非共享 port

每个 kit 自己把引擎原生事件翻译成 `RuntimeEvent[]`：

| kit | 输入（引擎原生） | 输出 | 文件 |
| --- | --- | --- | --- |
| pi | `AgentSessionEvent` | `RuntimeEvent[]` | `kits/pi/message-adapter.ts` |
| claude | `SDKMessage` | `RuntimeEvent[]` | `kits/claude/message-adapter.ts`（现 `normalizeSdkMessage`） |
| codex | `ThreadEvent` | `RuntimeEvent[]` | `kits/codex/message-adapter.ts`（现 `convertThreadEvent`） |
| self-built | — | 直接产 `RuntimeEvent` | — |

理由：输入类型引擎专属，进共享契约就反向耦合。输出统一到 `RuntimeEvent`（共享契约），shell 只消费输出。

## 3. kit 结构

```
client/main/core/runtime/kits/<kind>/
  descriptor.ts        // 自描述符：id/name/capabilities/presentation（供注册表读）
  runtime.ts           // AgentRuntime facade：组合下列 adapter，跑 sendMessage
  message-adapter.ts   // native → RuntimeEvent[]（kit 私有）
  tool-adapter.ts
  model-adapter.ts
  session-adapter.ts
  permission-adapter.ts
  steer-adapter.ts
  index.ts             // export createKit(): { runtime: AgentRuntime; descriptor: RuntimeDescriptor }
```

- `manager.ts`（**唯一 composition root**）按 kind 调 `createKit()`，是唯一 import 具体 kit 的文件。
- 共享基建（`workflow-thread-store`/`read-thread-serializer`/`steer-queue`/`security-host`/`sandbox-broker`/`runtime-event-adapter`）是 **port 的共享实现/工具**，kit 组合它们，不私有。
- `steer-queue.ts` 对 `claude-runtime-utils` 的依赖改名为中性 `runtime-utils.ts`。

## 4. 不变量（"事实可插拔"的守门规则）

1. **`shared/` 零 SDK import**：`import "@…sdk"` 只许出现在 `kits/<kind>/` 内。CI 加 lint 规则扫描违规。
2. **共享契约中立**：`RuntimeEvent`/`Thread`/`Message` 不带引擎专属字段/kind。引擎富事件（reasoning/memory/session-info）塌进通用 `detail?: unknown` 袋，或 renderer 当可选降级——**不新增引擎专属 union 成员**。
3. **renderer 全防御**：UI 只渲染到达的事件、按 `capabilities.*` 显隐动作，**绝不按 runtime 身份分叉**。
4. **composition root 隔离**：除 `manager.ts` 外，任何文件 import 具体 kit/SDK 即视为违规。
5. **无 SDK 可实现**：port 集必须能由一个纯自建 loop（零第三方 agent SDK，直接调模型 API）完整实现——这是 self-built-someday 的前提。

## 5. 待拍板：`RuntimeKind` 闭式联合 vs 开式注册表

| | 闭式联合 `"sdk"\|"binary"\|"pi"` | 开式数据驱动（`RuntimeKind=string` + descriptor） |
| --- | --- | --- |
| 增删 runtime | 改 `shared/types.ts`（算"对整体有影响"） | 零改共享文件 ✅ |
| 类型安全 | 强 ✅ | 弱（靠 descriptor 运行时校验） |
| 适合北极星 | 部分 | 完全 ✅ |

**建议**：开式注册表 + descriptor 自描述（`id`/`name`/`capabilities`/`presentation` 都由 kit 自己声明），`RuntimeKind` 退化为 `string`。类型安全用 zod 在注册时校验 descriptor 弥补。这是"真·零影响增删"的正路。

## 6. 迁移顺序（依赖驱动）

1. 定 port 集 + kit 目录骨架（Phase 1）
2. **封 shell**：把 5 处 SDK import 搬进对应 kit；`codex/` 折进 codex kit；删死代码（Phase 2）——**"拔掉"的硬前置**
3. 杀身份分叉 + renderer capability 驱动（Phase 3）
4. 契约中立化 + renderer 防御降级（Phase 4）
5. 开式注册表（Phase 5，含 §5 决策）
6. `pi/` kit 首个干净实现 + 删 self-built（Phase 6）
7. retrofit `claude`/`codex` kit + "拔掉"验证测试（Phase 7）

## 7. 评审问题

1. §2.2 子 port 划分（Model/Steer/Session/Permission/Tool）是否合理？有无该并/拆的？
2. §2.3 MessageAdapter 降为 kit 内部，可接受吗？（否则它进共享 port 会带引擎类型，反向耦合）
3. §5 闭式 vs 开式注册表，选哪个？（建议开式）
4. §6 顺序：先封 shell 再做 pi kit，还是先用 pi kit 当样板再封 shell？（建议先封 shell，否则 pi 也塞不干净）
