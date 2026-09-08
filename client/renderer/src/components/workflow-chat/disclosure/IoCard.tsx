/**
 * IN/OUT 简化卡：commandExecution / fileChange 行的展开内容（混合方案的
 * "命令/文件行用 IN/OUT 卡" 一侧）。两段网格（标签列 + 内容列），各段独立
 * 限高滚动；配色走语义 token。
 */

export function IoCard({
  input,
  output,
  failed,
}: {
  input: string;
  output: string;
  failed?: boolean;
}) {
  return (
    <div
      className="my-1 ml-1 flex flex-col overflow-hidden rounded-xl border border-line/60 bg-muted-soft"
      data-kind="message-tool-io"
    >
      {input ? (
        <div className="grid max-h-[150px] grid-cols-[max-content_1fr] items-baseline gap-x-3.5 overflow-y-auto px-4 py-3">
          <span className="sticky top-0 self-start text-xs text-text-subtle/70">
            IN
          </span>
          <span className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-[1.6] text-text-muted">
            {input}
          </span>
        </div>
      ) : null}
      {input && output ? <div className="h-px shrink-0 bg-line/60" /> : null}
      {output ? (
        <div className="grid max-h-[150px] grid-cols-[max-content_1fr] items-baseline gap-x-3.5 overflow-y-auto px-4 py-3">
          <span className="sticky top-0 self-start text-xs text-text-subtle/70">
            OUT
          </span>
          <span
            className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-[1.6] text-text-muted"
            data-error={failed || undefined}
          >
            {output}
          </span>
        </div>
      ) : null}
    </div>
  );
}
