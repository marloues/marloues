import { Prec, RangeSet } from "@codemirror/state";
import type { EditorState, Extension, Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { normalizeUrl } from "./composer-attachments";

export type ComposerLinkRange = {
  from: number;
  to: number;
  labelFrom: number;
  labelTo: number;
  label: string;
  href: string;
  displayIsHref: boolean;
};

export type ComposerLinkSelection = ComposerLinkRange & {
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
    bottom: number;
    right: number;
  };
};

function escapeMarkdownLabel(label: string): string {
  return label
    .replace(/\r?\n/gu, " ")
    .replace(/\\|\[|\]/gu, (character) => `\\${character}`);
}

function escapeMarkdownHref(href: string): string {
  return href.replace(/[()]/gu, (character) =>
    character === "(" ? "%28" : "%29",
  );
}

export function formatMarkdownLink(label: string, href: string): string {
  return `[${escapeMarkdownLabel(label)}](${escapeMarkdownHref(href)})`;
}

export function findComposerLinkRanges(
  state: EditorState,
): ComposerLinkRange[] {
  const links: ComposerLinkRange[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Link") return;
      const marks = node.node.getChildren("LinkMark");
      const open = marks[0];
      const close = marks[1];
      const urlNode = node.node.getChildren("URL")[0];
      if (!open || !close || !urlNode) return;

      const label = state.doc.sliceString(open.to, close.from);
      const href = normalizeUrl(
        state.doc.sliceString(urlNode.from, urlNode.to),
      );
      if (!href || !label.trim()) return;

      links.push({
        from: node.from,
        to: node.to,
        labelFrom: open.to,
        labelTo: close.from,
        label,
        href,
        displayIsHref: label === href,
      });
    },
  });
  return links;
}

function isInsideCode(state: EditorState, position: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, -1);
  while (node) {
    if (/Code/u.test(node.name)) return true;
    node = node.parent;
  }
  return false;
}

export function handleLinkTextInput(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  if (text !== " " || from !== to || isInsideCode(view.state, from)) {
    return false;
  }

  const before = view.state.doc.sliceString(0, from);
  const match = before.match(/(^|\s)(https?:\/\/\S+)$/u);
  if (!match || match.index == null) return false;

  const candidate = match[2];
  const url = normalizeUrl(candidate);
  if (!url || candidate !== url) return false;

  const wordFrom = from - candidate.length;
  if (
    wordFrom > 0 &&
    view.state.doc.sliceString(wordFrom - 1, wordFrom) === "["
  ) {
    return false;
  }

  const insertion = `${formatMarkdownLink(url, url)} `;
  view.dispatch({
    changes: { from: wordFrom, to, insert: insertion },
    selection: { anchor: wordFrom + insertion.length },
  });
  return true;
}

export function insertComposerLink(
  view: EditorView,
  href: string,
  options?: {
    label?: string;
    range?: { from: number; to: number };
  },
): void {
  const url = normalizeUrl(href);
  if (!url) return;

  const selection = view.state.selection.main;
  const from = Math.max(
    0,
    Math.min(options?.range?.from ?? selection.from, view.state.doc.length),
  );
  const to = Math.max(
    from,
    Math.min(options?.range?.to ?? selection.to, view.state.doc.length),
  );
  const selectedText = view.state.doc.sliceString(from, to).trim();
  const label = options?.label ?? (selectedText || url);
  const insertion = formatMarkdownLink(label, url);

  view.dispatch({
    changes: { from, to, insert: insertion },
    selection: { anchor: from + insertion.length },
  });
  view.focus();
}

export function updateComposerLink(
  view: EditorView,
  range: Pick<ComposerLinkRange, "from" | "to" | "label">,
  next: { label: string; href: string | null },
): void {
  const insertion =
    next.href && normalizeUrl(next.href)
      ? formatMarkdownLink(next.label, normalizeUrl(next.href) as string)
      : next.label;
  const caret = range.from + insertion.length;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: insertion },
    selection: { anchor: caret },
  });
  view.focus();
}

function toLinkSelection(
  range: ComposerLinkRange,
  element: Element,
): ComposerLinkSelection {
  const rect = element.getBoundingClientRect();
  return {
    ...range,
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom,
      right: rect.right,
    },
  };
}

class ComposerLinkIconWidget extends WidgetType {
  constructor(private readonly href: string) {
    super();
  }

  override eq(other: ComposerLinkIconWidget): boolean {
    return other.href === this.href;
  }

  override toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "composer-inline-link-icon composer-text-link-icon";
    element.contentEditable = "false";
    element.dataset.breakableUrl = "";
    element.dataset.composerTextLink = this.href;
    element.ariaHidden = "true";
    element.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
    return element;
  }
}

class ComposerLinkWidget extends WidgetType {
  constructor(
    private readonly range: ComposerLinkRange,
    private readonly onLinkClick: (selection: ComposerLinkSelection) => void,
  ) {
    super();
  }

