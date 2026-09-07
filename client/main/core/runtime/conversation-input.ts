import { randomUUID } from "node:crypto";
import type { RuntimeEvent } from "@shared/agent-runtime";
import {
  validateConversationInput,
  type ConversationInputRequest,
  type ConversationInputResponse,
} from "@shared/conversation-input";
type Pending = {
  request: ConversationInputRequest;
  finish: (response: ConversationInputResponse) => void;
};
export class ConversationInputBroker {
  private pending = new Map<string, Pending>();
  request(
    input: Omit<ConversationInputRequest, "requestId" | "status">,
    emit: (event: RuntimeEvent) => void,
    signal?: AbortSignal,
  ): Promise<ConversationInputResponse> {
    const request: ConversationInputRequest = {
      ...input,
      requestId: randomUUID(),
      status: "pending",
    };
    const publish = () =>
      emit({
        kind: "item-updated",
        payload: {
          turnId: request.turnId,
          item: {
            type: "permissionRequest",
            id: request.requestId,
            toolName: request.source,
            reason: request.title,
            status: request.status === "pending" ? "running" : "completed",
            settled: request.status !== "pending",
            question: { ...request },
          },
        },
      });
    return new Promise((resolve) => {
      const cancel = () =>
        this.pending
          .get(request.requestId)
          ?.finish({
            sessionId: request.sessionId,
            turnId: request.turnId,
            requestId: request.requestId,
            action: "cancel",
          });
      this.pending.set(request.requestId, {
        request,
        finish: (response) => {
          this.pending.delete(request.requestId);
          signal?.removeEventListener("abort", cancel);
          request.status =
            response.action === "accept"
              ? "answered"
              : response.action === "decline"
                ? "skipped"
                : "cancelled";
          request.answers = response.content;
          publish();
          resolve(response);
        },
      });
      publish();
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }
  respond(response: ConversationInputResponse): void {
    const pending = this.pending.get(response.requestId);
    if (
      !pending ||
      pending.request.sessionId !== response.sessionId ||
      pending.request.turnId !== response.turnId
    )
      throw new Error("问题已结束或不属于此任务");
    const error = validateConversationInput(pending.request, response);
    if (error) throw new Error(error);
    pending.finish(response);
  }
  cancelTurn(sessionId: string, turnId: string): void {
    for (const pending of [...this.pending.values()])
      if (
        pending.request.sessionId === sessionId &&
        pending.request.turnId === turnId
      )
        pending.finish({
          sessionId,
          turnId,
          requestId: pending.request.requestId,
          action: "cancel",
        });
  }
}
export const conversationInputBroker = new ConversationInputBroker();
