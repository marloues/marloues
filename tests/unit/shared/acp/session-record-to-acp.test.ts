import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  claudeSessionRecordsToACPEvents,
  type ClaudeSessionRecord,
} from "../../../../client/shared/acp/claude-session-record-to-acp";
import {
  codexSessionRecordsToACPEvents,
  type CodexSessionRecord,
} from "../../../../client/shared/acp/codex-session-record-to-acp";
import { MARLOUES_ACP_EXTENSION_NAMES } from "../../../../client/shared/acp/acp-extensions";
import type { ACPWorkflowEvent } from "../../../../client/shared/acp/acp-types";

const fixturesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/acp",
);

function readJSONL(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sessionUpdates(events: ACPWorkflowEvent[]) {
  return events.flatMap((event) =>
    event.type === "session/update" ? [event.notification.update] : [],
  );
}

function extensionNames(events: ACPWorkflowEvent[]) {
  return events.flatMap((event) =>
    event.type === "extension" ? [event.name] : [],
  );
}

describe("real Codex JSONL to ACP", () => {
  const events = readJSONL(
    resolve(fixturesDir, "codex-session.jsonl"),
  ) as CodexSessionRecord[];
  const acpEvents = codexSessionRecordsToACPEvents(events);

  it("maps stable core records without a private top-level type", () => {
    const stable = acpEvents.filter(
      (event) =>
        event.type === "session/update" ||
        event.type === "permission/request" ||
        event.type === "prompt/response",
    );

    const stableSessionUpdates = stable.filter(
      (event) => event.type === "session/update",
    );
    expect(stableSessionUpdates.map((event) => event.type)).toEqual(
      Array.from({ length: stableSessionUpdates.length }, () => "session/update"),
    );
    expect(sessionUpdates(acpEvents)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionUpdate: "current_mode_update",
          currentModeId: "plan",
        }),
        expect.objectContaining({
          sessionUpdate: "user_message_chunk",
          messageId: "codex-user-message",
          content: { type: "text", text: "Try plan mode\n" },
        }),
        expect.objectContaining({
          sessionUpdate: "agent_thought_chunk",
          messageId: "codex-reasoning",
        }),
        expect.objectContaining({
          sessionUpdate: "agent_message_chunk",
          messageId: "codex-agent-message",
        }),
        expect.objectContaining({
          sessionUpdate: "tool_call_update",
          toolCallId: "codex-command",
          status: "completed",
        }),
        expect.objectContaining({
          sessionUpdate: "plan",
        }),
        expect.objectContaining({
          sessionUpdate: "usage_update",
          used: 110,
          size: 121600,
        }),
      ]),
    );
  });

  it("maps completion and unsupported records to canonical response and raw fallback", () => {
    const completion = acpEvents.find(
      (event) => event.type === "prompt/response",
    );
    const unknown = acpEvents.filter((event) => event.type === "unknown");
    const sessionInfo = acpEvents.find(
      (event) =>
        event.type === "extension" &&
        event.name === MARLOUES_ACP_EXTENSION_NAMES.sessionInfo,
    );

    expect(completion).toMatchObject({
      sessionId: "codex-session-fixture",
      turnId: "codex-turn-1",
      nativeType: "task_complete",
      response: { stopReason: "end_turn" },
    });
    expect(sessionInfo).toMatchObject({
      source: "codex",
      nativeType: "session_meta",
    });
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({
      source: "codex",
      nativeType: "response_item",
      raw: {
        type: "response_item",
        payload: { type: "response_item_fixture" },
      },
    });
  });
});

describe("real Claude JSONL to ACP", () => {
  const records = readJSONL(
    resolve(fixturesDir, "claude-session.jsonl"),
  ) as ClaudeSessionRecord[];
  const events = claudeSessionRecordsToACPEvents(records);

  it("maps stable content, tool, plan, and mode records", () => {
    const stable = events.filter((event) => event.type === "session/update");
    expect(stable.length).toBeGreaterThan(0);
    expect(sessionUpdates(events)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionUpdate: "user_message_chunk",
          messageId: "claude-turn-1",
        }),
        expect.objectContaining({
          sessionUpdate: "agent_thought_chunk",
          messageId: "claude-turn-1:thought",
        }),
        expect.objectContaining({
          sessionUpdate: "agent_message_chunk",
          messageId: "claude-turn-1:message",
        }),
        expect.objectContaining({
          sessionUpdate: "current_mode_update",
          currentModeId: "plan",
        }),
        expect.objectContaining({
          sessionUpdate: "tool_call",
          toolCallId: "Agent_5",
          title: "Agent",
        }),
        expect.objectContaining({
          sessionUpdate: "tool_call_update",
          toolCallId: "Agent_5",
          status: "completed",
        }),
        expect.objectContaining({
          sessionUpdate: "current_mode_update",
          currentModeId: "default",
        }),
        expect.objectContaining({
          sessionUpdate: "plan",
        }),
      ]),
    );
  });

  it("maps task and subagent state through namespaced extensions and preserves unknown raw", () => {
    expect(extensionNames(events)).toEqual(
      expect.arrayContaining([
        MARLOUES_ACP_EXTENSION_NAMES.subagentStart,
        MARLOUES_ACP_EXTENSION_NAMES.subagentComplete,
        MARLOUES_ACP_EXTENSION_NAMES.taskUpdate,
      ]),
    );

    const subagentComplete = events.find(
      (event) =>
        event.type === "extension" &&
        event.name === MARLOUES_ACP_EXTENSION_NAMES.subagentComplete,
    );
    expect(subagentComplete).toMatchObject({
      source: "claude",
      turnId: "claude-agent",
      data: {
        subagentId: "Agent_5",
        parentToolId: "Agent_5",
        status: "completed",
        output: "Subagent completed",
      },
    });

    const unknown = events.filter((event) => event.type === "unknown");
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({
      source: "claude",
      nativeType: "queue-operation",
    });
  });
});
