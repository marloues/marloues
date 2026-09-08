import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowUserMessageContent } from "@shared/workflow-read-thread-contract";

const mocks = vi.hoisted(() => ({
  buildSdkUserContent: vi.fn(),
  enqueueOutboxMessage: vi.fn(),
  updateOutboxState: vi.fn(),
  getTurnInput: vi.fn(),
  updateTurnInputState: vi.fn(),
}));

vi.mock("../../../../../client/main/core/runtime/sdk-content", () => ({
  buildSdkUserContent: mocks.buildSdkUserContent,
}));
vi.mock("../../../../../client/main/services/outbox-service", () => ({
  enqueueOutboxMessage: mocks.enqueueOutboxMessage,
  getOutboxMessage: vi.fn(() => null),
  listOutboxSnapshots: vi.fn(() => []),
  reorderOutboxMessages: vi.fn(() => []),
  updateOutboxState: mocks.updateOutboxState,
}));
vi.mock("../../../../../client/main/services/config-service", () => ({
  getAgentSettings: vi.fn(() => ({
    defaultModel: { providerId: "vision-provider", modelId: "vision-model" },
  })),
}));
vi.mock("../../../../../client/main/services/turn-input-store", () => ({
  getTurnInput: mocks.getTurnInput,
  updateTurnInputState: mocks.updateTurnInputState,
}));
vi.mock("../../../../../client/main/core/config/model-provider", () => ({
  resolveModelProvider: vi.fn(() => ({
    model: "vision-model",
    provider: {
      models: [{ id: "vision-model", supportsVision: true }],
    },
  })),
}));
vi.mock("../../../../../client/main/core/logging/app-logger", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import { SteerQueue } from "../../../../../client/main/core/runtime/steer-queue";

describe("SteerQueue SDK input projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildSdkUserContent.mockResolvedValue([
      { type: "text", text: "projected canonical steer" },
    ]);
    mocks.enqueueOutboxMessage.mockReturnValue({ created: true, record: {} });
    mocks.getTurnInput.mockReturnValue({ id: "canonical-input-1" });
  });

  it("uses the same canonical projector and stores its SDK payload", async () => {
    const enqueue = vi.fn();
    const canonical: WorkflowUserMessageContent[] = [
      { type: "text", text: "canonical steer" },
      {
        type: "file",
        name: "steer.txt",
        mimeType: "text/plain",
        text: "full steer file",
      },
      { type: "skill", name: "review" },
    ];
    const active = {
      turnId: "turn-1",
      channel: {
        enqueue,
        cancel: vi.fn(),
        generator: (async function* () {})(),
        close: vi.fn(),
        isClosed: () => false,
      },
      pendingSteers: [],
      canceled: false,
      acceptingSteers: true,
    } as never;
    const queue = new SteerQueue({
      getActiveTurn: () => active,
      pushMessage: vi.fn(),
    });
    const enabledSkills = [
      {
        id: "review",
        name: "review",
        path: "/trusted/skills/review",
        scope: "user" as const,
        enabled: true,
      },
    ];
    queue.setInputProjectionContext("thread-1", {
      supportsVision: true,
      enabledSkills,
    });
    const legacyAttachments = [
      { type: "url", url: "https://legacy.example.test" },
    ];

    const receipt = await queue.queue({
      threadId: "thread-1",
      content: "runtime-prepared steer",
      displayContent: "canonical steer",
      userContent: canonical,
      attachments: legacyAttachments,
      messageId: "message-1",
    });

    expect(mocks.buildSdkUserContent).toHaveBeenCalledOnce();
    expect(mocks.buildSdkUserContent).toHaveBeenCalledWith(
      "runtime-prepared steer",
      legacyAttachments,
      true,
      canonical,
      enabledSkills,
    );
    expect(active.pendingSteers).toHaveLength(1);
    expect(active.pendingSteers[0]).toMatchObject({
      sdkMessage: {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "text", text: "projected canonical steer" }],
        },
        parent_tool_use_id: null,
      },
      userContent: canonical,
    });
    expect(mocks.enqueueOutboxMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "thread-1",
        messageId: "message-1",
        userContent: canonical,
        sdkContent: "runtime-prepared steer",
      }),
    );
    expect(receipt).toMatchObject({
      status: "queued",
      sessionId: "thread-1",
      turnId: "turn-1",
      messageId: "message-1",
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(mocks.updateTurnInputState).toHaveBeenCalledWith(
      "canonical-input-1",
      "queued",
      { lastError: null },
    );

    expect(queue.flushNextAtBoundary("thread-1", active)).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        message: {
          role: "user",
          content: [{ type: "text", text: "projected canonical steer" }],
        },
        shouldQuery: true,
      }),
      "message-1",
    );
    expect(mocks.updateTurnInputState).toHaveBeenCalledWith(
      "canonical-input-1",
      "acknowledged",
      { lastError: null },
    );
  });

  it("marks a canceled queued canonical steer as blocked", async () => {
    const active = {
      turnId: "turn-2",
      channel: {
        enqueue: vi.fn(),
        cancel: vi.fn(),
        generator: (async function* () {})(),
        close: vi.fn(),
        isClosed: () => false,
      },
      pendingSteers: [],
      canceled: false,
      acceptingSteers: true,
    } as never;
    const queue = new SteerQueue({
      getActiveTurn: () => active,
      pushMessage: vi.fn(),
    });
    queue.setInputProjectionContext("thread-2", {
      supportsVision: false,
      enabledSkills: [],
    });
    await queue.queue({
      threadId: "thread-2",
      content: "queued",
      userContent: [{ type: "text", text: "queued" }],
      messageId: "message-2",
    });

    await expect(queue.cancel("thread-2", "message-2")).resolves.toMatchObject({
      status: "canceled",
    });
    expect(mocks.updateTurnInputState).toHaveBeenLastCalledWith(
      "canonical-input-1",
      "blocked",
      { lastError: "The queued steer was canceled before delivery." },
    );
  });
});
