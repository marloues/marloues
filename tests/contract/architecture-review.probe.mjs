/**
 * Architecture review probes for baseline edebdae (2026-09-05).
 * Run manually: node tests/contract/architecture-review.probe.mjs
 *
 * Historical evidence only: source is read from the pinned git revision,
 * never from the modified working tree. These assert OBSERVED DEFECTS and
 * are excluded from npm test/verify. Correctness regressions live in unit tests.
 *
 * TypeScript AST extraction executes actual source functions/classes with
 * in-memory dependencies. No app launch, network, user data writes or deletion.
 * This isolates boundary behavior; it is not a substitute for Electron E2E.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = createRequire(join(root, "client/package.json"))("typescript");
const findings = [];
const baseline = "edebdae45ce19f787125584750e636f56ecb30d3";

function evaluate(file, { names, expose = [], globals = {}, mocks = {} } = {}) {
  const source = execFileSync("git", ["show", `${baseline}:${file}`], { cwd: root, encoding: "utf8" });
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const selected = names
    ? ast.statements
        .filter((node) => {
          if (node.name && names.includes(node.name.text)) return true;
          return (
            ts.isVariableStatement(node) &&
            node.declarationList.declarations.some((declaration) =>
              names.includes(declaration.name.getText(ast)),
            )
          );
        })
        .map((node) => node.getText(ast))
        .join("\n")
    : source;
  const { outputText, diagnostics } = ts.transpileModule(selected, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  assert.equal(diagnostics?.length ?? 0, 0, `Transpilation failed: ${file}`);
  const module = { exports: {} };
  runInNewContext(
    `${outputText}\nObject.assign(module.exports, {${expose.join(",")}});`,
    {
      module,
      exports: module.exports,
      require: (id) => {
        assert.ok(
          Object.hasOwn(mocks, id),
          `Unexpected dependency ${id} in ${file}`,
        );
        return mocks[id];
      },
      structuredClone,
      ...globals,
    },
    { filename: file },
  );
  return module.exports;
}

// F1: cache-style trimming removes durable sessions, including pinned ones.
const metadata = new Map();
let disk = "";
const { SimpleStore } = evaluate("client/main/store.ts", {
  names: ["defaults", "SimpleStore"],
  expose: ["SimpleStore"],
  globals: {
    getStoreUserDataPath: () => "/virtual",
    join,
    existsSync: () => Boolean(disk),
    mkdirSync: () => {},
    readFileSync: () => disk,
    writeFileSync: (_path, content) => {
      disk = content;
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    logInfo: () => {},
    logError: () => {},
    upsertSessionRecord: (record) => metadata.set(record.id, record),
  },
});
const legacyStore = new SimpleStore();
for (let i = 0; i < 51; i += 1) {
  legacyStore.saveSession({
    id: `s${i}`,
    title: `Session ${i}`,
    updatedAt: i,
    pinned: i === 0,
    messages: [{ id: `u${i}`, timestamp: i, content: "history", items: [] }],
  });
}
legacyStore.saveSync();
assert.equal(legacyStore.getSessions().length, 50);
assert.equal(new SimpleStore().getSession("s0"), undefined);
assert.equal(metadata.size, 51);
findings.push({
  id: "F1",
  observed:
    "51 saves -> 50 JSON sessions; pinned s0 absent after reload; 51 metadata records",
});

// F3: a started receipt is treated as successful task completion.
let finishStatus;
const { executeScheduledTask } = evaluate("client/main/ipc/handlers.ts", {
  names: ["executeScheduledTask"],
  expose: ["executeScheduledTask"],
  globals: {
    ensureScheduledSession: () => "scheduled-session",
    startScheduledTaskRun: () => ({ id: "run-1", status: "running" }),
    sendScheduleChanged: () => {},
    sendChatTurn: async () => ({ status: "started", turnId: "still-running" }),
    finishScheduledTaskRun: (_id, status) => {
      finishStatus = status;
      return { status };
    },
    getScheduledTask: () => null,
    markScheduledTaskAfterRun: (task) => task,
  },
});
await executeScheduledTask({
  id: "task",
  instruction: "work",
  workspacePath: "/virtual",
});
assert.equal(finishStatus, "success");
findings.push({
  id: "F3a",
  observed:
    "started receipt, without any completion event -> scheduled run success",
});

const { sendChatTurn } = evaluate("client/main/ipc/handlers.ts", {
  names: ["sendChatTurn"],
  expose: ["sendChatTurn"],
  globals: { getRuntime: () => ({}), getMainWindow: () => null },
});
const receipt = await sendChatTurn({
  sessionId: "headless",
  text: "work",
  clientMessageId: "u1",
});
assert.equal(receipt.reason, "no_window");
findings.push({
  id: "F3b",
  observed: "available runtime + no window -> send rejected with no_window",
});

// F2: the real gateway route callback re-reads global settings and ignores the
// incoming model. Provider resolution is a deterministic in-memory dependency.
function resolvedProvider(settings) {
  const provider = settings.providers.find(
    (item) => item.id === settings.defaultModel.providerId,
  );
  return {
    provider,
    model: settings.defaultModel.modelId,
    apiKey: provider.apiKey,
  };
}
const routing = evaluate("client/main/core/config/provider-routing.ts", {
  mocks: {
    "./builtin-provider-catalog": { builtinProviderEndpoints: () => [] },
    "./model-provider": { resolveModelProvider: resolvedProvider },
  },
});
function settingsFor(id) {
  return {
    defaultModel: { providerId: id, modelId: `model-${id}` },
    providers: [
      {
        id,
        name: id,
        kind: "custom",
        enabled: true,
        apiKey: `fake-${id}`,
        models: [{ id: `model-${id}`, enabled: true }],
        endpoints: [
          {
            id: "chat",
            protocol: "openai-chat",
            enabled: true,
            baseUrl: `https://${id}.invalid`,
            priority: 1,
          },
        ],
      },
    ],
  };
}
let globalSettings = settingsFor("a");
let gatewayConfig;
const gateway = evaluate("client/main/gateway/index.ts", {
  names: [
    "startGatewayServer",
    "gatewayConnection",
    "gatewayStarted",
    "gatewayPort",
    "gatewayToken",
  ],
  expose: ["startGatewayServer"],
  globals: {
    getAgentSettings: () => globalSettings,
    resolveModelProvider: resolvedProvider,
    resolveRuntimeProviderRoutes: routing.resolveRuntimeProviderRoutes,
    configurePipeline: () => {},
    randomBytes: () => ({ toString: () => "fake-token" }),
    startServer: async (config) => {
      gatewayConfig = config;
      return 1;
    },
    log: () => {},
  },
});
await gateway.startGatewayServer();
assert.equal(
  gatewayConfig.resolveRoute("anthropic", "model-a")[0].targetProvider,
  "a",
);
globalSettings = settingsFor("b");
const rerouted = gatewayConfig.resolveRoute("anthropic", "model-a")[0];
assert.equal(rerouted.targetProvider, "b");
assert.equal(rerouted.targetModel, "model-b");
findings.push({
  id: "F2",
  observed:
    "in-flight model-a request after global switch -> provider b / model-b",
});

const serializer = evaluate(
  "client/main/core/runtime/read-thread-serializer.ts",
  {
    mocks: {
      "../../../shared/workflow-read-thread-contract": {
        WORKFLOW_READ_THREAD_SCHEMA_VERSION: 2,
      },
    },
  },
);
const { workflowThreadStore } = evaluate(
  "client/main/core/runtime/workflow-thread-store.ts",
  {
    mocks: {
      "./read-thread-serializer": serializer,
      "../context/token-economy": { compressToolResult: (value) => value },
    },
  },
);

// F5: persisted failure is reconstructed as a completed turn.
workflowThreadStore.rehydrateFromStoredMessages("failed-session", [
  { id: "u", role: "user", content: "work", timestamp: 1, items: [] },
  {
    id: "a",
    role: "assistant",
    content: "provider failed",
    status: "failed",
    timestamp: 2,
    items: [],
  },
]);
const rehydrated = workflowThreadStore.readThread({
  threadId: "failed-session",
}).turns[0];
assert.equal(rehydrated.status, "completed");
assert.equal(rehydrated.error, null);
findings.push({
  id: "F5",
  observed:
    "stored assistant status=failed + error text -> rehydrated status=completed, error=null",
});

// F6: run the actual renderer slice, IPC read helper, store and serializer.
const messages = [];
for (let i = 0; i < 101; i += 1) {
  messages.push({
    id: `u${i}`,
    role: "user",
    content: `question ${i}`,
    timestamp: i * 2,
    items: [],
  });
  messages.push({
    id: `a${i}`,
    role: "assistant",
    content: `answer ${i}`,
    timestamp: i * 2 + 1,
    items: [],
  });
}
workflowThreadStore.rehydrateFromStoredMessages("long-session", messages);
const runtimeReads = [];
const { readRuntimeThreadSnapshot } = evaluate("client/main/ipc/handlers.ts", {
  names: ["readRuntimeThreadSnapshot"],
  expose: ["readRuntimeThreadSnapshot"],
  globals: {
    getRuntime: () => ({
      readThread: (input) => {
        runtimeReads.push(input);
        return workflowThreadStore.readThread(input);
      },
    }),
    store: { getSession: () => undefined },
    workflowThreadStore,
    sanitizeReadThreadForRenderer: (snapshot) => snapshot,
  },
});
let state = {};
const { createReadThreadSlice } = evaluate(
  "client/renderer/src/stores/chat-slices/readthread-slice.ts",
  {
    mocks: {
      "../workflow-message-builders": { activeWorkflowMessages: () => [] },
      "@shared/adapters/workflow-messages-to-read-thread": {},
      "./helpers": {
        reconcileReadThreadSnapshot: (value, snapshot) => ({
          readThreads: { ...value.readThreads, [snapshot.thread.id]: snapshot },
        }),
      },
    },
    globals: {
      window: { marloues: { chat: { readThread: readRuntimeThreadSnapshot } } },
      console,
    },
  },
);
state = createReadThreadSlice(
  (update) => {
    state = {
      ...state,
      ...(typeof update === "function" ? update(state) : update),
    };
  },
  () => state,
);
await state.loadReadThread("long-session");
await state.loadMoreReadThread("long-session");
await state.loadMoreReadThread("long-session");
assert.equal(state.readThreads["long-session"].turns.length, 100);
assert.equal(state.readThreadPaging["long-session"].hasMore, true);
assert.equal(runtimeReads.length, 3);
assert.ok(runtimeReads.every((input) => input.cursor === undefined));
assert.equal(
  workflowThreadStore.readThread({
    threadId: "long-session",
    cursor: "100",
    limit: 100,
  }).turns.length,
  1,
);
findings.push({
  id: "F6",
  observed:
    "101 turns; repeated loadMore yields 100 with hasMore=true; every runtime request omits cursor",
});

// R1: execute the real dispatch function; JSX children are boundary sentinels.
// This checks element selection/props, not DOM, layout, hooks or visual fidelity.
const jsx = (type, props) => ({ type, props });
const jsxMocks = { "react/jsx-runtime": { jsx, jsxs: jsx } };
const { MessageItemView } = evaluate(
  "client/renderer/src/components/workflow-chat/message-view.tsx",
  {
    names: ["MessageItemView", "itemFailed", "itemRunning", "itemName"],
    mocks: jsxMocks,
    globals: {
      memo: (component) => component,
      WorkflowMarkdownContent: "markdown",
      MessageThinkRow: "reasoning",
      MessageToolRow: "tool",
      MessageIoCard: "io",
      ToolDetail: "tool-detail",
      itemInputText: () => "input",
      itemOutputText: () => "output",
    },
  },
);
const { WORKFLOW_CANONICAL_TURN_ITEM_TYPES } = evaluate(
  "client/shared/workflow-read-thread-contract.ts",
  { names: ["WORKFLOW_CANONICAL_TURN_ITEM_TYPES"] },
);
const itemTypes = [...WORKFLOW_CANONICAL_TURN_ITEM_TYPES, "unknown"];
const missingTypes = itemTypes.filter((type) => {
  // The user prompt is handled separately by WorkflowUserMessage in TurnView.
  if (type === "userMessage") return false;
  return (
    MessageItemView({
      item: {
        type,
        id: type,
        text: "answer",
        summary: "reasoning",
        tool: "tool",
        status: "completed",
        changes: [],
      },
    }) === null
  );
});
assert.equal(itemTypes.length, 18);
assert.deepEqual(missingTypes, [
  "plan",
  "collabAgentToolCall",
  "imageView",
  "imageGeneration",
  "enteredReviewMode",
  "exitedReviewMode",
  "hookPrompt",
  "permissionRequest",
  "contextCompaction",
  "unknown",
]);
findings.push({
  id: "R1",
  observed: "10 assistant-side types return null in the active item renderer",
  missingTypes,
});

// R2: an explicit final answer followed by commentary is summarized/copied wrong.
const { WorkflowTurnView } = evaluate(
  "client/renderer/src/components/workflow-chat/turns/TurnView.tsx",
  {
    names: ["LIVE_TURN_ITEM_WINDOW", "WorkflowTurnView"],
    mocks: jsxMocks,
    globals: {
      memo: (component) => component,
      WorkflowUserMessage: "user",
      AssistantTurnHeader: "header",
      WorkflowTurnFooterView: "footer",
      WorkflowMarkdownContent: "markdown",
      MessageItemView: "item",
      MessageStatusRow: "status",
      workflowTurnStatusLabel: () => "completed",
      workflowTurnStatusTone: () => "normal",
      workflowTurnDurationLabel: () => "1s",
    },
  },
);
const turnElements = WorkflowTurnView({
  message: {
    id: "semantic-turn",
    user: "request",
    status: "completed",
    activity: "done",
    items: [
      {
        type: "agentMessage",
        id: "comment-1",
        phase: "commentary",
        text: "progress",
      },
      {
        type: "agentMessage",
        id: "final",
        phase: "final_answer",
        text: "final answer",
      },
      {
        type: "agentMessage",
        id: "comment-2",
        phase: "commentary",
        text: "later progress",
      },
    ],
  },
  expanded: false,
  isLastStreaming: false,
  onToggle: () => {},
});
function findElement(node, type) {
  if (!node || typeof node !== "object") return undefined;
  if (node.type === type) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findElement(child, type);
    if (match) return match;
  }
  return undefined;
}
const summaryText = findElement(turnElements, "markdown").props.content;
const copyText = findElement(turnElements, "footer").props.finalText;
assert.equal(summaryText, "later progress");
assert.equal(copyText, "progress\n\nfinal answer\n\nlater progress");
findings.push({
  id: "R2",
  observed:
    "explicit final_answer is ignored by collapsed summary and footer copy",
  summaryText,
  copyText,
});

// R3: native message semantics are retained only in rawItem, lost from UI phase.
const { normalizeCodexItem } = evaluate("client/main/codex/normalize.ts");
const { messageItemToWorkflowTurnItem } = evaluate(
  "client/shared/adapters/message-item-to-workflow-turn-item.ts",
);
const normalizedFinal = normalizeCodexItem(
  { type: "agentMessage", id: "final", text: "answer", phase: "final_answer" },
  {},
  "completed",
);
const canonicalFinal = messageItemToWorkflowTurnItem(normalizedFinal);
assert.equal(normalizedFinal.rawItem.phase, "final_answer");
assert.equal(canonicalFinal.phase, "completed");
assert.equal(canonicalFinal.settled, true);
findings.push({
  id: "R3",
  observed: "native final_answer -> canonical phase=completed; settled=true",
  canonicalFinal,
});

console.log(
  JSON.stringify(
    { baseline: "edebdae", probeCount: findings.length, findings },
    null,
    2,
  ),
);
