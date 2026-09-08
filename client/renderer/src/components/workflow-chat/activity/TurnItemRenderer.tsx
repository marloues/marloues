import { workflowShouldShowProcessItem } from "../turns/turn-collapse-rules";
import { WorkflowCollabAgentToolRow } from "./CollabAgentToolRow";
import { WorkflowCommandExecutionRow } from "./CommandExecutionRow";
import { WorkflowFileChangeRow } from "./FileChangeRow";
import { WorkflowImageGenerationRow } from "./ImageGenerationRow";
import {
  WorkflowContextCompactionMarker,
  WorkflowHookPromptBlock,
  WorkflowImageViewRow,
  WorkflowReviewModeMarker,
  WorkflowUnknownRawJson,
} from "./MarkerRows";
import { WorkflowPermissionRequestRow } from "./PermissionRequestRow";
import { WorkflowReasoningRow } from "./ReasoningRow";
import { WorkflowToolCallRow } from "./ToolCallRow";
import { WorkflowWebSearchRow } from "./WebSearchRow";
import { MessageItemView } from "../message-view";
import type { ProcessItem } from "../turns/turn-layout";

type RendererMap = {
  [K in ProcessItem["type"]]: (props: {
    item: Extract<ProcessItem, { type: K }>;
  }) => JSX.Element | null;
};

const renderers = {
  plan: WorkflowToolCallRow,
  reasoning: WorkflowReasoningRow,
  commandExecution: WorkflowCommandExecutionRow,
  fileChange: WorkflowFileChangeRow,
  mcpToolCall: WorkflowToolCallRow,
  dynamicToolCall: WorkflowToolCallRow,
  collabAgentToolCall: WorkflowCollabAgentToolRow,
  webSearch: WorkflowWebSearchRow,
  imageView: WorkflowImageViewRow,
  imageGeneration: WorkflowImageGenerationRow,
  enteredReviewMode: WorkflowReviewModeMarker,
  exitedReviewMode: WorkflowReviewModeMarker,
  hookPrompt: WorkflowHookPromptBlock,
  permissionRequest: WorkflowPermissionRequestRow,
  contextCompaction: WorkflowContextCompactionMarker,
  unknown: WorkflowUnknownRawJson,
} satisfies RendererMap;

/**
 * 这些类型改用简化渲染器的行组件（Think 折叠行、exec_command/apply_patch
 * 工具行 + IN/OUT 展开卡），与简化渲染实例保持同一视觉与交互。
 */
const SIMPLIFIED_ROW_TYPES: ReadonlySet<ProcessItem["type"]> = new Set([
  "reasoning",
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "webSearch",
]);

export function WorkflowTurnItemRenderer({ item }: { item: ProcessItem }) {
  if (!workflowShouldShowProcessItem(item)) return null;
  if (SIMPLIFIED_ROW_TYPES.has(item.type)) {
    return <MessageItemView item={item} />;
  }
  const Renderer = renderers[item.type];
  return Renderer ? <Renderer item={item as never} /> : null;
}
