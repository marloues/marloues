// Barrel for the workflow-chat domain. Re-exports everything from the
// composer / turns / activity / content / adapter / fixtures subdirs.
//
// Two flavors of exports per component are provided for back-compat:
// - The source name (e.g. `WorkflowAssistantAnswer`) — used by internal
//   code that lived in the same folder before the subdir split.
// - A short alias (e.g. `AssistantAnswer`) — used by external code that
//   historically imported the shortened name to avoid clashes.

// --- composer/ ---------------------------------------------------------
export { WorkflowComposerShell as ComposerShell } from "./composer/ComposerShell";
export { WorkflowComposerShell } from "./composer/ComposerShell";
export { ComposerAttachmentChips } from "./composer/ComposerAttachmentChips";
export { ComposerLinkPopover } from "./composer/ComposerLinkPopover";
export {
  ComposerRichInput,
  type ComposerRichInputHandle,
} from "./composer/ComposerRichInput";
export {
  ComposerSuggestionPopover,
  type ComposerSuggestion,
} from "./composer/ComposerSuggestionPopover";
export { ComposerTaskProgress } from "./composer/ComposerTaskProgress";
export { ContextUsageRing } from "./composer/ContextUsageRing";
export { FullAccessConfirmDialog } from "./composer/SandboxInstallBanner";
export { SlashCommandPopover } from "./composer/SlashCommandPopover";
export { useConversationScroll } from "./composer/use-conversation-scroll";

// --- turns/ ------------------------------------------------------------
export { WorkflowTurnView as TurnView } from "./turns/TurnView";
export { WorkflowTurnView } from "./turns/TurnView";
export { WorkflowAssistantTurn as AssistantTurn } from "./turns/AssistantTurn";
export { WorkflowAssistantTurn } from "./turns/AssistantTurn";
export { AssistantTurnHeader } from "./turns/AssistantTurnHeader";
export { WorkflowAssistantAnswer as AssistantAnswer } from "./turns/AssistantAnswer";
export { WorkflowAssistantAnswer } from "./turns/AssistantAnswer";
export { WorkflowAgentMessageView as AgentMessageView } from "./turns/AgentMessageView";
export { WorkflowAgentMessageView } from "./turns/AgentMessageView";
export { MessageErrorCard } from "./turns/MessageErrorCard";
export { MessageNavigation } from "./turns/MessageNavigation";
export {
  WorkflowMessageStatusRow as MessageStatusRow,
  WorkflowMessageStatusRow,
} from "./turns/MessageStatusRow";
export {
  WorkflowMessageTurnTail as MessageTurnTail,
  WorkflowMessageTurnTail,
} from "./turns/MessageTurnTail";
export {
  WorkflowMessageUserRow as MessageUserRow,
  WorkflowMessageUserRow,
} from "./turns/MessageUserRow";
export { WorkflowThinkingPlaceholder as ThinkingPlaceholder } from "./turns/ThinkingPlaceholder";
export { WorkflowThinkingPlaceholder } from "./turns/ThinkingPlaceholder";
export { WorkflowTurnErrorCard as TurnErrorCard } from "./turns/TurnErrorCard";
export { WorkflowTurnErrorCard } from "./turns/TurnErrorCard";
export { WorkflowTurnFlowSection as TurnFlowSection } from "./turns/TurnFlowSection";
export { WorkflowTurnFlowSection } from "./turns/TurnFlowSection";
export { WorkflowTurnFooterView as TurnFooterView } from "./turns/TurnFooterView";
export { WorkflowTurnFooterView } from "./turns/TurnFooterView";
export { WorkflowTurnProcessDisclosure as TurnProcessDisclosure } from "./turns/TurnProcessDisclosure";
export { WorkflowTurnProcessDisclosure } from "./turns/TurnProcessDisclosure";
export { WorkflowTurnShell as TurnShell } from "./turns/TurnShell";
export { WorkflowTurnShell } from "./turns/TurnShell";
export { TurnPresentationBlocks } from "./turns/TurnPresentationBlocks";
export { WorkflowUserMessage as UserMessage } from "./turns/UserMessage";
export { WorkflowUserMessage } from "./turns/UserMessage";
export { WorkflowThreadView as ThreadView } from "./turns/ThreadView";
export { WorkflowThreadView } from "./turns/ThreadView";
export { WorkflowTurnList as WorkflowTurnList } from "./turns/WorkflowTurnList";
export { WorkflowReadThreadTurnList as ReadThreadTurnList } from "./turns/ReadThreadTurnList";
export { WorkflowReadThreadTurnList } from "./turns/ReadThreadTurnList";
export { QueuedSteersPanel } from "./turns/QueuedSteersPanel";
export { WorkflowSubagentWorkspace as SubagentWorkspace } from "./turns/SubagentWorkspace";
export { WorkflowSubagentWorkspace } from "./turns/SubagentWorkspace";
export { buildTurnPresentationModel } from "./turns/turn-presentation-model";
export type {
  TurnPresentationBlock,
  TurnPresentationModel,
} from "./turns/turn-presentation-model";

