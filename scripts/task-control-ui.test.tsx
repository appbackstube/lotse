// Open /scripts/task-control-ui.html through Vite. The real App uses synthetic IPC; no live agents run.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { emit } from "@tauri-apps/api/event";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { taskStorageKey, normalizeTask } from "../src/tasks";
import { laneStorageKey } from "../src/laneAutomation";
import App from "../src/App";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let repo = { rootPath: "/synthetic-repository", name: "Monthly Report", currentBranch: "main", hasOrigin: true };
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const savedAgent = { id: "owner", title: "Product owner", prompt: "Clarify goals" };
const first = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Polish keyboard navigation", manualStatus: "inbox", chatMode: "default", location: "workspace", chatAgent: savedAgent, attachments: [{ kind: "image", path: "/synthetic/draft.png", name: "draft.png" }] })!;
const second = { ...first, id: "22345678-1234-1234-1234-123456789abc", title: "Wait behind my queued message", location: "worktree" as const, worktreeStart: { kind: "branch" as const, branch: "main" }, attachments: [] };
const third = { ...first, id: "32345678-1234-1234-1234-123456789abc", title: "Review empty states", attachments: [] };
const sends: any[] = [];
const preparations: any[] = [];
const failures: string[] = [];
const cancelled: string[] = [];
let selectedRepository = "/synthetic-other";

let failClaimWrite = false;


