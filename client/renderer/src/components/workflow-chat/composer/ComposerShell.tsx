import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Settings2 } from "lucide-react";
import { notify } from "@/lib/notifications";
import type { SkillDetail, SkillInfo } from "@shared/types";
import { SkillDetailModal } from "../../skills/SkillDetailModal";
import {
  ComposerRichInput,
  type ComposerRichInputHandle,
} from "./ComposerRichInput";
import { ComposerLinkPopover } from "./ComposerLinkPopover";
import type { ComposerLinkSelection } from "./composer-link-tokens";
import {
  attachmentsToUserContent,
  browserAppshotAttachment,
  browserCommentAttachment,
  isMatchingBrowserCommentAttachment,
  MAX_ATTACHMENTS,
} from "./composer-attachments";
import type { SlashCommandItem } from "../../../types";
import { WorkflowImageLightbox, type WorkflowImagePreview } from "../";
import { SlashCommandPopover } from "./SlashCommandPopover";
import { QueuedSteersPanel } from "../";
import { ContextUsageRing } from "../";
import { FullAccessConfirmDialog } from "./SandboxInstallBanner";
import {
  type WorkflowComposerShellProps,
  COMPOSER_TEXTAREA_MIN_HEIGHT,
  COMPOSER_TEXTAREA_WITH_ATTACHMENTS_MIN_HEIGHT,
  COMPOSER_TEXTAREA_MAX_HEIGHT,
  securityModeOptions,
} from "./composer-types";
import { ComposerTaskProgress } from "./ComposerTaskProgress";
import { ComposerAttachmentChips } from "./ComposerAttachmentChips";
import { useComposerAttachments } from "./useComposerAttachments";
import { useSecurityModeGate } from "./useSandboxGate";
import { useComposerDockSafeArea } from "./useComposerDockSafeArea";
import { CONVERSATION_PAGE_CONTRACT } from "@shared/conversation-page-contract";
import { CONVERSATION_ICONS } from "../conversation-icon-contract";
import {
  ComposerSuggestionPopover,
  type ComposerSuggestion,
} from "./ComposerSuggestionPopover";
import {
  replaceComposerSuggestion,
  selectedSkillAttachment,
} from "./composer-contract";
import { useComposerSuggestions } from "./useComposerSuggestions";
import { stripSkillTokenMarkers } from "./composer-skill-tokens";

const COMPOSER_ICONS = CONVERSATION_ICONS.composer;

