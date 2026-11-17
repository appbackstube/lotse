import assert from "node:assert/strict";
import { normalizePipelines, pipelineChatConfig, pipelineError, pipelineQueue, pipelineTurn, validPipelineMessage, type Pipeline } from "../src/pipelines.ts";
import { normalizeTask } from "../src/tasks.ts";
import { loadChatQueues, moveQueuedMessage } from "../src/chatQueue.ts";
import { fileStore } from "../src/fileStore.ts";
const owner = { id: "owner", title: "Owner", prompt: "Plan." };
const reviewer = { id: "reviewer", title: "Reviewer", prompt: "Review." };
const pipeline: Pipeline = { id: "build", title: "Build & review", description: "Small changes", steps: [
  { id: "plan", title: "Plan", agentId: owner.id, messages: ["Read the task.", "Implement it."] },
  { id: "review", title: "Review", agentId: reviewer.id, messages: ["Review the changes."] },
] };
const task = normalizeTask({ id: "task", title: "Task", chatAgent: owner, agentThreadId: "existing" })!;
const queue = pipelineQueue(pipeline, [owner, reviewer], task);
const configuredReviewer = { ...reviewer, modelConfig: { model: "review-model", effort: "high" as const } };
const configuredQueue = pipelineQueue(pipeline, [owner, configuredReviewer], task);
assert.equal(configuredQueue[0].model, task.chatModel);
assert.equal(configuredQueue[0].effort, task.chatEffort);
assert.equal(configuredQueue[2].model, "review-model");
assert.equal(configuredQueue[2].effort, "high");
assert.deepEqual(pipelineChatConfig(task, task, configuredQueue[2]), { chatModel: "review-model", chatEffort: "high" });
assert.deepEqual(pipelineChatConfig(task, { ...task, chatModel: "manual-model", chatEffort: "low" }, configuredQueue[2]), {});
assert.deepEqual(pipelineChatConfig(task, { ...task, chatModel: "manual-model" }, configuredQueue[2]), { chatEffort: "high" });
assert.deepEqual(pipelineChatConfig({ ...task, chatAgent: configuredReviewer }, task, configuredQueue[2]), {});
assert.deepEqual(pipelineChatConfig(task, task, queue[2]), {});
const configuredOwner = { ...owner, modelConfig: { model: "owner-model", effort: "high" as const } };
const manuallyConfiguredTask = { ...task, chatAgent: configuredOwner, chatModel: "manual-model", chatEffort: "low" as const };
const manualQueue = pipelineQueue(pipeline, [configuredOwner, configuredReviewer], manuallyConfiguredTask);
assert.equal(manualQueue[0].model, "manual-model");
assert.equal(manualQueue[0].effort, "low");
assert.equal(manualQueue[2].model, "review-model");
const switchedPipeline = { ...pipeline, steps: [...pipeline.steps, { id: "none", title: "No role", agentId: null, messages: ["Continue."] }, { id: "owner-again", title: "Owner again", agentId: owner.id, messages: ["Finish."] }] };
const switchedQueue = pipelineQueue(switchedPipeline, [configuredOwner, configuredReviewer], manuallyConfiguredTask);
assert.equal(switchedQueue[3].model, "review-model");
assert.equal(switchedQueue[4].model, "owner-model");
assert.equal(queue.length, 3);
assert.deepEqual(queue.map((q) => q.pipeline!.position), [0, 1, 2]);
assert.deepEqual(queue.map((q) => q.pipeline!.stepIndex), [0, 0, 1]);
assert.equal(new Set(queue.map((q) => q.pipeline!.runId)).size, 1);
assert.equal(new Set(queue.map((q) => q.id)).size, 3);
assert.equal(pipelineTurn(task, queue[0]).threadId, "existing");
const completed = { ...task, chatMessages: [{ id: "result", role: "assistant" as const, body: "Implemented and verified the summary.", createdAt: "now", selection: null, snapshotId: null, suggestions: [] }] };
const handoff = pipelineTurn(completed, queue[2]);
assert.equal(handoff.threadId, null);
assert.equal(handoff.agent!.id, reviewer.id);
assert.ok(handoff.prompt.startsWith("Review the changes."));
assert.ok(handoff.prompt.includes("Implemented and verified the summary."));
assert.equal(completed.chatMessages.length, 1, "Role change must preserve visible history");
reviewer.prompt = "Changed later";
assert.equal(queue[2].pipeline!.agent!.prompt, "Review.", "Running workflows keep their role snapshot");
assert.equal(moveQueuedMessage(queue, queue[1].id, -1), queue, "Individual pipeline messages cannot be reordered");
assert.throws(() => pipelineQueue(pipeline, [owner], task), /role no longer exists/);
const draft = { ...pipeline, title: "", steps: [{ ...pipeline.steps[0], messages: [""] }] };
assert.equal(normalizePipelines([draft]).length, 1, "Incomplete editor drafts survive reload");
assert.ok(pipelineError(draft, [owner]));
assert.throws(() => pipelineQueue(draft, [owner], task));
assert.deepEqual(normalizePipelines([{ ...pipeline, steps: [null] }]), []);
assert.equal(validPipelineMessage({ ...queue[0].pipeline, agent: { id: "malformed" } }), false);
const oldGet = fileStore.getItem;
try {
  fileStore.getItem = () => JSON.stringify({ task: [...queue, { ...queue[0], pipeline: { bad: true } }] });
  assert.equal(loadChatQueues().task.length, 3, "Reload must validate role snapshots, preserving legitimate queue items");
} finally { fileStore.getItem = oldGet; }
console.log("PASS pipeline validation, drafts, immutable execution snapshots, sequential messages, role handoff and persisted queue");

