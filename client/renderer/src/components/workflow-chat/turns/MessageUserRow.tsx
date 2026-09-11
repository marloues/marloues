import { WorkflowUserMessage } from "./UserMessage";

interface Props {
  text: string;
  startedAt?: number;
}

export function WorkflowMessageUserRow({ text, startedAt }: Props) {
  if (!text.trim()) return null;
  return <WorkflowUserMessage text={text} createdAt={startedAt} />;
}
