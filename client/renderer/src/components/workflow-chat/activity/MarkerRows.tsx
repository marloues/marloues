import { useItemDisclosure } from "../content/conversation-ui-state";
import {
  Brain,
  CircleHelp,
  Image as ImageIcon,
  ShieldQuestion,
  Wrench,
} from "lucide-react";
import type { WorkflowTurnItem } from "../../../../../shared/adapters/workflow-messages-to-read-thread";
import {
  WorkflowActivityDetailBlock,
  WorkflowActivityDetailStack,
} from "./ActivityDetail";
import { WorkflowActivityRow } from "./ActivityRow";
import { WorkflowImageViewGroup } from "./ImageViewGroup";

export function WorkflowImageViewRow({
  item,
}: {
  item: Extract<WorkflowTurnItem, { type: "imageView" }>;
}) {
  return <WorkflowImageViewGroup items={[item]} />;
}

export function WorkflowReviewModeMarker({
  item,
}: {
  item: Extract<
    WorkflowTurnItem,
    { type: "enteredReviewMode" | "exitedReviewMode" }
  >;
}) {
  return (
    <ExpandableMarkerRow
      itemId={item.id}
      icon="approval"
      label={
        item.type === "enteredReviewMode" ? "已进入审查模式" : "已退出审查模式"
      }
      activityKind={item.type}
      detailLabel="Review"
      payload={item.review}
    />
  );
}

export function WorkflowHookPromptBlock({
  item,
}: {
  item: Extract<WorkflowTurnItem, { type: "hookPrompt" }>;
}) {
  return (
    <ExpandableMarkerRow
      itemId={item.id}
      icon="question"
      label="正在提问"
      activityKind="hookPrompt"
      summary={item.fragmentCount ? `${item.fragmentCount} 个片段` : undefined}
      detailLabel="Fragments"
      payload={item.fragments}
    />
  );
}

export function WorkflowModeUpdateMarker({
  item,
}: {
  item: Extract<WorkflowTurnItem, { type: "modeUpdate" }>;
}) {
  const label =
    item.label ??
    (item.modeKind === "plan"
      ? "已进入计划模式"
      : item.modeKind === "default"
        ? "已退出计划模式"
        : `模式已切换：${item.label ?? item.modeId}`);

  return (
    <ExpandableMarkerRow
      itemId={item.id}
      icon="tool"
      label={label}
      activityKind="modeUpdate"
      detailLabel="Mode"
      payload={item.raw}
    />
  );
}

export function WorkflowContextCompactionMarker() {
  return (
    <MarkerRow
      icon="reasoning"
      label="上下文已压缩"
      activityKind="contextCompaction"
    />
  );
}

export function WorkflowUnknownRawJson({
  item,
}: {
  item: Extract<WorkflowTurnItem, { type: "unknown" }>;
}) {
  const [open, setOpen] = useItemDisclosure(item.id);
  const eventLabels: Record<string, string> = {
    "model-changed": "模型已切换",
    modelChanged: "模型已切换",
    "model-rerouted": "模型路由已调整",
    modelRerouted: "模型路由已调整",
    "personality-changed": "表达风格已切换",
    "thread-forked": "已创建分支任务",
    threadForked: "已创建分支任务",
    "worktree-created": "工作树已创建",
    "worktree-setup-failed": "工作树初始化失败",
    "runtime-status": "运行状态",
  };

  return (
    <WorkflowActivityRow
      activityKind="unknown"
      icon={<Wrench />}
      label={<>{eventLabels[item.rawType ?? ""] ?? "未知项目"}</>}
      meta={item.rawType}
      detail={
        <WorkflowActivityDetailStack>
          <WorkflowActivityDetailBlock
            label="Raw"
            value={formatUnknownValue(item.raw)}
          />
        </WorkflowActivityDetailStack>
      }
      open={open}
      onToggle={() => setOpen((value) => !value)}
    />
  );
}

function MarkerRow({
  icon,
  label,
  detail,
  activityKind,
}: {
  icon: MarkerIcon;
  label: string;
  detail?: string;
  activityKind: string;
}) {
  return (
    <WorkflowActivityRow
      activityKind={activityKind}
      icon={markerIcon(icon)}
      label={label}
      meta={detail}
    />
  );
}

function ExpandableMarkerRow({
  itemId,
  icon,
  label,
  summary,
  detailLabel,
  payload,
  activityKind,
}: {
  icon: MarkerIcon;
  label: string;
  summary?: string;
  detailLabel: string;
  payload?: unknown;
  activityKind: string;
  itemId: string;
}) {
  const [open, setOpen] = useItemDisclosure(itemId);
  const value = formatOptionalDetail(payload);
  const hasDetail = Boolean(value);

  return (
    <WorkflowActivityRow
      activityKind={activityKind}
      icon={markerIcon(icon)}
      label={label}
      meta={summary}
      detail={
        <WorkflowActivityDetailStack>
          <WorkflowActivityDetailBlock label={detailLabel} value={value} />
        </WorkflowActivityDetailStack>
      }
      hasDetail={hasDetail}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    />
  );
}

type MarkerIcon = "approval" | "tool" | "reasoning" | "image" | "question";

function markerIcon(icon: MarkerIcon) {
  if (icon === "approval") return <ShieldQuestion />;
  if (icon === "question") return <CircleHelp />;
  if (icon === "reasoning") return <Brain />;
  if (icon === "image") return <ImageIcon />;
  return <Wrench />;
}

function formatUnknownValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatOptionalDetail(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return formatUnknownValue(value);
}
