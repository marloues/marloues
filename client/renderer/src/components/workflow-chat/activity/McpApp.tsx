import { Button } from "@/components/ui/button";
import styles from "./McpApp.module.css";
import {
  observeConversationTheme,
  readConversationTheme,
} from "../content/conversation-theme";
import { useEffect, useRef, useState, useMemo, useLayoutEffect } from "react";
import type {
  ConversationAppOwner,
  ConversationAppResource,
  ConversationAppCallResult,
} from "@shared/conversation-app";
import { useMarkdownContext } from "../content/MarkdownContext";
import { WorkflowContentDialog } from "../content/ContentDialog";
import type { WorkflowMcpToolCallItem } from "@shared/workflow-read-thread-contract";

type Approval = Extract<ConversationAppCallResult, { kind: "approval" }> & {
  id: string | number;
  args: Record<string, unknown>;
};
type Entry = {
  container: HTMLDivElement;
  frame: HTMLIFrameElement;
  resource: ConversationAppResource;
  ready: boolean;
  owner: ConversationAppOwner;
  approval?: Approval;
  showApproval?: (approval: Approval | undefined) => void;
  active: boolean;
  pending: Set<string | number>;
};
const entries = new Map<string, Entry>();
let parking: HTMLDivElement | undefined;
function parked() {
  if (!parking) {
    parking = document.createElement("div");
    parking.hidden = true;
    parking.setAttribute("inert", "");
    document.body.append(parking);
  }
  return parking;
}
function move(target: HTMLElement, node: HTMLElement) {
  // Chromium's state-preserving move keeps iframe forms alive across virtualization.
  if ("moveBefore" in target && node.isConnected)
    (
      target as HTMLElement & {
        moveBefore(node: Node, before: Node | null): void;
      }
    ).moveBefore(node, null);
  else target.append(node);
}
function send(entry: Entry, value: unknown) {
  entry.frame.contentWindow?.postMessage(value, "*");
}
function reply(
  entry: Entry,
  id: string | number,
  result: unknown,
  error?: string,
) {
  send(entry, {
    jsonrpc: "2.0",
    id,
    ...(error ? { error: { code: -32000, message: error } } : { result }),
  });
}
function deliver(entry: Entry) {
  if (!entry.ready) return;
  send(entry, {
    jsonrpc: "2.0",
    method: "ui/notifications/tool-input",
    params: { arguments: entry.resource.arguments ?? {} },
  });
  if (entry.resource.result)
    send(entry, {
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: entry.resource.result,
    });
}
function createEntry(
  key: string,
  owner: ConversationAppOwner,
  resource: ConversationAppResource,
): Entry {
  const container = document.createElement("div");
  const frame = document.createElement("iframe");
  frame.title = resource.title;
  frame.sandbox.add("allow-scripts", "allow-forms");
  frame.referrerPolicy = "no-referrer";
  frame.src = resource.url;
  frame.className = styles.frame;
  container.append(frame);
  const entry: Entry = {
    container,
    frame,
    resource,
    owner,
    ready: false,
    active: true,
    pending: new Set(),
  };
  entries.set(key, entry);
  window.addEventListener("message", async (event) => {
    if (
      event.source !== frame.contentWindow ||
      !event.data ||
      typeof event.data !== "object" ||
      event.data.jsonrpc !== "2.0"
    )
      return;
    const { id, method, params = {} } = event.data;
    if (method === "ui/initialize") {
      if (params.protocolVersion !== "2026-01-26") {
        reply(entry, id, null, "不支持此 MCP Apps 协议版本");
        return;
      }
      reply(entry, id, {
        protocolVersion: "2026-01-26",
        hostInfo: { name: "Marloues", version: "0.4.0" },
        hostCapabilities: { serverTools: {} },
        hostContext: {
          theme: readConversationTheme().theme,
          styles: readConversationTheme().styles,
          displayMode: "inline",
          availableDisplayModes: ["inline"],
          locale: navigator.language,
          containerDimensions: { maxWidth: container.clientWidth },
        },
      });
      return;
    }
    if (method === "ui/notifications/initialized") {
      entry.ready = true;
      deliver(entry);
      return;
    }
    if (method === "ui/notifications/size-changed") {
      if (typeof params.height === "number" && Number.isFinite(params.height))
        frame.style.height = `${Math.max(80, Math.min(1200, params.height))}px`;
      return;
    }
    if (id == null) return;
    if (method === "ping") {
      reply(entry, id, {});
      return;
    }
    if (!entry.ready || !entry.active) {
      reply(entry, id, null, "组件未就绪或已离屏");
      return;
    }
    if (method !== "tools/call") {
      reply(entry, id, null, "此宿主未开放该能力");
      return;
    }
    if (entry.pending.has(id) || entry.approval) {
      reply(entry, id, null, "已有操作等待完成");
      return;
    }
    entry.pending.add(id);
    try {
      const args =
        params.arguments &&
        typeof params.arguments === "object" &&
        !Array.isArray(params.arguments)
          ? params.arguments
          : {};
      const result = await window.marloues.chat.callAppTool({
        ...owner,
        name: String(params.name),
        arguments: args,
      });
      if (result.kind === "approval") {
        entry.approval = { ...result, id, args };
        entry.showApproval?.(entry.approval);
      } else reply(entry, id, result.result);
    } catch (error) {
      reply(
        entry,
        id,
        null,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      entry.pending.delete(id);
    }
  });
  return entry;
}

export function WorkflowMcpApp({ item }: { item: WorkflowMcpToolCallItem }) {
  const { sessionId, turnId } = useMarkdownContext();
  const owner = useMemo(
    () =>
      sessionId && turnId ? { sessionId, turnId, itemId: item.id } : undefined,
    [sessionId, turnId, item.id],
  );
  const key = JSON.stringify(owner ?? null);
  const placeholder = useRef<HTMLDivElement>(null);
  const [resource, setResource] = useState<ConversationAppResource | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [approval, setApproval] = useState<Approval>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (
      !owner ||
      !window.marloues?.chat?.loadAppResource ||
      !(
        item.settled ||
        ["completed", "failed", "error", "cancelled"].includes(item.status)
      )
    )
      return;
    let current = true;
    setLoading(true);
    setError("");
    window.marloues.chat
      .loadAppResource(owner)
      .then((value) => {
        if (current) setResource(value);
      })
      .catch((reason) => {
        if (current)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [key, owner, item.settled, item.status, attempt]);
  useLayoutEffect(() => {
    if (!resource || !owner || !placeholder.current) return;
    const entry = entries.get(key) ?? createEntry(key, owner, resource);
    entry.resource = { ...resource, result: item.result ?? resource.result };
    entry.active = true;
    entry.showApproval = setApproval;
    setApproval(entry.approval);
    move(placeholder.current, entry.container);
    deliver(entry);
    return () => {
      entry.active = false;
      entry.showApproval = undefined;
      move(parked(), entry.container);
    };
  }, [key, owner, resource, item.result]);
  useEffect(() => {
    if (!resource) return;
    const update = () => {
      const entry = entries.get(key);
      if (!entry?.ready || !entry.active) return;
      const { theme, styles } = readConversationTheme();
      send(entry, {
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { theme, styles },
      });
    };
    update();
    return observeConversationTheme(update);
  }, [key, resource]);
  async function respond(approved: boolean) {
    const entry = entries.get(key);
    if (!entry || !approval || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!approved) reply(entry, approval.id, null, "用户拒绝此操作");
      else {
        const result = await window.marloues.chat.callAppTool({
          ...entry.owner,
          name: approval.name,
          arguments: approval.args,
          approvalId: approval.approvalId,
        });
        if (result.kind === "approval")
          throw new Error("批准已过期，请在组件内重试");
        reply(entry, approval.id, result.result);
      }
      entry.approval = undefined;
      setApproval(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!resource && !error && !loading) return null;
  return (
    <section className={`workflow-mcp-app ${styles.app}`} data-kind="mcp-app">
      {loading && !resource ? (
        <span className={styles.loading} role="status">
          正在检查交互资源…
        </span>
      ) : null}
      {error ? (
        <div className={styles.error} role="alert">
          {error}
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            重试资源
          </Button>
        </div>
      ) : null}
      {resource ? (
        <>
          <small className={styles.title}>{resource.title}</small>
          <div ref={placeholder} />
        </>
      ) : null}
      {approval ? (
        <WorkflowContentDialog
          title="交互组件请求执行工具"
          onClose={() => void respond(false)}
        >
          <div className={styles.approval}>
            <p>{approval.name}</p>
            <p>{approval.reason}</p>
            <pre>{JSON.stringify(approval.arguments, null, 2)}</pre>
            <div className={styles.actions}>
              <Button
                size="sm"
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void respond(true)}
              >
                允许本次操作
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => void respond(false)}
              >
                拒绝
              </Button>
            </div>
          </div>
        </WorkflowContentDialog>
      ) : null}
    </section>
  );
}
