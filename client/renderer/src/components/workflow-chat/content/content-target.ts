export type ContentTarget =
  | { kind: "file"; path: string; line?: number }
  | { kind: "url"; url: string }
  | { kind: "anchor"; href: string }
  | { kind: "unsupported" };

export function resolveContentTarget(
  href: string,
  cwd?: string | null,
): ContentTarget {
  const value = href.trim();
  if (!value || hasControlCharacter(value)) return { kind: "unsupported" };
  if (value.startsWith("#")) return { kind: "anchor", href: value };
  if (/^(https?:|mailto:)/i.test(value)) return { kind: "url", url: value };
  if (
    /^[a-z][a-z\d+.-]*:/i.test(value) &&
    !/^file:/i.test(value) &&
    !/^[a-z]:[\\/]/i.test(value)
  )
    return { kind: "unsupported" };
  let decoded: string;
  try {
    if (/^file:/i.test(value)) {
      const url = new URL(value);
      if (url.hostname && url.hostname !== "localhost")
        return { kind: "unsupported" };
      decoded = decodeURIComponent(url.pathname) + url.hash;
      if (/^\/[a-z]:\//i.test(decoded)) decoded = decoded.slice(1);
    } else decoded = decodeURIComponent(value);
  } catch {
    return { kind: "unsupported" };
  }
  const match = decoded.match(/(?:#L(\d+)(?:-L?\d+)?|:(\d+)(?::\d+)?)$/);
  const line = match ? Number(match[1] ?? match[2]) : undefined;
  const file = match ? decoded.slice(0, match.index) : decoded;
  const absolute = /^(?:\/|[a-z]:[\\/])/i.test(file);
  if (!absolute && !cwd) return { kind: "unsupported" };
  return {
    kind: "file",
    path: absolute ? file : `${cwd!.replace(/[\\/]$/, "")}/${file}`,
    line,
  };
}

export function markdownUrlTransform(url: string): string {
  if (hasControlCharacter(url)) return "";
  if (
    /^(?:https?:|mailto:|file:|data:(?:image|audio|video)\/|blob:)/i.test(url)
  )
    return url;
  if (/^[a-z]:[\\/]/i.test(url)) return url;
  return /^[a-z][a-z\d+.-]*:/i.test(url) || hasControlCharacter(url) ? "" : url;
}

export function mediaSource(value: string, cwd?: string | null): string {
  if (/^(?:https?:|data:(?:image|audio|video)\/|blob:)/i.test(value))
    return value;
  const target = resolveContentTarget(value, cwd);
  if (target.kind !== "file") return "";
  const normalized = target.path.replace(/\\/g, "/");
  return `file://${normalized.startsWith("/") ? "" : "/"}${normalized
    .split("/")
    .map((part, index) =>
      index === 0 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part),
    )
    .join("/")}`;
}

export function mediaKind(src: string): "image" | "audio" | "video" {
  if (
    /^data:audio\//i.test(src) ||
    /\.(?:mp3|wav|ogg|m4a|aac|flac)(?:[?#]|$)/i.test(src)
  )
    return "audio";
  if (
    /^data:video\//i.test(src) ||
    /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(src)
  )
    return "video";
  return "image";
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) if (character.charCodeAt(0) < 32) return true;
  return false;
}