const acknowledgements: any[] = [];
const pending = new Set<string>();
let failWrite = false;
let failLibraryWrite = false;
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  "chaoticreview.agents": JSON.stringify([savedAgent]),
  "chaoticreview.default-agent": savedAgent.id,
  "chaoticreview.review-playbooks": JSON.stringify([
    { id: "changelog", title: "Changelog", description: "Write release notes", prompt: "Update changelog for {{VERSION}}.\n{{DETAILS}}", variables: [{ id: "version", name: "VERSION", label: "Release version", type: "singleLine" }, { id: "details", name: "DETAILS", label: "Release details", type: "multiLine" }] },
    { id: "changelog-other", title: "Changelog", description: "Other release notes", prompt: "Other changelog", variables: [] }
  ]),

  [taskStorageKey(repo.rootPath)]: JSON.stringify([first, second, third]),
  "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: "kanban" }),
  "chaoticreview.task-board-tabs": JSON.stringify({ [repo.rootPath]: {} }),
};
mockWindows("main");
mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "task_control_active") return pending.has(args.operationId) && args.repositoryRoot === repo.rootPath;
  if (command === "task_control_ack") { acknowledgements.push(args); pending.delete(args.operationId); return; }
  if (command === "task_sandbox_supported") return true;
  if (command === "task_browser_supported") return false;
  if (command === "plugin:dialog|open") return selectedRepository;
  if (command === "open_repository") { repo = { ...repo, rootPath: args.path, name: args.path.endsWith("other") ? "Other repository" : "Monthly Report" }; return { status: "opened", repository: repo, focusedExisting: false }; }
  if (command === "ai_chat_cancel") { cancelled.push(args.requestId); return; }
  if (command === "delete_task_worktree" || command === "delete_task_assets") return;
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") {
    if (failLibraryWrite && args.key === "chaoticreview.agents") throw new Error("Synthetic library write failure");
    if (failWrite && args.key === taskStorageKey(repo.rootPath)) throw new Error("Synthetic disk write failure");
    if (failClaimWrite && args.key === laneStorageKey(repo.rootPath) && args.value?.includes('"status":"running"')) throw new Error("Synthetic disk write failure");
    storage[args.key] = args.value; return;
  }
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main", "feature/monthly-report"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "agent_models") return [];
  if (command === "load_task_changes") return { comparison, pendingSnapshotId: "snapshot", pendingFiles: false, committedChanges: false, headOid: comparison.baseOid, squashMessage: "" };
  if (command === "task_git_status") return { repository: { ...repo, currentBranch: "feature/monthly-report" }, upstream: "origin/feature/monthly-report", pullCount: 0, pushCount: 0, dirty: false };
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:notification|register_listener" || command === "plugin:notification|remove_listener") return;
  if (command === "plugin:window|outer_size" || command === "plugin:window|inner_size") return { width: innerWidth, height: innerHeight };
  if (command === "save_review" || command === "set_mcp_context" || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  if (command === "list_memory") return [];
  if (command === "scheduler_list") return [];
  if (command === "cleanup_unstarted_task_worktree") return;
  if (command === "prepare_task_worktree") { preparations.push(args); return { branch: `task/${args.taskId}`, baseOid: comparison.baseOid, baseBranch: "main", created: true }; }
  if (command === "ai_chat_send") { sends.push(args); return { requestId: `run-${sends.length}`, threadId: `thread-${sends.length}`, turnId: `turn-${sends.length}` }; }
  failures.push(command); throw new Error(`Unexpected IPC command: ${command}`);
}, { shouldMockEvents: true });

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); };
const visible = (element: Element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const button = (label: string) => [...document.querySelectorAll<HTMLElement>("button")].find((item) => visible(item) && (item.textContent?.trim() === label || item.getAttribute("aria-label") === label))!;
const click = async (element: HTMLElement) => { check(element, "Missing control"); await act(async () => { element.focus(); element.click(); }); await settle(); };
const storedTasks = () => JSON.parse(storage[taskStorageKey(repo.rootPath)]);
let sequence = 0;
const request = async (callerTaskId: string | null, name: string, args: Record<string, unknown>, operationId = `operation-${++sequence}`) => {
  pending.add(operationId);
  await act(async () => { await emit("task-control-request", { repositoryRoot: repo.rootPath, operationId, callerTaskId, name, arguments: args }); });
  await settle();
  const ack = acknowledgements.find((item) => item.operationId === operationId);
  check(ack, `${name} was not acknowledged`);
  return ack;
};
const event = async (index: number, payload: Record<string, unknown>) => { await act(async () => sends[index].events.onmessage({ type: "chat", payload: { requestId: `run-${index + 1}`, threadId: `thread-${index + 1}`, turnId: `turn-${index + 1}`, ...payload } })); await settle(); };
const edit = async (element: HTMLTextAreaElement, value: string) => {
  check(element, "Missing chat composer");
  await act(async () => { element.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); await settle();
};
const sendFromComposer = async (prompt: string) => {
  const composer = [...document.querySelectorAll<HTMLTextAreaElement>('[aria-label="Review Agent message"]')].find(visible)!;
  await edit(composer, prompt);
  await click(button("Send Review Agent message"));
};
const root = (fixtureRoot = createRoot(document.getElementById("root")!));
try {
  await initializeFileStore();
  await act(async () => root.render(<App />)); await settle();
  check(!document.querySelector('[aria-label="Task orchestrator"]'), "Orchestrator sidebar still exists");
  await click(button("Workspace"));
  await sendFromComposer("Coordinate the repository tasks");
  check(sends.length === 1 && !sends[0].taskId, "Workspace agent did not start");
  const list = await request(null, "get_tasks", {});
  check(!list.error && list.result.tasks.length === 3, "Workspace cannot list tasks");
  check(list.result.tasks[0].url === `#task=${first.id}`, "Task tools must return clickable URLs");
  const roles = await request(null, "get_agents", { query: "PRODUCT" });
  check(!roles.error && roles.result.length === 1 && roles.result[0].id === savedAgent.id && !("prompt" in roles.result[0]), "Workspace cannot search saved agents");
  const readRole = await request(null, "get_agent", { agentId: savedAgent.id });
  check(!readRole.error && readRole.result.prompt === savedAgent.prompt, "Workspace cannot read saved agent prompts");
  const createdRole = await request(null, "create_agent", { title: "Reviewer", prompt: "Review changes" });
  check(!createdRole.error && JSON.parse(storage["chaoticreview.agents"]).some((agent: any) => agent.id === createdRole.result.id), "Workspace agent creation not persisted");
  const createdTemplate = await request(null, "create_playbook", { title: "Audit", prompt: "Audit {{AREA}}", variables: [{ name: "AREA", label: "Which area?", type: "singleLine" }] });
  check(!createdTemplate.error && JSON.parse(storage["chaoticreview.review-playbooks"]).some((playbook: any) => playbook.id === createdTemplate.result.id), "Workspace playbook creation not persisted");
  const changedTemplate = await request(null, "update_playbook", { playbookId: createdTemplate.result.id, description: "Created by workspace" });
  check(!changedTemplate.error && changedTemplate.result.prompt === "Audit {{AREA}}" && changedTemplate.result.variables[0].id === createdTemplate.result.variables[0].id, "Playbook patch lost untouched fields");
  await event(0, { kind: "assistantMessageCompleted", finalText: `Updated [${first.title}](${list.result.tasks[0].url}). [Missing task](#task=deleted-task).` });
  await event(0, { kind: "completed" });
  await click(document.querySelector<HTMLAnchorElement>('a[href="#task=deleted-task"]')!);
  check(!button("Close task modal") && document.body.textContent?.includes("This task is no longer available"), "Missing task links must fail locally");
  await edit(document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')!, "Keep my workspace draft");
  await click(document.querySelector<HTMLAnchorElement>(`a[href="#task=${first.id}"]`)!);
  check(!!button("Close task modal") && document.querySelector('[role="dialog"]')?.textContent?.includes(first.title), "Workspace task links must open the matching task modal");
  check(button("Workspace")?.getAttribute("aria-pressed") === "true" && button("Tasks")?.getAttribute("aria-pressed") === "false", "Opening a workspace task link must keep the Workspace tab active");
  check(document.querySelector('[role="dialog"] [aria-label="Review Agent message"]'), "Workspace task modal must include the task chat");
  check(document.querySelector('[role="dialog"] .task-details-title-input'), "Workspace task modal must include editable task details");
  await edit(document.querySelector<HTMLTextAreaElement>('[role="dialog"] [aria-label="Review Agent message"]')!, "Keep my task draft");
  await click(button("Close task modal"));
  check(button("Workspace")?.getAttribute("aria-pressed") === "true", "Closing the task modal must stay in Workspace");
  check(document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')?.value === "Keep my workspace draft", "Closing the task modal must restore the workspace draft");
  check(visible(document.querySelector(`a[href="#task=${first.id}"]`)!), "Closing the task modal must restore the workspace conversation");
  await click(document.querySelector<HTMLAnchorElement>(`a[href="#task=${first.id}"]`)!);
  check(document.querySelector<HTMLTextAreaElement>('[role="dialog"] [aria-label="Review Agent message"]')?.value === "Keep my task draft", "Reopening the task must preserve its own draft");
  await edit(document.querySelector<HTMLTextAreaElement>('[role="dialog"] [aria-label="Review Agent message"]')!, "Keep my draft after Escape");
  await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await settle();
  check(!button("Close task modal") && button("Workspace")?.getAttribute("aria-pressed") === "true", "Escape must close the task modal in Workspace");
  await click(document.querySelector<HTMLAnchorElement>(`a[href="#task=${first.id}"]`)!);
  check(document.querySelector<HTMLTextAreaElement>('[role="dialog"] [aria-label="Review Agent message"]')?.value === "Keep my draft after Escape", "Escape must preserve the focused task draft");
  await click(button("Close task modal"));
  const created = await request(null, "create_task", { title: "Shared coordination", description: "From workspace", agentId: createdRole.result.id, startDate: "2026-11-06", deadline: "2026-11-07" });
  check(!created.error && storedTasks().some((task: any) => task.id === created.result.id), "Task creation not persisted");
  check(created.result.agent.id === createdRole.result.id && storedTasks().find((task: any) => task.id === created.result.id).chatAgent.prompt === "Review changes", "Task creation did not select and persist the canonical agent role");
  const beforeBadRole = storage[taskStorageKey(repo.rootPath)];
  for (const agentId of ["missing", "", 42, {}]) {
    check((await request(null, "create_task", { title: "Invalid role", agentId })).error, "Task creation accepted an invalid agent role");
    check((await request(null, "update_task", { taskId: created.result.id, title: "Must not change", agentId })).error, "Task update accepted an invalid agent role");
  }
  check(storage[taskStorageKey(repo.rootPath)] === beforeBadRole, "Invalid role selection changed tasks");
  const defaultRoleTask = await request(null, "add_task", { title: "Use default role" });
  check(!defaultRoleTask.error && defaultRoleTask.result.agent.id === savedAgent.id, "Omitting agentId lost the default role");
  const noRoleTask = await request(null, "create_task", { title: "Use no role", agentId: null });
  check(!noRoleTask.error && noRoleTask.result.agent === null && storedTasks().find((task: any) => task.id === noRoleTask.result.id).chatAgent === null, "Explicit null fell back to the default role");
  const clearedRole = await request(null, "update_task", { taskId: created.result.id, agentId: null });
  check(!clearedRole.error && clearedRole.result.agent === null, "Cannot clear a task role");
  const id = created.result.id;
  const changed = await request(null, "update_task", { taskId: id, title: "Updated from workspace", parentId: first.id, status: "inReview" });
  check(!changed.error && changed.result.parentId === first.id, "Cross-task metadata update failed");
  const comment = await request(null, "add_task_comment", { taskId: second.id, body: "Workspace comment" });
  check(!comment.error, "Workspace comment failed");
  const update = await request(null, "update_task_comment", { taskId: second.id, commentId: comment.result.id, body: "Revised from workspace" });
  check(!update.error && storedTasks().find((task: any) => task.id === second.id).comments[0].body === "Revised from workspace", "Comment update not saved");
  const selectedByWorkspace = await request(null, "update_task", { taskId: second.id, agentId: createdRole.result.id });
  check(!selectedByWorkspace.error && selectedByWorkspace.result.agent.id === createdRole.result.id, "Workspace cannot select a task agent role");
  const start = await request(null, "start_task_run", { taskId: first.id, prompt: "Coordinate the other tasks" });
  check(!start.error && sends.length === 2 && sends[1].taskId === first.id, "Workspace cannot start task agent directly");
  const taskRoles = await request(first.id, "get_agents", {});
  check(!taskRoles.error && taskRoles.result.length === 2, "Task cannot list saved agents");
  const taskRole = await request(first.id, "get_agent", { agentId: createdRole.result.id });
  check(!taskRole.error && taskRole.result.prompt === "Review changes", "Task cannot read a saved agent");
  const updatedRole = await request(first.id, "update_agent", { agentId: savedAgent.id, prompt: "Prioritize goals" });
  check(!updatedRole.error && updatedRole.result.title === savedAgent.title && JSON.parse(storage["chaoticreview.agents"])[0].prompt === "Prioritize goals", "Task agent edit not persisted");
  check(storedTasks()[0].chatAgent.prompt === savedAgent.prompt, "Saved-role edit changed an existing task chat role");
  const taskCreatedRole = await request(first.id, "create_agent", { title: "Task author", prompt: "Write tasks" });
  check(!taskCreatedRole.error, "Task cannot create saved agents");
  const taskTemplate = await request(first.id, "get_playbook", { playbookId: createdTemplate.result.id });
  check(!taskTemplate.error && taskTemplate.result.description === "Created by workspace", "Task cannot read workspace playbook edits");
  const taskCreatedTemplate = await request(first.id, "create_playbook", { title: "Task audit", prompt: "Audit all" });
  check(!taskCreatedTemplate.error, "Task cannot create playbooks");
  const taskUpdatedTemplate = await request(first.id, "update_playbook", { playbookId: createdTemplate.result.id, title: "Task audit with area", variables: [{ name: "AREA", label: "Area", type: "multiLine" }] });
  check(!taskUpdatedTemplate.error && taskUpdatedTemplate.result.variables[0].id === createdTemplate.result.variables[0].id, "Task playbook edit lost the variable ID");
  const workspaceUpdatedRole = await request(null, "update_agent", { agentId: taskCreatedRole.result.id, title: "Workspace author" });
  check(!workspaceUpdatedRole.error && workspaceUpdatedRole.result.prompt === "Write tasks", "Workspace cannot update task-created roles");
  const beforeInvalid = storage["chaoticreview.review-playbooks"];
  for (const [name, args] of [
    ["update_playbook", { playbookId: createdTemplate.result.id, variables: [{ name: "INVALID!", label: "Area", type: "singleLine" }] }],
    ["update_playbook", { playbookId: createdTemplate.result.id, prompt: "" }],
    ["update_playbook", { playbookId: createdTemplate.result.id }],
    ["update_playbook", { playbookId: "missing", title: "Missing" }],
    ["update_agent", { agentId: savedAgent.id, title: null }],
    ["update_agent", { agentId: savedAgent.id, shell: "no" }],
    ["update_agent", { agentId: savedAgent.id }],
    ["get_agent", { agentId: "missing" }],
  ] as const) check((await request(first.id, name, args)).error, `${name} accepted invalid input`);
  check(storage["chaoticreview.review-playbooks"] === beforeInvalid, "Invalid library edits changed persisted data");
  failLibraryWrite = true;
  const failedLibraryWrite = await request(first.id, "update_agent", { agentId: savedAgent.id, prompt: "Uncertain save" });
  check(failedLibraryWrite.error?.includes("uncertain"), `Library write failure was reported as success: ${JSON.stringify(failedLibraryWrite)}`);
  failLibraryWrite = false;
  await act(async () => {
    fileStore.setItem("chaoticreview.agents", storage["chaoticreview.agents"]);
    window.dispatchEvent(new StorageEvent("storage", { key: "chaoticreview.agents", newValue: storage["chaoticreview.agents"] }));
    await fileStore.flush();
  });
  await settle();
  await request(first.id, "update_task_queue", { taskId: third.id, paused: true });
  const idleQueued = await request(first.id, "start_task_run", { taskId: third.id, prompt: "Keep this queued prompt" });
  check(!idleQueued.error && sends.length === 2, "Paused idle task unexpectedly started");
  const idleQueueRoleChange = await request(first.id, "update_task", { taskId: third.id, agentId: null });
  check(idleQueueRoleChange.error?.includes("queued") && storedTasks().find((task: any) => task.id === third.id).chatAgent.id === savedAgent.id, "Role switch changed an idle task with queued prompts");
  const sameQueuedRole = await request(first.id, "update_task", { taskId: third.id, agentId: savedAgent.id });
  // The saved owner prompt changed above, so selecting its latest snapshot is a role change too.
  check(sameQueuedRole.error?.includes("queued"), "Refreshing the same role bypassed queued-prompt protection");
  await request(first.id, "update_task_queue", { taskId: third.id, removeMessageIds: [idleQueued.result.messageId], paused: false });
  const selectedByTask = await request(first.id, "update_task", { taskId: third.id, agentId: createdRole.result.id });
  check(!selectedByTask.error && selectedByTask.result.agent.id === createdRole.result.id, "Task agent cannot select another task's agent role");
  const runningRoleChange = await request(null, "update_task", { taskId: first.id, agentId: createdRole.result.id });
  check(runningRoleChange.error && storedTasks()[0].chatAgent.prompt === savedAgent.prompt, "Role switch changed a running conversation");
  const other = await request(first.id, "get_task", { taskId: second.id });
  check(!other.error && other.result.comments[0].body === "Revised from workspace" && Array.isArray(other.result.chatMessages), "Task cannot read another task");
  const fromTask = await request(first.id, "add_task_comment", { taskId: second.id, body: "Task A comments on Task B" });
  check(!fromTask.error, "Task-to-task comment failed");
  const changedByTask = await request(first.id, "update_task_comment", { taskId: second.id, commentId: comment.result.id, body: "Revised from task" });
  check(!changedByTask.error, "Task-to-task comment update failed");
  check(other.result.agent.prompt === "Review changes", "Task details omit the selected prompt snapshot");
  const next = await request(first.id, "start_task_run", { taskId: second.id, prompt: "Implement the delegated change" });
  check(!next.error && sends.length === 3 && sends[2].taskId === second.id && preparations.length === 1, "Task cannot start another task agent");
  check(sends[2].agentPrompt === "Review changes", "Delegation ignored the selected agent template");
  check(sends[2].model === second.chatModel && sends[2].effort === second.chatEffort, "Delegation changed the target model or effort");
  check(storedTasks().find((task: any) => task.id === first.id).attachments.length === 1, "Delegation consumed existing draft attachments");
  const cycle = await request(second.id, "start_task_run", { taskId: first.id, prompt: "Start the parent again" });
  check(cycle.error?.includes("cycle") && sends.length === 3, "Reciprocal delegation cycle was allowed");
  const queued = await request(first.id, "start_task_run", { taskId: second.id, prompt: "Follow-up while running" });
  check(!queued.error && sends.length === 3 && JSON.parse(storage["chaoticreview.chat-queues"])[JSON.stringify([repo.rootPath, "task", second.id])].length === 1, "Running task prompt was not queued");
  const queuedRoleChange = await request(first.id, "update_task", { taskId: second.id, agentId: null });
  check(queuedRoleChange.error && storedTasks().find((task: any) => task.id === second.id).chatAgent.id === createdRole.result.id, "Role switch changed a queued conversation");
  const duplicate = await request(first.id, "start_task_run", { taskId: second.id, prompt: "Follow-up while running" }, queued.operationId);
  check(!duplicate.error && JSON.parse(storage["chaoticreview.chat-queues"])[JSON.stringify([repo.rootPath, "task", second.id])].length === 1, "Repeated operation duplicated the queue");
  const stopped = await request(first.id, "stop_task_run", { taskId: second.id });
  check(!stopped.error && stopped.result.queuePaused && cancelled.includes("run-3"), "Stopping task did not cancel the run and pause its queue");
  await event(2, { kind: "cancelled", message: "Cancelled by coordinator" });
  const lightweight = await request(first.id, "get_task_execution", { taskId: second.id });
  check(!lightweight.error && lightweight.result.execution.status === "cancelled" && !lightweight.result.chatMessages && !lightweight.result.drawing, "Waiting must read execution state without copying chat history or drawing assets");
  const result = await request(first.id, "get_task", { taskId: second.id });
  check(result.result.execution.status === "cancelled" && result.result.execution.queuePaused && sends.length === 3, "Cancelled result or queue pause lost");
  const badPlaybook = await request(first.id, "run_task_playbook", { taskId: third.id, playbookId: "changelog", values: {} });
  check(badPlaybook.error && sends.length === 3, "Missing playbook variables started work");
  const playbook = await request(first.id, "run_task_playbook", { taskId: third.id, playbookId: "changelog", values: { VERSION: "1.0", DETAILS: "Saved canonical prompt" } });
  check(!playbook.error && sends.at(-1).prompt === "Update changelog for 1.0.\nSaved canonical prompt", "Saved playbook was not rendered and run");
  const resumed = await request(first.id, "update_task_queue", { taskId: second.id, paused: false });
  check(!resumed.error && sends.length === 5 && sends[4].prompt === "Follow-up while running", "Coordinator cannot resume a stopped task queue");
  const paused = await request(first.id, "update_task_queue", { taskId: second.id, paused: true });
  check(!paused.error && paused.result.queuePaused, "Cannot pause another task queue");
  const toRemove = await request(first.id, "start_task_run", { taskId: second.id, prompt: "Remove this queued prompt" });
  const removed = await request(first.id, "update_task_queue", { taskId: second.id, removeMessageIds: [toRemove.result.messageId] });
  check(!removed.error && !removed.result.queuedMessageIds.length, "Cannot remove a queued task prompt");
  const bad = await request(first.id, "update_task", { taskId: second.id, parentId: "unknown" });
  check(bad.error, "Invalid hierarchy accepted");
  const lanes = await request(first.id, "get_lanes", {});
  check(!lanes.error && lanes.result.length === 5, "Cannot inspect lanes");
  const lane = await request(first.id, "update_lane", { status: "done", enabled: false, prompt: "Inspect completed work", baseBranch: "main", workers: 1 });
  check(!lane.error, "Cannot configure lanes");
  const runningDelete = await request(null, "delete_task", { taskId: first.id });
  check(runningDelete.error?.includes("running"), "Running parent task was deletable");
  pending.add("delete-cancel");
  await act(async () => emit("task-control-request", { repositoryRoot: repo.rootPath, operationId: "delete-cancel", callerTaskId: null, name: "delete_task", arguments: { taskId: id } })); await settle();
  check(document.querySelector('[role="alertdialog"]') || document.querySelector('[role="dialog"]'), "Task deletion skipped its confirmation");
  await click(button("Cancel"));
  check(acknowledgements.find((entry) => entry.operationId === "delete-cancel")?.result.deleted === false && storedTasks().some((task: any) => task.id === id), "Declining deletion lost the task");
  failWrite = true;
  const failedWrite = await request(null, "create_task", { title: "Unsaved task stays inactive" });
  check(failedWrite.error?.includes("uncertain") && sends.length === 5, "Failed persistence dispatched work or hid the uncertainty");
  failWrite = false;
  const missing = await request(null, "get_task", { taskId: "outside-repository" });
  check(missing.error, "Foreign task accepted");
  await event(1, { kind: "completed", finalText: "Coordinator finished" });
  const completedRoleChange = await request(null, "update_task", { taskId: first.id, agentId: null });
  check(completedRoleChange.error?.includes("conversation") && storedTasks()[0].chatMessages.length > 0, "Role switch erased completed chat history");
  const stoppedCaller = await request(first.id, "add_task_comment", { taskId: second.id, body: "Must not run" });
  check(stoppedCaller.error?.includes("stopped"), "Stopped caller could mutate tasks");
  const stoppedLibraryCaller = await request(first.id, "update_agent", { agentId: savedAgent.id, prompt: "Must not save" });
  check(stoppedLibraryCaller.error?.includes("stopped"), "Stopped caller could edit the saved library");
  await click(button("Tasks"));
  await click(button("List"));
  await click(button("Workspace"));
  check(!button("Close task modal"), "Returning to Workspace must not reopen an old task modal");
  await click(document.querySelector<HTMLAnchorElement>(`a[href="#task=${first.id}"]`)!);
  check(button("Workspace")?.getAttribute("aria-pressed") === "true" && button("Close task modal"), "Workspace task links must also open a modal with List selected");
  await click(button("Changes"));
  check(document.querySelector('[role="dialog"]')?.textContent?.includes("Your workspace has no uncommitted changes."), "Workspace task modal must load the task Changes panel");
  await click(button("Detail"));
  const sendCount = sends.length;
  await sendFromComposer("Sent from workspace task modal");
  check(sends.length === sendCount + 1 && sends.at(-1).taskId === first.id, "The workspace task modal must send to the task agent");
  await click(button("Close task modal"));
  check(document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')?.value === "Keep my workspace draft", "Sending in the task modal must preserve the workspace draft");
  await event(sends.length - 1, { kind: "completed" });
  check(!failures.length, `Unexpected IPC commands: ${failures.join(", ")}`);
  document.getElementById("result")!.textContent = "PASS: workspace task-link modals with List/Kanban, unchanged active tab, separate drafts, task chat and changes, workspace/task agent coordination, sidebar removal, task metadata and hierarchy, cross-task comments, persisted writes, agent-template selection and role-switch protection, direct starts, model/worktree/draft preservation, exact queues, cycle prevention, cancellation, playbooks, lanes and stopped/foreign caller checks.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`;
} finally {
  await act(async () => fixtureRoot?.unmount());
}
