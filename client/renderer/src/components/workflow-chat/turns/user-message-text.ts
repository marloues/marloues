import { Lexer } from "marked";

/** Decode rich-text composer serialization for display; protocol text stays intact. */
export function userMessageDisplayText(value: string): string {
  // Ordinary prompts, code and paths are plain text. The rich-text composer
  // writes explicit Markdown hard breaks between its serialized lines.
  if (!/\\\n/.test(value)) return value;
  return Lexer.lexInline(value)
    .map((token) => {
      if (token.type === "br") return "\n";
      if (token.type === "escape") return token.text;
      if (token.type === "link" && token.text === token.href) return token.text;
      if (token.type === "text") return decodeTextEntities(token.text);
      return token.raw;
    })
    .join("");
}

function decodeTextEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
  };
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (raw, entity: string) => {
      if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? raw;
      const hex = entity[1].toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : raw;
    },
  );
}
