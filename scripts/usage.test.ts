import assert from "node:assert/strict";
import { summarizeUsage, type UsageEvent } from "../src/usage.ts";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const events: UsageEvent[] = [
  { id: "first", at: now - day, kind: "run", agent: { id: "agent", title: "Coding" }, model: "model-a", playbook: { id: "book", title: "Review" } },
  { id: "second", at: now - 2 * day, kind: "run", agent: { id: "agent", title: "Old name" }, model: "model-a" },
  { id: "third", at: now - 40 * day, kind: "run", agent: { id: "none", title: "No agent" }, model: "model-b", playbook: { id: "book", title: "Review" } },
  { id: "fourth", at: now - day, kind: "role", agent: { id: "agent", title: "Coding" } },
  { id: "future", at: now + day, kind: "run", agent: { id: "agent", title: "Coding" }, model: "model-a" },
];

assert.deepEqual(summarizeUsage(events, "Agents", now - 7 * day), [{ id: "agent", title: "Coding", count: 2, lastUsed: now - day }]);
assert.deepEqual(summarizeUsage(events, "Playbooks", now - 30 * day), [{ id: "book", title: "Review", count: 1, lastUsed: now - day }]);
assert.equal(summarizeUsage(events, "Playbooks", 0)[0].count, 2);
assert.equal(summarizeUsage(events, "Roles", 0)[0].count, 1);
assert.deepEqual(summarizeUsage(events, "Models", now - 30 * day).map((row) => [row.title, row.count]), [["model-a", 2]]);
assert.deepEqual(summarizeUsage(events, "Roles", now), []);
