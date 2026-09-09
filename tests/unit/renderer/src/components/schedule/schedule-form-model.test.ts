import { describe, expect, it } from "vitest";
import { scheduleCopyInputFromTask } from "../../../../../../client/renderer/src/components/schedule/schedule-form-model";
import type { ScheduledTaskRecord } from "@shared/types";

describe("schedule form model", () => {
  it("preserves the source session when copying a scheduled task", () => {
    const task: ScheduledTaskRecord = {
      id: "schedule-1",
      name: "每日摘要",
      instruction: "生成摘要",
      workspacePath: "/workspace/marloues",
      sourceSessionId: "session-1",
      kind: "cron",
      cronExpr: "0 9 * * *",
      enabled: true,
      metadata: {
        tags: [],
        schedule: {
          mode: "cycle",
          cycleType: "daily",
          time: { hour: 9, minute: 0 },
        },
        notificationChannels: [],
      },
      createdAt: 1,
      updatedAt: 2,
    };

    expect(scheduleCopyInputFromTask(task).sourceSessionId).toBe("session-1");
  });
});
