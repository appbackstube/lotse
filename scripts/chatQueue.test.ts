import assert from "node:assert/strict";
import { loadChatQueues, moveQueuedMessage, pauseRestoredChatQueues, type QueuedChatMessage } from "../src/chatQueue.ts";
import { fileStore } from "../src/fileStore.ts";

const item = (id: string): QueuedChatMessage => ({ id, body: id, context: { mode: "auto", attachments: [] }, selection: null, mode: "default", model: "test", effort: "low" });
const queue = [item("first"), item("second"), item("third")];

assert.deepEqual(moveQueuedMessage(queue, "third", -1).map((entry) => entry.id), ["first", "third", "second"]);
assert.deepEqual(moveQueuedMessage(queue, "first", 1).map((entry) => entry.id), ["second", "first", "third"]);
assert.equal(moveQueuedMessage(queue, "first", -1), queue);
assert.equal(moveQueuedMessage(queue, "missing", 1), queue);
assert.deepEqual(queue.map((entry) => entry.id), ["first", "second", "third"]);

const ownedRoot = '/repo "with quotes"';
const runningKey = JSON.stringify([ownedRoot, "task", "running"]);
const pausedKey = JSON.stringify([ownedRoot, "task", "paused"]);
const foreignKey = JSON.stringify([`${ownedRoot}-other`, "task", "pipeline"]);
const lateKey = JSON.stringify([ownedRoot, "workingCopy", "main", "main", "commit"]);
const previousQueues = { [runningKey]: queue, [pausedKey]: queue, [foreignKey]: queue };
const paused = new Set([pausedKey]);
const synced = pauseRestoredChatQueues(paused, { ...previousQueues, [runningKey]: queue.slice(1) }, ownedRoot, previousQueues);
assert.deepEqual(synced, new Set([pausedKey, foreignKey]));
assert.deepEqual(paused, new Set([pausedKey]));
assert.equal(pauseRestoredChatQueues(synced, previousQueues, ownedRoot, previousQueues), synced);
assert.deepEqual(pauseRestoredChatQueues(synced, { ...previousQueues, [lateKey]: queue }, ownedRoot, previousQueues), new Set([pausedKey, foreignKey, lateKey]));
assert.deepEqual(pauseRestoredChatQueues(synced, previousQueues, null, {}), new Set([pausedKey, foreignKey, runningKey]));

const originalGet = fileStore.getItem;
fileStore.getItem = () => JSON.stringify({ thread: [item("kept"), { id: 2 }, null], broken: "not a queue" });
assert.deepEqual(loadChatQueues().thread.map((entry) => entry.id), ["kept"]);
assert.deepEqual(loadChatQueues().broken, []);
fileStore.getItem = () => JSON.stringify({ thread: [{ ...item("delegated"), coordinationPath: ["parent", "child"] }, { ...item("invalid"), coordinationPath: [false] }] });
assert.deepEqual(loadChatQueues().thread.map((entry) => entry.id), ["delegated"]);
assert.deepEqual(loadChatQueues().thread[0].coordinationPath, ["parent", "child"]);
fileStore.getItem = () => JSON.stringify({ thread: [{ ...item("telegram"), telegram: { connectionId: "id", journalId: "bot", updateId: 42, repositoryRoot: "/repo" } }, { ...item("invalid"), telegram: { connectionId: "id", journalId: "bot", updateId: -1, repositoryRoot: "/repo" } }] });
assert.equal(loadChatQueues().thread.length, 1);
assert.equal(loadChatQueues().thread[0].telegram?.updateId, 42);
fileStore.getItem = () => JSON.stringify({ thread: [{ ...item("playbook"), playbook: { id: "book", title: "Review" } }, { ...item("invalid"), playbook: null }] });
assert.deepEqual(loadChatQueues().thread.map((entry) => entry.id), ["playbook"]);
assert.deepEqual(loadChatQueues().thread[0].playbook, { id: "book", title: "Review" });
fileStore.getItem = () => "{";
assert.deepEqual(loadChatQueues(), {});
fileStore.getItem = originalGet;
