import { Prec, RangeSet, StateEffect } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { SkillInfo } from "@shared/types";

export const SKILL_TOKEN_SEPARATOR = "\u2063";
const TOKEN_PATTERN = /\u2063([^\u2063]+)\u2063/gu;

export const skillMetadataRefreshEffect = StateEffect.define<null>();

export type SkillTokenRange = {
  id: string;
  from: number;
  to: number;
};

export function encodeSkillToken(skillId: string): string {
  return `${SKILL_TOKEN_SEPARATOR}${encodeURIComponent(skillId)}${SKILL_TOKEN_SEPARATOR}`;
}

function decodeSkillToken(rawId: string): string | null {
  try {
    return decodeURIComponent(rawId);
  } catch {
    return null;
  }
}

export function findSkillTokenRanges(state: EditorState): SkillTokenRange[] {
  const doc = state.doc.toString();
  const tokens: SkillTokenRange[] = [];
  for (const match of doc.matchAll(TOKEN_PATTERN)) {
    if (match.index == null) continue;
    const id = decodeSkillToken(match[1] ?? "");
    if (!id) continue;
    tokens.push({
      id,
      from: match.index,
      to: match.index + match[0].length,
    });
  }
  return tokens;
}

export function stripSkillTokenMarkers(value: string): string {
  return value.replace(TOKEN_PATTERN, "");
}

export function getPlainText(state: EditorState): string {
  return stripSkillTokenMarkers(state.doc.toString());
}

export function getSkillTokenIds(state: EditorState): string[] {
  return findSkillTokenRanges(state).map((token) => token.id);
}

export function getSkillInfos(
  state: EditorState,
  skills: SkillInfo[],
): SkillInfo[] {
  const ids = new Set(getSkillTokenIds(state));
  return skills.filter((skill) => ids.has(skill.id));
}

function skillAtomicRanges(state: EditorState): RangeSet<Decoration> {
  return RangeSet.of(
    findSkillTokenRanges(state).map((token) =>
      Decoration.mark({ class: "composer-skill-atomic" }).range(
        token.from,
        token.to,
      ),
    ),
    true,
  );
}

const LAYERS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>`;

class SkillTokenWidget extends WidgetType {
  constructor(
    private readonly skillId: string,
    private readonly getSkill: () => SkillInfo | undefined,
    private readonly onSkillClick: (skillId: string) => void,
  ) {
    super();
  }

  override eq(other: SkillTokenWidget): boolean {
    return other.skillId === this.skillId;
  }

  override toDOM(): HTMLElement {
    const skill = this.getSkill();
    const link = document.createElement("span");
    link.className = "composer-skill-mention";
    link.contentEditable = "false";
    link.dataset.skillId = this.skillId;
    link.role = "button";
    link.tabIndex = -1;
    link.ariaLabel = `查看 Skill ${skill?.name ?? this.skillId} 详情`;
    link.title =
      skill?.description ?? `查看 ${skill?.name ?? this.skillId} 详情`;

    const icon = document.createElement("span");
    icon.className = "composer-skill-mention-icon";
    icon.innerHTML = LAYERS_ICON;
    link.appendChild(icon);

    const name = document.createElement("span");
    name.className = "composer-skill-mention-name";
    name.textContent = skill?.name ?? this.skillId;
    link.appendChild(name);

    link.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onSkillClick(this.skillId);
    });
    return link;
  }
}

function skillTokenDecorations(
  state: EditorState,
  getSkill: (skillId: string) => SkillInfo | undefined,
  onSkillClick: (skillId: string) => void,
): DecorationSet {
  return Decoration.set(
    findSkillTokenRanges(state).map((token) =>
      Decoration.replace({
        widget: new SkillTokenWidget(
          token.id,
          () => getSkill(token.id),
          onSkillClick,
        ),
      }).range(token.from, token.to),
    ),
    true,
  );
}

function findTokenAtSelection(
  state: EditorState,
  selection: { from: number; to: number; head: number },
): SkillTokenRange | null {
  return (
    findSkillTokenRanges(state).find(
      (token) =>
        selection.head >= token.from &&
        selection.head <= token.to &&
        selection.from === selection.to,
    ) ?? null
  );
}

function findTokenForBackwardDeletion(
  state: EditorState,
  selection: { from: number; to: number; head: number },
): SkillTokenRange | null {
  return (
    findSkillTokenRanges(state).find((token) => {
      if (selection.from !== selection.to) return false;
      if (selection.head >= token.from && selection.head <= token.to) {
        return true;
      }
      // The inserted separator is part of the mention deletion unit. Keeping it
      // outside the atomic range lets typing "$next-skill" start a new query.
      return (
        selection.head === token.to + 1 &&
        /\s/u.test(state.doc.sliceString(token.to, selection.head))
      );
    }) ?? null
  );
}

function deleteSkillTokenBackward(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const token = findTokenForBackwardDeletion(view.state, selection);
  if (!token) return false;

  const to = selection.head > token.to ? selection.head : token.to;
  view.dispatch({
    changes: { from: token.from, to },
    selection: { anchor: token.from },
  });
  view.focus();
  return true;
}

function deleteSkillTokenForward(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const token = findTokenAtSelection(view.state, selection);
  if (!token) return false;

  let to = token.to;
  if (/\s/u.test(view.state.doc.sliceString(to, to + 1))) to += 1;
  view.dispatch({
    changes: { from: token.from, to },
    selection: { anchor: token.from },
  });
  view.focus();
  return true;
}

export function skillTokensExtension({
  getSkill,
  onSkillClick,
}: {
  getSkill: (skillId: string) => SkillInfo | undefined;
  onSkillClick: (skillId: string) => void;
}): Extension[] {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = skillTokenDecorations(
          view.state,
          getSkill,
          onSkillClick,
        );
      }

      update(update: ViewUpdate) {
        const metadataChanged = update.transactions.some((transaction) =>
          transaction.effects.some((effect) =>
            effect.is(skillMetadataRefreshEffect),
          ),
        );
        if (update.docChanged || metadataChanged) {
          this.decorations = skillTokenDecorations(
            update.state,
            getSkill,
            onSkillClick,
          );
        }
      }
    },
    {
      decorations: (instance) => instance.decorations,
    },
  );

  return [
    Prec.high(
      keymap.of([
        { key: "Backspace", run: deleteSkillTokenBackward },
        { key: "Delete", run: deleteSkillTokenForward },
      ]),
    ),
    plugin,
    EditorView.atomicRanges.of((view) => skillAtomicRanges(view.state)),
  ];
}

export function insertSkillToken(
  view: EditorView,
  skill: SkillInfo,
  range?: { from: number; to: number },
): void {
  const selection = view.state.selection.main;
  const from = Math.max(
    0,
    Math.min(range?.from ?? selection.from, view.state.doc.length),
  );
  const to = Math.max(
    from,
    Math.min(range?.to ?? selection.to, view.state.doc.length),
  );
  const marker = encodeSkillToken(skill.id);
  const insertion = `${marker} `;
  const caret = from + insertion.length;

  view.dispatch({
    changes: { from, to, insert: insertion },
    selection: { anchor: caret, head: caret },
  });
  view.focus();
}

export function deleteSkillToken(
  view: EditorView,
  direction: "before" | "after",
): boolean {
  return direction === "before"
    ? deleteSkillTokenBackward(view)
    : deleteSkillTokenForward(view);
}
