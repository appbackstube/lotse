// Full settings navigation with synthetic IPC; no native credentials or repository writes.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { emit } from "@tauri-apps/api/event";
import { pipelinesStorageKey, type Pipeline } from "../src/pipelines";
import { chatQueueStorageKey } from "../src/chatQueue";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { agentsStorageKey, defaultAgentStorageKey } from "../src/agents";
import { normalizeTask, taskStorageKey } from "../src/tasks";
import App from "../src/App";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-settings", name: "Settings preview", currentBranch: "main", hasOrigin: true };
const agent = { id: "owner", title: "Product Owner", prompt: "Clarify goals." };
const reviewer = { id: "reviewer", title: "Reviewer", prompt: "Review changes.", modelConfig: { model: "review-model", effort: "high" as const } };
const pipeline: Pipeline = { id: "build", title: "Build & review", description: "A clear plan, implementation, then review.", steps: [
  { id: "plan", title: "Plan & implement", agentId: agent.id, messages: ["Inspect the task.", "Implement the plan."] },
  { id: "review", title: "Review", agentId: reviewer.id, messages: ["Review the result.", "Summarize the review."] },
] };
const sends: any[] = [], cancelled: string[] = [];
let failSend = false;
let failCancel = false;
let failPipelineWrite = false;
const acknowledgements: any[] = [];
let deferSend = false;
let releaseSend: (() => void) | undefined;
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  [agentsStorageKey]: JSON.stringify([agent, reviewer]),
  [pipelinesStorageKey]: JSON.stringify([pipeline]),
  [taskStorageKey(repo.rootPath)]: JSON.stringify([normalizeTask({ id: "existing", title: "Existing task", location: "workspace", chatAgent: agent, agentThreadId: "existing-thread" }), normalizeTask({ id: "target", title: "Background target", location: "workspace" }), normalizeTask({ id: "missing-start", title: "No start", location: "worktree" })]),
};
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "task_control_active") return true;
  if (command === "task_control_ack") { acknowledgements.push(args); return; }
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return true;
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { if (failPipelineWrite && args.key === pipelinesStorageKey) throw new Error("Synthetic pipeline disk failure"); storage[args.key] = args.value; return; }
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "agent_models") return [{ model: "gpt-5.6-terra", displayName: "Default" }, { model: "review-model", displayName: "Review model", supportedReasoningEfforts: [{ reasoningEffort: "high" }] }];
  if (["scheduler_list", "list_memory", "load_mcp_servers", "list_website_credentials"].includes(command)) return [];
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:window|inner_size" || command === "plugin:window|outer_size") return { width: innerWidth, height: innerHeight };
  if (["save_review", "set_mcp_context"].includes(command) || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  if (command === "ai_chat_send") { if (failSend) throw new Error("Synthetic start failure"); sends.push(args); if (deferSend) await new Promise<void>((resolve) => { releaseSend = resolve; }); return { requestId: `run-${sends.length}`, threadId: `thread-${sends.length}`, turnId: `turn-${sends.length}` }; }
  if (command === "task_git_status") return { repository: repo, upstream: null, pullCount: 0, pushCount: 0, dirty: false };
  if (command === "ai_chat_cancel") { if (failCancel) throw new Error("Synthetic cancellation failure"); cancelled.push(args.requestId); return; }
  throw new Error(`Unexpected pipeline IPC: ${command}`);
}, { shouldMockEvents: true });
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const visible = (el: Element) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const button = (label: string) => [...document.querySelectorAll<HTMLElement>('button')].find((el) => visible(el) && (el.getAttribute('aria-label') === label || el.textContent?.trim() === label));
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 30)); }); };
const click = async (el: HTMLElement | undefined | null) => { check(el, 'Missing control'); await act(async () => el!.click()); await settle(); };
const edit = async (label: string, value: string) => {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  check(el, `Missing ${label}`);
  await act(async () => { Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); await settle();
};
const event = async (index: number, kind: string, extra = {}) => {
  await act(async () => sends[index].events.onmessage({ type: 'chat', payload: { requestId: `run-${index + 1}`, threadId: `thread-${index + 1}`, turnId: `turn-${index + 1}`, kind, ...extra } })); await settle();
};
let operationSequence = 0;
const request = async (name: string, args: Record<string, unknown>, callerTaskId: string | null = null) => {
  const operationId = `pipeline-operation-${++operationSequence}`;
  await act(async () => { await emit("task-control-request", { repositoryRoot: repo.rootPath, operationId, callerTaskId, name, arguments: args }); });
  await settle();
  const ack = acknowledgements.find((item) => item.operationId === operationId);
  check(ack, `${name} must acknowledge`);
  return ack;
};
const queue = () => Object.values(JSON.parse(fileStore.getItem(chatQueueStorageKey) ?? '{}')).flat() as any[];
const storedTask = () => JSON.parse(fileStore.getItem(taskStorageKey(repo.rootPath))!)[0];
const start = async () => { await click(button('Add to chat')); await click(button('Pipeline')); await click(button('Start pipeline Build & review')); };
const root = createRoot(document.getElementById('root')!);
try {
  await initializeFileStore(); await act(async () => root.render(<App />)); await settle();
  await click(button('Settings')); await click(button('Pipelines'));
  check(document.querySelector('[data-settings-page="pipelines"]:not([hidden])'), 'Designer must be a Settings page');
  await click(button('New pipeline')); await edit('Pipeline title', 'Quick review'); await edit('Step 1 message 1', 'Review this task.');
  await click(document.querySelector<HTMLElement>('.pipeline-role button'));
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((el) => el.textContent === reviewer.title));
  await click(button('Add message')); await edit('Step 1 message 2', 'Summarize the findings.'); await click(button('Delete message 2 from step 1'));
  await fileStore.flush();
  check(JSON.parse(storage[pipelinesStorageKey])[1].steps[0].agentId === reviewer.id, 'New pipelines and role choices must persist');
  await click(document.querySelector<HTMLElement>('.pipeline-library-item'));
  await click(button('Add step')); await edit('Step 3 title', 'Verify'); await edit('Step 3 message 1', 'Verify the journey.');
  await click(button('Move step 3 up'));
  check((document.querySelector('[aria-label="Step 2 title"]') as HTMLInputElement).value === 'Verify', 'Step order must change');
  await click(button('Delete step 2'));
  await fileStore.flush();
  check(JSON.parse(storage[pipelinesStorageKey])[0].steps.length === 2, 'Designer edits must persist');
  await click(button('Close settings')); await click(button('Tasks')); await click(button('Existing task'));
  await start();
  check(sends.length === 1 && sends[0].prompt === 'Inspect the task.', 'Plus menu must start the first message');
  check(sends[0].agentPrompt === agent.prompt && sends[0].agentThreadId === 'existing-thread', 'Same role must reuse the thread');
  check(queue().length === 4, 'The in-flight message must stay durable until completion');
  await click(button('Pause')); await event(0, 'assistantMessageCompleted', { finalText: 'Plan ready.' }); await event(0, 'completed');
  check(sends.length === 1 && queue().length === 3, 'Pausing waits for current response, then stops');
  await click(button('Resume')); check(sends.length === 2 && sends[1].prompt === 'Implement the plan.', 'Resume sends the next message');
  await event(1, 'failed', { message: 'Synthetic failure' });
  check(sends.length === 2 && queue().length === 3 && document.querySelector('.pipeline-run-card')?.textContent?.includes('Paused'), 'Failed messages must stay queued and pause the pipeline');
  await click(button('Resume')); check(sends.length === 3 && sends[2].prompt === 'Implement the plan.', 'Retry must repeat the failed message');
  await event(2, 'assistantMessageCompleted', { finalText: 'Implementation verified.' }); await event(2, 'completed');
  check(sends.length === 4 && sends[3].agentPrompt === reviewer.prompt && sends[3].agentThreadId === null, 'Role switch must start a fresh reviewer thread');
  check(sends[3].model === 'review-model' && sends[3].effort === 'high', 'A pipeline role switch must use the role model and effort');
  check(storedTask().chatModel === 'review-model' && storedTask().chatEffort === 'high', 'A pipeline role switch must update the task chat configuration');
  check(button('Model and effort')?.textContent?.includes('Review model') && button('Model and effort')?.textContent?.includes('High'), 'The task chat must display the selected pipeline role configuration');
  check(sends[3].prompt.includes('Implementation verified.') && sends[3].prompt.includes('Plan ready.'), 'Handoff must include previous results');
  check(storedTask().chatMessages.some((m: any) => m.body === 'Plan ready.'), 'Switching roles must preserve chat history');
  await click(button('Pause'));
  await click(button('Model and effort'));
  await click(document.querySelector<HTMLElement>('.ios-chat-config-popover .model-picker-trigger'));
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) => visible(element) && element.textContent?.includes('Default')));
  await click(button('Effort'));
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) => visible(element) && element.textContent === 'Low'));
  await act(async () => document.querySelector('.ios-chat-config-popover')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await settle();
  await event(3, 'completed');
  await click(button('Resume'));
  check(sends[4].model === 'review-model' && sends[4].effort === 'high', 'Queued pipeline messages must keep their saved configuration');
  check(storedTask().chatModel === 'gpt-5.6-terra' && storedTask().chatEffort === 'low', 'A repeated pipeline role must not overwrite manual chat settings');
  await event(4, 'completed'); check(!queue().length && !document.querySelector('.pipeline-run-card'), 'Completion must clear the pipeline');
  await edit('Review Agent message', 'Follow up manually.'); await click(button('Send Review Agent message'));
  check(sends[5].model === 'gpt-5.6-terra' && sends[5].effort === 'low', 'A later manual message must use the edited chat settings');
  await event(5, 'completed');
  check(storedTask().manualStatus === null && !storedTask().completed, 'Pipelines must not change task status');
  await start(); const stoppedIndex = sends.length - 1; await click(button('Stop'));
  check(cancelled.length === 1 && !queue().length, 'Stop must cancel the active agent and remove remaining steps');
  await event(stoppedIndex, 'cancelled');
  // Stop must also work while the native start acknowledgement is still pending.
  deferSend = true; await start(); const pendingIndex = sends.length - 1;
  await click(button('Stop')); await act(async () => releaseSend!()); await settle(); deferSend = false;
  check(cancelled.length === 2 && !queue().length && button('Stop Review Agent response'), 'An accepted late start must stay observable until cancellation is confirmed');
  await event(pendingIndex, 'cancelled');
  check(!button('Stop Review Agent response'), 'A confirmed cancellation must clear the active turn');
  check(pendingIndex === sends.length - 1, 'Stop must not start any following messages');
  // A rejected start must remain recoverable without silently skipping the first message.
  failSend = true; await start();
  check(queue().length === 4 && document.querySelector('.pipeline-run-card')?.textContent?.includes('Paused'), 'Rejected start must preserve the whole pipeline');
  failSend = false;
  const beforeReload = sends.length;
  await act(async () => root.render(null)); await act(async () => root.render(<App />)); await settle();
  check(sends.length === beforeReload, 'Reload must never resume an interrupted pipeline automatically');
  await click(button('Tasks')); await click(button('Existing task'));
  check(document.querySelector('.pipeline-run-card')?.textContent?.includes('Paused'), 'Interrupted pipeline must reopen paused');
  // All tools use the real dispatch and synthetic IPC; the target is not selected in the UI.
  const draftList = await request('get_pipelines', {});
  check(!draftList.error && draftList.result.some((p: any) => p.id === pipeline.id && p.stepCount === 2 && p.messageCount === 4), 'List must expose the designer library and counts');
  const created = await request('create_pipeline', { title: 'Agent flow', description: 'Tool fixture', steps: [{ title: 'Inspect', agentId: null, messages: ['Tool first', 'Tool second'] }] });
  check(!created.error && created.result.id && created.result.steps[0].id, 'Create must return generated IDs');
  const template = created.result;
  const read = await request('get_pipeline', { pipelineId: template.id });
  check(read.result.steps[0].messages[1] === 'Tool second', 'Read must return ordered prompts');
  const filtered = await request('get_pipelines', { query: 'Tool fixture' });
  check(filtered.result.length === 1 && filtered.result[0].id === template.id, 'Search must include descriptions');
  const beforeInvalid = fileStore.getItem(pipelinesStorageKey);
  for (const patch of [{ steps: [{ ...template.steps[0], agentId: 'missing' }] }, { title: null }, { steps: [template.steps[0], template.steps[0]] }, { steps: [{ ...template.steps[0], foreign: true }] }, { foreign: true }]) {
    check((await request('update_pipeline', { pipelineId: template.id, ...patch })).error, 'Invalid updates must fail');
    check(fileStore.getItem(pipelinesStorageKey) === beforeInvalid, 'Invalid updates must preserve the library');
  }
  check((await request('start_task_pipeline', { taskId: 'missing-start', pipelineId: template.id })).error, 'A missing worktree start must fail without queueing');
  const index = sends.length;
  const started = await request('start_task_pipeline', { taskId: 'target', pipelineId: template.id });
  check(!started.error && started.result.taskId === 'target' && started.result.messageIds.length === 2 && sends.length === index + 1 && sends[index].taskId === 'target', 'Explicit target must start without UI selection');
  const runId = started.result.runId;
  const observe = async (id = runId) => (await request('get_task_pipeline_run', { taskId: 'target', runId: id })).result;
  check((await observe()).status === 'running' && (await observe()).completedMessages === 0, 'Accepted turns are running, not completed');
  check((await request('start_task_pipeline', { taskId: 'target', pipelineId: template.id })).error, 'Busy tasks must reject another pipeline');
  check((await request('start_task_pipeline', { taskId: 'target', pipelineId: template.id }, 'target')).error, 'Caller cycles must be rejected');
  await act(async () => sends[index].events.onmessage({ type: 'userInputRequested', payload: { requestId: 100, threadId: `thread-${index + 1}`, turnId: `turn-${index + 1}`, itemId: 'input', isBlocking: true, questions: [{ id: 'choice', header: 'Choice', question: 'Choose', isOther: true, isSecret: false, options: null }] } })); await settle();
  check((await observe()).status === 'needsInput' && (await observe()).question.requestId === 100, 'Human questions must remain visible');
  await act(async () => sends[index].events.onmessage({ type: 'userInputResolved', payload: { requestId: 100 } })); await settle();
  await act(async () => sends[index].events.onmessage({ type: 'approvalRequested', payload: { requestId: 101, title: 'Synthetic approval', description: 'Local fixture', source: 'agent', serverName: null } })); await settle();
  check((await observe()).status === 'needsApproval', 'Human approvals must remain visible');
  await act(async () => sends[index].events.onmessage({ type: 'approvalResolved', payload: { requestId: 101 } })); await settle();
  const modified = await request('update_pipeline', { pipelineId: template.id, title: 'Changed during execution', steps: [{ ...template.steps[0], messages: ['Changed prompt'] }] });
  check(!modified.error && modified.result.description === 'Tool fixture', 'Omitted fields must survive updates');
  check((await request('delete_pipeline', { pipelineId: template.id })).result.deleted, 'Delete must remove only the template');
  check(queue().some((m: any) => m.body === 'Tool second'), 'Template writes must preserve the queued snapshot');
  await event(index, 'assistantMessageCompleted', { finalText: 'First result' }); await event(index, 'completed');
  check(sends[index + 1].prompt === 'Tool second' && (await observe()).completedMessages === 1, 'Execution must keep the original prompt and exact progress');
  await event(index + 1, 'failed', { message: 'Synthetic pipeline failure' });
  check((await observe()).status === 'failed' && (await observe()).completedMessages === 1 && (await observe()).error.includes('Synthetic pipeline failure'), 'Failure must pause with exact progress and error');
  await request('update_task_queue', { taskId: 'target', paused: false });
  check(sends[index + 2].prompt === 'Tool second', 'Resume retries the failed message');
  await event(index + 2, 'assistantMessageCompleted', { finalText: 'Final result' }); await event(index + 2, 'completed');
  const finished = await observe();
  check(finished.status === 'completed' && finished.completedMessages === 2 && finished.messages.every((m: any) => m.resultIds.length), 'Completion must preserve result references after queue removal');
  const stopIndex = sends.length;
  const newer = await request('start_task_pipeline', { taskId: 'target', pipelineId: pipeline.id });
  const newerId = newer.result.runId;
  const staleStoppedItems = queue().filter((m: any) => m.pipeline?.runId === newerId);
  const beforeStaleStop = cancelled.length;
  check((await request('stop_task_pipeline', { taskId: 'target', runId })).result.status === 'completed', 'Stopping an old completed run must be safe');
  check(cancelled.length === beforeStaleStop && (await observe(newerId)).status === 'running', 'A stale stop must preserve the newer run');
  const manual = await request('start_task_run', { taskId: 'target', prompt: 'Unrelated follow-up' });
  failCancel = true;
  check((await request('stop_task_pipeline', { taskId: 'target', runId: newerId })).error?.includes('Cancellation failed'), 'Failed cancellation must surface an error');
  check((await observe(newerId)).status === 'running', 'Failed cancellation must never report cancelled');
  check(queue().some((m: any) => m.id === manual.result.messageId), 'Stop must preserve unrelated queued work');
  failCancel = false;
  await request('stop_task_pipeline', { taskId: 'target', runId: newerId });
  await event(stopIndex, 'cancelled');
  check((await observe(newerId)).status === 'cancelled', 'Only terminal cancellation confirms stop');
  const afterStop = cancelled.length;
  await request('stop_task_pipeline', { taskId: 'target', runId: newerId });
  check(cancelled.length === afterStop, 'Repeated stop must not cancel anything else');
  // Simulate an old persisted queue reappearing after an uncertain write.
  const staleQueues = JSON.parse(fileStore.getItem(chatQueueStorageKey)!);
  const targetKey = Object.keys(staleQueues).find((key) => staleQueues[key].some((m: any) => m.id === manual.result.messageId))!;
  staleQueues[targetKey] = [...staleStoppedItems, ...staleQueues[targetKey]];
  await act(async () => { fileStore.setItem(chatQueueStorageKey, JSON.stringify(staleQueues)); window.dispatchEvent(new StorageEvent('storage', { key: chatQueueStorageKey })); }); await settle();
  const beforeReplay = sends.length;
  await request('update_task_queue', { taskId: 'target', paused: false });
  check(sends.length === beforeReplay + 1 && sends[beforeReplay].prompt === 'Unrelated follow-up', 'A stopped run must never replay stale messages; unrelated work remains dispatchable');
  await event(beforeReplay, 'completed');
  check((await request('get_task_pipeline_run', { taskId: 'existing', runId })).error, 'Run IDs cannot cross task boundaries');
  check((await request('get_task_pipeline_run', { taskId: 'target', runId: 'unknown' })).error, 'Unknown runs must fail clearly');
  failPipelineWrite = true;
  const diskFailure = await request('create_pipeline', { title: 'Uncertain write', steps: [{ title: 'Inspect', agentId: null, messages: ['Never dispatch'] }] });
  check(diskFailure.error?.includes('outcome uncertain'), 'Persistence failures must not claim success');
  failPipelineWrite = false; fileStore.setJSON(pipelinesStorageKey, JSON.parse(fileStore.getItem(pipelinesStorageKey)!)); await fileStore.flush();
  await act(async () => root.render(null)); await act(async () => root.render(<App />)); await settle();
  check((await observe()).status === 'completed' && (await observe(newerId)).status === 'cancelled', 'Exact terminal evidence must survive remount');
  await click(button('Settings')); await click(button('Pipelines'));
  check(document.querySelector('.pipeline-library')?.textContent?.includes('Uncertain write') || document.body.textContent?.includes('Uncertain write'), 'Tool writes must be visible in the designer');
  if (new URLSearchParams(location.search).has('preview')) { await click(button('Settings')); await click(button('Pipelines')); }
  document.getElementById('result')!.textContent = 'PASS: Settings designer persistence and reorder; plus-menu start; sequential execution; pause/resume; failure retry; role handoff; stop; interrupted run recovery; unchanged task status; eight pipeline tools; explicit background task; validation; immutable snapshots; exact durable outcomes; human waits; scoped repeat-safe cancellation; persistence errors.';
} catch (error) { document.getElementById('result')!.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`; }
finally { if (!new URLSearchParams(location.search).has('preview')) await act(async () => root.unmount()); }
