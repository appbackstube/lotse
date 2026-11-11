import assert from "node:assert/strict";
import { normalizeTaskDate, taskDateDay, taskDateFromDay, taskGanttTimeline, taskScheduleRange } from "../src/taskSchedule.ts";

for (const date of ["2026-10-27", "2024-02-29", "0001-01-01", "9999-12-31"]) {
  assert.equal(normalizeTaskDate(date), date);
  assert.equal(taskDateFromDay(taskDateDay(date)), date);
}
for (const date of [null, undefined, 123, "", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "0000-01-01", "2026-1-01", "2026-10-27T00:00:00Z"]) assert.equal(normalizeTaskDate(date), null);

assert.equal(taskScheduleRange({ startDate: null, deadline: "2026-10-27" }), null);
assert.equal(taskScheduleRange({ startDate: "2026-10-27", deadline: null }), null);
assert.equal(taskScheduleRange({ startDate: "2026-10-28", deadline: "2026-10-27" }), null);
const singleDay = taskScheduleRange({ startDate: "2026-10-27", deadline: "2026-10-27" })!;
assert.equal(singleDay.end - singleDay.start + 1, 1);
const daylightSaving = taskScheduleRange({ startDate: "2026-10-24", deadline: "2026-10-26" })!;
assert.equal(daylightSaving.end - daylightSaving.start + 1, 3);

const empty = taskGanttTimeline([], "2026-10-27");
assert.equal(empty.days, 28);
assert.ok(empty.start <= singleDay.start && empty.end >= singleDay.end);
const tasks = [{ startDate: "2026-10-27", deadline: "2026-11-03" }, { startDate: null, deadline: null }];
const timeline = taskGanttTimeline(tasks, "2026-10-27");
assert.ok(timeline.start < taskDateDay("2026-10-27"));
assert.ok(timeline.end > taskDateDay("2026-11-03"));
assert.equal(timeline.days, 14);
assert.deepEqual(taskGanttTimeline([...tasks, { startDate: "2020-01-01", deadline: null }], "2026-10-27"), timeline);
assert.equal(taskGanttTimeline([{ startDate: "2026-01-01", deadline: "2026-04-01" }], "2026-10-27").step, 7);
const longTimeline = taskGanttTimeline([{ startDate: "2025-12-31", deadline: "2030-01-02" }], "2026-10-27");
assert.ok(longTimeline.ticks.length <= 24);
const limits = taskGanttTimeline([{ startDate: "0001-01-01", deadline: "9999-12-31" }], "2026-10-27");
assert.equal(taskDateFromDay(limits.start), "0001-01-01");
assert.equal(taskDateFromDay(limits.end), "9999-12-31");
console.log("Task schedule tests passed");
