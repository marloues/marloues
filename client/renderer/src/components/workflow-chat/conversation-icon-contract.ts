import {
  ArrowUp,
  Camera,
  CheckCircle2,
  CircleDashed,
  FileText,
  GitBranch,
  Globe2,
  Image as ImageIcon,
  Laptop,
  Link,
  Layers,
  ListChecks,
  LockKeyhole,
  Network,
  Paperclip,
  Plus,
  RefreshCw,
  Square,
  SquareTerminal,
  Terminal,
} from "lucide-react";

/**
 * Central semantic icon mapping for the conversation surface.
 * The pinned-summary toggle is an exact Codex SVG and lives with its header.
 */
export const CONVERSATION_ICONS = {
  composer: {
    addContext: Plus,
    uploadFile: Paperclip,
    photo: ImageIcon,
    appshot: Camera,
    link: Link,
    skill: Layers,
    workspaceFile: FileText,
    command: Terminal,
    send: ArrowUp,
    stop: Square,
  },
  summary: {
    changes: ListChecks,
    outputContent: FileText,
    workspace: Laptop,
    branch: GitBranch,
    model: Network,
    permission: LockKeyhole,
    taskCompleted: CheckCircle2,
    taskPending: CircleDashed,
    process: SquareTerminal,
    webSource: Globe2,
    mcpSource: Network,
    refresh: RefreshCw,
  },
} as const;
