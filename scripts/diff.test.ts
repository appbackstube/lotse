import assert from "node:assert/strict";
import { findCodeLanguage } from "../src/codeLanguage.ts";
import { isLargeCodeDocument, LARGE_FILE_MAX_CHARACTERS, LARGE_FILE_MAX_LINES } from "../src/codeMirror.ts";
import { diffChangeBlocks, isVeryLargeChangedFile, isVeryLargeDiff, isVeryLargePatch, parseUnifiedDiff, unchangedLineCount } from "../src/diff.ts";
import { parseFileReference } from "../src/fileReference.ts";

const [hunk] = parseUnifiedDiff("@@ -25,3 +25,5 @@\n same\n-old\n+new\n+added\n tail\n");
assert.deepEqual(hunk.rows.map(({ kind, old, new: next }) => [kind, old?.lineNumber, next?.lineNumber]), [
  ["context", 25, 25],
  ["changed", 26, 26],
  ["added", undefined, 27],
  ["context", 27, 28],
]);

const [first, second] = parseUnifiedDiff("@@ -8,2 +8,2 @@\n same\n-old\n+new\n@@ -12,2 +12,2 @@\n same\n-old\n+new\n");
assert.equal(unchangedLineCount(first, second), 2);
assert.deepEqual(diffChangeBlocks({ path: "file", oldPath: null, hunks: parseUnifiedDiff("@@ -1,6 +1,6 @@\n one\n-old\n+new\n three\n-four\n+next\n five\n six\n@@ -10,2 +10,1 @@\n-delete\n tail\n") }), [
  { hunkIndex: 0, rowIndex: 1, side: "compare", lineNumber: 2 },
  { hunkIndex: 0, rowIndex: 3, side: "compare", lineNumber: 4 },
  { hunkIndex: 1, rowIndex: 0, side: "base", lineNumber: 10 },
]);
const changedFile = { oldPath: null, path: "file", status: "modified" as const, snapshotId: "snapshot", additions: 2500, deletions: 2500, binary: false };
assert.equal(isVeryLargeChangedFile(changedFile), false);
assert.equal(isVeryLargeChangedFile({ ...changedFile, additions: 2501 }), true);
const contextRows = Array.from({ length: 5001 }, (_, index) => ({ kind: "context" as const, old: { lineNumber: index + 1, text: "line" }, new: { lineNumber: index + 1, text: "line" } }));
assert.equal(isVeryLargeDiff({ path: "file", oldPath: null, hunks: [{ header: "@@", rows: contextRows.slice(0, 5000) }] }), false);
assert.equal(isVeryLargeDiff({ path: "file", oldPath: null, hunks: [{ header: "@@", rows: contextRows }] }), true);
assert.equal(isVeryLargePatch("line\n".repeat(5000)), false);
assert.equal(isVeryLargePatch("line\n".repeat(5001)), true);
assert.equal(isVeryLargePatch("x".repeat(200_001)), false);
assert.deepEqual(parseFileReference("src/App.swift:120"), { path: "src/App.swift", line: 120 });
assert.deepEqual(parseFileReference("./src/App.swift#L85"), { path: "src/App.swift", line: 85 });
assert.equal(parseFileReference("https://example.com"), null);
assert.equal(parseFileReference("https://example.com/src/App.swift#L42"), null);

for (const path of ["main.tsx", "app.py", "index.php", "README.md", "Dockerfile", "query.sql", "style.scss", "main.swift"]) {
  assert.ok(findCodeLanguage(path), `missing CodeMirror language for ${path}`);
}
for (const name of ["javascript", "c++", "c#", "kotlin", "go", "rust", "ruby", "shell", "yaml"]) {
  assert.ok(findCodeLanguage(name, true), `missing CodeMirror language for ${name}`);
}

assert.equal(isLargeCodeDocument(Array.from({ length: LARGE_FILE_MAX_LINES - 1 }, () => "line").join("\n")), false);
assert.equal(isLargeCodeDocument(Array.from({ length: LARGE_FILE_MAX_LINES }, () => "line").join("\n")), true);
assert.equal(isLargeCodeDocument("x".repeat(LARGE_FILE_MAX_CHARACTERS - 1)), false);
assert.equal(isLargeCodeDocument("x".repeat(LARGE_FILE_MAX_CHARACTERS)), true);
