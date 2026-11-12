import assert from "node:assert/strict";
import { defaultTaskColumnRatios, resizeTaskColumn, taskColumnPixels } from "../src/taskColumns.ts";

const width = 1200;
assert.deepEqual(taskColumnPixels(width, defaultTaskColumnRatios), { tasks: 300, changes: 400 });
const resizedTasks = resizeTaskColumn(width, defaultTaskColumnRatios, "tasks", 550);
assert.deepEqual(taskColumnPixels(width, resizedTasks), { tasks: 540, changes: 400 });
const resizedChanges = resizeTaskColumn(width, resizedTasks, "changes", 300);
assert.deepEqual(taskColumnPixels(width, resizedChanges), { tasks: 540, changes: 320 });
const narrow = taskColumnPixels(1100, resizeTaskColumn(width, resizedChanges, "changes", 900));
assert.ok(1100 - narrow.tasks - narrow.changes >= 260);
assert.ok(narrow.changes >= 320);
assert.ok(taskColumnPixels(1100, resizeTaskColumn(1100, defaultTaskColumnRatios, "tasks", 100)).tasks >= 260);
for (const narrowWidth of [600, 780, 800, 839]) {
  const columns = taskColumnPixels(narrowWidth, defaultTaskColumnRatios);
  const scale = narrowWidth / 840;
  assert.ok(columns.tasks + 0.001 >= 260 * scale);
  assert.ok(columns.changes + 0.001 >= 320 * scale);
  assert.ok(narrowWidth - columns.tasks - columns.changes + 0.001 >= 260 * scale);
}
