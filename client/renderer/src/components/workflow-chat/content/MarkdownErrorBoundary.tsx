import { Button } from "@/components/ui/button";
import styles from "./MarkdownErrorBoundary.module.css";
import { Component, type ReactNode } from "react";

export class MarkdownErrorBoundary extends Component<
  { contentKey: string; children: ReactNode },
  { error: boolean; contentKey: string }
> {
  state = { error: false, contentKey: this.props.contentKey };
  static getDerivedStateFromError() {
    return { error: true };
  }
  static getDerivedStateFromProps(
    props: { contentKey: string },
    state: { contentKey: string },
  ) {
    return props.contentKey !== state.contentKey
      ? { error: false, contentKey: props.contentKey }
      : null;
  }
  render() {
    return this.state.error ? (
      <div className={`workflow-content-error ${styles.error}`} role="alert">
        这段内容暂时无法显示。
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => this.setState({ error: false })}
        >
          重试
        </Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
