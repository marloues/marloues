import { describe, expect, it, vi } from "vitest";
import type { AgentSettings } from "@shared/types";
import type { RuntimeEvent } from "@shared/agent-runtime";

const mocks = vi.hoisted(() => ({
  queryClaude: vi.fn(),
  workflowThreadStore: {
    startTurn: vi.fn(),
    applyRuntimeEvent: vi.fn(),
  },
}));

vi.mock("../../../../../client/main/core/sdk/claude-sdk", () => ({
  queryClaude: mocks.queryClaude,
}));
vi.mock("../../../../../client/main/services/config-service", () => ({
  getAgentSettings: vi.fn(),
  saveAgentSettings: vi.fn(),
  buildSdkEnv: vi.fn(() => ({})),
}));
vi.mock("../../../../../client/main/services/mcp-service", () => ({
  recordMcpRuntimeStatus: vi.fn(),
}));
vi.mock("../../../../../client/main/services/extension-plan-service", () => ({
  resolveEffectiveExtensionPlan: vi.fn(() => ({
    runtimeId: "sdk",
    workspace: null,
    skills: [],
    mcpServers: [],
    skillStates: [],
    fingerprint: "test-plan",
  })),
  claudePluginPaths: vi.fn(() => []),
}));
vi.mock("../../../../../client/main/core/context/context-policy", () => ({
  evaluateContextPolicy: vi.fn(),
}));
vi.mock("../../../../../client/main/core/config/model-provider", () => ({
  resolveModelProvider: vi.fn(() => ({
    provider: {
      id: "test",
      name: "Test",
      kind: "custom",
      enabled: true,
      apiKey: "test-key",
      endpoints: [
        {
          id: "test-anthropic",
          protocol: "anthropic",
          baseUrl: "https://models.example.test",
          enabled: true,
          priority: 10,
        },
      ],
      models: [{ id: "test-model", label: "Test", enabled: true }],
    },
    selection: { providerId: "test", modelId: "test-model" },
    model: "test-model",
    apiKey: "test-key",
  })),
}));
vi.mock("../../../../../client/main/core/config/options-builder", () => ({
  buildClaudeRuntimeOptions: vi.fn(() => ({})),
}));
vi.mock("../../../../../client/main/core/runtime/mcp-tools", () => ({
  configuredMcpTools: vi.fn(() => []),
}));
vi.mock("../../../../../client/main/core/runtime/runtime-models", () => ({
  configuredRuntimeModels: vi.fn(() => []),
}));
vi.mock(
  "../../../../../client/main/core/runtime/workflow-thread-store",
  () => ({
    workflowThreadStore: mocks.workflowThreadStore,
  }),
);
vi.mock(
  "../../../../../client/main/core/permissions/tool-permission-engine",
  () => ({
    evaluateToolPermission: vi.fn(),
  }),
);
vi.mock("../../../../../client/main/core/runtime/tool-storm-breaker", () => ({
  ToolStormBreaker: class {
    resetTurn = vi.fn();
    check = vi.fn(() => ({ action: "allow" as const }));
  },
}));
vi.mock("../../../../../client/main/core/logging/app-logger", () => ({
  logInfo: vi.fn(),
  logQuiet: vi.fn(),
  logWarn: vi.fn(),
}));
vi.mock("../../../../../client/main/gateway", () => ({
  startGateway: vi.fn(async () => ({
    port: 45678,
    baseUrl: "http://127.0.0.1:45678",
    token: "gateway-token",
  })),
  stopGateway: vi.fn(),
  isGatewayStarted: vi.fn(() => false),
  getGatewayPort: vi.fn(() => 0),
}));
vi.mock("../../../../../client/main/core/runtime/steer-queue", () => ({
  SteerQueue: class {
    flushNextAtBoundary = vi.fn(() => false);
    setInputProjectionContext = vi.fn();
    clearInputProjectionContext = vi.fn();
  },
}));
vi.mock("../../../../../client/main/core/runtime/message-channel", () => ({
  createMessageChannel: vi.fn(() => ({
    enqueue: vi.fn(),
    close: vi.fn(),
    isClosed: () => false,
    generator: (async function* () {})(),
  })),
}));
vi.mock("../../../../../client/main/core/runtime/sdk-content", () => ({
  buildSdkUserContent: vi.fn(() => [{ type: "text", text: "hi" }]),
}));
vi.mock("../../../../../client/main/core/runtime/turn-state", () => ({
  RuntimeEventQueue: class {
    push = vi.fn();
    next = vi.fn(() => new Promise<RuntimeEvent>(() => {}));
    *drainSync() {}
  },
  createTurnLifetime: vi.fn(() => ({
    finished: Promise.resolve(),
    finish: vi.fn(),
  })),
}));
vi.mock("../../../../../client/main/services/outbox-service", () => ({
  recoverApplyingOutbox: vi.fn(),
}));