// turn layout / collapse / scroll state
export {
  workflowActivityGroupViewState as activityGroupViewState,
  workflowActivitySummaryLabel as activitySummaryLabel,
  workflowTurnLayout as turnLayout,
  workflowActivityGroupViewState,
  workflowActivitySummaryLabel,
  workflowTurnLayout,
} from "./turns/turn-layout";
export type {
  WorkflowActivityGroup as ActivityGroupModel,
  WorkflowActivityGroupViewState as ActivityGroupViewState,
  WorkflowActivityItem as ActivityItem,
  WorkflowActivitySummary as ActivitySummary,
  WorkflowFlowEntry as FlowEntry,
  WorkflowTurnLayout as TurnLayout,
} from "./turns/turn-layout";
export type {
  WorkflowActivityGroup,
  WorkflowFlowEntry,
  WorkflowActivityItem,
  WorkflowActivitySummary,
  WorkflowActivityGroupViewState,
} from "./turns/turn-layout";
export {
  workflowIsCollapsibleActivityItem as isCollapsibleActivityItem,
  workflowIsResultCardSourceItem as isResultCardSourceItem,
  workflowItemIsRunning as itemIsRunning,
  workflowLayoutToolName as layoutToolName,
  workflowShouldKeepSingleActivityItem as shouldKeepSingleActivityItem,
  workflowShouldShowActivityItem as shouldShowActivityItem,
  workflowShouldShowProcessItem as shouldShowProcessItem,
  workflowTurnDefaultCollapsed as turnDefaultCollapsed,
  workflowTurnIsCompleted as turnIsCompleted,
  workflowTurnShouldCollapseAfterRuntime as turnShouldCollapseAfterRuntime,
  workflowTurnStateKey as turnStateKey,
  workflowStatusIsRunning,
  workflowIsCollapsibleActivityItem,
  workflowIsResultCardSourceItem,
  workflowItemIsRunning,
  workflowLayoutToolName,
  workflowShouldKeepSingleActivityItem,
  workflowShouldShowActivityItem,
  workflowShouldShowProcessItem,
  workflowTurnDefaultCollapsed,
  workflowTurnIsCompleted,
  workflowTurnShouldCollapseAfterRuntime,
  workflowTurnStateKey,
} from "./turns/turn-collapse-rules";
export type {
  WorkflowProcessItem as ProcessItem,
  WorkflowTurnRuntimeState as TurnRuntimeState,
  WorkflowProcessItem,
  WorkflowTurnRuntimeState,
} from "./turns/turn-collapse-rules";
export {
  workflowTurnCollapseStateKey as turnCollapseStateKey,
  nextWorkflowTurnCollapseState as nextTurnCollapseState,
  workflowTurnCollapseStateKey,
  nextWorkflowTurnCollapseState,
} from "./turns/turn-collapse-state";
export type {
  WorkflowTurnCollapseRuntimeState as TurnCollapseRuntimeState,
  WorkflowTurnCollapseStateResult as TurnCollapseStateResult,
  WorkflowTurnCollapseRuntimeState,
  WorkflowTurnCollapseStateResult,
} from "./turns/turn-collapse-state";
export { formatAssistantMessageTime } from "./turns/TurnFooterView";
export {
  formatUserMessageTime as userMessageTime,
  userMessageClipboardText,
} from "./turns/UserMessage";
export {
  formatMessageDuration as formatDuration,
  formatMessageClock as formatClock,
} from "./turns/message-view-format";
export {
  workflowTurnDurationLabel as turnDurationLabel,
  workflowTurnStatusLabel as turnStatusLabel,
  workflowTurnStatusTone as turnStatusTone,
  workflowTurnDurationLabel,
  workflowTurnStatusLabel,
  workflowTurnStatusTone,
} from "./turns/turn-status";
export { useWorkflowCollapseState as useWorkflowCollapseState } from "./turns/use-collapse-state";
export type { WorkflowCollapseState as WorkflowCollapseState } from "./turns/use-collapse-state";
export { useWorkflowScrollAnchor as useScrollAnchor } from "./turns/use-scroll-anchor";
export type {
  WorkflowScrollAnchor as ScrollAnchor,
  WorkflowScrollAnchorOptions as ScrollAnchorOptions,
  WorkflowScrollAnchor,
  WorkflowScrollAnchorOptions,
} from "./turns/use-scroll-anchor";
export { useWorkflowTurnExpansion as useTurnExpansion } from "./turns/use-turn-expansion";

