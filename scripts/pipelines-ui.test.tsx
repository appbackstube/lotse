// Full settings navigation with synthetic IPC; no native credentials or repository writes.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { pipelinesStorageKey, type Pipeline } from "../src/pipelines";
import { chatQueueStorageKey } from "../src/chatQueue";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { agentsStorageKey, defaultAgentStorageKey } from "../src/agents";
import { normalizeTask, taskStorageKey } from "../src/tasks";
import App from "../src/App";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-settings", name: "Settings preview", currentBranch: "main", hasOrigin: true };
const agent = { id: "owner", title: "Product Owner", prompt: "Clarify goals." };
const reviewer = { id: "reviewer", title: "Reviewer", prompt: "Review changes." };
const pipeline: Pipeline = { id: "build", title: "Build & review", description: "A clear plan, implementation, then review.", steps: [
  { id: "plan", title: "Plan & implement", agentId: agent.id, messages: ["Inspect the task.", "Implement the plan."] },
  { id: "review", title: "Review", agentId: reviewer.id, messages: ["Review the result."] },
] };
const sends: any[] = [], cancelled: string[] = [];
let failSend = false;
let deferSend = false;
let releaseSend: (() => void) | undefined;
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  [agentsStorageKey]: JSON.stringify([agent, reviewer]),
  [pipelinesStorageKey]: JSON.stringify([pipeline]),
  [taskStorageKey(repo.rootPath)]: JSON.stringify([normalizeTask({ id: "existing", title: "Existing task", location: "workspace", chatAgent: agent, agentThreadId: "existing-thread" })]),
};
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return true;
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
  if (command === "load_review" || command === "github_connection") return null;
  if (["scheduler_list", "list_memory", "agent_models", "load_mcp_servers", "list_website_credentials"].includes(command)) return [];
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:window|inner_size" || command === "plugin:window|outer_size") return { width: innerWidth, height: innerHeight };
  if (["save_review", "set_mcp_context"].includes(command) || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  if (command === "ai_chat_send") { if (failSend) throw new Error("Synthetic start failure"); sends.push(args); if (deferSend) await new Promise<void>((resolve) => { releaseSend = resolve; }); return { requestId: `run-${sends.length}`, threadId: `thread-${sends.length}`, turnId: `turn-${sends.length}` }; }
  if (command === "task_git_status") return { repository: repo, upstream: null, pullCount: 0, pushCount: 0, dirty: false };
  if (command === "ai_chat_cancel") { cancelled.push(args.requestId); return; }
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
  check(queue().length === 3, 'The in-flight message must stay durable until completion');
  await click(button('Pause')); await event(0, 'assistantMessageCompleted', { finalText: 'Plan ready.' }); await event(0, 'completed');
  check(sends.length === 1 && queue().length === 2, 'Pausing waits for current response, then stops');
  await click(button('Resume')); check(sends.length === 2 && sends[1].prompt === 'Implement the plan.', 'Resume sends the next message');
  await event(1, 'failed', { message: 'Synthetic failure' });
  check(sends.length === 2 && queue().length === 2 && document.querySelector('.pipeline-run-card')?.textContent?.includes('Paused'), 'Failed messages must stay queued and pause the pipeline');
  await click(button('Resume')); check(sends.length === 3 && sends[2].prompt === 'Implement the plan.', 'Retry must repeat the failed message');
  await event(2, 'assistantMessageCompleted', { finalText: 'Implementation verified.' }); await event(2, 'completed');
  check(sends.length === 4 && sends[3].agentPrompt === reviewer.prompt && sends[3].agentThreadId === null, 'Role switch must start a fresh reviewer thread');
  check(sends[3].prompt.includes('Implementation verified.') && sends[3].prompt.includes('Plan ready.'), 'Handoff must include previous results');
  check(storedTask().chatMessages.some((m: any) => m.body === 'Plan ready.'), 'Switching roles must preserve chat history');
  await event(3, 'completed'); check(!queue().length && !document.querySelector('.pipeline-run-card'), 'Completion must clear the pipeline');
  check(storedTask().manualStatus === null && !storedTask().completed, 'Pipelines must not change task status');
  await start(); const stoppedIndex = sends.length - 1; await click(button('Stop'));
  check(cancelled.length === 1 && !queue().length, 'Stop must cancel the active agent and remove remaining steps');
  await event(stoppedIndex, 'cancelled');
  // Stop must also work while the native start acknowledgement is still pending.
  deferSend = true; await start(); const pendingIndex = sends.length - 1;
  await click(button('Stop')); await act(async () => releaseSend!()); await settle(); deferSend = false;
  check(cancelled.length === 2 && !queue().length && !button('Stop Review Agent response'), 'A stopped pending start must be cancelled when acknowledged');
  check(pendingIndex === sends.length - 1, 'Stop must not start any following messages');
  // A rejected start must remain recoverable without silently skipping the first message.
  failSend = true; await start();
  check(queue().length === 3 && document.querySelector('.pipeline-run-card')?.textContent?.includes('Paused'), 'Rejected start must preserve the whole pipeline');
  failSend = false;
  const beforeReload = sends.length;
  await act(async () => root.render(null)); await act(async () => root.render(<App />)); await settle();
  check(sends.length === beforeReload, 'Reload must never resume an interrupted pipeline automatically');
  await click(button('Tasks')); await click(button('Existing task'));
  check(document.querySelector('.pipeline-run-card')?.textContent?.includes('Paused'), 'Interrupted pipeline must reopen paused');
  if (new URLSearchParams(location.search).has('preview')) { await click(button('Settings')); await click(button('Pipelines')); }
  document.getElementById('result')!.textContent = 'PASS: Settings designer persistence and reorder; plus-menu start; sequential execution; pause/resume; failure retry; role handoff; stop; interrupted run recovery; unchanged task status.';
} catch (error) { document.getElementById('result')!.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`; }
finally { if (!new URLSearchParams(location.search).has('preview')) await act(async () => root.unmount()); }
