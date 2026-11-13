// Open /scripts/task-performance-ui.html through Vite. Uses the real App with synthetic IPC and storage.
import { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { checkTaskDetailFields } from "./task-detail-fields";
import { checkTaskPanelTransitions } from "./task-panel-transitions";
import { emit } from "@tauri-apps/api/event";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { taskStorageKey, normalizeTask } from "../src/tasks";
import App from "../src/App";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const listOnly = location.pathname.endsWith("task-list-ui.html");
const tabsOnly = location.pathname.endsWith("task-tabs-ui.html");
const foldersOnly = location.pathname.endsWith("task-folders-ui.html");
const repo = { rootPath: "/synthetic-repository", name: "Monthly Report", currentBranch: "main", hasOrigin: true };
let currentRepository = repo;
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const task = normalizeTask({ ...((tabsOnly || listOnly) ? { sandboxHtml: "<!doctype html><h1>Sandbox state fixture</h1>" } : {}), id: "12345678-1234-1234-1234-123456789abc", title: "Monthly Report", manualStatus: "inbox", description: "## Monthly report\n\nReview the changes alongside the agent conversation.\n\n" + "A longer task description with details to review.\n\n".repeat(30), location: "worktree", worktree: { branch: "feature/monthly-report", baseOid: comparison.baseOid, baseBranch: "main" }, startDate: "2026-10-28", deadline: "2026-10-30", unreadAgentResult: true,
  comments: [{ id: "review-comment", author: "user", body: "- [ ] Review the report\n" + "- Keep the comment visible while reading.\n".repeat(100), createdAt: 1_793_174_400_000 }],
  chatMessages: [{ id: "response", role: "assistant", body: "The monthly report is ready for review. Open Changes to inspect it while we continue here.", createdAt: "2026-10-28T12:00:00Z", selection: null, snapshotId: null, suggestions: [], contexts: [] }] })!;
const auditTask = normalizeTask({ ...task, id: "field-audit", title: "Field audit", sandboxHtml: undefined, started: false, chatMessages: [], agentThreadId: null, unreadAgentResult: false, worktree: null, newBranchName: "feature/audit", worktreeStart: { kind: "workspace" }, github: { accountId: 1, accountLogin: "synthetic", repositoryId: 2, repository: "qa/fields", number: 7, kind: "issue", url: "https://github.com/qa/fields/issues/7", state: "open", synced: { title: "Field audit", description: task.description, completed: false } } })!;
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  "chaoticreview.task-custom-fields": JSON.stringify([
    { id: "perf", name: "Performance field", type: "text", multiline: false, showOnCards: false, options: [] },
    { id: "multiline", name: "Multiline field", type: "text", multiline: true, showOnCards: false, options: [] },
    { id: "url", name: "Website", type: "text", multiline: false, hyperlink: true, showOnCards: false, options: [] },
    { id: "choice", name: "Choice field", type: "select", showOnCards: false, options: [{ id: "selected", label: "Selected" }] },
  ]),
  "chaoticreview.task-plan-mode-default": "true",
  "chaoticreview.chat-defaults": JSON.stringify({ default: { model: "synthetic-default", effort: "low" }, plan: { model: "synthetic-plan", effort: "high" } }),
  [taskStorageKey(repo.rootPath)]: JSON.stringify([task, auditTask, ...Array.from({ length: 6 }, (_, index) => ({ ...task, id: `terminal-${index}`, title: `Terminal ${index}`, unreadAgentResult: false })), { ...task, id: "workspace-one", title: "Workspace one", location: "workspace", worktree: null }, { ...task, id: "workspace-two", title: "Workspace two", location: "workspace", worktree: null }]),
  "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: tabsOnly ? "kanban" : "list" }),
  "chaoticreview.task-board-tabs": JSON.stringify({ [repo.rootPath]: { [task.id]: "chat" } }),
};
const merges: any[] = [];
const startedTerminals: any[] = [];
const stoppedTerminals: string[] = [];
let changeReads = 0;
let scheduleReads = 0;
let branchReads = 0;
const openedUrls: string[] = [];
let assetDownloads = 0;
const openedFolders: { taskId: string | null; terminal: boolean }[] = [];
let assetImports = 0;
let chatFileImports = 0;
const preparedPreviews: { token: string; taskId: string }[] = [];
const releasedPreviews: string[] = [];
let prepareGate: Promise<void> | undefined;
let prepareFailure = false;
const deferPreview = () => { let release!: () => void; prepareGate = new Promise<void>((resolve) => { release = resolve; }); return release; };
let taskWrites = 0;
let contextWrites = 0;
let taskStateWrites = 0;
const setJSON = fileStore.setJSON;
fileStore.setJSON = (key, value) => { if (key === taskStorageKey(repo.rootPath)) taskStateWrites++; setJSON(key, value); };
let agentSend: any;
let mcpTasks: any[] = [];
mockWindows("main");
mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "open_task_folder") { openedFolders.push(args); return; }
  if (command === "task_sandbox_supported") return true;
  if (command === "prepare_task_sandbox") {
    const token = `qa-preview-${preparedPreviews.length + 1}`;
    preparedPreviews.push({ token, taskId: args.taskId });
    const gate = prepareGate; prepareGate = undefined;
    const fail = prepareFailure; prepareFailure = false;
    if (gate) await gate;
    if (fail) throw new Error("Synthetic preview preparation failure");
    const base = new URLSearchParams(location.search).get("sandboxUrl");
    if (!base) throw new Error("Run the tab suite with npm run test:browser -- task-tabs");
    return { token, url: base + token };
  }
  if (command === "release_task_sandbox") { releasedPreviews.push(args.token); return; }
  if (command === "plugin:opener|open_url") { openedUrls.push(args.url); return; }
  if (command === "plugin:dialog|open") return ["/synthetic/qa.txt"];
  if (command === "import_task_assets") { assetImports++; return [{ id: "audit-asset", name: "qa.txt", image: false }]; }
  if (command === "import_chat_files") { chatFileImports++; return []; }
  if (command === "retain_task_images") return;
  if (command === "task_asset_preview") return { kind: "text", content: "Synthetic attachment", truncated: false };
  if (command === "download_task_asset") {
    if (args.taskId !== auditTask.id || args.assetId !== "audit-asset" || args.name !== "qa.txt") throw new Error("Wrong asset download arguments");
    if (++assetDownloads === 2) throw new Error("Synthetic save failure");
    return;
  }
  if (command === "remove_task_asset") return;
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { if (args.key === taskStorageKey(repo.rootPath)) taskWrites++; storage[args.key] = args.value; return; }
  if (command === "set_mcp_context") { contextWrites++; mcpTasks = args.tasks; return; }
  if (command === "current_repository" || command === "refresh_repository") return currentRepository;
  if (command === "list_branch_refs") { branchReads++; return { refs: ["main", "feature/monthly-report"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 }; }
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "scheduler_list") { scheduleReads++; return []; }
  if (command === "list_memory") return [];
  if (command === "agent_models") return [];
  if (command === "ai_chat_send") { agentSend = args; return { requestId: "plan-check", threadId: "plan-thread", turnId: "plan-turn" }; }
  if (command === "start_terminal") { startedTerminals.push(args); return; }
  if (command === "stop_terminal") { stoppedTerminals.push(args.sessionId); return; }
  if (command === "resize_terminal" || command === "write_terminal") return;
  if (command === "load_task_changes") { changeReads++; return { comparison, pendingSnapshotId: "snapshot", pendingFiles: true, committedChanges: true, headOid: comparison.baseOid, squashMessage: "Squash task" }; }
  if (command === "list_merge_targets") return [["main", comparison.baseOid]];
  if (command === "merge_task_worktree") { merges.push(args); return "b".repeat(40); }
  if (command === "task_git_status") return { repository: { ...repo, currentBranch: "feature/monthly-report" }, upstream: "origin/feature/monthly-report", pullCount: 0, pushCount: 0, dirty: true };
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:notification|register_listener" || command === "plugin:notification|remove_listener" || command === "plugin:notification|remove_listener") return;
  if (command === "plugin:window|outer_size" || command === "plugin:window|inner_size") return { width: innerWidth, height: innerHeight };
  if (command === "save_review" || command === "set_mcp_context" || command.startsWith("plugin:window|")) return;
  throw new Error(`Unexpected IPC command: ${command}`);
}, { shouldMockEvents: true });
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async (ms = 100) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); };
const visible = (element: Element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const click = async (element: HTMLElement | null) => { check(element, "Missing control"); await act(async () => { element!.focus(); element!.click(); }); await settle(); };
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === name && visible(element))!;
let appCommits = 0;
const root = (fixtureRoot = createRoot(document.getElementById("root")!));
try {
  await initializeFileStore();
  await act(async () => root.render(<Profiler id="app" onRender={() => { appCommits++; }}><App /></Profiler>)); await settle(400);
  await click(button("Tasks"));
  if (listOnly) {
    check(document.querySelector('[aria-label="Task workspace"]'), "List mode must show an inline task workspace before selecting a task");
    check(!([...document.querySelectorAll('[role="dialog"]')].some(visible)) && document.body.textContent?.includes("Select a task to see its details."), "An unselected list must show an empty state without a modal");
  }
  await click(button(task.title));
  await settle(400);
  if (listOnly) {
    const workspace = () => document.querySelector<HTMLElement>('[aria-label="Task workspace"]')!;
    const list = () => document.querySelector<HTMLElement>('.task-mode-list')!;
    const chat = () => workspace().querySelector<HTMLElement>('[aria-label="Task chat"]')!;
    check(!([...document.querySelectorAll('[role="dialog"]')].some(visible)) && visible(workspace()) && visible(list()) && visible(chat()), "Selecting a list task must keep list, panels and chat visible without a modal");
    const bounds = [list(), workspace().querySelector<HTMLElement>('[aria-label="Task details"]')!, chat()].map(el => el.getBoundingClientRect());
    check(bounds[0].right <= bounds[1].left && bounds[1].right <= bounds[2].left && bounds.every(b => b.height > 100), "List, task details and chat must appear side by side");
    if (new URLSearchParams(location.search).get("preview") === "1") {
      document.getElementById("result")!.hidden = true;
      // Native background previews can pause animations at their first frame.
      document.querySelectorAll('.task-board-modal-panel').forEach(el => el.getAnimations().forEach(animation => animation.finish()));
      await new Promise<void>(() => {});
    }
    const draft = workspace().querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')!;
    await act(async () => {
      draft.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(draft, "Keep my task draft");
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button(auditTask.title));
    check(workspace().querySelector<HTMLInputElement>('.task-details-title-input')?.value === auditTask.title && workspace().querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')?.value === "", "Switching tasks must update details and isolate chat drafts");
    await click(button(task.title));
    check(workspace().querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')?.value === "Keep my task draft", "Returning to a task must restore its draft");
    for (const label of ["Resize Tasks and Details columns", "Resize Details and Agent columns"]) {
      const handle = [...document.querySelectorAll<HTMLElement>('[role="separator"]')].find(el => el.getAttribute("aria-label") === label && visible(el))!;
      const before = handle.getAttribute("aria-valuetext");
      await act(async () => handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
      await settle();
      check(handle.getAttribute("aria-valuetext") !== before, "Both list dividers must resize using the keyboard");
    }
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    check(visible(workspace()) && visible(list()), "Escape must not dismiss the inline workspace");
    for (const view of ["Kanban", "Gantt"]) {
      await click(button(view));
      check(!document.querySelector('[aria-label="Task workspace"]') && ![...document.querySelectorAll('[role="dialog"]')].some(visible), "Switching to a board must not automatically open the previous list task");
      await click(button(task.title));
      check([...document.querySelectorAll('[role="dialog"]')].some(visible), view + " tasks must still open their modal");
      await click(document.querySelector<HTMLElement>('[aria-label="Close task modal"]'));
      await click(button("List"));
      check(visible(workspace()) && ![...document.querySelectorAll('[role="dialog"]')].some(visible), "Returning to List must restore the inline workspace");
    }
    const changesTab = () => [...workspace().querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(el => el.textContent?.startsWith("Changes"))!;
    const dropzone = workspace().querySelector<HTMLElement>('#task-assets-dropzone')!;
    dropzone.scrollIntoView({ block: "center" });
    const dropBounds = dropzone.getBoundingClientRect();
    const position = { x: (dropBounds.left + 20) * devicePixelRatio, y: (dropBounds.top + 20) * devicePixelRatio };
    const drop = async () => { await act(async () => emit("tauri://drag-drop", { paths: ["/synthetic/qa.txt"], position })); await settle(); };
    const previousAssetImports = assetImports;
    const previousChatImports = chatFileImports;
    await drop();
    check(assetImports === previousAssetImports + 1 && chatFileImports === previousChatImports, "A visible attachment dropzone must import task assets without also attaching them to chat");
    await click(changesTab());
    check(getComputedStyle(dropzone).visibility === "hidden" && dropzone.getBoundingClientRect().width > 0, "The regression must retain the hidden dropzone's bounds");
    await drop();
    check(assetImports === previousAssetImports + 1 && chatFileImports === previousChatImports + 1, "An inactive Detail panel must not intercept a native file drop intended for chat");
    await click(button(auditTask.title));
    check(workspace().querySelector('[role="tab"][aria-selected="true"]')?.textContent === "Detail", "Each task must restore its own selected tab");
    await click(button(task.title));
    check(changesTab().getAttribute("aria-selected") === "true", "Returning to a task must restore its selected Changes tab");
    const addTask = document.querySelector<HTMLTextAreaElement>('[aria-label="Add task…"]')!;
    await act(async () => {
      addTask.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(addTask, "New inline task");
      addTask.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => addTask.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await settle();
    check(workspace().querySelector<HTMLInputElement>('.task-details-title-input')?.value === "New inline task" && ![...document.querySelectorAll('[role="dialog"]')].some(visible), "Creating a task must select its Detail tab inline even when another tab was open");
    await click(button(task.title));
    await click([...workspace().querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(el => el.textContent === "Detail")!);
    await checkTaskPanelTransitions({ repositoryRoot: repo.rootPath, taskId: task.id, taskTitle: task.title, otherTaskTitle: auditTask.title, storage,
      preparedPreviews, releasedPreviews, openedUrls, deferPreview, failNextPreview: () => { prepareFailure = true; } });
  }
  if (foldersOnly) {
    for (const current of [task, auditTask]) {
      await click(button(current.title));
      for (const terminal of [false, true]) {
        const before = openedFolders.length;
        await click(document.querySelector<HTMLElement>(current.worktree ? '[aria-label="Open task folder"]' : '[aria-label="Open repository folder"]'));
        check(openedFolders.length === before, "Opening the folder menu must wait for a destination choice");
        const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent?.trim() === (terminal ? "Open in Terminal" : "Open in Finder"));
        await click(item!);
        check(openedFolders.length === before + 1 && openedFolders.at(-1)?.taskId === (current.worktree ? current.id : null) && openedFolders.at(-1)?.terminal === terminal, "Folder choices must preserve the destination and task/repository scope");
      }
    }
    await click(button(task.title));
  }
  const fieldsOnly = location.pathname.endsWith("task-fields-ui.html");
  if (!listOnly && !fieldsOnly && !tabsOnly && !foldersOnly) {
  check(document.querySelector('[aria-label="Changes, uncommitted changes"]'), "The lightweight Git status must preserve the dirty marker while Changes is hidden");
  const field = document.querySelector<HTMLInputElement>('#task-custom-perf')!;
  check(field, "The task custom field must be available");
  const beforeWrites = taskWrites;
  const beforeContext = contextWrites;
  const beforeSchedules = scheduleReads;
  const beforeStateWrites = taskStateWrites;
  for (const value of ["A", "AB", "ABC"]) await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check(taskWrites === beforeWrites && contextWrites === beforeContext, "A burst of field edits must defer both serialization and MCP publication");
  check(taskStateWrites === beforeStateWrites, `Typing must not rewrite global task state per character (${taskStateWrites - beforeStateWrites} updates)`);
  await settle(350); await settle(200);
  check(taskWrites === beforeWrites + 1 && contextWrites === beforeContext + 1, "A field-edit burst must produce one disk write and one context update");
  check(scheduleReads === beforeSchedules, "Text edits must not re-read schedule and task storage");
  const published = mcpTasks.find((entry) => entry.id === task.id);
  check(published.customFields.perf === "ABC" && published.details.description === task.description, "MCP must receive the latest task values and details");
  check(!("chatMessages" in published) && !("attachments" in published) && !("description" in published), "MCP must omit unused history, prompt attachments and duplicated descriptions");
  check(JSON.parse(storage[taskStorageKey(repo.rootPath)])[0].customFields.perf === "ABC", "The coalesced write must persist the latest edit");
  const composer = document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(composer, "Stream a response");
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(document.querySelector('[aria-label="Send Review Agent message"]'));
  check(agentSend, "The synthetic task agent must start");
  const nativeFrame = window.requestAnimationFrame;
  const nativeCancelFrame = window.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 100_000;
  window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = (id) => { frames.delete(id); };
  const sendEvent = (kind: string, extra = {}) => agentSend.events.onmessage({ type: "chat", payload: { requestId: "plan-check", threadId: "plan-thread", turnId: "plan-turn", kind, ...extra } });
  try {
    const beforeStreaming = appCommits;
    for (const delta of ["Buffered", " task", " text"]) await act(async () => sendEvent("assistantDelta", { delta }));
    check(appCommits === beforeStreaming, "Task deltas must not commit root renders before a frame");
    await act(async () => { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(performance.now()); });
    check(document.body.textContent?.includes("Buffered task text"), "One frame must publish the combined task text");
    await act(async () => { sendEvent("assistantDelta", { delta: " before tool" }); sendEvent("toolStarted", { label: "Checking" }); });
    check(document.body.textContent?.includes("Buffered task text before tool"), "Tool events must flush buffered text first");
    await act(async () => { sendEvent("assistantDelta", { delta: " before completion" }); sendEvent("completed"); });
  } finally { window.requestAnimationFrame = nativeFrame; window.cancelAnimationFrame = nativeCancelFrame; }
  await settle(450);
  check(JSON.parse(storage[taskStorageKey(repo.rootPath)])[0].chatMessages.some((entry: any) => entry.body === "Buffered task text before tool before completion"), "Completion must persist every buffered delta without waiting for a frame");
  await click(document.querySelector('[aria-label="Toggle terminal"]'));
  check(startedTerminals.length === 1, "Opening a task terminal must start one session");
  const firstSession = startedTerminals[0].sessionId;
  await click(button("Terminal 0"));
  check(startedTerminals.length === 2 && !stoppedTerminals.includes(firstSession), "Switching tasks must preserve running commands");
  await click(document.querySelector('[aria-label="Toggle terminal"]'));
  check(!stoppedTerminals.length, "Hiding a terminal must preserve running commands");
  await click(document.querySelector('[aria-label="Toggle terminal"]'));
  check(startedTerminals.length === 2, "Showing a terminal must reuse its session");
  await click([...document.querySelectorAll<HTMLElement>('[aria-label="Close terminal session"]')].find(visible)!);
  check(stoppedTerminals.length === 1 && stoppedTerminals[0] === startedTerminals[1].sessionId, "Closing a terminal session must stop the PTY");
  await click(button("Workspace one"));
  await click(document.querySelector('[aria-label="Toggle terminal"]'));
  const workspaceStarts = startedTerminals.length;
  await click(button("Workspace two"));
  check(startedTerminals.length === workspaceStarts, "Workspace tasks must share one repository session");
  for (let index = 0; index < 4; index++) await click(button(`Terminal ${index}`));
  check(startedTerminals.length - stoppedTerminals.length === 5, "Task terminal retention must be bounded at five sessions");
  check(document.body.textContent?.includes("Five task terminals are already open"), "The session limit must explain how to free a slot");
  await click(button(task.title));
  const readsWhileHidden = changeReads;
  await settle(2700);
  check(changeReads === readsWhileHidden, "Hidden Changes panel must not scan the repository");
  const changesTab = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((element) => element.textContent?.startsWith("Changes") && visible(element))!;
  await click(changesTab());
  check(changeReads === readsWhileHidden + 1, "Opening Changes must immediately load a fresh comparison");
  await settle(2600);
  check(changeReads > readsWhileHidden + 1, "Visible Changes must keep refreshing");
  const detailsTab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((element) => element.textContent?.startsWith("Detail") && visible(element))!;
  const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  const readsWhileBackgrounded = changeReads;
  await settle(2600);
  check(changeReads === readsWhileBackgrounded, "A backgrounded window must not perform full Git scans");
  if (originalHidden) Object.defineProperty(document, "hidden", originalHidden); else delete (document as any).hidden;
  await act(async () => document.dispatchEvent(new Event("visibilitychange"))); await settle();
  check(changeReads === readsWhileBackgrounded + 1, "Returning to the app must refresh visible Changes");
  await click(detailsTab);
  const afterHiding = changeReads;
  await settle(2600);
  check(changeReads === afterHiding, "Switching back to Details must stop full Git scans");
  await click(changesTab());
  check(changeReads === afterHiding + 1, "Reopening Changes must refresh immediately");
  } else if (fieldsOnly) {
  await click(button(auditTask.title));
  const checkedFields = await checkTaskDetailFields({
    taskId: auditTask.id, repositoryRoot: repo.rootPath, storage,
    stateWrites: () => taskStateWrites, branchReads: () => branchReads, openedUrls,
    otherTaskTitle: task.title,
    switchRepository: async () => {
      currentRepository = { ...repo, rootPath: "/other-field-audit-repository", name: "Other repository" };
      await emit("repository-changed", { rootPath: repo.rootPath, paths: [] });
    },
  });
  console.info(`Task detail fields checked: ${checkedFields.join(", ")}`);
  } else if (tabsOnly) {
    await checkTaskPanelTransitions({ repositoryRoot: repo.rootPath, taskId: task.id, taskTitle: task.title, otherTaskTitle: auditTask.title, storage,
      preparedPreviews, releasedPreviews, openedUrls, deferPreview, failNextPreview: () => { prepareFailure = true; } });
  }
  await act(async () => root.unmount()); await settle();
  check(startedTerminals.every((session) => stoppedTerminals.includes(session.sessionId)), "Unmount must stop every retained terminal");
  document.getElementById("result")!.textContent = listOnly ? "PASS: inline list empty state, side-by-side details/chat, task switching and isolated drafts, keyboard dividers, Escape, Kanban/Gantt modal regressions; retained drawing/sandbox state and cleanup." : foldersOnly ? "PASS: folder menu waits for selection and opens Finder or Terminal with task/worktree or repository scope." : tabsOnly ? "PASS: early drawing preparation, immediate tab selection, retained canvas/zoom/pan and sandbox state, preview retry, inactive link blocking, task isolation and cleanup." : fieldsOnly ? "PASS: every task detail field; local typing, validation, links, attachments, checklist/comments, native close and pending edits across task/repository changes." : "PASS: explicit terminal disposal, reuse across task switches, shared workspace terminal, five-session limit, unmount cleanup; visible-only Git refresh and immediate reload; coalesced task/MCP writes, trimmed context, scheduler isolation and background visibility; frame-batched task streaming and boundary flushes.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`;
  console.error(error);
} finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
  fileStore.setJSON = setJSON;
}
