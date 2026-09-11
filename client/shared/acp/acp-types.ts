import type {
  PromptResponse,
  RequestPermissionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk";

export type ACPWorkflowEventSource = "codex" | "claude" | "openai" | "local";

interface ACPWorkflowEventEnvelope {
  source: ACPWorkflowEventSource;
  nativeType?: string;
  rawEvent?: unknown;
  timestamp?: number;
}

export type ACPWorkflowEvent =
  | (ACPWorkflowEventEnvelope & {
      type: "session/update";
      sessionId: string;
      /** Session-level updates may not belong to a specific turn. */
      turnId?: string;
      notification: SessionNotification;
    })
  | (ACPWorkflowEventEnvelope & {
      type: "permission/request";
      sessionId: string;
      turnId?: string;
      requestId: string;
      request: RequestPermissionRequest;
    })
  | (ACPWorkflowEventEnvelope & {
      type: "prompt/response";
      sessionId: string;
      turnId: string;
      response: PromptResponse;
    })
  | (ACPWorkflowEventEnvelope & {
      type: "extension";
      namespace: "com.marloues";
      name: string;
      sessionId?: string;
      turnId?: string;
      data: unknown;
    })
  | (ACPWorkflowEventEnvelope & {
      type: "unknown";
      sessionId?: string;
      turnId?: string;
      nativeType: string;
      raw: unknown;
    });
