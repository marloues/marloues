export type ConversationInputKind =
  | "question"
  | "form"
  | "url"
  | "auth"
  | "toolSuggestion"
  | "confirmation"
  | "permission"
  | "unknown";
export interface ConversationInputField {
  id: string;
  label: string;
  description?: string;
  type: "string" | "number" | "integer" | "boolean" | "enum" | "multi";
  required?: boolean;
  options?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}
export interface ConversationInputRequest {
  sessionId: string;
  turnId: string;
  requestId: string;
  kind: ConversationInputKind;
  title: string;
  source: string;
  fields: ConversationInputField[];
  url?: string;
  status: "pending" | "answered" | "skipped" | "cancelled";
  answers?: Record<string, unknown>;
  unsupported?: string;
}
export interface ConversationInputResponse {
  sessionId: string;
  turnId: string;
  requestId: string;
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}
export function validateConversationInput(
  request: ConversationInputRequest,
  response: ConversationInputResponse,
): string | null {
  if (!["accept", "decline", "cancel"].includes(response.action))
    return "无效回应";
  if (response.action !== "accept") return null;
  if (request.unsupported) return request.unsupported;
  const values = response.content ?? {};
  for (const field of request.fields) {
    const value = values[field.id];
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    ) {
      if (field.required) return `请填写${field.label}`;
      continue;
    }
    if (field.type === "boolean" && typeof value !== "boolean")
      return `${field.label}需要是选项`;
    if (
      ["number", "integer"].includes(field.type) &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        (field.type === "integer" && !Number.isInteger(value)) ||
        (field.minimum != null && value < field.minimum) ||
        (field.maximum != null && value > field.maximum))
    )
      return `${field.label}超出数值范围`;
    if (
      field.type === "string" &&
      (typeof value !== "string" ||
        (field.minLength != null && value.length < field.minLength) ||
        (field.maxLength != null && value.length > field.maxLength))
    )
      return `${field.label}文字长度不符合要求`;
    if (
      field.type === "enum" &&
      (typeof value !== "string" || !field.options?.includes(value))
    )
      return `请选择${field.label}`;
    if (
      field.type === "multi" &&
      (!Array.isArray(value) ||
        !value.every(
          (part) => typeof part === "string" && field.options?.includes(part),
        ))
    )
      return `请选择${field.label}`;
  }
  if (
    Object.keys(values).some(
      (key) => !request.fields.some((field) => field.id === key),
    )
  )
    return "回应包含未知字段";
  return null;
}
export function inputFieldsFromSchema(schema: Record<string, unknown> = {}): {
  fields: ConversationInputField[];
  unsupported?: string;
} {
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  let unsupported: string | undefined =
    (schema.type != null && schema.type !== "object") ||
    Object.keys(schema).some((key) =>
      [
        "$ref",
        "oneOf",
        "anyOf",
        "allOf",
        "not",
        "if",
        "then",
        "else",
        "dependentRequired",
        "dependentSchemas",
        "patternProperties",
      ].includes(key),
    )
      ? "此表单包含暂不支持的校验条件，可跳过或取消。"
      : undefined;
  const fields = Object.entries(properties).map(([id, value]) => {
    const rule = value && typeof value === "object" ? value : {};
    if (rule !== value)
      unsupported = "此表单包含暂不支持的字段类型，可跳过或取消。";
    if (
      Object.keys(rule).some((key) =>
        [
          "$ref",
          "oneOf",
          "anyOf",
          "allOf",
          "pattern",
          "format",
          "const",
          "not",
          "exclusiveMinimum",
          "exclusiveMaximum",
          "multipleOf",
        ].includes(key),
      )
    )
      unsupported = "此表单包含暂不支持的校验条件，可跳过或取消。";
    const enumValues = Array.isArray(rule.enum) ? rule.enum : undefined;
    const type = enumValues ? "enum" : rule.type;
    if (
      !["string", "number", "integer", "boolean", "enum"].includes(
        String(type),
      ) ||
      (enumValues && !enumValues.every((value) => typeof value === "string"))
    )
      unsupported = "此表单包含暂不支持的字段类型，可跳过或取消。";
    return {
      id,
      label: String(rule.title ?? id),
      description:
        typeof rule.description === "string" ? rule.description : undefined,
      type: (["string", "number", "integer", "boolean", "enum"].includes(
        String(type),
      )
        ? type
        : "string") as ConversationInputField["type"],
      required: required.includes(id),
      options: enumValues as string[] | undefined,
      minimum: typeof rule.minimum === "number" ? rule.minimum : undefined,
      maximum: typeof rule.maximum === "number" ? rule.maximum : undefined,
      minLength:
        typeof rule.minLength === "number" ? rule.minLength : undefined,
      maxLength:
        typeof rule.maxLength === "number" ? rule.maxLength : undefined,
    };
  });
  return { fields, unsupported };
}
