/** Keeps MCP content and structured output intact across runtime and history. */
export interface WorkflowToolResult {
  content: unknown[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export function workflowToolResult(
  value: unknown,
): WorkflowToolResult | undefined {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.length &&
      parsed.every(
        (block) => block && typeof block === "object" && "type" in block,
      )
      ? { content: parsed }
      : undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.content) && record.structuredContent === undefined)
    return undefined;
  return {
    content: Array.isArray(record.content) ? record.content : [],
    ...(record.structuredContent !== undefined
      ? { structuredContent: record.structuredContent }
      : {}),
    ...(record._meta && typeof record._meta === "object"
      ? { _meta: record._meta as Record<string, unknown> }
      : {}),
    ...(typeof record.isError === "boolean" ? { isError: record.isError } : {}),
  };
}
