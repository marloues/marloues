const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DETAILS",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "UL",
]);

const SKIP_TAGS = new Set([
  "AREA",
  "BASE",
  "CANVAS",
  "DATALIST",
  "HEAD",
  "LINK",
  "MAP",
  "META",
  "NOSCRIPT",
  "OPTION",
  "SCRIPT",
  "SELECT",
  "STYLE",
  "TEMPLATE",
  "TEXTAREA",
  "TITLE",
]);

type ReactLikeClipboardEvent = {
  clipboardData?: {
    getData: (type: string) => string;
  };
};

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(https?|mailto):/iu.test(trimmed)) return true;
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp);/iu.test(trimmed)) return true;
  return !/^[a-z][a-z0-9+.-]*:/iu.test(trimmed);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ");
}

function fenceCode(code: string, language = ""): string {
  const ticks = "`".repeat(
    Math.max(
      3,
      ...(code.match(/`{3,}/gu)?.map((match) => match.length) ?? [0]),
    ),
  );
  const normalized = code.replace(/\r\n/g, "\n").replace(/\n$/, "");
  return `${ticks}${language}\n${normalized}\n${ticks}`;
}

function inlineNodes(children: Array<ChildNode>): string {
  let result = "";
  let pendingWhitespace = false;

  for (const node of children) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent ?? "");
      if (!text) continue;
      if (text === " ") {
        pendingWhitespace = result.length > 0;
        continue;
      }
      if (pendingWhitespace && result && !/\s$/u.test(result)) result += " ";
      pendingWhitespace = false;
      result += text;
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as HTMLElement;
    if (SKIP_TAGS.has(element.tagName)) continue;

    const inline = inlineElement(element);
    if (!inline) {
      pendingWhitespace = result.length > 0;
      continue;
    }
    if (pendingWhitespace && result && !/\s$/u.test(result)) result += " ";
    pendingWhitespace = false;
    result += inline;
  }

  return result;
}

function inlineElement(element: HTMLElement): string {
  const children = Array.from(element.childNodes);
  switch (element.tagName) {
    case "BR":
      return "\n";
    case "B":
    case "STRONG": {
      const value = inlineNodes(children).trim();
      return value ? `**${value}**` : "";
    }
    case "I":
    case "EM": {
      const value = inlineNodes(children).trim();
      return value ? `*${value}*` : "";
    }
    case "DEL":
    case "S":
    case "STRIKE": {
      const value = inlineNodes(children).trim();
      return value ? `~~${value}~~` : "";
    }
    case "CODE": {
      const value = normalizeText(element.textContent ?? "").trim();
      return value ? `\`${value}\`` : "";
    }
    case "A": {
      const href = element.getAttribute("href") ?? "";
      const label = inlineNodes(children).trim() || href;
      return isSafeUrl(href) ? `[${label}](${href})` : label;
    }
    case "IMG": {
      const src = element.getAttribute("src") ?? "";
      const alt = normalizeText(element.getAttribute("alt") ?? "").trim();
      return isSafeUrl(src) ? `![${alt || "image"}](${src})` : alt;
    }
    default:
      return inlineNodes(children);
  }
}

function listItems(
  element: HTMLElement,
  ordered: boolean,
  level: number,
): string[] {
  const items: string[] = [];
  let index = 1;

  for (const child of Array.from(element.children)) {
    if (child.tagName !== "LI") continue;
    const marker = ordered ? `${index++}. ` : "- ";
    const blocks = blockNodes(Array.from(child.childNodes), level + 1);
    const [first, ...rest] = blocks.length > 0 ? blocks : [""];
    items.push(`${marker}${first}`);
    for (const block of rest) {
      items.push(`${"  ".repeat(level + 1)}${block}`);
    }
  }

  return items;
}

function blockNodes(children: Array<ChildNode>, level = 0): string[] {
  const blocks: string[] = [];
  let inlineBuffer: Array<ChildNode> = [];

  const flushInline = () => {
    if (inlineBuffer.length === 0) return;
    const value = inlineNodes(inlineBuffer).trim();
    if (value) blocks.push(value);
    inlineBuffer = [];
  };

  for (const node of children) {
    if (node.nodeType === Node.TEXT_NODE) {
      inlineBuffer.push(node);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const element = node as HTMLElement;
    if (SKIP_TAGS.has(element.tagName)) continue;
    if (!BLOCK_TAGS.has(element.tagName)) {
      inlineBuffer.push(element);
      continue;
    }

    flushInline();
    blocks.push(...blockElement(element, level));
  }

  flushInline();
  return blocks;
}

function blockElement(element: HTMLElement, level: number): string[] {
  const children = Array.from(element.childNodes);
  switch (element.tagName) {
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6": {
      const headingLevel = Number(element.tagName[1]);
      const value = inlineNodes(children).trim();
      return value ? [`${"#".repeat(headingLevel)} ${value}`] : [];
    }
    case "P":
    case "DIV":
    case "SECTION":
    case "ARTICLE":
    case "ASIDE":
    case "HEADER":
    case "FOOTER":
    case "MAIN":
    case "NAV":
    case "FIGCAPTION":
    case "SUMMARY":
    case "DT":
    case "DD": {
      const value = inlineNodes(children).trim();
      return value ? [value] : [];
    }
    case "BLOCKQUOTE": {
      const value = blockNodes(children, level).join("\n\n");
      return value
        ? value.split("\n").map((line) => `> ${line}`.trimEnd())
        : [];
    }
    case "PRE": {
      const code = element.querySelector("code");
      const language =
        Array.from((code ?? element).classList)
          .find((name) => /^language-/u.test(name))
          ?.slice("language-".length) ?? "";
      return [fenceCode((code ?? element).textContent ?? "", language)];
    }
    case "UL":
      return listItems(element, false, level);
    case "OL":
      return listItems(element, true, level);
    case "HR":
      return ["---"];
    case "LI": {
      const value = inlineNodes(children).trim();
      return value ? [value] : [];
    }
    case "TABLE":
      return [tableToMarkdown(element)].filter(Boolean);
    default:
      return blockNodes(children, level);
  }
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";

  const parsed = rows.map((row) =>
    Array.from(row.querySelectorAll("th,td")).map((cell) =>
      inlineNodes(Array.from(cell.childNodes)).trim().replace(/\|/gu, "\\|"),
    ),
  );
  const width = Math.max(...parsed.map((row) => row.length));
  if (width === 0) return "";

  const normalized = parsed.map((row) => {
    const cells = Array.from({ length: width }, (_, index) => row[index] ?? "");
    return `| ${cells.join(" | ")} |`;
  });
  normalized.splice(
    1,
    0,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
  );
  return normalized.join("\n");
}

/** Converts formatted clipboard HTML into the composer's Markdown model. */
export function htmlToMarkdown(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.body
    .querySelectorAll("script,style,template,noscript")
    .forEach((element) => element.remove());

  return blockNodes(Array.from(parsed.body.childNodes))
    .join("\n\n")
    .replace(/[ \t]+\n/gu, "\n")
    .trim();
}

export function hasFormattedClipboard(event: ReactLikeClipboardEvent): boolean {
  return Boolean(event.clipboardData?.getData("text/html")?.trim());
}