// Tool writes are strict and atomic; UI drafts remain readable through normalization.
const { getPipeline, pipelineMetadata } = await import('../src/pipelineControl.ts');
const { newPipelineRun, observePipelineRun, savePipelineRun, loadPipelineRuns, removePipelineRuns, updatePipelineMessage } = await import('../src/pipelineRuns.ts');
const created = pipelineMetadata(null, { title: ' Agent pipeline ', steps: [{ title: 'Inspect', agentId: null, messages: [' Inspect the task. '] }] }, []);
assert.equal(created.title, 'Agent pipeline');
assert.equal(created.steps[0].messages[0], 'Inspect the task.');
assert.ok(created.id && created.steps[0].id);
const changed = pipelineMetadata(created, { pipelineId: created.id, description: 'Updated' }, []);
assert.deepEqual(changed.steps, created.steps);
assert.equal(created.description, '', 'Updating must not mutate the saved template');
const reordered = pipelineMetadata(created, { steps: [{ ...created.steps[0] }, { title: 'New', agentId: null, messages: ['Continue'] }] }, []);
assert.equal(reordered.steps[0].id, created.steps[0].id);
assert.notEqual(reordered.steps[1].id, created.steps[0].id);
for (const args of [
  { title: null }, { description: null }, { title: ' '.repeat(2) }, { extra: true }, { steps: [] },
  { steps: [{ ...created.steps[0], extra: true }] }, { steps: [{ ...created.steps[0], messages: [' '] }] },
  { steps: [{ ...created.steps[0], messages: ['a'.repeat(20_001)] }] }, { steps: [{ ...created.steps[0], agentId: 'missing' }] },
  { steps: [{ ...created.steps[0], agentId: undefined }] }, { steps: [{ ...created.steps[0], id: 'unknown' }] },
  { steps: [created.steps[0], created.steps[0]] },
]) assert.throws(() => pipelineMetadata(created, args, []));
assert.throws(() => pipelineMetadata(null, { title: 'Missing steps' }, []));
assert.throws(() => pipelineMetadata(null, { title: 'Bad', steps: [created.steps[0]] }, []), /unknown tool arguments/i);
assert.throws(() => getPipeline([created], 'unknown'), /not found/);
assert.equal(getPipeline([created], created.id), created);

