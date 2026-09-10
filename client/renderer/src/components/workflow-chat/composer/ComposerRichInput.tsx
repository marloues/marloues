import {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactElement,
  Ref,
} from "react";
import { Compartment, EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  placeholder as codeMirrorPlaceholder,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { syntaxTree } from "@codemirror/language";
import { htmlToMarkdown } from "./html-to-markdown";
import { findBareUrlRanges } from "./composer-attachments";
import {
  insertComposerLink,
  linkTokensExtension,
  updateComposerLink,
  type ComposerLinkRange,
  type ComposerLinkSelection,
} from "./composer-link-tokens";
import type { SkillInfo } from "@shared/types";
import {
  deleteSkillToken,
  getPlainText,
  getSkillInfos,
  insertSkillToken,
  skillMetadataRefreshEffect,
  skillTokensExtension,
  stripSkillTokenMarkers,
} from "./composer-skill-tokens";

export type ComposerRichInputHandle = {
  focus: (offset?: number) => void;
  getCaret: () => number;
  getSelection: () => { start: number; end: number };
  insertText: (text: string) => void;
  insertLink: (href: string) => void;
  insertSkill: (skill: SkillInfo, range?: { from: number; to: number }) => void;
  deleteSkill: (direction: "before" | "after") => boolean;
  getSkills: () => SkillInfo[];
  getPlainText: () => string;
  updateLink: (
    range: Pick<ComposerLinkRange, "from" | "to" | "label">,
    next: { label: string; href: string | null },
  ) => void;
  clear: (options?: { focus?: boolean }) => void;
};

type ComposerRichInputProps = {
  value: string;
  placeholder: string;
  skills: SkillInfo[];
  minHeight: number;
  maxHeight: number;
  onChange: (value: string) => void;
  onCaretChange: (caret: number) => void;
  onSkillsChange: (skills: SkillInfo[]) => void;
  onSkillClick: (skillId: string) => void;
  onLinkClick: (selection: ComposerLinkSelection) => void;
  onBlurCapture?: (event: ReactFocusEvent<HTMLElement>) => void;
  onKeyDownCapture: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onPasteCapture: (event: ReactClipboardEvent<HTMLElement>) => void;
};

function richMarkdownDecorations(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];
  syntaxTree(state).iterate({
    enter(node) {
      const heading = /^ATXHeading([1-6])$/u.exec(node.name);
      if (heading) {
        ranges.push(
          Decoration.line({
            class: `cm-composer-heading cm-composer-heading-${heading[1]}`,
          }).range(state.doc.lineAt(node.from).from),
        );
        return;
      }

      switch (node.name) {
        case "HeaderMark":
        case "EmphasisMark":
        case "StrikethroughMark":
        case "CodeMark":
          ranges.push(
            Decoration.mark({ class: "cm-composer-hidden" }).range(
              node.from,
              node.to,
            ),
          );
          break;
        case "URL":
          // Link syntax is hidden by composer-link-tokens.
          break;
        case "StrongEmphasis":
          ranges.push(
            Decoration.mark({ class: "cm-composer-strong" }).range(
              node.from,
              node.to,
            ),
          );
          break;
        case "Emphasis":
          ranges.push(
            Decoration.mark({ class: "cm-composer-emphasis" }).range(
              node.from,
              node.to,
            ),
          );
          break;
        case "Strikethrough":
          ranges.push(
            Decoration.mark({ class: "cm-composer-strikethrough" }).range(
              node.from,
              node.to,
            ),
          );
          break;
        case "InlineCode":
          ranges.push(
            Decoration.mark({ class: "cm-composer-code" }).range(
              node.from,
              node.to,
            ),
          );
          break;
        default:
          break;
      }
    },
  });

  for (const { from, to } of findBareUrlRanges(state.doc.toString())) {
    ranges.push(
      Decoration.mark({
        class: "cm-composer-link composer-bare-url",
      }).range(from, to),
    );
  }

  return Decoration.set(ranges, true);
}

const richMarkdownPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = richMarkdownDecorations(view.state);
    }

    update(update: ViewUpdate) {
      // Composer documents are small. Recompute on every update so Lezer's
      // asynchronous syntax-tree refresh is reflected immediately.
      this.decorations = richMarkdownDecorations(update.state);
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

function ComposerRichInputImpl(
  props: ComposerRichInputProps,
  ref: Ref<ComposerRichInputHandle>,
): ReactElement {
  const {
    value,
    placeholder,
    skills,
    minHeight,
    maxHeight,
    onChange,
    onCaretChange,
    onSkillsChange,
    onSkillClick,
    onLinkClick,
    onBlurCapture,
    onKeyDownCapture,
    onPasteCapture,
  } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const placeholderCompartment = useRef(new Compartment());
  const valueRef = useRef(value);
  valueRef.current = value;
  const lastEmittedValueRef = useRef(value);

  const callbacksRef = useRef({
    onChange,
    onCaretChange,
    onSkillsChange,
  });
  callbacksRef.current = { onChange, onCaretChange, onSkillsChange };

  const skillsRef = useRef(skills);
  skillsRef.current = skills;

  const onSkillClickRef = useRef(onSkillClick);
  onSkillClickRef.current = onSkillClick;

  const onLinkClickRef = useRef(onLinkClick);
  onLinkClickRef.current = onLinkClick;

  const getSkill = useCallback(
    (skillId: string) =>
      skillsRef.current.find((skill) => skill.id === skillId),
    [],
  );

  const handleSkillClick = useCallback(
    (skillId: string) => onSkillClickRef.current(skillId),
    [],
  );

  const extensions = useMemo(
    () => [
      markdown({ addKeymap: false, extensions: GFM }),
      EditorView.lineWrapping,
      placeholderCompartment.current.of(codeMirrorPlaceholder(placeholder)),
      richMarkdownPlugin,
      linkTokensExtension({
        onLinkClick: (selection) => onLinkClickRef.current(selection),
      }),
      skillTokensExtension({
        getSkill,
        onSkillClick: handleSkillClick,
      }),
      EditorView.domEventHandlers({
        paste(event: ClipboardEvent, view: EditorView) {
          if (event.defaultPrevented) return false;
          const html = event.clipboardData?.getData("text/html") ?? "";
          if (!html.trim()) {
            const plainText = event.clipboardData?.getData("text/plain") ?? "";
            if (stripSkillTokenMarkers(plainText) !== plainText) {
              event.preventDefault();
              view.dispatch(
                view.state.replaceSelection(stripSkillTokenMarkers(plainText)),
              );
              return true;
            }
            return false;
          }

          const markdownValue = stripSkillTokenMarkers(htmlToMarkdown(html));
          if (!markdownValue) return false;
          event.preventDefault();
          view.dispatch(view.state.replaceSelection(markdownValue));
          return true;
        },
      }),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          const nextValue = update.state.doc.toString();
          lastEmittedValueRef.current = nextValue;
          callbacksRef.current.onChange(nextValue);
          callbacksRef.current.onSkillsChange(
            getSkillInfos(update.state, skillsRef.current),
          );
        }
        if (update.docChanged || update.selectionSet) {
          callbacksRef.current.onCaretChange(update.state.selection.main.head);
        }
      }),
    ],
    // Keep the view mounted; placeholder changes are handled by a Compartment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    viewRef.current = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        extensions,
      }),
    });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartment.current.reconfigure(
        codeMirrorPlaceholder(placeholder),
      ),
    });
  }, [placeholder]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    if (lastEmittedValueRef.current === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    lastEmittedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: skillMetadataRefreshEffect.of(null) });
    callbacksRef.current.onSkillsChange(
      getSkillInfos(view.state, skillsRef.current),
    );
  }, [skills]);

  useImperativeHandle(
    ref,
    () => ({
      focus(offset) {
        const view = viewRef.current;
        if (!view) return;
        const position = Math.min(
          Math.max(0, offset ?? view.state.doc.length),
          view.state.doc.length,
        );
        view.dispatch({ selection: { anchor: position, head: position } });
        view.focus();
      },
      getCaret: () => viewRef.current?.state.selection.main.head ?? -1,
      getSelection: () => {
        const selection = viewRef.current?.state.selection.main;
        return {
          start: selection?.from ?? -1,
          end: selection?.to ?? -1,
        };
      },
      insertText(text) {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
      },
      insertLink(href) {
        const view = viewRef.current;
        if (!view) return;
        insertComposerLink(view, href);
      },
      insertSkill(skill, range) {
        const view = viewRef.current;
        if (!view) return;
        insertSkillToken(view, skill, range);
      },
      deleteSkill(direction) {
        const view = viewRef.current;
        return view ? deleteSkillToken(view, direction) : false;
      },
      updateLink(range, next) {
        const view = viewRef.current;
        if (!view) return;
        updateComposerLink(view, range, next);
      },
      getSkills() {
        const view = viewRef.current;
        return view ? getSkillInfos(view.state, skillsRef.current) : [];
      },
      getPlainText() {
        const view = viewRef.current;
        return view ? getPlainText(view.state) : "";
      },
      clear(options) {
        const view = viewRef.current;
        if (!view || view.state.doc.length === 0) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: "" },
        });
        if (options?.focus !== false) view.focus();
      },
    }),
    [],
  );

  return (
    <div
      ref={hostRef}
      className="composer-rich-input"
      data-placeholder={placeholder}
      style={{ minHeight, maxHeight }}
      onBlurCapture={onBlurCapture}
      onKeyDownCapture={onKeyDownCapture}
      onPasteCapture={onPasteCapture}
    />
  );
}

export const ComposerRichInput = forwardRef(ComposerRichInputImpl);
