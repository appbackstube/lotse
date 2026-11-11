import assert from "node:assert/strict";
import { newAgent, normalizeAgent, normalizeAgents, switchChatAgent } from "../src/agents.ts";
import { normalizeTask } from "../src/tasks.ts";
import { carryReviewChat } from "../src/chatTimeline.ts";
import type { ReviewSession } from "../src/types.ts";

const agent = { id: "product-owner", title: "Agile Product Owner", prompt: "Act as an Agile Product Owner." };
assert.deepEqual(normalizeAgents([agent, agent, null, {}, { ...agent, id: "", prompt: "" }]), [agent]);
for (const value of [null, "role", [], {}, { ...agent, title: " " }, { ...agent, prompt: " " }, { ...agent, title: "x".repeat(201) }, { ...agent, prompt: "x".repeat(20_001) }]) {
  assert.equal(normalizeAgent(value), null);
}
assert.deepEqual(normalizeAgents(null), []);
assert.equal(normalizeAgent({ ...agent, prompt: "x".repeat(20_000) })?.prompt.length, 20_000);
assert.equal(newAgent().prompt, "");
assert.notEqual(newAgent().id, newAgent().id);

const task = normalizeTask({ id: "task", title: "Plan", chatAgent: agent, chatMessages: [{ body: "Old chat" }], agentThreadId: "old-thread" })!;
assert.deepEqual(task.chatAgent, agent);
assert.equal(normalizeTask({ id: "legacy", title: "Legacy" })?.chatAgent, null);
assert.equal(normalizeTask({ ...task, chatAgent: { ...agent, prompt: 123 } })?.chatAgent, null);
assert.deepEqual(normalizeTask(JSON.parse(JSON.stringify(task)))?.chatAgent, agent);
const switched = switchChatAgent(task, agent);
assert.equal(switched.agentThreadId, null);
assert.deepEqual(switched.chatMessages, []);
assert.deepEqual(switched.chatAgent, agent);
assert.equal(switched.title, task.title);
assert.equal(task.chatMessages.length, 1);
assert.equal(switchChatAgent(switched, null).chatAgent, null);

const review: ReviewSession = { repoPath: "/repo", baseOid: "old", mode: "workingCopy", baseRef: null, compareRef: null, compareCommitOid: null, comments: [], chatMessages: [], agentThreadId: "thread", chatAgent: agent, approvedFiles: [], approvedFileSnapshots: {}, approvedSnapshotId: null };
assert.deepEqual(carryReviewChat(review, { ...review, baseOid: "new", chatAgent: null }).chatAgent, agent);
assert.equal(switchChatAgent(review, null).agentThreadId, null);
console.log("PASS: agent validation, task persistence, role changes, and review carry-over.");
