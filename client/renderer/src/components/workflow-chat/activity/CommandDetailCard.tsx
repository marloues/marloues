import { CircleCheck, CircleX, LoaderCircle, Square } from "lucide-react";
import { WorkflowDetailCopyButton } from "./DetailCopyButton";
import type {
  CommandPresentation,
  CommandStatusKind,
} from "./command-presentation";

export function WorkflowCommandDetail({
  presentation,
}: {
  presentation: CommandPresentation;
}) {
  return (
    <section
      className="workflow-command-detail workflow-activity-detail-surface"
      aria-label={`${presentation.shell} 命令详情`}
    >
      <header className="workflow-command-detail-header">
        <span className="workflow-command-shell">{presentation.shell}</span>
        <CommandStatus
          kind={presentation.statusKind}
          text={presentation.statusText}
        />
      </header>
      <div className="workflow-command-detail-body">
        {typeof presentation.exitCode === "number" ||
        typeof presentation.durationMs === "number" ? (
          <div className="workflow-command-metadata">
            {typeof presentation.exitCode === "number" ? (
              <span>退出码 {presentation.exitCode}</span>
            ) : null}
            {typeof presentation.durationMs === "number" &&
            Number.isFinite(presentation.durationMs) ? (
              <span>
                命令用时{" "}
                {(Math.max(0, presentation.durationMs) / 1000).toFixed(1)} 秒
              </span>
            ) : null}
          </div>
        ) : null}
        {presentation.truncated ? (
          <p role="status">输出已截断，以下是保留的输出。</p>
        ) : null}
        {presentation.input ? (
          <CommandSection
            label="命令"
            value={`$ ${presentation.input}`}
            copyValue={presentation.input}
          />
        ) : null}
        {presentation.detailOutput ? (
          <CommandSection
            label={presentation.failed ? "错误" : "输出"}
            value={presentation.detailOutput}
            copyValue={presentation.detailOutput}
            danger={presentation.failed}
            scrollable
          />
        ) : (
          <div className="workflow-command-empty">无输出</div>
        )}
      </div>
    </section>
  );
}

function CommandSection({
  label,
  value,
  copyValue,
  danger = false,
  scrollable = false,
}: {
  label: string;
  value: string;
  copyValue: string;
  danger?: boolean;
  scrollable?: boolean;
}) {
  return (
    <section className="workflow-command-section">
      <header className="workflow-command-section-header">
        <span>{label}</span>
        <WorkflowDetailCopyButton value={copyValue} label={`复制${label}`} />
      </header>
      <pre
        className={`workflow-command-code ${danger ? "is-danger" : ""} ${scrollable ? "is-scrollable" : ""}`}
      >
        {value}
      </pre>
    </section>
  );
}

function CommandStatus({
  kind,
  text,
}: {
  kind: CommandStatusKind;
  text: string;
}) {
  return (
    <span className={`workflow-command-status is-${kind}`}>
      {kind === "running" ? (
        <LoaderCircle />
      ) : kind === "failed" ? (
        <CircleX />
      ) : kind === "stopped" ? (
        <Square />
      ) : (
        <CircleCheck />
      )}
      <span>{text}</span>
    </span>
  );
}