// --- activity/ ---------------------------------------------------------
export { WorkflowActivityGroup as ActivityGroup } from "./activity/ActivityGroup";
export type { WorkflowActivityGroupEntry as ActivityGroupEntry } from "./activity/ActivityGroup";
export {
  WorkflowActivityRow as ActivityRow,
  WorkflowActivityStatusBadge as ActivityStatusBadge,
  WorkflowInlineDots as InlineDots,
  WorkflowActivityRow,
  WorkflowActivityStatusBadge,
  WorkflowInlineDots,
} from "./activity/ActivityRow";
export { WorkflowActivityRenderer as ActivityRenderer } from "./activity/ActivityRenderer";
export { WorkflowActivityRenderer } from "./activity/ActivityRenderer";
export {
  WorkflowActivityDetailBlock as ActivityDetailBlock,
  WorkflowActivityDetailStack as ActivityDetailStack,
} from "./activity/ActivityDetail";
export { WorkflowAgentFlowSection as AgentFlowSection } from "./activity/AgentFlowSection";
export { WorkflowAgentFlowSection } from "./activity/AgentFlowSection";
export { AskUserQuestionCard } from "./activity/AskUserQuestionCard";
export { WorkflowCollabAgentToolRow as CollabAgentToolRow } from "./activity/CollabAgentToolRow";
export { WorkflowCollabAgentToolRow } from "./activity/CollabAgentToolRow";
export { WorkflowCommandDetail as CommandDetail } from "./activity/CommandDetailCard";
export { WorkflowCommandExecutionRow as CommandExecutionRow } from "./activity/CommandExecutionRow";
export { WorkflowCommandExecutionRow } from "./activity/CommandExecutionRow";
export { WorkflowDetailCopyButton as DetailCopyButton } from "./activity/DetailCopyButton";
export { WorkflowFileChangeRow as FileChangeRow } from "./activity/FileChangeRow";
export { WorkflowFileChangeRow } from "./activity/FileChangeRow";
export { WorkflowFileReadRow as FileReadRow } from "./activity/FileReadRow";
export { WorkflowFileReadRow } from "./activity/FileReadRow";
export { WorkflowImageGenerationRow as ImageGenerationRow } from "./activity/ImageGenerationRow";
export { WorkflowImageGenerationRow } from "./activity/ImageGenerationRow";
export { WorkflowImageLightbox as ImageLightbox } from "./activity/ImageLightbox";
export { WorkflowImageLightbox } from "./activity/ImageLightbox";
export type { WorkflowImagePreview } from "./activity/ImageLightbox";
export { WorkflowImageViewGroup as ImageViewGroup } from "./activity/ImageViewGroup";
export { WorkflowImageViewGroup } from "./activity/ImageViewGroup";
export { WorkflowMcpApp as McpApp } from "./activity/McpApp";
export { WorkflowMcpApp } from "./activity/McpApp";
export { WorkflowMcpResult as McpResult } from "./activity/McpResult";
export { WorkflowMcpResult } from "./activity/McpResult";
export { PlanModeCard } from "./activity/PlanModeCard";
export { QuestionAskPanel } from "./activity/QuestionAskPanel";
export { WorkflowQuestionCard as QuestionCard } from "./activity/QuestionCard";
export { WorkflowQuestionCard } from "./activity/QuestionCard";
export { QuestionQaCard } from "./activity/QuestionQaCard";
export { WorkflowReasoningRow as ReasoningRow } from "./activity/ReasoningRow";
export { WorkflowReasoningRow } from "./activity/ReasoningRow";
export {
  WorkflowReasoningDisclosureRow as ReasoningDisclosureRow,
  WorkflowReasoningDisclosureRow,
} from "./activity/ReasoningDisclosureRow";
export { WorkflowPermissionRequestRow as PermissionRequestRow } from "./activity/PermissionRequestRow";
export { WorkflowPermissionRequestRow } from "./activity/PermissionRequestRow";
export { WorkflowResultCards as ResultCards } from "./activity/ResultCards";
export { WorkflowResultCards } from "./activity/ResultCards";
export { WorkflowToolCallRow as ToolCallRow } from "./activity/ToolCallRow";
export { WorkflowToolCallRow } from "./activity/ToolCallRow";
export {
  WorkflowToolDisclosureRow as ToolDisclosureRow,
  WorkflowToolDisclosureRow,
} from "./activity/ToolDisclosureRow";
export { ToolDetail, ToolIcon, toolLabel } from "./activity/ToolCallRowDetails";
export {
  DetailBlock,
  ImageGenerationDetail,
  MarkdownDetail,
  PlanDetail,
  ToolSearchDetail,
  UsageDetail,
  WebSearchDetail,
} from "./activity/ToolCallRowDetails/detail-sections";
export { ToolDetailFrame } from "./activity/ToolCallRowDetails/ToolDetailFrame";
export {
  WorkflowTurnItemRenderer as TurnItemRenderer,
  WorkflowTurnItemRenderer,
} from "./activity/TurnItemRenderer";
export { WorkflowWebSearchRow as WebSearchRow } from "./activity/WebSearchRow";
export { WorkflowWebSearchRow } from "./activity/WebSearchRow";
export {
  WorkflowContextCompactionMarker as ContextCompactionMarker,
  WorkflowHookPromptBlock as HookPromptBlock,
  WorkflowImageViewRow as ImageViewRow,
  WorkflowReviewModeMarker as ReviewModeMarker,
  WorkflowUnknownRawJson as UnknownRawJson,
  WorkflowContextCompactionMarker,
  WorkflowHookPromptBlock,
  WorkflowImageViewRow,
  WorkflowReviewModeMarker,
  WorkflowUnknownRawJson,
} from "./activity/MarkerRows";

