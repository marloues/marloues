/** 适配规格草案；不参与产品编译。现有 phase/settled 继续使用，不另造语义角色。 */
export type ConversationIdentity = {
  threadId: string;
  turnId: string;
  itemId: string;
  hostId: string;
};

export type AsyncAction<T> = (input: T) => Promise<
  { ok: true } | { ok: false; message: string }
>;

export type ConversationCapabilities = {
  editOriginalMessage: boolean;
  openFile: boolean;
  openThread: boolean;
  openExternalUrl: boolean;
  markdownMedia: boolean;
  math: boolean;
  mermaid: boolean;
  responseAnnotations: boolean;
  mcpApp: boolean;
  revertPatch: boolean;
  resources: ReadonlySet<ResultResource['kind']>;
};

export type TimingDecision = {
  mode: 'hidden' | 'working' | 'worked' | 'stopped' | 'total';
  placement: 'none' | 'before-process' | 'before-answer' | 'process-header';
  basis: 'runtime' | 'client-observed' | 'turn-total' | 'unavailable';
  startedAtMs: number | null;
  endedAtMs: number | null;
  durationMs: number | null;
};

export type DisclosurePolicy =
  | { kind: 'command'; defaultExpanded: false }
  | { kind: 'ordinary'; defaultExpanded: boolean }
  | { kind: 'phase-separated'; runningDefault: boolean; settledDefault: boolean }
  | { kind: 'interactive'; collapsible: boolean; autoExpand: boolean };

export type ToolDisclosureInput = {
  identity: ConversationIdentity;
  policy: DisclosurePolicy;
  phase: 'running' | 'settled';
  hasContent: boolean;
  forcedExpanded?: boolean;
  onExpand?: () => void; // 仅从关闭到打开；不能在每次内容更新时触发。
};

export type CodeBlockProps = {
  blockId: string;
  content: string;
  language?: string;
  fenceOpen: boolean;
  wrapMode: 'off' | 'always' | 'user-controlled';
  writingBlockMode: boolean;
  allowWide: boolean;
  stickyHeader: boolean;
  onCopy: AsyncAction<{ text: string; html?: string }>;
  onAddSelection?: AsyncAction<{ text: string; blockId: string }>;
};

export type MarkdownContext = {
  identity: ConversationIdentity;
  cwd: string | null;
  streaming: boolean;
  capabilities: ConversationCapabilities;
  externalResourcePolicy: 'allow' | 'restricted';
  mediaCacheKey: string;
  onOpenFile?: AsyncAction<{ path: string; line?: number; endLine?: number }>;
  onOpenThread?: AsyncAction<{ threadId: string; turnId?: string }>;
  onOpenUrl?: AsyncAction<{ url: string }>;
};

export type TableProps = {
  tableId: string;
  markdownSource: string;
  allowWide: boolean;
  onCopy: AsyncAction<{ text: string; html?: string }>;
};

export type MediaModel = {
  id: string;
  kind: 'image' | 'audio' | 'video';
  source: { pathOrUrl: string; hostId: string };
  resolvedSrc?: string;
  status: 'loading' | 'ready' | 'unavailable';
  alt: string;
  title?: string;
  layout: 'inline' | 'wide' | 'grid' | 'scrollable';
  width?: number;
  height?: number;
};

export type ToolContent = (
  | { type: 'text'; text: string }
  | { type: 'image' | 'audio'; data: string; mimeType: string }
  | { type: 'resource_link'; uri: string; name: string; description?: string }
  | { type: 'embedded_resource'; resource: {
      uri: string; mimeType?: string; text?: string; blob?: string;
    } }
  | { type: 'unknown'; raw: unknown }
) & { annotations?: Record<string, unknown> };

export type ToolResultModel = {
  identity: ConversationIdentity;
  callId: string;
  status: 'running' | 'success' | 'failed' | 'cancelled' | 'unknown';
  content: readonly ToolContent[];
  structuredContent?: unknown;
  raw: unknown;
  durationMs?: number;
  exitCode?: number;
  processId?: string;
};

export type McpAppModel = {
  identity: ConversationIdentity;
  callId: string;
  appId: string;
  resourceUri: string;
  status: 'loading' | 'ready' | 'error' | 'fallback' | 'superseded';
  collapsible: boolean;
  autoExpand: boolean;
  minHeight?: number;
  html?: string; // 交给宿主 App surface，不直接塞入 Markdown。
  error?: string;
  onRetry: AsyncAction<{ callId: string; resourceUri: string }>;
};

export type ElicitationKind = 'toolSuggestion' | 'connectorAuth' | 'urlAction'
  | 'formElicitation' | 'generic' | 'mcpToolCall' | 'openaiForm'
  | 'unsupportedOpenAIForm';

export type QuestionRecord = {
  identity: ConversationIdentity;
  requestId: string;
  status: 'pending' | 'answered' | 'skipped' | 'cancelled' | 'failed';
  questionsAndAnswers: readonly {
    questionId: string; question: string; answer?: string;
  }[];
};

export type ResultResource = {
  id: string;
  identity: ConversationIdentity;
  title: string;
} & (
  | { kind: 'file'; path: string; mimeType?: string }
  | { kind: 'website'; url: string }
  | { kind: 'artifact-session'; artifactRef: string }
  | { kind: 'google-drive'; url: string; resourceKind: string }
  | { kind: 'appgen-app'; url: string; appId?: string }
);

export type UserMessageEditorProps<TContent> = {
  identity: ConversationIdentity;
  initialContent: TContent;
  draft: TContent;
  submitting: boolean;
  onDraftChange: (content: TContent) => void;
  onCancel: () => void;
  onSubmit: AsyncAction<{ identity: ConversationIdentity; content: TContent }>;
};

export type ScrollAnchor = {
  sessionKey: string;
  turnId: string;
  itemId?: string;
  viewportOffset: number;
};

export type ConversationLayoutCoordinator = {
  captureAnchor: (itemId?: string) => ScrollAnchor | null;
  restoreAnchor: (anchor: ScrollAnchor) => void;
  navigate: (target: { turnId: string; itemId?: string }) => Promise<void>;
  pinInteractiveItem: (identity: ConversationIdentity) => () => void;
  // 恢复前核对 sessionKey；异步旧任务回调不能改变新任务布局。
};
