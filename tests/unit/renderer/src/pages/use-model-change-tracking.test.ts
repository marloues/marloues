import { describe, expect, it } from "vitest";
import { isModelChangeDuringStreaming } from "../../../../../client/renderer/src/pages/use-model-change-tracking";

describe("isModelChangeDuringStreaming", () => {
  it("does not warn on the first observed model for a session", () => {
    expect(
      isModelChangeDuringStreaming({
        previousModelId: null,
        currentModelId: "glm-5.3-aliyun",
        wasStreaming: true,
        isStreaming: true,
      }),
    ).toBe(false);
  });

  it("does not warn when the model is unchanged", () => {
    expect(
      isModelChangeDuringStreaming({
        previousModelId: "glm-5.3-aliyun",
        currentModelId: "glm-5.3-aliyun",
        wasStreaming: true,
        isStreaming: true,
      }),
    ).toBe(false);
  });

  it("does not warn when a turn is starting or ending", () => {
    const shared = {
      previousModelId: "glm-5.3-aliyun",
      currentModelId: "kimi-k3-aliyun",
    };

    expect(
      isModelChangeDuringStreaming({
        ...shared,
        wasStreaming: false,
        isStreaming: true,
      }),
    ).toBe(false);
    expect(
      isModelChangeDuringStreaming({
        ...shared,
        wasStreaming: true,
        isStreaming: false,
      }),
    ).toBe(false);
  });

  it("warns only after streaming is already established", () => {
    expect(
      isModelChangeDuringStreaming({
        previousModelId: "glm-5.3-aliyun",
        currentModelId: "kimi-k3-aliyun",
        wasStreaming: true,
        isStreaming: true,
      }),
    ).toBe(true);
  });
});