const record = newPipelineRun(task.id, pipeline.id, queue);
const state = { starting: false, paused: false, queueIds: queue.map((q) => q.id) };
assert.equal(observePipelineRun(record, state).status, 'pending');
assert.equal(observePipelineRun(record, { ...state, activeMessageId: queue[0].id }).status, 'running');
assert.equal(observePipelineRun(record, { ...state, activeMessageId: queue[0].id, input: { question: 'Choose' } }).status, 'needsInput');
assert.equal(observePipelineRun(record, { ...state, activeMessageId: queue[0].id, approval: { id: 1 } }).status, 'needsApproval');
assert.equal(observePipelineRun(record, { ...state, paused: true }).status, 'paused');
assert.equal(observePipelineRun(record, { ...state, queueIds: [] }).status, 'paused', 'Missing messages never imply success');
assert.equal(observePipelineRun({ ...record, stopRequested: true }, { ...state, queueIds: [] }).status, 'cancelled');
assert.equal(observePipelineRun({ ...record, stopRequested: true }, { ...state, starting: true, queueIds: [] }).status, 'pending', 'Pending start cancellation is not yet confirmed');
assert.equal(observePipelineRun({ ...record, stopRequested: true }, { ...state, activeMessageId: queue[0].id }).status, 'running', 'Cancellation dispatch is not confirmation');
const oldSetJSON = fileStore.setJSON;
const oldRemove = fileStore.removeItem;
const saved = new Map<string, string>();
try {
  fileStore.getItem = (key) => saved.get(key) ?? null;
  fileStore.setJSON = (key, value) => { saved.set(key, JSON.stringify(value)); };
  fileStore.removeItem = (key) => { saved.delete(key); };
  savePipelineRun('task', record);
  updatePipelineMessage('task', record.runId, queue[0].id, 'failed', 'Synthetic failure');
  let loaded = loadPipelineRuns('task')[0];
  assert.equal(observePipelineRun(loaded, { ...state, paused: true }).status, 'failed');
  assert.equal(loaded.error, 'Synthetic failure');
  assert.equal(observePipelineRun(loaded, state).completedMessages, 0);
  updatePipelineMessage('task', record.runId, queue[0].id, 'running');
  for (const q of queue) updatePipelineMessage('task', record.runId, q.id, 'completed', null, [`result-${q.id}`]);
  loaded = loadPipelineRuns('task')[0];
  const complete = observePipelineRun(loaded, { ...state, queueIds: [] });
  assert.equal(complete.status, 'completed');
  assert.equal(complete.completedMessages, 3);
  assert.deepEqual(complete.messages[0].resultIds, [`result-${queue[0].id}`]);
  assert.equal(loadPipelineRuns('other-task').length, 0);
  for (let i = 0; i < 25; i++) savePipelineRun('task', { ...record, runId: `run-${i}` });
  assert.equal(loadPipelineRuns('task').length, 20, 'Run evidence is bounded');
  assert.equal(loadPipelineRuns('task').at(-1)?.runId, 'run-24');
  savePipelineRun('other-task', record);
  removePipelineRuns('task');
  assert.equal(loadPipelineRuns('task').length, 0, 'Task deletion removes its run evidence');
  assert.equal(loadPipelineRuns('other-task').length, 1, 'Other task evidence survives deletion');
} finally { fileStore.getItem = oldGet; fileStore.setJSON = oldSetJSON; fileStore.removeItem = oldRemove; }
console.log('PASS pipeline tool validation, atomic edits, durable exact-run outcomes, human waits, cancellation and retention');

const uncertainCancellation = { ...record, stopRequested: true, messages: record.messages.map((m, i) => i === 0 ? { ...m, status: 'running' as const } : m) };
assert.equal(observePipelineRun(uncertainCancellation, { ...state, queueIds: [] }).status, 'paused', 'Reload must not confirm an unobserved cancellation');
configuredReviewer.modelConfig.model = 'Changed later';
assert.equal(configuredQueue[2].pipeline!.agent!.modelConfig!.model, 'review-model', 'Execution must deeply copy role settings');
