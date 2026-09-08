import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: undefined }));

import { projectCodexTurnInput } from "../../client/main/codex/input-adapter";
import { CodexAppServerSession } from "../../client/main/codex/session";
import type { CodexTransport } from "../../client/main/codex/transport/connection";
import { JsonRpcClient } from "../../client/main/codex/transport/jsonrpc-client";

function createHarness() {
  const written: Array<Record<string, unknown>> = [];
  let responseHandler: ((message: unknown) => void) | undefined;
  let notificationHandler:
    ((method: string, params: unknown) => void) | undefined;
  const stdin = {
    write(chunk: string) {
      const message = JSON.parse(chunk) as Record<string, unknown>;
      written.push(message);
      const id = message.id;
      if (message.method === "initialize") {
        queueMicrotask(() =>
          responseHandler?.({
            jsonrpc: "2.0",
            id,
            result: {
              userAgent: "codex-test",
              codexHome: "/tmp/codex",
              platformFamily: "unix",
              platformOs: "macos",
            },
          }),
        );
      } else if (message.method === "thread/start") {
        queueMicrotask(() =>
          responseHandler?.({
            jsonrpc: "2.0",
            id,
            result: { thread: { id: "thread-native" } },
          }),
        );
      } else if (message.method === "turn/start") {
        queueMicrotask(() =>
          responseHandler?.({
            jsonrpc: "2.0",
            id,
            result: {
              turn: {
                id: "turn-native",
                status: "inProgress",
                items: [],
                error: null,
              },
            },
          }),
        );
        // End the synthetic stream without triggering the completed-turn probe.
        queueMicrotask(() =>
          notificationHandler?.("turn/failed", {
            error: { message: "synthetic test completion" },
          }),
        );
      }
      return true;
    },
  } as unknown as CodexTransport["stdin"];
  const transport = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    isAlive: vi.fn(() => true),
    stdin,
    stdout: {} as CodexTransport["stdout"],
    onNotification: (handler: (method: string, params: unknown) => void) => {
      notificationHandler = handler;
    },
    onServerRequest: vi.fn(),
    onResponse: (handler: (message: unknown) => void) => {
      responseHandler = handler;
    },
  } as CodexTransport;
  const rpc = new JsonRpcClient(transport);
  return {
    session: new CodexAppServerSession("session-input", rpc, transport),
    written,
  };
}

describe("Codex app-server turn input", () => {
  it("forwards the runtime projection unchanged to turn/start.input", async () => {
    const harness = createHarness();
    const imageUrl = "data:image/png;base64,aW1hZ2U=";
    const input = projectCodexTurnInput(
      "生成示意图",
      [
        { type: "image", url: imageUrl, detail: "high" },
        {
          type: "localImage",
          path: "/tmp/reference.png",
          detail: "original",
        },
        {
          type: "skill",
          id: "imagegen-id",
          name: "imagegen",
          path: "/untrusted/imagegen",
        },
        {
          type: "file",
          name: "requirements.txt",
          mimeType: "text/plain",
          text: "vitest==4",
        },
        { type: "url", url: "https://example.test/reference" },
        { type: "mention", name: "package.json", path: "package.json" },
        {
          type: "browserComment",
          commentId: 9,
          ref: "main > button",
          tagName: "BUTTON",
          text: "Create",
          attributes: {},
          rect: { x: 1, y: 2, width: 3, height: 4 },
          viewport: { width: 800, height: 600 },
          scrollX: 0,
          scrollY: 10,
          comment: "Move this button",
          pageUrl: "https://example.test/app",
        },
      ],
      {
        availableSkills: [
          {
            id: "imagegen-id",
            name: "imagegen",
            path: "/skills/imagegen",
          },
        ],
      },
    );

    await harness.session.start();
    await harness.session.send(input);

    const request = harness.written.find(
      (message) => message.method === "turn/start",
    );
    expect(request).toMatchObject({
      method: "turn/start",
      params: {
        threadId: "thread-native",
        input,
      },
    });
    const sentInput = (request?.params as { input: typeof input }).input;
    expect(sentInput.map((item) => item.type)).toEqual([
      "text",
      "image",
      "localImage",
      "skill",
    ]);
    expect(sentInput).toContainEqual({
      type: "image",
      url: imageUrl,
      detail: "high",
    });
    expect(sentInput).toContainEqual({
      type: "localImage",
      path: "/tmp/reference.png",
      detail: "original",
    });
    expect(sentInput).toContainEqual({
      type: "skill",
      name: "imagegen",
      path: "/skills/imagegen/SKILL.md",
    });
    const sentTextInput = sentInput.find((item) => item.type === "text");
    const sentText = sentTextInput?.type === "text" ? sentTextInput.text : "";
    expect(sentText).toContain("$imagegen");
    expect(sentText).toContain('"kind":"file"');
    expect(sentText).toContain("vitest==4");
    expect(sentText).toContain("https://example.test/reference");
    expect(sentText).toContain("package.json");
    expect(sentText).toContain("Move this button");
  });
});
