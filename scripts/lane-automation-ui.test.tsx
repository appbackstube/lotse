// Open /scripts/lane-automation-ui.html through Vite. The real App uses synthetic IPC; no live agents run.
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
const repo = { rootPath: "/synthetic-repository", name: "Monthly Report", currentBranch: "main", hasOrigin: true };
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const first = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Polish keyboard navigation", manualStatus: "inbox", chatMode: "plan", location: "worktree", attachments: [{ kind: "image", path: "/synthetic/draft.png", name: "draft.png" }] })!;
const second = { ...first, id: "22345678-1234-1234-1234-123456789abc", title: "Wait behind my queued message", attachments: [] };
const third = { ...first, id: "32345678-1234-1234-1234-123456789abc", title: "Review empty states", attachments: [] };
const sends: any[] = [];
const preparations: any[] = [];
const failures: string[] = [];
let failClaimWrite = false;
const storage: Record<string, string> = {
  "chaoticreview.branch-prefix:/synthetic-repository": "fix/",
  "chaoticreview.auth-onboarding-v1": "complete",
  "chaoticreview.chat-queues": JSON.stringify({ [JSON.stringify([repo.rootPath, "task", second.id])]: [{ id: "queued", body: "My queued prompt", context: { mode: "auto", attachments: [] }, selection: null, mode: "default", model: first.chatModel, effort: first.chatEffort }] }),
  [taskStorageKey(repo.rootPath)]: JSON.stringify([first, second, third]),
  "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: "kanban" }),
  "chaoticreview.task-board-tabs": JSON.stringify({ [repo.rootPath]: {} }),
};
mockWindows("main");
mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") {
    if (failClaimWrite && args.key === laneStorageKey(repo.rootPath) && args.value?.includes('"status":"running"')) throw new Error("Synthetic disk write failure");
    storage[args.key] = args.value; return;
  }
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main", "feature/monthly-report"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "agent_models") return [];
  if (command === "task_browser_supported") return false;
  if (command === "task_sandbox_supported") return true;
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
  if (command === "prepare_task_worktree") { preparations.push(args); return { branch: args.newBranchName, baseOid: comparison.baseOid, baseBranch: "main", created: true }; }
  if (command === "ai_chat_send") { if ("requireCleanWorktree" in args) throw new Error("Agent messages must not request a clean working tree"); sends.push(args); return { requestId: `run-${sends.length}`, threadId: `thread-${sends.length}`, turnId: `turn-${sends.length}` }; }
  failures.push(command); throw new Error(`Unexpected IPC command: ${command}`);
}, { shouldMockEvents: true });
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); };
const visible = (element: Element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const button = (label: string) => [...document.querySelectorAll<HTMLElement>("button, [role=switch]")].find((item) => visible(item) && (item.textContent?.trim() === label || item.getAttribute("aria-label") === label))!;
const click = async (element: HTMLElement) => { check(element, "Missing control"); await act(async () => { element.focus(); if (element.getAttribute("role") === "option") element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" })); element.click(); }); await settle(); };
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.trim() === label)!;
const storedTasks = () => JSON.parse(storage[taskStorageKey(repo.rootPath)]);
const storedLanes = () => JSON.parse(storage[laneStorageKey(repo.rootPath)]);
const change = async (label: string, value: string) => {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  check(input, `Missing ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }); await settle();
};
const save = async () => { await act(async () => document.querySelector('[role=dialog] form')?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await settle(); };
const openAutomation = async (label = "Inbox") => { await click(button(`Options for ${label} column`)); await click(menuItem("Automation…")); };
const event = async (index: number, payload: Record<string, unknown>) => { await act(async () => sends[index].events.onmessage({ type: "chat", payload: { requestId: `run-${index + 1}`, threadId: `thread-${index + 1}`, turnId: `turn-${index + 1}`, ...payload } })); await settle(); };
const root = (fixtureRoot = createRoot(document.getElementById("root")!));
try {
  await initializeFileStore();
  await act(async () => root.render(<App />)); await settle();
  await click(button("Tasks"));
  for (const view of ["List", "Kanban", "Gantt"]) {
    await click(button(view)); await click(button("Options for Inbox column"));
    check(menuItem("Automation…") && menuItem("Delete all cards"), `${view} status menu differs`);
    await click(menuItem("Automation…"));
    check(document.querySelector('[aria-label="Lane automation prompt"]'), `${view} automation dialog is missing`);
    const bounds = document.querySelector('[role="dialog"][data-slot="dialog-content"]')!.getBoundingClientRect();
    check(bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= 0 && bounds.bottom <= innerHeight + 1, `${view} dialog exceeds viewport`);
    await click(button("Cancel"));
  }
  await click(button("Kanban")); await openAutomation();
  await change("Lane automation prompt", "Inspect the task and update its description. Move it to In review when finished.");
  await change("Maximum concurrent lane workers", "2");
  await click(button("Automation base branch")); await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === "main")!);
  await click(button("Enable Inbox automation"));
  await save();
  check(sends.length === 2 && sends[0].taskId === first.id && sends[1].taskId === third.id, `Wrong queue order, worker cap, or manual queue priority: ${JSON.stringify(sends.map((s) => s.taskId))}`);
  check(preparations.every((args) => args.startPoint.kind === "branch" && args.startPoint.branch === "main"), "New worktrees ignored lane base");
  check(preparations.every((args) => args.newBranchName === (args.taskId === first.id ? "fix/polish-keyboard-navigation" : "fix/review-empty-states")), "Automatic starts must use the repository prefix and task title");
  check(sends[0].collaborationMode === "default" && sends[0].model === first.chatModel && sends[0].effort === first.chatEffort, "Automation changed task model/effort or used Plan mode");
  check(storedTasks().find((task: any) => task.id === first.id).manualStatus === "inbox", "Starting automation moved the task");
  check(storedTasks().find((task: any) => task.id === first.id).attachments.length === 1 && sends[0].chatContext.attachments.length === 0, "Automation consumed draft attachments");
  await act(async () => emit("mcp-tasks-updated", { repositoryRoot: repo.rootPath, tasks: storedTasks().map(({ id, title, parentId, color, manualStatus, completed, planReady }: any) => ({ id, title, parentId, color, manualStatus: id === first.id ? "inReview" : manualStatus, completed, planReady })), descriptionChange: { taskId: first.id, description: "Agent-updated description" } })); await settle();
  await openAutomation("In review"); await change("Lane automation prompt", "Review the result.");
  await click(button("Automation base branch")); await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === "main")!);
  await click(button("Enable In review automation")); await save();
  check(sends.length === 2, "Destination lane started before the source turn ended");
  await event(0, { kind: "completed" });
  check(sends.length === 3 && sends[2].taskId === first.id && sends[2].agentThreadId === "thread-1", "Cross-lane handoff failed to reuse the task chat");
  check(preparations.filter((args) => args.taskId === first.id).length === 1, "Handoff recreated existing work");
  check(storedTasks().find((task: any) => task.id === first.id).manualStatus === "inReview" && storedTasks().find((task: any) => task.id === first.id).description === "Agent-updated description", "Completion overwrote explicit agent edits");
  await event(1, { kind: "failed", message: "Synthetic failed check" });
  check(storedLanes().inbox.attempts[third.id].status === "failed" && sends.length === 3, `Failure auto-retried or was lost: ${JSON.stringify({ attempt: storedLanes().inbox.attempts[third.id], sends: sends.map((send) => ({taskId: send.taskId, thread: send.agentThreadId})), failures })}`);
  await openAutomation(); await click(button("Retry"));
  check(sends.length === 4 && sends[3].taskId === third.id, "Explicit retry did not restart failed task");
  await click(button("Enable Inbox automation")); await save();
  await event(3, { kind: "completed" }); await event(2, { kind: "completed" });
  check(storedLanes().inbox.attempts[third.id].status === "processed" && !storedLanes().inbox.enabled, "Pausing cancelled active work or lost completion");
  await openAutomation(); await click(button("Enable Inbox automation")); await save();
  const fourth = { ...first, id: "42345678-1234-1234-1234-123456789abc", title: "A newly arriving task", attachments: [] };
  await act(async () => emit("mcp-task-added", { repositoryRoot: repo.rootPath, task: fourth })); await settle();
  check(sends.length === 5 && sends[4].taskId === fourth.id, "Newly entering tasks did not join the enabled queue");
  await act(async () => root.render(<div />)); await settle();
  await act(async () => root.render(<App />)); await settle();
  check(sends.length === 5 && storedLanes().inbox.attempts[fourth.id].status === "interrupted", "Reopening replayed processed or interrupted work");
  failClaimWrite = true;
  const fifth = { ...first, id: "52345678-1234-1234-1234-123456789abc", title: "Storage must succeed before dispatch", attachments: [] };
  await act(async () => emit("mcp-task-added", { repositoryRoot: repo.rootPath, task: fifth })); await settle();
  check(sends.length === 5, "Agent ran before its processing claim was saved");
  failClaimWrite = false;
  await act(async () => root.render(<div />)); await settle();
  await act(async () => root.render(<App />)); await settle();
  check(sends.length === 5, "Uncertain storage failure was automatically replayed");
  const workspaceOne = { ...first, id: "62345678-1234-1234-1234-123456789abc", title: "First shared workspace task", location: "workspace", attachments: [] };
  const workspaceTwo = { ...workspaceOne, id: "72345678-1234-1234-1234-123456789abc", title: "Second shared workspace task" };
  // Preserve the explicit workspace location rather than the new-task default applied by MCP imports.
  await act(async () => {
    fileStore.setItem(taskStorageKey(repo.rootPath), JSON.stringify([...storedTasks(), workspaceOne, workspaceTwo]));
  });
  await act(async () => root.render(<div />)); await settle();
  await act(async () => root.render(<App />)); await settle();
  check(sends.length === 7 && sends[5].taskId === workspaceOne.id && sends[6].taskId === workspaceTwo.id, "Agents sharing a workspace did not start concurrently");
  await act(async () => sends[5].events.onmessage({ type: "approvalRequested", payload: { requestId: 42, title: "Synthetic approval", description: "Waiting", source: "agent", serverName: null } })); await settle();
  check(sends.length === 7 && storedLanes().inbox.attempts[workspaceOne.id].status === "running" && storedLanes().inbox.attempts[workspaceTwo.id].status === "running", "Approval interrupted concurrent workspace agents");
  await click(button("Workspace"));
  await change("Review Agent message", "Review while the workspace tasks run");
  await click(button("Send Review Agent message"));
  check(sends.length === 8 && !sends[7].taskId, "Workspace review was blocked by running task agents");
  await event(5, { kind: "completed" });
  check(storedLanes().inbox.attempts[workspaceTwo.id].status === "running", "Finishing one workspace agent interrupted another");
  await event(6, { kind: "completed" });
  const workspaceThree = { ...workspaceOne, id: "82345678-1234-1234-1234-123456789abc", title: "Task during a workspace review" };
  await act(async () => emit("mcp-task-added", { repositoryRoot: repo.rootPath, task: workspaceThree })); await settle();
  check(sends.length === 9 && sends[8].taskId === workspaceThree.id, "Lane task was blocked by the running workspace review");
  await event(8, { kind: "completed" });
  await event(7, { kind: "completed" });
  await click(button("Tasks")); await click(button("Gantt")); await openAutomation();
  check(!document.querySelector('[aria-label="Generate issue description"]'), "Legacy Generate action remains");
  const form = document.querySelector("[role=dialog] form")!;
  check(form.scrollWidth <= form.clientWidth + 1, "Automation form scrolls horizontally");
  check(failures.length === 0, `Unexpected IPC: ${failures.join(", ")}`);
  document.getElementById("result")!.textContent = "PASS: shared menus in all views, dialog layout, persisted config, FIFO/worker limit, concurrent workspace tasks and reviews, approval occupancy, queued-user priority, branch fallback, model/effort/chat reuse, draft preservation, status/description edits, cross-lane handoff, explicit retry, pause, arriving tasks, interrupted recovery, storage-failure blocking, and reopening without replay. No live agents.";
} catch (error) { document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`; } finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
