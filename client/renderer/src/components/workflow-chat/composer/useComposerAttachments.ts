import {
  useCallback,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import {
  ComposerAttachment,
  FILE_ACCEPT,
  MAX_ATTACHMENTS,
  MAX_FILE_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
  attachmentsToUserContent,
  fileToFileAttachment,
  fileToImageAttachment,
  isTextFile,
  normalizeUrl,
  pastedTextAttachment,
  shouldExternalizePastedText,
} from "./composer-attachments";
import { hasFormattedClipboard } from "./html-to-markdown";
import { notify } from "@/lib/notifications";
import type { UserMessageContent } from "../../../types";

export function useComposerAttachments(onInputChange: (value: string) => void) {
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const availableSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length);
      if (availableSlots === 0) {
        notify({
          title: "附件数量已达上限",
          description: `最多一次发送 ${MAX_ATTACHMENTS} 个附件。`,
          tone: "warning",
        });
        return;
      }
      // Classify each file: image, text, or unsupported binary.
      const picked: Array<{ file: File; kind: "image" | "file" }> = [];
      let unsupported = 0;
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          picked.push({ file, kind: "image" });
        } else if (isTextFile(file)) {
          picked.push({ file, kind: "file" });
        } else {
          unsupported++;
        }
      }
      if (unsupported > 0) {
        notify({
          title: "部分文件未添加",
          description:
            "暂不支持二进制文件（如 PDF、Office），仅支持图片与文本类文件。",
          tone: "warning",
        });
      }
      if (picked.length === 0) return;
      const accepted = picked.slice(0, availableSlots);
      if (picked.length > availableSlots) {
        notify({
          title: "部分文件未添加",
          description: `最多一次发送 ${MAX_ATTACHMENTS} 个附件，已截断。`,
          tone: "warning",
        });
      }
      const next: ComposerAttachment[] = [];
      for (const { file, kind } of accepted) {
        try {
          if (kind === "image") {
            if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
              notify({
                title: "图片未添加",
                description: `${file.name} 超过 8 MB 上限。`,
                tone: "warning",
              });
              continue;
            }
            next.push(await fileToImageAttachment(file));
          } else {
            if (file.size > MAX_FILE_ATTACHMENT_BYTES) {
              notify({
                title: "文件未添加",
                description: `${file.name} 超过 256 KB 文本上限。`,
                tone: "warning",
              });
              continue;
            }
            next.push(await fileToFileAttachment(file));
          }
        } catch (error) {
          notify({
            title: "读取文件失败",
            description: error instanceof Error ? error.message : String(error),
            tone: "error",
          });
        }
      }
      if (next.length > 0) {
        setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
      }
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      void addFiles(files);
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      const files = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (files.length > 0) {
        event.preventDefault();
        void addFiles(files);
        return;
      }
      const text = event.clipboardData.getData("text/plain");
      if (
        !hasFormattedClipboard(event) &&
        shouldExternalizePastedText(text) &&
        attachments.length < MAX_ATTACHMENTS
      ) {
        event.preventDefault();
        setAttachments((previous) => {
          if (previous.length >= MAX_ATTACHMENTS) return previous;
          const sequence =
            previous.reduce(
              (max, attachment) =>
                attachment.kind === "pasted-text"
                  ? Math.max(max, attachment.sequence)
                  : max,
              0,
            ) + 1;
          return [...previous, pastedTextAttachment(text, sequence)];
        });
        return;
      }
    },
    [addFiles, attachments],
  );

  /**
   * Manual input intentionally stays in the editor until submit. Converting
   * while typing would steal the URL before the user finishes editing it.
   */
  const commitInputValue = useCallback(
    (value: string) => {
      onInputChange(value);
    },
    [onInputChange],
  );

  const handleDrop = useCallback(
    (
      event: DragEvent<HTMLFormElement>,
      options?: { insertText?: (text: string) => void },
    ) => {
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        void addFiles(files);
        return;
      }
      const draggedUrl = normalizeUrl(
        event.dataTransfer.getData("text/uri-list") ||
          event.dataTransfer.getData("text/plain"),
      );
      if (draggedUrl) {
        event.preventDefault();
        options?.insertText?.(draggedUrl);
      }
    },
    [addFiles],
  );

  const sendAttachments = useCallback(
    (): UserMessageContent[] => attachmentsToUserContent(attachments),
    [attachments],
  );

  return {
    attachments,
    setAttachments,
    addFiles,
    removeAttachment,
    handleFileInputChange,
    handlePaste,
    commitInputValue,
    handleDrop,
    sendAttachments,
    fileAccept: FILE_ACCEPT,
  };
}
