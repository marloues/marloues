import { describe, expect, it, vi } from "vitest";
import type { AgentSettings } from "../../../../../client/shared/types";

const mocks = vi.hoisted(() => ({
  startTurn: vi.fn(),
  applyRuntimeEvent: vi.fn(),
}));

vi.mock("../../../../../client/main/services/extension-plan-service", () => ({
  resolveEffectiveExtensionPlan: vi.fn(() => ({
    runtimeId: "self-built",
    workspace: null,
    skills: [],
    mcpServers: [],
    skillStates: [],
    fingerprint: "integration-plan",
  })),
}));
vi.mock("../../../../../client/main/services/config-service", () => ({
  getAgentSettings: vi.fn(() => ({})),
}));
vi.mock("../../../../../client/main/core/runtime/mcp-tools", () => ({
  configuredMcpTools: vi.fn(() => []),
}));
vi.mock(
  "../../../../../client/main/core/runtime/workflow-thread-store",
  () => ({
    workflowThreadStore: {
      startTurn: mocks.startTurn,
      applyRuntimeEvent: mocks.applyRuntimeEvent,
      ensureThread: vi.fn(),
      deleteThread: vi.fn(),
      clearThread: vi.fn(),
      cloneThread: vi.fn(),
      truncateFromUserMessage: vi.fn(),
      readThread: vi.fn(),
      subscribeThread: vi.fn(),
    },
  }),
);
vi.mock("../../../../../client/main/services/terminal-service", () => ({
  terminalService: {},
}));
vi.mock("../../../../../client/main/services/cdp-browser-service", () => ({
  cdpBrowserService: {},
}));

import { SelfBuiltRuntime } from "../../../../../client/main/core/runtime/self-built-runtime";

describe("SelfBuiltRuntime canonical input integration", () => {
  it("uses the semantic projection for the actual response and token input", async () => {
    const runtime = new SelfBuiltRuntime();
    const userContent = [
      { type: "text" as const, text: "Explain the inputs" },
      {
        type: "file" as const,
        name: "facts.txt",
        mimeType: "text/plain",
        text: "CANONICAL FILE CONTENT",
        size: 22,
      },
      {
        type: "url" as const,
        url: "https://example.com/facts",
      },
      {
        type: "image" as const,
        url: "data:image/png;base64,aW1hZ2U=",
        name: "facts.png",
        mimeType: "image/png",
        size: 5,
      },
    ];
    const stream = await runtime.sendMessage({
      threadId: "self-built-input-integration",
      turnId: "turn-1",
      content: "[STATE PACK]\n\nExplain the inputs",
      displayContent: "Explain the inputs",
      userContent,
      settingsSnapshot: {} as AgentSettings,
    });

    let assistantText = "";
    let thinkingText = "";
    let usageInputTokens = 0;
    for await (const event of stream) {
      if (event.kind === "text-chunk") assistantText += event.payload.content;
      if (event.kind === "thinking-chunk")
        thinkingText += event.payload.content;
      if (event.kind === "token-usage")
        usageInputTokens = event.payload.usage.inputTokens ?? 0;
    }

    expect(assistantText).toContain("[STATE PACK]");
    expect(assistantText).toContain("CANONICAL FILE CONTENT");
    expect(assistantText).toContain("https://example.com/facts");
    expect(assistantText).toContain("has no pixel-understanding model");
    expect(assistantText).not.toContain("data:image/png;base64,aW1hZ2U=");
    expect(thinkingText).toContain("file:exact");
    expect(thinkingText).toContain("url:exact");
    expect(thinkingText).toContain("image:degraded");
    expect(usageInputTokens).toBeGreaterThan(10);
    expect(mocks.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: userContent }),
    );
  });
});
