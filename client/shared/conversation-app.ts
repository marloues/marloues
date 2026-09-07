import type { WorkflowToolResult } from "./workflow-tool-result";
export interface ConversationAppOwner {
  sessionId: string;
  turnId: string;
  itemId: string;
}
export interface ConversationAppResource {
  url: string;
  uri: string;
  title: string;
  arguments: unknown;
  result?: WorkflowToolResult;
}
export interface ConversationAppCall extends ConversationAppOwner {
  name: string;
  arguments?: Record<string, unknown>;
  approvalId?: string;
}
export type ConversationAppCallResult =
  | { kind: "result"; result: unknown }
  | {
      kind: "approval";
      approvalId: string;
      name: string;
      arguments: unknown;
      reason: string;
    };
