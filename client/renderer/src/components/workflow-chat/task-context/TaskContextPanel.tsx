import { useEffect, useRef } from "react";
import { CONVERSATION_PAGE_CONTRACT } from "@shared/conversation-page-contract";
import type { TaskContextMode } from "./use-task-context-layout";
import type {
  OutputTarget,
  TaskPresentationModel,
} from "./task-presentation-model";
import { openAuxiliaryTab } from "@/stores/auxiliary-tab-intent-store";
import {
  BackgroundProcessesSection,
  BrowserPagesSection,
  OutputContentSection,
  PlanSection,
  ScheduledSection,
  SourcesSection,
  SubagentsSection,
  TaskProgressSection,
  UsageSection,
  WorkspaceContextSection,
} from "./TaskContextSections";

const SUMMARY_CONTRACT = CONVERSATION_PAGE_CONTRACT.threadSummary;

export function TaskContextPanel({
  model,
  mode,
  gitLoading,
  onRefresh,
  onCloseFloating,
  onOpenChanges,
}: {
  model: TaskPresentationModel;
  mode: TaskContextMode;
  gitLoading: boolean;
  onRefresh: () => void;
  onCloseFloating: () => void;
  onOpenChanges?: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mode !== "floating") return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseFloating();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        panelRef.current?.contains(target) ||
        target?.closest("[data-thread-summary-toggle]")
      ) {
        return;
      }
      onCloseFloating();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [mode, onCloseFloating]);

  if (!model.hasData || mode === "hidden") return null;
  const workspace = model.workspace;
  const sessionId = model.sessionId;
  const sectionOrder = SUMMARY_CONTRACT.sectionOrder.filter(
    (key) =>
      !(SUMMARY_CONTRACT.deferredSections as readonly string[]).includes(key),
  );

  const openOutput = (target: OutputTarget) => {
    if (!sessionId) return;
    if (target.kind === "review") {
      openAuxiliaryTab({
        type: "review",
        sessionId,
        path: target.path,
        diff: target.diff,
      });
    } else if (target.kind === "file") {
      openAuxiliaryTab({ type: "file", sessionId, path: target.path });
    } else if (target.kind === "browser") {
      openAuxiliaryTab({ type: "browser", sessionId, url: target.url });
    } else {
      openAuxiliaryTab({ type: "outputs", sessionId });
    }
  };

  return (
    <aside
      ref={panelRef}
      className={`thread-summary-panel is-${mode}`}
      data-kind="thread-summary-panel"
      data-mode={mode}
      aria-label="会话固定摘要"
      role="complementary"
    >
      <div className="thread-summary-panel-scroll scrollbar-thin">
        {sectionOrder.map((sectionKey) => {
          switch (sectionKey) {
            case "scheduled":
              return (
                <ScheduledSection
                  key={sectionKey}
                  sessionId={sessionId}
                  scheduled={model.scheduled}
                />
              );
            case "environment":
              return (
                <WorkspaceContextSection
                  key={sectionKey}
                  sessionId={sessionId}
                  model={model}
                  gitLoading={gitLoading}
                  onRefresh={onRefresh}
                  onOpenChanges={
                    model.changes?.reviewTarget ? onOpenChanges : undefined
                  }
                  onOpenWorkspace={() => {
                    if (workspace?.id)
                      void window.marloues.workspace.openInExplorer(
                        workspace.id,
                      );
                  }}
                />
              );
            case "plan":
              return (
                <PlanSection
                  key={sectionKey}
                  sessionId={sessionId}
                  plan={model.plan}
                />
              );
            case "outputs":
              return (
                <OutputContentSection
                  key={sectionKey}
                  sessionId={sessionId}
                  outputContent={model.outputContent}
                  onOpenOutput={openOutput}
                />
              );
            case "created-tasks":
              return (
                <TaskProgressSection
                  key={sectionKey}
                  sessionId={sessionId}
                  tasks={model.tasks}
                />
              );
            case "subagents":
              return (
                <SubagentsSection
                  key={sectionKey}
                  sessionId={sessionId}
                  subagents={model.subagents}
                  onOpenSubagent={(subagentId) => {
                    if (sessionId)
                      openAuxiliaryTab({
                        type: "subagent",
                        sessionId,
                        subagentId,
                      });
                  }}
                />
              );
            case "usage":
              return (
                <UsageSection
                  key={sectionKey}
                  sessionId={sessionId}
                  usage={model.usage}
                />
              );
            case "background-processes":
              return (
                <BackgroundProcessesSection
                  key={sectionKey}
                  sessionId={sessionId}
                  processes={model.processes}
                  onOpenTerminal={(terminalSessionId) => {
                    if (sessionId)
                      openAuxiliaryTab({
                        type: "terminal",
                        sessionId,
                        terminalSessionId,
                      });
                  }}
                />
              );
            case "browser":
              return (
                <BrowserPagesSection
                  key={sectionKey}
                  sessionId={sessionId}
                  browserPages={model.browserPages}
                  onOpenBrowserPage={(pageId) => {
                    if (sessionId)
                      openAuxiliaryTab({
                        type: "browser",
                        sessionId,
                        pageId,
                      });
                  }}
                />
              );
            case "sources":
              return (
                <SourcesSection
                  key={sectionKey}
                  sessionId={sessionId}
                  sources={model.sources}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    </aside>
  );
}
