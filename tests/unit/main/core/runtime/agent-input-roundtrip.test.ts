import { describe, expect, it } from "vitest";
import {
  AGENT_TURN_INPUT_SCHEMA_VERSION,
  createAgentTurnInput,
  normalizeAgentInputParts,
  type AgentInputPart,
} from "../../../../../client/shared/agent-input";
import { WorkflowThreadStore } from "../../../../../client/main/core/runtime/workflow-thread-store";

const ALL_PARTS: AgentInputPart[] = [
  {
    type: "text",
    text: "structured text",
    text_elements: [{ start: 0, end: 10 }],
    displayFormat: "markdown",
    workflowDelegation: { sourceThreadId: "source-1", input: "delegate me" },
  },
  {
    type: "image",
    url: "data:image/png;base64,aW1hZ2U=",
    detail: "auto",
    name: "diagram.png",
    mimeType: "image/png",
    size: 5,
  },
  {
    type: "localImage",
    path: "/workspace/local.png",
    detail: "high",
    name: "local.png",
    mimeType: "image/png",
    size: 10,
  },
  {
    type: "file",
    name: "notes.md",
    mimeType: "text/markdown",
    text: "# Notes",
    path: "/workspace/notes.md",
    size: 7,
  },
  {
    type: "url",
    url: "https://example.com/reference",
    title: "Reference",
  },
  {
    type: "skill",
    id: "skill-1",
    name: "review",
    displayName: "Review",
    path: "/skills/review/SKILL.md",
    description: "Review code",
    scope: "project",
    version: "1.2.3",
    promptLinkLabel: "$review",
  },
  {
    type: "mention",
    name: "agent-input.ts",
    path: "/workspace/client/shared/agent-input.ts",
  },
  {
    type: "browserComment",
    commentId: 42,
    targetType: "region",
    ref: "body > main",
    tagName: "MAIN",
    text: "Selected text",
    attributes: { role: "main" },
    rect: { x: 1, y: 2, width: 300, height: 200 },
    viewport: { width: 1440, height: 900 },
    scrollX: 3,
    scrollY: 4,
    comment: "Tighten this area",
    styleEdits: { gap: "8px" },
    pageUrl: "https://example.com/app",
    screenshotDataUrl: "data:image/png;base64,c2NyZWVuc2hvdA==",
  },
];

function jsonRoundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe("canonical agent input", () => {
  it("round-trips every supported part without losing fields", () => {
    expect(
      normalizeAgentInputParts(jsonRoundTrip(ALL_PARTS) as unknown[]),
    ).toEqual(ALL_PARTS);
  });

  it("retains legacy image dataUrl metadata while canonicalizing to url", () => {
    expect(
      normalizeAgentInputParts([
        {
          type: "image",
          dataUrl: "data:image/webp;base64,d2VicA==",
          name: "photo.webp",
          mimeType: "image/webp",
          size: 4,
          detail: "auto",
        },
      ]),
    ).toEqual([
      {
        type: "image",
        url: "data:image/webp;base64,d2VicA==",
        name: "photo.webp",
        mimeType: "image/webp",
        size: 4,
        detail: "auto",
      },
    ]);
  });

  it("creates a versioned turn input and does not duplicate supplied text", () => {
    expect(createAgentTurnInput("structured text", ALL_PARTS)).toEqual({
      schemaVersion: AGENT_TURN_INPUT_SCHEMA_VERSION,
      parts: ALL_PARTS,
    });
  });

  it("keeps every canonical part in live thread snapshots and rehydration", () => {
    const store = new WorkflowThreadStore();
    store.startTurn({
      threadId: "roundtrip-live",
      turnId: "turn-live",
      content: "",
      attachments: jsonRoundTrip(ALL_PARTS) as unknown[],
      userMessageId: "user-live",
      startedAt: 1000,
    });

    const liveUser = store
      .readThread({ threadId: "roundtrip-live", limit: 10 })
      .turns[0].items.find((item) => item.type === "userMessage");
    expect(liveUser?.type).toBe("userMessage");
    if (liveUser?.type !== "userMessage") throw new Error("missing user item");
    expect(liveUser.content).toEqual(ALL_PARTS);

    const persistedStore = new WorkflowThreadStore();
    persistedStore.rehydrateFromStoredMessages("roundtrip-persisted", [
      {
        id: "user-persisted",
        role: "user",
        content: "",
        userContent: jsonRoundTrip(ALL_PARTS) as AgentInputPart[],
        timestamp: 1000,
        items: [],
      },
    ]);
    const persistedUser = persistedStore
      .readThread({ threadId: "roundtrip-persisted", limit: 10 })
      .turns[0].items.find((item) => item.type === "userMessage");
    expect(persistedUser?.type).toBe("userMessage");
    if (persistedUser?.type !== "userMessage")
      throw new Error("missing persisted user item");
    expect(persistedUser.content).toEqual(ALL_PARTS);
  });
});
