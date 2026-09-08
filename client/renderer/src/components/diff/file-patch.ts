type DiffLine = {
  kind: "add" | "remove" | "meta" | "context";
  prefix: string;
  text: string;
};

export function filePatchStats(patch: string) {
  return patchStats(patchPreviewLines(patch));
}

function patchPreviewLines(patch: string): DiffLine[] {
  if (!patch.trim()) return [];

  const rawLines = patch
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => {
      if (!line.trim()) return false;
      if (line === "*** Begin Patch" || line === "*** End Patch") return false;
      return true;
    });
  return rawLines.map(diffLineFromPatchLine);
}

function diffLineFromPatchLine(line: string): DiffLine {
  if (line.startsWith("+") && !line.startsWith("+++"))
    return { kind: "add", prefix: "+", text: line.slice(1) };
  if (line.startsWith("-") && !line.startsWith("---"))
    return { kind: "remove", prefix: "-", text: line.slice(1) };
  if (line.startsWith("*** ") || line.startsWith("@@"))
    return { kind: "meta", prefix: "", text: line };
  return {
    kind: "context",
    prefix: "",
    text: line.startsWith(" ") ? line.slice(1) : line,
  };
}

function patchStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((line) => line.kind === "add").length,
    removed: lines.filter((line) => line.kind === "remove").length,
  };
}

export function patchForFile(
  patch: string,
  filePath: string,
  cwd?: string | null,
): string {
  if (!patch.trim()) return "";
  return (
    applyPatchSectionForFile(patch, filePath, cwd) ||
    gitDiffSectionForFile(patch, filePath, cwd) ||
    (/^(?:diff --git |\*\*\* (?:Add|Update|Delete) File: )/m.test(patch)
      ? ""
      : patch)
  );
}

function applyPatchSectionForFile(
  patch: string,
  filePath: string,
  cwd?: string | null,
): string {
  const lines = patch.replace(/\r/g, "").split("\n");
  const target = normalizePathForCompare(filePath, cwd);
  const collected: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
    if (match) {
      if (capturing) break;
      capturing = normalizePathForCompare(match[1], cwd) === target;
    }
    if (capturing) collected.push(line);
  }

  return collected.join("\n");
}

function gitDiffSectionForFile(
  patch: string,
  filePath: string,
  cwd?: string | null,
): string {
  const lines = patch.replace(/\r/g, "").split("\n");
  const target = normalizePathForCompare(filePath, cwd);
  const collected: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      if (capturing) break;
      capturing =
        normalizePathForCompare(match[2], cwd) === target ||
        normalizePathForCompare(match[1], cwd) === target;
    }
    if (capturing) collected.push(line);
  }

  return collected.join("\n");
}

function normalizePathForCompare(
  filePath: string,
  cwd?: string | null,
): string {
  const path = filePath
    .replace(/\\/g, "/")
    .replace(/^["']|["']$/g, "")
    .trim();
  const root = cwd?.replace(/\\/g, "/").replace(/\/$/, "");
  return (
    root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
  ).replace(/^\.\//, "");
}