export function WorkflowComposerShell({
  conversationKey,
  input,
  incomingBrowserComment,
  browserCommentSubmit,
  browserCommentRemoval,
  isGenerating,
  securityMode: controlledSecurityMode,
  selectedProvider,
  onInputChange,
  onKeyDown,
  onSend,
  onStop,
  onSecurityModeChange,
  onOpenSecuritySettings,
  permissionPanel,
  planPrompt,
  emptyHeader,
  modelControl,
  placeholder = CONVERSATION_PAGE_CONTRACT.composer.placeholder,
  slashCommands,
  skills = [],
  taskProgress,
  contextUsage,
  usage,
  fileChangeSummary,
  onFileChangeSummaryClick,
  pendingSteers = [],
  steerQueuePaused = false,
  onResumeSteerQueue,
  onApplyPendingSteer,
  onCancelPendingSteer,
  onEditPendingSteer,
  onReorderPendingSteer,
}: WorkflowComposerShellProps) {
  const dockRef = useComposerDockSafeArea();
  const richInputRef = useRef<ComposerRichInputHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const securityMenuRef = useRef<HTMLDivElement>(null);
  const fallbackModelMenuRef = useRef<HTMLDivElement>(null);
  const slashPopoverRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const linkPopoverRef = useRef<HTMLDivElement>(null);
  const previousPermissionPanelRef = useRef(false);
  const submittedBrowserCommentEventRef = useRef<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [suggestionSelectedIndex, setSuggestionSelectedIndex] = useState(0);
  const [caret, setCaret] = useState(0);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<ComposerLinkSelection | null>(
    null,
  );
  const [previewImage, setPreviewImage] = useState<WorkflowImagePreview | null>(
    null,
  );
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [selectedSkillDetail, setSelectedSkillDetail] =
    useState<SkillDetail | null>(null);
  const [skillDetailLoading, setSkillDetailLoading] = useState(false);
  const skillDetailRequestRef = useRef(0);
  const [skillAttachments, setSkillAttachments] = useState<SkillInfo[]>([]);
  const [suggestionDismissedKey, setSuggestionDismissedKey] = useState<
    string | null
  >(null);

  const {
    attachments,
    setAttachments,
    removeAttachment,
    handleFileInputChange,
    handlePaste: handleComposerPaste,
    commitInputValue,
    handleDrop: handleAttachmentDrop,
    fileAccept,
  } = useComposerAttachments(onInputChange);

  const handlePaste = useCallback(
    (event: Parameters<typeof handleComposerPaste>[0]) => {
      handleComposerPaste(event);
    },
    [handleComposerPaste],
  );

  const handleDrop = useCallback(
    (event: Parameters<typeof handleAttachmentDrop>[0]) => {
      handleAttachmentDrop(event, {
        insertText: (text) => {
          const view = richInputRef.current;
          if (/^https?:\/\//iu.test(text.trim())) {
            view?.insertLink(text.trim());
            return;
          }
          view?.insertText(text);
        },
      });
    },
    [handleAttachmentDrop],
  );

  const closeLinkPopover = useCallback(() => {
    setLinkTarget(null);
    window.requestAnimationFrame(() => richInputRef.current?.focus());
  }, []);

  const updateLinkTarget = useCallback(
    (label: string, href: string | null) => {
      if (!linkTarget) return;
      richInputRef.current?.updateLink(linkTarget, { label, href });
      setLinkTarget(null);
    },
    [linkTarget],
  );

  const handleSkillsChange = useCallback((nextSkills: SkillInfo[]) => {
    setSkillAttachments((previous) => {
      if (
        previous.length === nextSkills.length &&
        previous.every((skill, index) => skill.id === nextSkills[index]?.id)
      ) {
        return previous;
      }
      return nextSkills;
    });
  }, []);

  const openSkillDetail = useCallback(async (skill: SkillInfo) => {
    const request = ++skillDetailRequestRef.current;
    setSelectedSkill(skill);
    setSelectedSkillDetail(null);
    setSkillDetailLoading(true);
    try {
      const detail = await window.marloues.skill.getDetail(skill.id);
      if (request !== skillDetailRequestRef.current) return;
      setSelectedSkillDetail(detail);
    } catch (error) {
      if (request !== skillDetailRequestRef.current) return;
      notify({
        title: "Skill 详情加载失败",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    } finally {
      if (request === skillDetailRequestRef.current) {
        setSkillDetailLoading(false);
      }
    }
  }, []);

  const handleSkillTokenClick = useCallback(
    (skillId: string) => {
      const skill = skills.find((item) => item.id === skillId);
      if (skill) void openSkillDetail(skill);
    },
    [openSkillDetail, skills],
  );

  const closeSkillDetail = useCallback(() => {
    skillDetailRequestRef.current += 1;
    setSelectedSkill(null);
    setSelectedSkillDetail(null);
    setSkillDetailLoading(false);
  }, []);

  useEffect(() => {
    setAttachments([]);
    setSkillAttachments([]);
    setPreviewImage(null);
    richInputRef.current?.clear({ focus: false });
  }, [conversationKey, setAttachments]);

  useEffect(() => {
    if (!incomingBrowserComment) return;
    setAttachments((previous) => {
      const additions = incomingBrowserComment.payloads
        .filter(
          (payload) =>
            !previous.some(
              (attachment) =>
                attachment.kind === "browser-comment" &&
                attachment.pageId === incomingBrowserComment.pageId &&
                attachment.payload.commentId === payload.commentId &&
                attachment.payload.pageUrl === payload.pageUrl,
            ),
        )
        .slice(0, Math.max(0, MAX_ATTACHMENTS - previous.length))
        .map((payload) =>
          browserCommentAttachment(payload, incomingBrowserComment.pageId),
        );
      return additions.length > 0 ? [...previous, ...additions] : previous;
    });
    requestAnimationFrame(() => richInputRef.current?.focus());
  }, [incomingBrowserComment, setAttachments]);

  useEffect(() => {
    if (!browserCommentSubmit) return;
    if (
      submittedBrowserCommentEventRef.current === browserCommentSubmit.eventId
    )
      return;

    submittedBrowserCommentEventRef.current = browserCommentSubmit.eventId;
    const submittedAttachments = [...attachments];
    for (const payload of browserCommentSubmit.payloads) {
      const exists = submittedAttachments.some(
        (attachment) =>
          attachment.kind === "browser-comment" &&
          attachment.pageId === browserCommentSubmit.pageId &&
          attachment.payload.commentId === payload.commentId &&
          attachment.payload.pageUrl === payload.pageUrl,
      );
      if (!exists)
        submittedAttachments.push(
          browserCommentAttachment(payload, browserCommentSubmit.pageId),
        );
    }

    // Keep the browser bar's send semantics identical to the primary submit
    // button: send current text + attachments, then clear transient chips.
    const composerText =
      richInputRef.current?.getPlainText() ?? stripSkillTokenMarkers(input);
    onSend(
      composerText.trim(),
      attachmentsToUserContent([
        ...submittedAttachments,
        ...skillAttachments.map(selectedSkillAttachment),
      ]),
    );
    setAttachments([]);
    setSkillAttachments([]);
    richInputRef.current?.clear();
  }, [
    attachments,
    browserCommentSubmit,
    input,
    onSend,
    setAttachments,
    skillAttachments,
  ]);

  useEffect(() => {
    if (!browserCommentRemoval) return;
    setAttachments((previous) =>
      previous.filter(
        (attachment) =>
          !isMatchingBrowserCommentAttachment(
            attachment,
            browserCommentRemoval.pageId,
            browserCommentRemoval.commentId,
          ),
      ),
    );
  }, [browserCommentRemoval, setAttachments]);

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      const attachment = attachments.find((item) => item.id === id);
      removeAttachment(id);
      if (
        attachment?.kind === "browser-comment" &&
        attachment.pageId &&
        window.marloues.browser?.removeComment
      ) {
        void window.marloues.browser.removeComment(
          attachment.pageId,
          attachment.payload.commentId,
        );
      }
    },
    [attachments, removeAttachment],
  );

  const handleCapturePage = useCallback(async () => {
    setContextOpen(false);
    if (attachments.length >= MAX_ATTACHMENTS) {
      notify({
        title: "附件数量已达上限",
        description: `最多一次发送 ${MAX_ATTACHMENTS} 个附件。`,
        tone: "warning",
      });
      return;
    }
    try {
      const dataUrl = await window.marloues.browser?.screenshot();
      if (!dataUrl) throw new Error("当前没有可捕获的浏览器页面");
      setAttachments((previous) => {
        if (previous.length >= MAX_ATTACHMENTS) return previous;
        return [...previous, browserAppshotAttachment(dataUrl)];
      });
    } catch (error) {
      notify({
        title: "页面截图失败",
        description: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    }
  }, [attachments.length, setAttachments]);
  const {
    query: composerQuery,
    items: composerSuggestions,
    attachmentFor,
  } = useComposerSuggestions({ input, caret, skills });

  const composerQueryKey = composerQuery
    ? `${composerQuery.kind}:${composerQuery.query}:${composerQuery.start}:${composerQuery.end}`
    : null;
  const activeComposerQuery =
    composerQuery && composerQueryKey !== suggestionDismissedKey
      ? composerQuery
      : null;

  useEffect(() => {
    setSuggestionSelectedIndex(0);
  }, [composerQueryKey]);

  const {
    securityMode,
    fullAccessConfirmationOpen,
    handleSecurityModeSelect,
    handleFullAccessConfirm,
    handleFullAccessCancel,
  } = useSecurityModeGate(onSecurityModeChange, controlledSecurityMode);

  const activeSecurityMode =
    securityModeOptions.find((option) => option.mode === securityMode) ??
    securityModeOptions[0];
  const ActiveSecurityIcon = activeSecurityMode.icon;
  const hasPermissionPanel = Boolean(permissionPanel);
  const otherAttachments = attachments;
  const textareaMinHeight =
    otherAttachments.length > 0
      ? COMPOSER_TEXTAREA_WITH_ATTACHMENTS_MIN_HEIGHT
      : COMPOSER_TEXTAREA_MIN_HEIGHT;

  useEffect(() => {
    const commandQuery =
      activeComposerQuery?.kind === "command" ? activeComposerQuery : null;
    if (commandQuery) {
      setSlashOpen(true);
      setSlashFilter(commandQuery.query);
      setSlashSelectedIndex(0);
    } else {
      setSlashOpen(false);
    }
  }, [activeComposerQuery]);

  useEffect(() => {
    const wasShowingPermission = previousPermissionPanelRef.current;
    previousPermissionPanelRef.current = hasPermissionPanel;
    if (!wasShowingPermission || hasPermissionPanel) return;

    const frame = window.requestAnimationFrame(() =>
      richInputRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [hasPermissionPanel]);

  useEffect(() => {
    if (
      !securityOpen &&
      !contextOpen &&
      !modelOpen &&
      !slashOpen &&
      !linkTarget
    )
      return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (securityMenuRef.current?.contains(target)) return;
      if (contextMenuRef.current?.contains(target)) return;
      if (linkPopoverRef.current?.contains(target)) return;
      if (fallbackModelMenuRef.current?.contains(target)) return;
      if (slashPopoverRef.current?.contains(target)) return;

      setSecurityOpen(false);
      setContextOpen(false);
      setModelOpen(false);
      setSlashOpen(false);
      setLinkTarget(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSecurityOpen(false);
      setContextOpen(false);
      setModelOpen(false);
      setSlashOpen(false);
      setLinkTarget(null);
      richInputRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextOpen, linkTarget, modelOpen, securityOpen, slashOpen]);

  const filteredSlashCommands = useMemo<SlashCommandItem[]>(() => {
    const items = slashCommands ?? [];
    const q = slashFilter.toLowerCase().trim();
    const categoryOrder: SlashCommandItem["category"][] = ["skill", "builtin"];
    const matched = q
      ? items.filter(
          (item) =>
            item.command.toLowerCase().includes(q) ||
            item.label.toLowerCase().includes(q),
        )
      : items;
    return [...matched].sort((a, b) => {
      if (q) {
        const aStarts = a.command.toLowerCase().startsWith("/" + q) ? 0 : 1;
        const bStarts = b.command.toLowerCase().startsWith("/" + q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
      }
      const ca = categoryOrder.indexOf(a.category);
      const cb = categoryOrder.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      return a.command.localeCompare(b.command);
    });
  }, [slashCommands, slashFilter]);

  const composerPlainText = stripSkillTokenMarkers(input).trim();
  const canSubmit =
    composerPlainText.length > 0 ||
    attachments.length > 0 ||
    skillAttachments.length > 0;
  const focusComposer = useCallback((offset?: number) => {
    requestAnimationFrame(() => richInputRef.current?.focus(offset));
  }, []);

  const submitComposer = useCallback(() => {
    if (!canSubmit) return;
    const text =
      richInputRef.current?.getPlainText() ??
      stripSkillTokenMarkers(input).trim();
    onSend(
      text,
      attachmentsToUserContent([
        ...attachments,
        ...skillAttachments.map(selectedSkillAttachment),
      ]),
    );
    setAttachments([]);
    setSkillAttachments([]);
    richInputRef.current?.clear();
  }, [attachments, canSubmit, input, onSend, setAttachments, skillAttachments]);

  const activateContextTrigger = useCallback(
    (trigger: "$" | "@" | "/") => {
      const richInput = richInputRef.current;
      const liveSelection = richInput?.getSelection() ?? {
        start: -1,
        end: -1,
      };
      const start =
        liveSelection.start >= 0 ? liveSelection.start : input.length;
      const end = liveSelection.end >= 0 ? liveSelection.end : start;
      const needsSpace = start > 0 && !/\s/u.test(input[start - 1] ?? "");
      const token = `${needsSpace ? " " : ""}${trigger}`;
      const value = `${input.slice(0, start)}${token}${input.slice(end)}`;
      const nextCaret = start + token.length;
      onInputChange(value);
      setCaret(nextCaret);
      setContextOpen(false);
      focusComposer(nextCaret);
    },
    [focusComposer, input, onInputChange],
  );

  const handleSlashSelect = useCallback(
    (item: SlashCommandItem) => {
      setSlashOpen(false);
      const commandQuery =
        activeComposerQuery?.kind === "command" ? activeComposerQuery : null;
      if (item.category === "skill") {
        const selectedSkill = skills.find((skill) => skill.name === item.label);
        if (!selectedSkill) return;
        if (attachments.length + skillAttachments.length >= MAX_ATTACHMENTS)
          return;
        richInputRef.current?.insertSkill(
          selectedSkill,
          commandQuery
            ? { from: commandQuery.start, to: commandQuery.end }
            : {
                from: 0,
                to: richInputRef.current?.getSelection().end ?? input.length,
              },
        );
        return;
      }
      if (commandQuery) {
        const next = replaceComposerSuggestion(
          input,
          commandQuery,
          item.command,
        );
        onInputChange(next.value);
        setCaret(next.caret);
        focusComposer(next.caret);
        return;
      }
      onInputChange(`${item.command} `);
      focusComposer();
    },
    [
      activeComposerQuery,
      attachments.length,
      focusComposer,
      input,
      onInputChange,
      skillAttachments.length,
      skills,
    ],
  );

  const handleSuggestionSelect = useCallback(
    (suggestion: ComposerSuggestion) => {
      if (!activeComposerQuery) return;
      if (suggestion.kind === "skill") {
        if (attachments.length + skillAttachments.length >= MAX_ATTACHMENTS)
          return;
        richInputRef.current?.insertSkill(suggestion.skill, {
          from: activeComposerQuery.start,
          to: activeComposerQuery.end,
        });
        return;
      }
      setAttachments((previous) => {
        if (previous.length >= MAX_ATTACHMENTS) return previous;
        return [...previous, attachmentFor(suggestion)];
      });
      const next = replaceComposerSuggestion(input, activeComposerQuery, "");
      onInputChange(next.value);
      setCaret(next.caret);
      focusComposer(next.caret);
    },
    [
      attachmentFor,
      activeComposerQuery,
      attachments.length,
      input,
      onInputChange,
      focusComposer,
      setAttachments,
      skillAttachments.length,
    ],
  );

  const handleComposerBlurCapture = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      if (event.defaultPrevented) return;
      if (composerQueryKey) setSuggestionDismissedKey(composerQueryKey);
    },
    [composerQueryKey],
  );

  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      // IME composition in progress (e.g. pinyin Enter to pick a candidate):
      // let the input method own the keystroke. Must run before slash-menu
      // handling, otherwise confirming a candidate triggers slash selection.
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      if (slashOpen && filteredSlashCommands.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSlashSelectedIndex((i) => (i + 1) % filteredSlashCommands.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSlashSelectedIndex(
            (i) =>
              (i - 1 + filteredSlashCommands.length) %
              filteredSlashCommands.length,
          );
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          handleSlashSelect(filteredSlashCommands[slashSelectedIndex]);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSuggestionDismissedKey(composerQueryKey);
          setSlashOpen(false);
          return;
        }
      }
      if (activeComposerQuery && composerSuggestions.length > 0) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          setSuggestionSelectedIndex(
            (index) =>
              (index + delta + composerSuggestions.length) %
              composerSuggestions.length,
          );
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          handleSuggestionSelect(composerSuggestions[suggestionSelectedIndex]);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSuggestionDismissedKey(composerQueryKey);
          return;
        }
      }
      // Shift/Ctrl+Enter inserts a newline; plain Enter sends. Cmd+Enter is
      // delegated to the page-level handler so existing shortcuts stay intact.
      if (
        event.key === "Enter" &&
        (event.shiftKey || (event.ctrlKey && !event.metaKey))
      ) {
        event.preventDefault();
        richInputRef.current?.insertText("\n");
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
        if (canSubmit) {
          event.preventDefault();
          submitComposer();
        }
        return;
      }
      onKeyDown(event);
    },
    [
      slashOpen,
      filteredSlashCommands,
      slashSelectedIndex,
      handleSlashSelect,
      activeComposerQuery,
      composerQueryKey,
      composerSuggestions,
      suggestionSelectedIndex,
      handleSuggestionSelect,
      canSubmit,
      submitComposer,
      onKeyDown,
    ],
  );

  return (
    <div ref={dockRef} className="composer-wrap">
      {planPrompt}
      {emptyHeader ? (
        <div className="composer-empty-header">{emptyHeader}</div>
      ) : null}
      {hasPermissionPanel ? (
        <div className="composer-permission-slot">{permissionPanel}</div>
      ) : (
        <>
          {taskProgress?.length || fileChangeSummary?.filesChanged ? (
            <ComposerTaskProgress
              tasks={taskProgress}
              fileChangeSummary={fileChangeSummary}
              onFileChangeSummaryClick={onFileChangeSummaryClick}
            />
          ) : null}
          <div
            className={`composer-steer-stack${pendingSteers.length > 0 ? " has-pending-steers" : ""}`}
          >
            {/* 排队 steer 是独立的上层面板，主输入框从其下方承接。 */}
            <QueuedSteersPanel
              pendingSteers={pendingSteers}
              paused={steerQueuePaused}
              onApply={onApplyPendingSteer}
              onCancel={onCancelPendingSteer}
              onEdit={onEditPendingSteer}
              onReorder={onReorderPendingSteer}
              onResume={onResumeSteerQueue}
            />
            <form
              onDragOver={(event) => {
                if (
                  Array.from(event.dataTransfer.items ?? []).some(
                    (item) => item.kind === "file",
                  ) ||
                  Array.from(event.dataTransfer.types ?? []).includes(
                    "text/uri-list",
                  )
                ) {
                  event.preventDefault();
                }
              }}
              onDrop={handleDrop}
              onSubmit={(event) => {
                event.preventDefault();
                submitComposer();
              }}
              className="composer input-glow"
            >
              <input
                ref={imageInputRef}
                type="file"
                accept={fileAccept}
                multiple
                className="composer-file-input"
                onChange={handleFileInputChange}
                tabIndex={-1}
                aria-hidden="true"
              />
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="composer-file-input"
                onChange={handleFileInputChange}
                tabIndex={-1}
                aria-hidden="true"
              />
              <div
                className={`composer-input${otherAttachments.length > 0 ? " has-chips" : ""}`}
              >
                <ComposerAttachmentChips
                  attachments={otherAttachments}
                  onRemove={handleRemoveAttachment}
                  onPreviewImage={setPreviewImage}
                />
                <div className="composer-input-field">
                  <ComposerRichInput
                    ref={richInputRef}
                    value={input}
                    placeholder={placeholder}
                    skills={skills}
                    minHeight={textareaMinHeight}
                    maxHeight={COMPOSER_TEXTAREA_MAX_HEIGHT}
                    onChange={commitInputValue}
                    onCaretChange={setCaret}
                    onSkillsChange={handleSkillsChange}
                    onSkillClick={handleSkillTokenClick}
                    onLinkClick={setLinkTarget}
                    onBlurCapture={handleComposerBlurCapture}
                    onKeyDownCapture={handleComposerKeyDown}
                    onPasteCapture={handlePaste}
                  />
                  {linkTarget ? (
                    <ComposerLinkPopover
                      ref={linkPopoverRef}
                      target={linkTarget}
                      onClose={closeLinkPopover}
                      onUpdate={updateLinkTarget}
                    />
                  ) : null}
                </div>
              </div>

              <div className="composer-toolbar">
                <div className="composer-menu" ref={contextMenuRef}>
                  <button
                    type="button"
                    className="tool-button"
                    aria-label="添加文件及更多内容"
                    title="添加文件及更多内容"
                    aria-haspopup="menu"
                    aria-expanded={contextOpen}
                    data-composer-navigation-target="add-context"
                    onClick={() => setContextOpen((value) => !value)}
                  >
                    <COMPOSER_ICONS.addContext
                      size={16}
                      aria-hidden="true"
                      data-icon-contract="add-context"
                    />
                  </button>
                  {contextOpen ? (
                    <div
                      className="composer-popover add-context-popover"
                      role="menu"
                      aria-label="添加内容"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setContextOpen(false);
                          imageInputRef.current?.click();
                        }}
                      >
                        <COMPOSER_ICONS.uploadFile
                          size={16}
                          aria-hidden="true"
                          data-icon-contract="composer-upload-file"
                        />
                        <span>上传文件</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setContextOpen(false);
                          photoInputRef.current?.click();
                        }}
                      >
                        <COMPOSER_ICONS.photo
                          size={16}
                          aria-hidden="true"
                          data-icon-contract="composer-photo"
                        />
                        <span>添加照片</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          void handleCapturePage();
                        }}
                      >
                        <COMPOSER_ICONS.appshot
                          size={16}
                          aria-hidden="true"
                          data-icon-contract="composer-appshot"
                        />
                        <span>捕获页面</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => activateContextTrigger("$")}
                      >
                        <COMPOSER_ICONS.skill
                          size={16}
                          aria-hidden="true"
                          data-icon-contract="composer-skill"
                        />
                        <span>添加 Skill</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => activateContextTrigger("@")}
                      >
                        <COMPOSER_ICONS.workspaceFile
                          size={16}
                          aria-hidden="true"
                          data-icon-contract="composer-workspace-file"
                        />
                        <span>引用工作区文件</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => activateContextTrigger("/")}
                      >
                        <COMPOSER_ICONS.command
                          size={16}
                          aria-hidden="true"
                          data-icon-contract="composer-command"
                        />
                        <span>使用命令</span>
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="composer-menu" ref={securityMenuRef}>
                  <button
                    type="button"
                    aria-label={`权限：${activeSecurityMode.label}`}
                    title={activeSecurityMode.label}
                    aria-haspopup="menu"
                    aria-expanded={securityOpen}
                    onClick={() => setSecurityOpen((value) => !value)}
                    className={`mode-button security-${securityMode}`}
                  >
                    <ActiveSecurityIcon size={16} />
                    <span>{activeSecurityMode.label}</span>
                  </button>
                  {securityOpen && (
                    <div
                      className="composer-popover security-mode-popover"
                      role="menu"
                      aria-label="权限模式"
                    >
                      <div className="security-popover-title">
                        应如何批准 Marloues 操作？
                      </div>
                      {securityModeOptions.map(
                        ({ mode, label, description, icon: Icon }) => (
                          <button
                            key={mode}
                            type="button"
                            role="menuitemradio"
                            aria-checked={securityMode === mode}
                            aria-current={
                              securityMode === mode ? "true" : undefined
                            }
                            onClick={() => {
                              setSecurityOpen(false);
                              handleSecurityModeSelect(mode);
                            }}
                            className={`${securityMode === mode ? "active" : ""} security-${mode}`}
                          >
                            <Icon size={16} />
                            <span className="security-option-copy">
                              <strong>{label}</strong>
                              <small>{description}</small>
                            </span>
                            <Check className="access-check" size={15} />
                          </button>
                        ),
                      )}
                      <div className="security-popover-separator" />
                      <button
                        type="button"
                        role="menuitem"
                        className="security-settings-link"
                        onClick={() => {
                          setSecurityOpen(false);
                          onOpenSecuritySettings?.();
                        }}
                      >
                        <Settings2 size={16} />
                        <span>权限与沙箱设置</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="composer-spacer" />

                {contextUsage ? (
                  <ContextUsageRing snapshot={contextUsage} usage={usage} />
                ) : null}

                <div
                  className="composer-menu model-menu"
                  ref={fallbackModelMenuRef}
                >
                  {modelControl ?? (
                    <>
                      <button
                        type="button"
                        onClick={() => setModelOpen((value) => !value)}
                        className="model-chip"
                      >
                        <span>custom</span>
                        <strong>{selectedProvider?.name ?? "默认模型"}</strong>
                      </button>

                      {modelOpen && (
                        <div className="composer-popover model-popover">
                          <div className="popover-title">选择模型</div>
                          <button
                            type="button"
                            className="model-option active"
                            onClick={() => setModelOpen(false)}
                          >
                            <span className="model-avatar">
                              {(selectedProvider?.name ?? "M")[0]}
                            </span>
                            <span>
                              <strong>
                                {selectedProvider?.name ?? "默认模型"}
                              </strong>
                              <small>
                                {selectedProvider?.model ?? "当前 Provider"}
                              </small>
                            </span>
                            <Check size={16} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {isGenerating && canSubmit ? (
                  <button
                    type="submit"
                    className="send steer-submit"
                    aria-label="发送追加消息"
                    title="发送追加消息"
                  >
                    <COMPOSER_ICONS.send
                      size={15}
                      data-icon-contract="composer-send"
                    />
                  </button>
                ) : null}

                {isGenerating ? (
                  <button
                    type="button"
                    className="send stop"
                    onClick={onStop}
                    aria-label="停止任务"
                    title="停止任务"
                  >
                    <COMPOSER_ICONS.stop
                      size={12}
                      fill="currentColor"
                      strokeWidth={0}
                      data-icon-contract="composer-stop"
                    />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="send"
                    aria-label="发送消息"
                    title="发送消息"
                  >
                    <COMPOSER_ICONS.send
                      size={15}
                      data-icon-contract="composer-send"
                    />
                  </button>
                )}
              </div>

              {slashOpen && filteredSlashCommands.length > 0 && (
                <SlashCommandPopover
                  items={filteredSlashCommands}
                  selectedIndex={slashSelectedIndex}
                  onSelect={handleSlashSelect}
                  onClose={() => setSlashOpen(false)}
                  popoverRef={slashPopoverRef}
                />
              )}
              {activeComposerQuery && composerSuggestions.length > 0 ? (
                <ComposerSuggestionPopover
                  items={composerSuggestions}
                  selectedIndex={suggestionSelectedIndex}
                  onSelect={handleSuggestionSelect}
                />
              ) : null}
              <WorkflowImageLightbox
                image={previewImage}
                onClose={() => setPreviewImage(null)}
              />
              {selectedSkill ? (
                <SkillDetailModal
                  key={selectedSkill.id}
                  kind="installed"
                  detail={selectedSkillDetail}
                  skill={selectedSkill}
                  installingSlug={null}
                  detailLoading={skillDetailLoading}
                  onClose={closeSkillDetail}
                  onInstall={() => undefined}
                />
              ) : null}
            </form>
          </div>
        </>
      )}
      {fullAccessConfirmationOpen ? (
        <FullAccessConfirmDialog
          onConfirm={handleFullAccessConfirm}
          onCancel={handleFullAccessCancel}
          returnFocusTo={securityMenuRef.current?.querySelector("button")}
        />
      ) : null}
    </div>
  );
}
