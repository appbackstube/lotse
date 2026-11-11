import assert from "node:assert/strict";
import { emptyLane, finishLaneAttempt, holdLaneTask, laneCandidates, laneConfigError, laneMessage, laneStorageKey, laneTask, readLaneAutomations, type LaneRun } from "../src/laneAutomation.ts";
import { normalizeTask } from "../src/tasks.ts";

const task = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Task", manualStatus: "inbox", chatMode: "plan", attachments: [{ kind: "image", path: "/draft.png", name: "draft.png" }] })!;
const second = { ...task, id: "second" };
const third = { ...task, id: "third" };
const lane = { ...emptyLane(), enabled: true, prompt: "Work on this task", baseBranch: "main", workers: 2 };
assert.equal(laneConfigError(lane), null);
for (const workers of [0, -1, 1.5, NaN, Infinity]) assert.match(laneConfigError({ ...lane, workers })!, /whole number/);
assert.match(laneConfigError({ ...lane, prompt: " " })!, /prompt/);
assert.match(laneConfigError({ ...lane, prompt: "x".repeat(20_001) })!, /20,000/);
assert.match(laneConfigError({ ...lane, baseBranch: "" })!, /branch/);
assert.equal(laneConfigError(emptyLane()), null);
assert.notEqual(laneStorageKey("/repo-a"), laneStorageKey("/repo-b"));
assert.deepEqual(laneCandidates([task, second, third], "inbox", lane, () => false), [task, second]);
assert.deepEqual(laneCandidates([task, second, third], "inbox", lane, (task) => task.id === second.id), [task, third], "busy tasks and queued user messages wait without blocking the rest of the lane");
assert.deepEqual(laneCandidates([task], "inbox", { ...lane, enabled: false }, () => false), []);
assert.deepEqual(laneCandidates([task], "done", lane, () => false), []);
assert.deepEqual(laneCandidates([{ ...task, completed: true }], "done", lane, () => false).map((task) => task.id), [task.id]);

let lanes = readLaneAutomations(null);
const run: LaneRun = { root: "/repo", lane: "inbox", id: "run-1", taskId: task.id };
lanes.inbox = { ...lane, attempts: { [task.id]: { id: run.id, taskId: task.id, status: "running", error: null } } };
assert.deepEqual(laneCandidates([task, second, third], "inbox", lanes.inbox, () => false), [second], "running turns retain worker slots, including approvals and questions");
assert.deepEqual(laneCandidates([second, third], "inbox", { ...lanes.inbox, workers: 1 }, () => false), [], "moving a running task out of the source lane must not release its worker");
assert.equal(finishLaneAttempt(lanes, { ...run, id: "stale-run" }, "processed", null), lanes);
lanes = finishLaneAttempt(lanes, run, "processed", null);
assert.deepEqual(laneCandidates([task, second, third], "inbox", lanes.inbox, () => false), [second, third]);
assert.equal(finishLaneAttempt(lanes, run, "failed", "late failure"), lanes, "late events must not overwrite a terminal result");
assert.deepEqual(laneCandidates([task], "inbox", { ...lanes.inbox, prompt: "Changed prompt" }, () => false), [], "prompt edits and reentering a lane must not replay processed work");
lanes.inReview = { ...lane, workers: 1 };
assert.deepEqual(laneCandidates([{ ...task, manualStatus: "inReview" }], "inReview", lanes.inReview, () => true), [], "a destination lane waits for the source turn to end");
assert.equal(laneCandidates([{ ...task, manualStatus: "inReview" }], "inReview", lanes.inReview, () => false).length, 1);

for (const status of ["failed", "interrupted"] as const) {
  const failed = { ...lane, attempts: { [task.id]: { id: "failed", taskId: task.id, status, error: "Inspect changes" } } };
  assert.deepEqual(laneCandidates([task, second], "inbox", failed, () => false), [second]);
  delete failed.attempts[task.id];
  assert.equal(laneCandidates([task], "inbox", failed, () => false).length, 1, "explicit Retry releases a task");
}
lanes.inbox.attempts[second.id] = { id: "unfinished", taskId: second.id, status: "running", error: null };
const recovered = readLaneAutomations(JSON.stringify(lanes), true);
assert.equal(recovered.inbox.attempts[task.id].status, "processed");
assert.equal(recovered.inbox.attempts[second.id].status, "interrupted");
assert.deepEqual(laneCandidates([task, second], "inbox", recovered.inbox, () => false), []);
assert.equal(readLaneAutomations(JSON.stringify(lanes)).inbox.attempts[second.id].status, "running");
for (const raw of ["{", "null", "[]", JSON.stringify({ inbox: { ...lane, workers: 0 } }), JSON.stringify({ inbox: { ...lane, attempts: { bogus: { id: "x", taskId: "other", status: "running" } } } })]) assert.throws(() => readLaneAutomations(raw));

const unchanged = JSON.stringify(task);
assert.deepEqual(laneTask({ ...task, location: "worktree", worktreeStart: null }, lane).worktreeStart, { kind: "branch", branch: "main" });
assert.deepEqual(laneTask({ ...task, location: "worktree", worktreeStart: null }, { ...lane, baseKind: "remote" }).worktreeStart, { kind: "remote", branch: "main" });
for (const existing of [
  { ...task, location: "workspace" as const },
  { ...task, started: true },
  { ...task, agentThreadId: "existing-thread" },
  { ...task, worktree: { branch: "feature", baseOid: "oid", baseBranch: "main" } },
  { ...task, worktreeStart: { kind: "existing" as const, branch: "feature" } },
  { ...task, worktreeStart: { kind: "workspace" as const } },
]) assert.equal(laneTask(existing, lane), existing, "existing work and selected environments must be reused");
const item = laneMessage(task, lane, run.id);
assert.deepEqual([item.id, item.body, item.mode, item.model, item.effort, item.selection], [run.id, lane.prompt, "default", task.chatModel, task.chatEffort, null]);
assert.deepEqual(item.context.attachments, [], "automation must not consume draft attachments");
assert.equal(JSON.stringify(task), unchanged);
console.log("Lane automation tests passed");

const held = holdLaneTask(lanes, "inbox", "held-task", "operation");
assert.equal(held.inbox.attempts["held-task"].status,"held");
assert.deepEqual(laneCandidates([{...task,id:"held-task"}],"inbox",held,()=>false),[]);
assert.equal(readLaneAutomations(JSON.stringify(held),true).inbox.attempts["held-task"].status,"held");
assert.equal(holdLaneTask(held,"inbox","held-task","another"),held);
