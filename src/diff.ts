import type { ChangedFile, CommentSide, DiffCell, FileDiff } from "./types";

const maxVisibleDiffLines = 5000;

export function isVeryLargeChangedFile(file: ChangedFile): boolean {
  return (file.additions ?? 0) + (file.deletions ?? 0) > maxVisibleDiffLines;
}

export function isVeryLargeDiff(diff: FileDiff): boolean {
  let lines = 0;
  for (const hunk of diff.hunks) {
    for (const row of hunk.rows) {
      lines += Number(!!row.old) + Number(!!row.new && row.kind !== "context");
      if (lines > maxVisibleDiffLines) return true;
    }
  }
  return false;
}

export function isVeryLargePatch(patch: string): boolean {
  let lines = patch ? 1 : 0;
  for (let index = 0; index < patch.length - 1; index += 1) {
    if (patch[index] === "\n" && ++lines > maxVisibleDiffLines) return true;
  }
  return false;
}

export type DiffChangeBlock = { hunkIndex: number; rowIndex: number; side: CommentSide; lineNumber: number };

export function diffChangeBlocks(diff: FileDiff): DiffChangeBlock[] {
  const blocks: DiffChangeBlock[] = [];
  diff.hunks.forEach((hunk, hunkIndex) => {
    let inChange = false;
    hunk.rows.forEach((row, rowIndex) => {
      if (row.kind === "context") { inChange = false; return; }
      if (!inChange) {
        const cell = row.new ?? row.old;
        if (cell) blocks.push({ hunkIndex, rowIndex, side: row.new ? "compare" : "base", lineNumber: cell.lineNumber });
      }
      inChange = true;
    });
  });
  return blocks;
}

export function unchangedLineCount(
  previous: FileDiff["hunks"][number],
  current: FileDiff["hunks"][number],
) {
  const last = [...previous.rows].reverse().find((row) => row.new ?? row.old)?.new?.lineNumber
    ?? [...previous.rows].reverse().find((row) => row.old)?.old?.lineNumber;
  const first = current.rows.find((row) => row.new ?? row.old)?.new?.lineNumber
    ?? current.rows.find((row) => row.old)?.old?.lineNumber;
  return last && first ? Math.max(0, first - last - 1) : 0;
}

export function parseUnifiedDiff(text: string): FileDiff["hunks"] {
  const hunks: FileDiff["hunks"] = [];
  let hunk: FileDiff["hunks"][number] | null = null;
  let oldLine = 0;
  let newLine = 0;
  let removed: DiffCell[] = [];
  let added: DiffCell[] = [];

  const flush = () => {
    if (!hunk) return;
    for (let index = 0; index < Math.max(removed.length, added.length); index += 1) {
      const old = removed[index] ?? null;
      const next = added[index] ?? null;
      hunk.rows.push({ kind: old && next ? "changed" : old ? "removed" : "added", old, new: next });
    }
    removed = [];
    added = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const range = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (range) {
      flush();
      hunk = { header: line, rows: [] };
      hunks.push(hunk);
      oldLine = Number(range[1]);
      newLine = Number(range[2]);
    } else if (hunk && line.startsWith(" ")) {
      flush();
      hunk.rows.push({ kind: "context", old: { lineNumber: oldLine++, text: line.slice(1) }, new: { lineNumber: newLine++, text: line.slice(1) } });
    } else if (hunk && line.startsWith("-") && !line.startsWith("---")) {
      removed.push({ lineNumber: oldLine++, text: line.slice(1) });
    } else if (hunk && line.startsWith("+") && !line.startsWith("+++")) {
      added.push({ lineNumber: newLine++, text: line.slice(1) });
    }
  }
  flush();
  return hunks;
}