  override eq(other: ComposerLinkWidget): boolean {
    return (
      other.range.from === this.range.from &&
      other.range.to === this.range.to &&
      other.range.href === this.range.href &&
      other.range.label === this.range.label
    );
  }

  override toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "composer-inline-link";
    element.contentEditable = "false";
    element.role = "button";
    element.tabIndex = -1;
    element.ariaHasPopup = "dialog";
    element.ariaLabel = `编辑链接 ${this.range.href}`;
    element.title = this.range.href;
    element.dataset.richLink = "";

    const icon = document.createElement("span");
    icon.className = "composer-inline-link-icon";
    icon.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
    element.appendChild(icon);

    const label = document.createElement("span");
    label.className = "composer-inline-link-label";
    label.textContent = this.range.label;
    element.appendChild(label);

    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onLinkClick(toLinkSelection(this.range, element));
    });
    return element;
  }
}

function linkDecorations(
  state: EditorState,
  onLinkClick: (selection: ComposerLinkSelection) => void,
): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];
  const atomic: Array<Range<Decoration>> = [];
  const links = findComposerLinkRanges(state);
  const displayIsHref = new Set(
    links.filter((link) => link.displayIsHref).map((link) => link.from),
  );

  for (const link of links) {
    if (link.displayIsHref) {
      ranges.push(
        Decoration.widget({
          widget: new ComposerLinkIconWidget(link.href),
          side: -1,
        }).range(link.labelFrom),
      );
      ranges.push(
        Decoration.mark({
          class: "composer-text-link",
          attributes: {
            role: "button",
            "aria-haspopup": "dialog",
            "aria-label": `编辑链接 ${link.label}`,
            "data-composer-text-link": link.href,
            "data-breakable-url": "",
            tabindex: "-1",
            title: link.href,
          },
        }).range(link.labelFrom, link.labelTo),
      );
    } else {
      atomic.push(
        Decoration.replace({
          widget: new ComposerLinkWidget(link, onLinkClick),
        }).range(link.from, link.to),
      );
    }
  }

  syntaxTree(state).iterate({
    enter(node) {
      const parent = node.node.parent;
      if (parent?.name !== "Link") return;
      if (!displayIsHref.has(parent.from)) return;
      if (node.name === "LinkMark" || node.name === "LinkTitle") {
        ranges.push(
          Decoration.mark({ class: "cm-composer-hidden" }).range(
            node.from,
            node.to,
          ),
        );
      }
      if (node.name === "URL") {
        ranges.push(
          Decoration.mark({ class: "cm-composer-hidden" }).range(
            node.from,
            node.to,
          ),
        );
      }
    },
  });

  return Decoration.set([...ranges, ...atomic], true);
}

export function linkTokensExtension({
  onLinkClick,
}: {
  onLinkClick: (selection: ComposerLinkSelection) => void;
}): Extension[] {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = linkDecorations(view.state, onLinkClick);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = linkDecorations(update.state, onLinkClick);
        }
      }
    },
    {
      decorations: (instance) => instance.decorations,
    },
  );

  return [
    Prec.high(
      EditorView.inputHandler.of((view, from, to, text) =>
        handleLinkTextInput(view, from, to, text),
      ),
    ),
    Prec.high(
      EditorView.domEventHandlers({
        paste(event, view) {
          if (event.defaultPrevented) return false;
          const plain = event.clipboardData?.getData("text/plain").trim() ?? "";
          const url = normalizeUrl(plain);
          if (!url || plain !== url) return false;

          event.preventDefault();
          insertComposerLink(view, url);
          return true;
        },
        drop(event, view) {
          if (event.defaultPrevented) return false;
          const dataTransfer = event.dataTransfer;
          if (!dataTransfer) return false;
          const plain =
            dataTransfer.getData("text/uri-list") ||
            dataTransfer.getData("text/plain");
          const url = normalizeUrl(plain);
          if (!url) return false;

          event.preventDefault();
          event.stopPropagation();
          const position = view.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });
          insertComposerLink(view, url, {
            range: position ? { from: position, to: position } : undefined,
          });
          return true;
        },
        mousedown(event, view) {
          if (!(event.target instanceof Element)) return false;
          const element = event.target.closest("[data-composer-text-link]");
          if (!element) return false;

          const href = element.getAttribute("data-composer-text-link");
          if (!href) return false;
          const position = view.posAtDOM(element, 0);
          const link = findComposerLinkRanges(view.state).find(
            (candidate) =>
              candidate.href === href &&
              position >= candidate.from &&
              position <= candidate.to,
          );
          if (!link) return false;

          event.preventDefault();
          event.stopPropagation();
          onLinkClick(toLinkSelection(link, element));
          return true;
        },
      }),
    ),
    plugin,
    EditorView.atomicRanges.of((view) =>
      RangeSet.of(
        findComposerLinkRanges(view.state)
          .filter((link) => !link.displayIsHref)
          .map((link) =>
            Decoration.mark({ class: "composer-inline-link-atomic" }).range(
              link.from,
              link.to,
            ),
          ),
        true,
      ),
    ),
  ];
}
