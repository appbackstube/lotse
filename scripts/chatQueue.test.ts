import assert from "node:assert/strict";
import { loadChatQueues, moveQueuedMessage, type QueuedChatMessage } from "../src/chatQueue.ts";
import { fileStore } from "../src/fileStore.ts";

const item = (id: string): QueuedChatMessage => ({ id, body: id, context: { mode: "auto", attachments: [] }, selection: null, mode: "default", model: "test", effort: "low" });
const queue = [item("first"), item("second"), item("third")];

assert.deepEqual(moveQueuedMessage(queue, "third", -1).map((entry) => entry.id), ["first", "third", "second"]);
assert.deepEqual(moveQueuedMessage(queue, "first", 1).map((entry) => entry.id), ["second", "first", "third"]);
assert.equal(moveQueuedMessage(queue, "first", -1), queue);
assert.equal(moveQueuedMessage(queue, "missing", 1), queue);
assert.deepEqual(queue.map((entry) => entry.id), ["first", "second", "third"]);

const originalGet = fileStore.getItem;
fileStore.getItem = () => JSON.stringify({ thread: [item("kept"), { id: 2 }, null], broken: "not a queue" });
assert.deepEqual(loadChatQueues().thread.map((entry) => entry.id), ["kept"]);
assert.deepEqual(loadChatQueues().broken, []);
fileStore.getItem = () => JSON.stringify({ thread: [{ ...item("delegated"), coordinationPath: ["parent", "child"] }, { ...item("invalid"), coordinationPath: [false] }] });
assert.deepEqual(loadChatQueues().thread.map((entry) => entry.id), ["delegated"]);
assert.deepEqual(loadChatQueues().thread[0].coordinationPath, ["parent", "child"]);
fileStore.getItem = () => "{";
assert.deepEqual(loadChatQueues(), {});
fileStore.getItem = originalGet;
