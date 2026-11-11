import assert from "node:assert/strict";
import { movePlaybook, normalizePlaybooks, preparePlaybookPrompt, renderPlaybookPrompt } from "../src/playbooks.ts";

const [playbook] = normalizePlaybooks([{
  id: "legacy",
  title: "Security",
  description: "Check boundaries",
  prompt: "Review {{AREA}} and {{AREA}}; leave {{UNKNOWN}} intact.",
  reviewModel: "gpt-5.6-terra",
  allowComments: true,
  variables: [{ id: "area", name: "AREA", value: "old value" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}]);

assert.deepEqual(playbook, {
  id: "legacy",
  title: "Security",
  description: "Check boundaries",
  prompt: "Review {{AREA}} and {{AREA}}; leave {{UNKNOWN}} intact.",
  variables: [{ id: "area", name: "AREA", label: "AREA", type: "multiLine" }],
});
assert.equal(renderPlaybookPrompt(playbook, { AREA: "authentication" }), "Review authentication and authentication; leave {{UNKNOWN}} intact.");

const [typed] = normalizePlaybooks([{
  id: "typed",
  title: "Typed variables",
  prompt: "Review {{AREA}} and {{DETAILS}}.",
  variables: [
    { id: "area", name: "AREA", label: "Which area?", type: "singleLine" },
    { id: "details", name: "DETAILS", label: "Details", type: "multiLine" },
  ],
}]);
assert.deepEqual(typed.variables, [
  { id: "area", name: "AREA", label: "Which area?", type: "singleLine" },
  { id: "details", name: "DETAILS", label: "Details", type: "multiLine" },
]);

const playbooks = [playbook, typed, { ...typed, id: "third", title: "Third" }];
assert.deepEqual(movePlaybook(playbooks, "third", -1), [playbook, playbooks[2], typed]);
assert.deepEqual(movePlaybook(playbooks, "legacy", 1), [typed, playbook, playbooks[2]]);
assert.equal(movePlaybook(playbooks, "legacy", -1), playbooks);
assert.equal(movePlaybook(playbooks, "third", 1), playbooks);
assert.equal(movePlaybook(playbooks, "missing", 1), playbooks);
assert.deepEqual(movePlaybook([], "missing", -1), []);
assert.equal(movePlaybook([playbook], playbook.id, 1)[0], playbook);
assert.deepEqual(playbooks.map(({ id }) => id), ["legacy", "typed", "third"]);
const reordered = movePlaybook(playbooks, "third", -1);
assert.deepEqual(normalizePlaybooks(JSON.parse(JSON.stringify(reordered))), reordered);

assert.equal(renderPlaybookPrompt(typed, { AREA: "authentication", DETAILS: "line 1\nline 2" }), "Review authentication and line 1\nline 2.");

assert.deepEqual(preparePlaybookPrompt(typed, { AREA: "authentication", DETAILS: "line 1\nline 2" }), {
  prompt: "Review authentication and line 1\nline 2.", values: { AREA: "authentication", DETAILS: "line 1\nline 2" },
});
assert.equal(preparePlaybookPrompt({ ...typed, prompt: "Review", variables: [] }).prompt, "Review");
for (const values of [null, [], "text", {}, { AREA: "auth" }, { AREA: "auth", DETAILS: " " }, { AREA: "auth\nother", DETAILS: "details" }, { AREA: "auth", DETAILS: "details", UNKNOWN: "extra" }, { AREA: "auth", DETAILS: "x".repeat(20_001) }]) {
  assert.throws(() => preparePlaybookPrompt(typed, values));
}
assert.throws(() => preparePlaybookPrompt(playbook, { AREA: "auth" }), /Undefined.*UNKNOWN/);
assert.throws(() => preparePlaybookPrompt({ ...typed, variables: [...typed.variables, typed.variables[0]] }, { AREA: "auth", DETAILS: "details" }), /definitions/);
assert.throws(() => preparePlaybookPrompt({ ...typed, prompt: "{{DETAILS}}{{DETAILS}}" }, { AREA: "auth", DETAILS: "x".repeat(10_001) }), /20,000/);
assert.throws(() => preparePlaybookPrompt({ ...typed, prompt: "  " }, { AREA: "auth", DETAILS: "details" }), /prompt/);
assert.throws(() => preparePlaybookPrompt({ ...typed, variables: [{ id: "proto", name: "constructor", label: "Value", type: "singleLine" }] }, {}), /Missing/);
