import type { ComposerAttachment } from "./composer-attachments";

export type SkillAttachment = Extract<ComposerAttachment, { kind: "skill" }>;

const LAYERS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>';

function buildSkillLink(attachment: SkillAttachment): HTMLButtonElement {
  const link = document.createElement("button");
  link.type = "button";
  link.className = "composer-skill-link";
  link.contentEditable = "false";
  link.dataset.skillAttachmentId = attachment.id;
  link.dataset.skillId = attachment.skill.id;
  link.title =
    attachment.skill.description || `查看 ${attachment.skill.name} 详情`;
  link.ariaLabel = `查看 Skill ${attachment.skill.name} 详情`;

  const icon = document.createElement("span");
  icon.className = "composer-skill-link-icon";
  icon.innerHTML = LAYERS_SVG;
  link.appendChild(icon);

  const name = document.createElement("span");
  name.className = "composer-skill-link-name";
  name.textContent = attachment.skill.name;
  link.appendChild(name);

  return link;
}

function isSkillNode(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as Element).hasAttribute("data-skill-attachment-id")
  );
}

export function extractText(el: HTMLElement): string {
  let text = "";

  const walk = (node: Node): void => {
    if (isSkillNode(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    if (element.tagName === "BR") {
      text += "\n";
      return;
    }
    for (const child of Array.from(element.childNodes)) walk(child);
  };

  walk(el);
  return text;
}

export function setTextInEditable(el: HTMLElement, text: string): void {
  for (const child of Array.from(el.childNodes)) {
    if (!isSkillNode(child)) child.remove();
  }

  if (text) el.appendChild(document.createTextNode(text));
}

export function syncSkillLinks(
  el: HTMLElement,
  attachments: SkillAttachment[],
): void {
  const links = Array.from(
    el.querySelectorAll<HTMLButtonElement>("[data-skill-attachment-id]"),
  );
  const stateIds = new Set(attachments.map((attachment) => attachment.id));

  for (const link of links) {
    if (!stateIds.has(link.dataset.skillAttachmentId ?? "")) link.remove();
  }

  for (const attachment of attachments) {
    if (links.some((link) => link.dataset.skillAttachmentId === attachment.id))
      continue;

    const existing = Array.from(
      el.querySelectorAll<HTMLButtonElement>("[data-skill-attachment-id]"),
    );
    const lastLink = existing.at(-1);
    el.insertBefore(
      buildSkillLink(attachment),
      lastLink?.nextSibling ?? el.firstChild,
    );
  }
}

export function getSkillLinkIds(el: HTMLElement): Set<string> {
  return new Set(
    Array.from(
      el.querySelectorAll<HTMLButtonElement>("[data-skill-attachment-id]"),
    ).map((link) => link.dataset.skillAttachmentId ?? ""),
  );
}

export function removeAdjacentSkillLink(
  el: HTMLElement,
  direction: "before" | "after",
): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!range.collapsed || !el.contains(range.startContainer)) return null;

  const container = range.startContainer;
  const offset = range.startOffset;
  let candidate: ChildNode | null = null;

  if (container === el) {
    candidate =
      el.childNodes[direction === "before" ? offset - 1 : offset] ?? null;
  } else if (container.nodeType === Node.TEXT_NODE) {
    const length = container.textContent?.length ?? 0;
    const isBoundary =
      direction === "before" ? offset === 0 : offset === length;
    if (isBoundary) {
      candidate =
        direction === "before"
          ? container.previousSibling
          : container.nextSibling;
    }
  }

  if (
    !candidate ||
    candidate.nodeType !== Node.ELEMENT_NODE ||
    !(candidate as Element).hasAttribute("data-skill-attachment-id")
  ) {
    return null;
  }

  const link = candidate as HTMLButtonElement;
  const id = link.dataset.skillAttachmentId ?? "";
  link.remove();
  return id || null;
}

function textNodeOffset(el: HTMLElement, target: Node, offset: number): number {
  let result = 0;
  let found = false;

  const walk = (node: Node): void => {
    if (found || isSkillNode(node)) return;
    if (node === target) {
      result += offset;
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent?.length ?? 0;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node === el) {
        for (const child of Array.from(node.childNodes)) walk(child);
        return;
      }
      const element = node as Element;
      if (element.tagName === "BR") {
        result += 1;
        return;
      }
      for (const child of Array.from(node.childNodes)) walk(child);
    }
  };

  walk(el);
  return found ? result : -1;
}

export function getCaretOffset(el: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return -1;

  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer)) return -1;
  return textNodeOffset(el, range.startContainer, range.startOffset);
}

export function setCaretOffset(el: HTMLElement, offset: number): void {
  if (offset < 0) return;

  let remaining = offset;
  let target: Text | null = null;
  let targetOffset = 0;
  let applied = false;

  const walk = (node: Node): void => {
    if (target || isSkillNode(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        target = node as Text;
        targetOffset = remaining;
        return;
      }
      remaining -= length;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    if (element.tagName === "BR") {
      if (remaining === 0) {
        const range = document.createRange();
        range.setStartBefore(element);
        range.collapse(true);
        applyRange(range);
        applied = true;
      } else remaining -= 1;
      return;
    }
    for (const child of Array.from(element.childNodes)) walk(child);
  };

  walk(el);
  if (target) {
    const range = document.createRange();
    range.setStart(target, targetOffset);
    range.collapse(true);
    applyRange(range);
  } else if (applied) {
    return;
  }
}

function applyRange(range: Range): void {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function placeCursorAtEnd(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  applyRange(range);
}

export function autoResize(el: HTMLElement, min: number, max: number): void {
  el.style.height = "0px";
  el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`;
}

export function insertTextAtCaret(el: HTMLElement, text: string): void {
  el.focus();
  document.execCommand("insertText", false, text);
}
