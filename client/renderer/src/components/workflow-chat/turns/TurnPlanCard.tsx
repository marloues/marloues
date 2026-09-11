import { ListChecks } from "lucide-react";
import { WorkflowMarkdownContent } from "../content/MarkdownContent";

interface Props {
  text: string;
  streaming: boolean;
}

export function WorkflowTurnPlanCard({ text, streaming }: Props) {
  return (
    <section
      className="workflow-turn-plan-card"
      data-kind="turn-plan-card"
      aria-label="计划"
    >
      <header className="workflow-turn-plan-card-head">
        <ListChecks aria-hidden="true" />
        <span>计划</span>
      </header>
      <WorkflowMarkdownContent content={text} streaming={streaming} />
    </section>
  );
}
