export function workflowStatusIsRunning(statusValue: unknown): boolean {
  const status = String(statusValue).toLowerCase();
  return (
    status === "running" ||
    status === "pending" ||
    status === "in_progress" ||
    status === "inprogress"
  );
}