// --- content/ ----------------------------------------------------------
export { WorkflowMarkdownContent as MarkdownContent } from "./content/MarkdownContent";
export { WorkflowMarkdownContent } from "./content/MarkdownContent";
export { WorkflowMarkdownProvider } from "./content/MarkdownContext";
export { useMarkdownContext } from "./content/MarkdownContext";
export { WorkflowCodeBlock as CodeBlock } from "./content/CodeBlock";
export { WorkflowCodeBlock } from "./content/CodeBlock";
export { WorkflowContentDialog as ContentDialog } from "./content/ContentDialog";
export { WorkflowInlineCode as InlineCode } from "./content/InlineCode";
export { MarkdownErrorBoundary } from "./content/MarkdownErrorBoundary";
export {
  WorkflowFileLink as FileLink,
  WorkflowMarkdownLink as MarkdownLink,
} from "./content/MarkdownLink";
export { WorkflowFileLink } from "./content/MarkdownLink";
export { WorkflowMarkdownLink } from "./content/MarkdownLink";
export { WorkflowMarkdownMedia as MarkdownMedia } from "./content/MarkdownMedia";
export { WorkflowMarkdownMedia } from "./content/MarkdownMedia";
export { WorkflowMarkdownTable as MarkdownTable } from "./content/MarkdownTable";
export { WorkflowMarkdownTable } from "./content/MarkdownTable";
export { WorkflowMermaidBlock as MermaidBlock } from "./content/MermaidBlock";
export { WorkflowMermaidBlock } from "./content/MermaidBlock";

// --- disclosure/ --------------------------------------------------------
export { IoCard } from "./disclosure/IoCard";
export { toolIconFor } from "./disclosure/tool-icon";

// --- task-context/ ------------------------------------------------------
export * from "./task-context";
// --- adapter/ ----------------------------------------------------------
export {
  messagesToWorkflowReadThreadResponse,
  toWorkflowMessages,
  finalAssistantText,
  itemOutputText,
  itemInputText,
} from "./adapter/workflow-message-adapter";
export type {
  WorkflowMessageBlock,
  WorkflowActivity,
  WorkflowTurnStatus,
} from "./adapter/workflow-message-adapter";
export { buildWorkflowMessages } from "./adapter/workflow-consumption-model";
export type { WorkflowMessageBlock as WorkflowConsumptionBlock } from "./adapter/workflow-consumption-model";
export { rehypeSharedHighlight } from "./adapter/shared-rehype-highlight";
export {
  itemOutputText as itemOutputTextFromText,
  itemInputText as itemInputTextFromText,
} from "./adapter/item-text";

// --- fixtures/ ---------------------------------------------------------
export {
  WorkflowCodexFixturePage,
  WorkflowChatShellFixturePage,
} from "./fixtures/WorkflowCodexFixturePage";
export { TaskContextFixturePage } from "./fixtures/TaskContextFixturePage";

// --- root files (kept at workflow-chat/ for now) -----------------------
export { WorkflowScrollToBottomButton as ScrollToBottomButton } from "./ScrollToBottomButton";
export { WorkflowScrollToBottomButton } from "./ScrollToBottomButton";
export { ViewportCulling } from "./ViewportCulling";

// --- legacy message-view compatibility ----------------------------------
export { MessageItemView } from "./message-view";
