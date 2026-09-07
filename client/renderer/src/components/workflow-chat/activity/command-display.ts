/** Display only: keep the original command intact for execution and details. */
export function commandDisplayText(command: string): string {
  const firstLine = command.trim().split(/\r?\n/)[0] ?? "";
  // Skip a literal working-directory prefix. Do not interpret substitutions,
  // scripts, or other shell setup as if they were just a directory change.
  return firstLine.replace(
    /^cd\s+(?:--\s+)?(?:'[^'\r\n]*'|"[^"$`\r\n]*"|[^\s;&|<>"'`$()]+)\s*&&\s*/,
    "",
  );
}

export function commandSummaryKind(
  command: string,
): "command" | "folder" | "list" | "read" | "search" | "web" {
  const firstLine = commandDisplayText(command);
  if (/^(Get-Content|gc|cat)\b/i.test(firstLine)) return "read";
  if (
    /^(mkdir|md)\b/i.test(firstLine) ||
    (/^New-Item\b/i.test(firstLine) &&
      /\s-ItemType\s+Directory\b/i.test(firstLine))
  )
    return "folder";
  if (
    /^(Get-ChildItem|ls|dir)\b/i.test(firstLine) ||
    /^rg\s+--files\b/.test(firstLine)
  )
    return "list";
  if (/^Select-String\b/i.test(firstLine) || /^rg\s+/.test(firstLine))
    return "search";
  if (/^(Invoke-WebRequest|Invoke-RestMethod|curl|wget)\b/i.test(firstLine))
    return "web";
  return "command";
}