import {
  ClaudeRuntime,
  normalizeSdkMessage,
} from "../../../../../client/main/core/runtime/claude-runtime";

function settings(): AgentSettings {
  return {
    providers: [],
    defaultModel: { providerId: "test", modelId: "test-model" },
    maxTurns: 1,
    workMode: "code",
    permissionMode: "default",
    thinkingEnabled: false,
    maxThinkingTokens: 0,
  } as unknown as AgentSettings;
}

describe("ClaudeRuntime context usage", () => {
  it("does not reopen a fast tool error when the SDK echoes its assistant block", () => {
    const session = "late-tool-echo";
    const turn = "late-tool-turn";
    const block = {
      type: "tool_use",
      id: "glob",
      name: "Glob",
      input: { pattern: "**/*.ts" },
    };
    normalizeSdkMessage(session, turn, {
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: block },
    });
    const completion = normalizeSdkMessage(session, turn, {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "glob",
            is_error: true,
            content: "No such tool available: Glob",
          },
        ],
      },
    });
    expect(completion).toContainEqual({
      kind: "tool-complete",
      payload: {
        turnId: turn,
        toolId: "glob",
        isError: true,
        output: "No such tool available: Glob",
      },
    });
    expect(
      normalizeSdkMessage(session, turn, {
        type: "assistant",
        message: { content: [block] },
      }),
    ).toEqual([]);
    expect(
      normalizeSdkMessage(session, turn, {
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      }),
    ).toEqual([]);
    // Scope the guard to this invocation, not the tool's name or other turns.
    expect(
      normalizeSdkMessage(session, turn, {
        type: "assistant",
        message: { content: [{ ...block, id: "retry" }] },
      })[0]?.kind,
    ).toBe("tool-start");
    normalizeSdkMessage(session, turn, { type: "result", subtype: "success" });
  });

  it.each(["result", "throw"])(
    "keeps a user stop cancelled when the SDK ends with an error %s",
    async (ending) => {
      const nativeSessionId = "985c6dad-c171-45e5-bd8a-d2528f3cfa94";
      mocks.queryClaude.mockResolvedValueOnce({
        interrupt: vi.fn(async () => undefined),
        close: vi.fn(),
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: "system",
            subtype: "init",
            session_id: nativeSessionId,
          };
          yield {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "Reading files" },
            },
          };
          if (ending === "throw") throw new Error("query interrupted");
          yield {
            type: "result",
            subtype: "error_during_execution",
            is_error: true,
            session_id: nativeSessionId,
            errors: [
              "[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use",
            ],
          };
        },
      });
      const runtime = new ClaudeRuntime();
      const events: RuntimeEvent[] = [];
      for await (const event of await runtime.sendMessage({
        threadId: `stop-${ending}`,
        turnId: "stop-turn",
        content: "inspect",
        settingsSnapshot: settings(),
      })) {
        events.push(event);
        if (event.kind === "text-chunk")
          await runtime.interruptTurn("stop-turn");
      }
      expect(events.some((event) => event.kind === "error")).toBe(false);
      expect(events).toContainEqual(
        expect.objectContaining({
          kind: "turn-complete",
          payload: expect.objectContaining({
            result: "aborted",
            final: true,
            sdkSessionId: nativeSessionId,
          }),
        }),
      );
    },
  );
  it("marks streamed tool input as pending until its argument block closes", () => {
    const start = normalizeSdkMessage("pending-input", "turn", {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "bash",
          name: "Bash",
          input: {},
        },
      },
    });
    const delta = normalizeSdkMessage("pending-input", "turn", {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"command":"pwd"}' },
      },
    });
    const stop = normalizeSdkMessage("pending-input", "turn", {
      type: "stream_event",
      event: { type: "content_block_stop", index: 0 },
    });
    expect(start[0]).toMatchObject({ payload: { isReady: false } });
    expect(delta[0]).toMatchObject({ payload: { isReady: false } });
    expect(stop[0]).toMatchObject({
      payload: { isReady: true, input: { command: "pwd" } },
    });
  });
  it("finalizes the workflow turn when the SDK fails before streaming starts", async () => {
    mocks.queryClaude.mockRejectedValueOnce(
      new Error("Claude executable is missing"),
    );

    const runtime = new ClaudeRuntime();

    await expect(
      runtime.sendMessage({
        threadId: "thread-startup-failure",
        turnId: "turn-startup-failure",
        content: "hi",
        settingsSnapshot: settings(),
      }),
    ).rejects.toThrow("Claude executable is missing");

    expect(mocks.workflowThreadStore.applyRuntimeEvent).toHaveBeenCalledWith(
      "thread-startup-failure",
      "turn-startup-failure",
      expect.objectContaining({
        kind: "error",
        payload: expect.objectContaining({
          code: "SDK_STARTUP_ERROR",
          message: "Claude executable is missing",
        }),
      }),
    );
    expect(mocks.workflowThreadStore.applyRuntimeEvent).toHaveBeenCalledWith(
      "thread-startup-failure",
      "turn-startup-failure",
      {
        kind: "turn-complete",
        payload: {
          turnId: "turn-startup-failure",
          result: "error",
          error: "Claude executable is missing",
        },
      },
    );
  });

  it("preserves the native session ID after a real max-turns result so the next request can resume", async () => {
    const nativeSessionId = "bc115220-6dd2-4d5a-bb44-7d4bbfa2c76a";
    mocks.queryClaude.mockResolvedValueOnce({
      close: vi.fn(),
      [Symbol.asyncIterator]: async function* () {
        yield {
          type: "result",
          subtype: "error_max_turns",
          is_error: true,
          session_id: nativeSessionId,
        };
      },
    });
    const runtime = new ClaudeRuntime();
    const events: RuntimeEvent[] = [];
    for await (const event of await runtime.sendMessage({
      threadId: "max-turns-resume",
      turnId: "first",
      content: "inspect",
      settingsSnapshot: settings(),
    }))
      events.push(event);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "turn-complete",
        payload: expect.objectContaining({
          result: "error",
          sdkSessionId: nativeSessionId,
        }),
      }),
    );
    mocks.queryClaude.mockResolvedValueOnce({
      close: vi.fn(),
      [Symbol.asyncIterator]: async function* () {
        yield {
          type: "result",
          subtype: "success",
          session_id: nativeSessionId,
        };
      },
    });
    for await (const event of await runtime.sendMessage({
      threadId: "max-turns-resume",
      turnId: "second",
      content: "continue",
      runtimeThreadId: nativeSessionId,
      settingsSnapshot: settings(),
    }))
      void event;
    expect(mocks.queryClaude).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ resume: nativeSessionId }),
    );
  });

  it("does not block streaming while the turn-end context probe is pending", async () => {
    let resolveContextUsage!: (value: unknown) => void;
    const getContextUsage = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveContextUsage = resolve;
        }),
    );
    const query = {
      getContextUsage,
      close: vi.fn(),
      [Symbol.asyncIterator]: async function* () {
        yield {
          type: "system",
          subtype: "init",
          session_id: "sdk-session",
        };
        yield {
          type: "stream_event",
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "hi" },
          },
        };
        yield {
          type: "result",
          subtype: "success",
          result: "success",
          session_id: "sdk-session",
        };
      },
    };
    mocks.queryClaude.mockResolvedValueOnce(query);

    const runtime = new ClaudeRuntime();
    const deferredEvents: RuntimeEvent[] = [];
    runtime.forwardDeferredEvent = (event) => deferredEvents.push(event);

    const stream = await runtime.sendMessage({
      threadId: "thread",
      turnId: "turn",
      content: "hi",
      settingsSnapshot: settings(),
    });
    const events: RuntimeEvent[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "text-chunk" }),
        expect.objectContaining({ kind: "turn-complete" }),
      ]),
    );
    expect(events.some((event) => event.kind === "context-usage")).toBe(false);
    expect(getContextUsage).toHaveBeenCalledTimes(1);

    resolveContextUsage({ totalTokens: 120, maxTokens: 1000 });
    await vi.waitFor(() => expect(deferredEvents).toHaveLength(1));
    expect(runtime.forwardDeferredEvent).toBeUndefined();
    expect(deferredEvents[0]).toMatchObject({
      kind: "context-usage",
      payload: { phase: "turn_end", turnId: "turn" },
    });
  });
});
