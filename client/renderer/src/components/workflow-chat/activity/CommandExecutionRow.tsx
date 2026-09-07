import { useItemDisclosure } from "../content/conversation-ui-state";
import {
  Check,
  FileText,
  FolderTree,
  Search,
  SquareTerminal,
} from "lucide-react";
import { WorkflowActivityRow, WorkflowInlineDots } from "./ActivityRow";
import { WorkflowCommandDetail } from "./CommandDetailCard";
import {
  commandPresentation,
  type CommandDisplayKind,
  type CommandItemModel,
} from "./command-presentation";

interface Props {
  item: CommandItemModel;
}

export function WorkflowCommandExecutionRow({ item }: Props) {
  const [open, setOpen] = useItemDisclosure(item.id);
  const presentation = commandPresentation(item);

  return (
    <WorkflowActivityRow
      activityKind="commandExecution"
      iconTone="muted"
      icon={
        <CommandIcon
          kind={presentation.kind}
          completed={presentation.statusKind === "success"}
        />
      }
      label={
        <>
          <span
            className="workflow-activity-row-text"
            title={presentation.label}
          >
            {presentation.label}
          </span>
          {presentation.running ? <WorkflowInlineDots /> : null}
        </>
      }
      meta={presentation.meta}
      hasDetail={presentation.hasDetail}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      detail={<WorkflowCommandDetail presentation={presentation} />}
    />
  );
}

function CommandIcon({
  kind,
  completed,
}: {
  kind: CommandDisplayKind;
  completed: boolean;
}) {
  if (completed) return <Check />;
  if (kind === "read") return <FileText />;
  if (kind === "list") return <FolderTree />;
  if (kind === "search") return <Search />;
  return <SquareTerminal />;
}
