import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FileText } from "lucide-react";
import { WorkflowActivityRow } from "../../../../../../../client/renderer/src/components/workflow-chat/activity/ActivityRow";

describe("WorkflowActivityRow", () => {
  it("renders the design row columns and exposes expansion state", () => {
    const html = renderToStaticMarkup(
      <WorkflowActivityRow
        activityKind="fileChange"
        icon={<FileText />}
        label="已编辑文件"
        meta="src/Workbench.tsx"
        detail={<pre>+ auxiliary</pre>}
        open
        onToggle={vi.fn()}
      />,
    );

    expect(html).toContain('data-activity-kind="fileChange"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('class="workflow-activity-row-icon');
    expect(html).toMatch(/class="[^"]*\bworkflow-activity-row-label\b[^"]*"/);
    expect(html).toMatch(/class="[^"]*\bworkflow-activity-row-meta\b[^"]*"/);
    expect(html).toMatch(/class="[^"]*\bworkflow-activity-detail\b[^"]*"/);
    const contentId = html.match(/aria-controls="([^"]+)"/)?.[1];
    expect(contentId).toBeTruthy();
    expect(html).toContain(`id="${contentId}"`);
    expect(html).toContain("src/Workbench.tsx");
  });

  it("uses static row markup when there is no action", () => {
    const html = renderToStaticMarkup(
      <WorkflowActivityRow
        activityKind="contextCompaction"
        icon={<FileText />}
        label="上下文已压缩"
      />,
    );

    expect(html).toMatch(
      /class="[^"]*\bworkflow-activity-row-button\b[^"]*\bis-static\b[^"]*"/,
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-expanded");
  });
});
