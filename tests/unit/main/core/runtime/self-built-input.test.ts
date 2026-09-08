import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentInputPart } from "../../../../../client/shared/agent-input";
import type { EffectiveExtensionPlan } from "../../../../../client/main/services/extension-plan-service";
import { projectSelfBuiltInput } from "../../../../../client/main/core/runtime/self-built-input";

function extensionPlan(
  skillPath: string,
  includeSkill = true,
): EffectiveExtensionPlan {
  return {
    runtimeId: "self-built",
    workspace: null,
    skills: includeSkill
      ? [
          {
            id: "allowed-skill",
            name: "allowed",
            path: skillPath,
            scope: "project",
            enabled: true,
          },
        ]
      : [],
    mcpServers: [],
    skillStates: [],
    fingerprint: "test-plan",
  };
}

describe("Self-built canonical input projection", () => {
  it("consumes or explicitly degrades all eight supported input types", () => {
    const skillDir = mkdtempSync(join(tmpdir(), "marloues-self-skill-"));
    const skillFile = join(skillDir, "SKILL.md");
    writeFileSync(
      skillFile,
      "# Allowed Skill\nFollow the verified workflow.",
      "utf8",
    );

    try {
      const parts: AgentInputPart[] = [
        { type: "text", text: "Do the task" },
        {
          type: "image",
          url: "data:image/png;base64,aW1hZ2U=",
          name: "diagram.png",
          mimeType: "image/png",
          size: 5,
        },
        {
          type: "localImage",
          path: "/workspace/local.png",
          name: "local.png",
          mimeType: "image/png",
          size: 10,
        },
        {
          type: "file",
          name: "notes.md",
          mimeType: "text/markdown",
          text: "FULL FILE BODY\nsecond line",
          path: "/workspace/notes.md",
          size: 26,
        },
        {
          type: "url",
          url: "https://example.com/reference",
          title: "Reference",
        },
        {
          type: "skill",
          id: "allowed-skill",
          name: "allowed",
          path: "/untrusted/renderer/path/SKILL.md",
        },
        {
          type: "mention",
          name: "agent-input.ts",
          path: "/workspace/client/shared/agent-input.ts",
        },
        {
          type: "browserComment",
          commentId: 9,
          targetType: "region",
          ref: "body > main",
          tagName: "MAIN",
          text: "Selected copy",
          attributes: { role: "main" },
          rect: { x: 1, y: 2, width: 100, height: 50 },
          viewport: { width: 1280, height: 720 },
          scrollX: 3,
          scrollY: 4,
          comment: "Reduce spacing",
          styleEdits: { gap: "8px" },
          pageUrl: "https://example.com/app",
          screenshotDataUrl: "data:image/png;base64,c2NyZWVuc2hvdA==",
        },
      ];
      const statePack = "[STATE PACK]\nprior context";
      const projection = projectSelfBuiltInput({
        runtimeContent: `${statePack}\n\nDo the task`,
        userContent: parts,
        extensionPlan: extensionPlan(skillDir),
      });

      expect(projection.parts).toEqual(parts);
      expect(
        projection.deliveries.map(({ type, outcome }) => [type, outcome]),
      ).toEqual([
        ["text", "exact"],
        ["image", "degraded"],
        ["localImage", "degraded"],
        ["file", "exact"],
        ["url", "exact"],
        ["skill", "transformed"],
        ["mention", "exact"],
        ["browserComment", "degraded"],
      ]);
      expect(projection.prompt.match(/\[STATE PACK\]/g)).toHaveLength(1);
      expect(projection.prompt.match(/Do the task/g)).toHaveLength(1);
      expect(projection.prompt).toContain("FULL FILE BODY\nsecond line");
      expect(projection.prompt).toContain("https://example.com/reference");
      expect(projection.prompt).toContain(
        "/workspace/client/shared/agent-input.ts",
      );
      expect(projection.prompt).toContain("Reduce spacing");
      expect(projection.prompt).toContain('"gap": "8px"');
      expect(projection.prompt).toContain("Follow the verified workflow.");
      expect(projection.prompt).toContain(skillFile);
      expect(projection.prompt).not.toContain("/untrusted/renderer/path");
      expect(projection.prompt).toContain("has no pixel-understanding model");
      expect(projection.prompt).not.toContain(
        "data:image/png;base64,c2NyZWVuc2hvdA==",
      );
    } finally {
      unlinkSync(skillFile);
      rmdirSync(skillDir);
    }
  });

  it("rejects a selected Skill that is absent from the effective allow-list", () => {
    const projection = projectSelfBuiltInput({
      runtimeContent: "Review this",
      userContent: [
        {
          type: "skill",
          id: "disabled-skill",
          name: "disabled",
          path: "/tmp/untrusted/SKILL.md",
        },
      ],
      extensionPlan: extensionPlan("/unused", false),
    });

    expect(projection.deliveries).toEqual([
      expect.objectContaining({ type: "skill", outcome: "rejected" }),
    ]);
    expect(projection.prompt).toContain("Rejected Skill invocation");
    expect(projection.prompt).toContain(
      "is not enabled by the effective extension plan",
    );
  });

  it("appends canonical text only when runtimeContent does not already have it", () => {
    const projection = projectSelfBuiltInput({
      runtimeContent: "[STATE PACK]",
      userContent: [{ type: "text", text: "New user task" }],
      extensionPlan: extensionPlan("/unused", false),
    });

    expect(projection.prompt).toContain("[STATE PACK]\n\nNew user task");
    expect(projection.deliveries[0]).toEqual(
      expect.objectContaining({ type: "text", outcome: "transformed" }),
    );
  });
});
