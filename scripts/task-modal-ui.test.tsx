// Open /scripts/task-modal-ui.html through Vite. Uses the real App with synthetic IPC and storage.
import { act } from "react";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { emit, listen } from "@tauri-apps/api/event";
import { initializeFileStore } from "../src/fileStore";
import { taskStorageKey, normalizeTask, taskBoardStatus } from "../src/tasks";
import App from "../src/App";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const chatScrollCheck = location.pathname.endsWith("/chat-scroll-ui.html");
const agentsCheck = location.pathname.endsWith("/agents-ui.html");
const notificationCheck = location.pathname.endsWith("/notification-ui.html");
const repo = { rootPath: "/synthetic-repository", name: "Monthly Report", currentBranch: "main", hasOrigin: true };
let currentRepository = repo;
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
let savedReview: any = null;
let taskComparison = { ...comparison, baseRef: "main", files: [
  { path: "src/report.ts", oldPath: null, status: "modified", snapshotId: "report", additions: 10, deletions: 2, binary: false },
  { path: "assets/report.png", oldPath: null, status: "added", snapshotId: "image", additions: null, deletions: null, binary: true },
] };
const changeReads: any[] = [];
const diffReads: any[] = [];
const fixtureBranch = new URLSearchParams(location.search).has("long-branch") ? "lotse/task/09c6ed5b-80e3-4999-8536-1ef092735adb" : "feature/monthly-report";
const task = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Monthly Report", manualStatus: "inbox", description: "## Monthly report\n\nReview the changes alongside the agent conversation.\n\n" + "A longer task description with details to review.\n\n".repeat(30), location: "worktree", worktree: { branch: fixtureBranch, baseOid: comparison.baseOid, baseBranch: "main" }, startDate: "2026-10-28", deadline: "2026-10-30", unreadAgentResult: true,
  comments: [{ id: "review-comment", author: "user", body: "- [ ] Review the report\n" + "- Keep the comment visible while reading.\n".repeat(100), createdAt: 1_793_174_400_000 }],
  chatMessages: [
    { id: "response", role: "assistant", body: "The monthly report is ready for review. Open Changes to inspect it while we continue here." + (chatScrollCheck ? "\n\nInline `savedCode` stays inline.\n\n```swift\n" + "    let savedCode = true\n".repeat(30) + "    // " + "Long code line ".repeat(30) + "\n```" : ""), createdAt: "2026-10-28T12:00:00Z", selection: null, snapshotId: null, suggestions: [], contexts: [] },
    { id: "follow-up", role: "user", body: "Thanks, check the totals too.", createdAt: "2026-10-28T12:01:00Z", selection: null, snapshotId: null, suggestions: [], contexts: [] },
    { id: "latest-response", role: "assistant", body: "The totals are correct.", final: true, createdAt: "2026-10-28T12:02:00Z", selection: null, snapshotId: null, suggestions: [], contexts: [] },
  ] })!;
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  "chaoticreview.task-plan-mode-default": "true",
  "chaoticreview.chat-defaults": JSON.stringify({ default: { model: "synthetic-default", effort: "low" }, plan: { model: "synthetic-plan", effort: "high" } }),
  [taskStorageKey(repo.rootPath)]: JSON.stringify([task]),
  "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: "kanban" }),
  "chaoticreview.task-board-tabs": JSON.stringify({ [repo.rootPath]: { [task.id]: "chat" } }),
};
if (agentsCheck) {
  storage["chaoticreview.agents"] = JSON.stringify([{ id: "owner", title: "Product Owner", prompt: "Act as an Agile Product Owner." }]);
  storage["chaoticreview.chat-queues"] = JSON.stringify({ [JSON.stringify([repo.rootPath, "task", task.id])]: [{ id: "queued", body: "Old queued prompt", context: { mode: "auto", attachments: [] }, selection: null, mode: "default", model: "synthetic-default", effort: "low" }] });
}
const browserViews: any[] = [];
let browserHideGate: Promise<void> | undefined;
let browserUrl = "";
const browserState = () => ({ repositoryRoot: repo.rootPath, taskId: task.id, url: browserUrl, title: "", loading: false, error: null, canGoBack: !!browserUrl, canGoForward: false });
const merges: any[] = [];
let taskWrites = 0;
let contextWrites = 0;
let agentSend: any;
let mcpTasks: any[] = [];
let notificationAction: (event: any) => void;
const windowActions: string[] = [];
mockWindows("main");
mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return true;
  if (command === "task_browser_hide") { browserViews.push({ visible: false }); await browserHideGate; return; }
  if (command === "task_browser_view") { browserViews.push(args); return args.visible ? browserState() : null; }
  if (command === "task_browser_action") { browserUrl = "https://example.com/"; return browserState(); }
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { if (args.key === taskStorageKey(repo.rootPath)) taskWrites++; storage[args.key] = args.value; return; }
  if (command === "set_mcp_context") { contextWrites++; mcpTasks = args.tasks; return; }
  if (command === "current_repository" || command === "refresh_repository") return currentRepository;
  if (command === "list_branch_refs") return { refs: ["main", "develop", "feature/monthly-report"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review") return agentsCheck ? savedReview : null;
  if (command === "github_connection") return null;
  if (command === "scheduler_list" || command === "list_memory") return [];
  if (command === "agent_models") return [];
  if (command === "ai_chat_send") { agentSend = args; return { requestId: "plan-check", threadId: "plan-thread", turnId: "plan-turn" }; }
  if (command === "load_task_changes") { changeReads.push(args); return { comparison: { ...taskComparison, baseRef: args.baseRef ?? "main" }, pendingSnapshotId: "snapshot", pendingFiles: true, committedChanges: true, headOid: comparison.baseOid, squashMessage: "Squash task" }; }
  if (command === "load_task_file_diff") { diffReads.push(args); return { path: args.path, oldPath: null, hunks: [{ header: "@@ -1 +1 @@", rows: [{ kind: "changed", old: { lineNumber: 1, text: "before" }, new: { lineNumber: 1, text: "after" } }] }] }; }
  if (command === "list_merge_targets") return [["main", comparison.baseOid]];
  if (command === "merge_task_worktree") { merges.push(args); return "b".repeat(40); }
  if (command === "task_git_status") return { repository: { ...repo, currentBranch: fixtureBranch }, upstream: `origin/${fixtureBranch}`, pullCount: 0, pushCount: 0, dirty: false };
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:notification|is_permission_granted") return true;
  if (command === "plugin:notification|register_listener") { notificationAction = args.handler.onmessage; return; }
  if (command === "plugin:notification|remove_listener") return;
  if (command === "plugin:window|outer_size" || command === "plugin:window|inner_size") return { width: innerWidth, height: innerHeight };
  if (command.startsWith("plugin:window|")) { windowActions.push(command); return; }
  if (command === "save_review") { if (agentsCheck) savedReview = args.session; return; }
  if (command === "set_mcp_context") return;
  throw new Error(`Unexpected IPC command: ${command}`);
}, { shouldMockEvents: true });
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); }); };
const waitFor = async (condition: () => boolean, message: string) => {
  const end = performance.now() + 20_000;
  while (!condition() && performance.now() < end) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  check(condition(), message);
};
const visible = (element: Element | null) => !!element && element.getBoundingClientRect().height > 0 && element.getBoundingClientRect().width > 0;
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === name && visible(element))!;
const click = async (element: HTMLElement) => { check(element, "Missing control"); await act(async () => { element.focus(); element.click(); }); await settle(); };
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][data-slot="dialog-content"]')!;
const chat = () => dialog()?.querySelector<HTMLElement>('[aria-label="Task chat"]')!;
const tab = (name: string) => [...dialog().querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((element) => element.textContent?.startsWith(name))!;
const composer = () => chat().querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')!;
const assertComposerRow = () => {
  const surface = composer().closest<HTMLElement>(".ios-chat-composer")!;
  const controls = surface.querySelector<HTMLElement>(".ios-chat-controls")!;
  const toolbar = controls.parentElement!;
  const originalStyle = surface.style.cssText;
  try {
    for (const width of [660, 400, 240, 160]) {
      surface.style.width = `${width}px`;
      surface.style.maxWidth = "none";
      const bounds = toolbar.getBoundingClientRect();
      check(bounds.height <= 32, `${width}px: composer controls must occupy one row`);
      for (const button of toolbar.querySelectorAll<HTMLElement>(":scope > button, .ios-chat-controls > button")) {
        const rect = button.getBoundingClientRect();
        check(Math.abs(rect.top + rect.height / 2 - bounds.top - bounds.height / 2) < 1, `${width}px: composer control wrapped`);
        if (button.parentElement === toolbar) check(rect.left >= bounds.left && rect.right <= bounds.right + 1, `${width}px: add/send/stop must stay visible`);
      }
    }
  } finally { surface.style.cssText = originalStyle; }
};
const assertSplit = () => {
  const left = chat().previousElementSibling!.getBoundingClientRect();
  const right = chat().getBoundingClientRect();
  check(visible(chat()) && right.left >= left.right - 1 && Math.abs(right.top - left.top) < 1, "Chat must stay to the right of details/changes");
  check(Math.abs(left.width - right.width * 1.618) < 1, "Details must use the larger golden-ratio share, with chat in the smaller share");
  check(Math.abs(dialog().getBoundingClientRect().width - Math.min(innerWidth * .94, 1800)) < 2, "Modal must adapt to the viewport up to 1800px");
  check(getComputedStyle(dialog()).maxWidth === "1800px", "Large windows must retain the sensible modal width cap");
  check(visible(dialog().querySelector('[aria-label="Task Git"]')), "Git toolbar must remain visible above both columns");
  const bounds = dialog().getBoundingClientRect();
  check(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight, "The task dialog must stay inside narrow windows");
  const header = dialog().querySelector<HTMLElement>('.task-modal-toolbar')!;
  check(header.getBoundingClientRect().height <= 72 && Math.abs(left.top - header.getBoundingClientRect().bottom) < 1, "A single compact header must lead straight into both columns");
  check(!chat().querySelector('.ios-chat-header') && header.contains(dialog().querySelector('[aria-label="Task Git"]')), "Git actions and chat controls must not add header rows");
};
const changesPanel = () => dialog().querySelector<HTMLElement>('[aria-label="Task changes"]')!;
const fileToggle = () => [...changesPanel().querySelectorAll<HTMLButtonElement>('.task-changes-file-toggle')].find((element) => element.textContent?.includes("src/report.ts"))!;
const chooseBase = async (branch: string) => {
  await click(changesPanel().querySelector<HTMLElement>('[aria-label="Comparison base branch"]')!);
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) => element.textContent?.trim() === branch)!);
};
async function checkChanges() {
  check(changesPanel().querySelector('.task-changes-branches')?.textContent?.includes("main"), "The current comparison base must be visible");
  check(changesPanel().querySelector('.task-changes-summary')?.textContent?.includes("2 changed files"), "Changed file count is missing");
  check(changesPanel().querySelector('.task-changes-summary .ios-tree-additions')?.textContent === "+10", "Summary must total only numeric additions");
  await click(fileToggle());
  check(fileToggle().getAttribute("aria-expanded") === "true" && changesPanel().querySelector('.codemirror-task-diff'), "Changed files must expand into their diff");
  await chooseBase("develop");
  check(changeReads.at(-1)?.baseRef === "develop" && changesPanel().querySelector('.task-changes-branches')?.textContent?.includes("develop"), "Base selection must reach IPC and update the header");
  await click(fileToggle());
  check(diffReads.at(-1)?.baseRef === "develop", "File diffs must use the selected live base");
  taskComparison = { ...taskComparison, baseOid: "b".repeat(40), snapshotId: "updated-base", files: [{ ...taskComparison.files[0], additions: 4 }] };
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2700)); });
  check(changesPanel().querySelector('.task-changes-summary')?.textContent?.includes("1 changed file") && fileToggle().getAttribute("aria-expanded") === "false", "Polling must refresh changed files and invalidate diffs after the base moves");
  check(changesPanel().querySelector('.task-changes-summary .ios-tree-additions')?.textContent === "+4", "Polling must refresh line totals");
}
try {
  await initializeFileStore();
  await act(async () => (fixtureRoot = createRoot(document.getElementById("root")!)).render(<App />)); await settle();
  if (agentsCheck) {
    const manager = () => document.querySelector<HTMLElement>('[aria-label="Close agents"]')!.closest<HTMLElement>('[role="dialog"]')!;
    const savedAgent = (name: string) => [...manager().querySelectorAll<HTMLButtonElement>("aside button")].find((item) => item.textContent?.trim() === name)!;
    const picker = () => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Agent role"]')].find(visible)!;
    const menuItem = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[data-slot="popover-content"] button')].find((item) => (item.querySelector(".truncate")?.textContent?.trim() ?? item.textContent?.trim()) === name)!;
    const choose = async (name: string) => { await click(picker()); await click(menuItem(name)); };
    const storedTask = () => JSON.parse(storage[taskStorageKey(repo.rootPath)])[0];
    const type = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }); await settle();
    };
    const event = async (payload: Record<string, unknown>) => {
      await act(async () => agentSend.events.onmessage({ type: "chat", payload: { requestId: "plan-check", threadId: "plan-thread", turnId: "plan-turn", ...payload } })); await settle();
    };
    check(picker().textContent === "None", "Workspace must default to None");
    const model = document.querySelector('[aria-label="Model and effort"]')!.getBoundingClientRect();
    check(picker().getBoundingClientRect().left >= model.right, "Agent picker must sit to the right of model");
    await choose("Product Owner");
    check(savedReview?.chatAgent?.id === "owner" && savedReview.agentThreadId === null, "Workspace role must persist with a fresh thread");
    await click(picker()); await click(menuItem("Manage agents"));
    check(manager().textContent?.includes("Agents"), "Manage agents must open the manager");
    await click(button("New agent"));
    await type(manager().querySelector<HTMLInputElement>("input")!, "Agile Coach");
    await click(button("Save"));
    check(manager().querySelector('[role="alert"]'), "Empty prompts must be rejected");
    await type(manager().querySelector<HTMLTextAreaElement>("textarea")!, "Act as an Agile Coach.");
    await click(button("Save"));
    check(JSON.parse(storage["chaoticreview.agents"]).length === 2, "New agent must be saved");
    await click(document.querySelector<HTMLElement>('[aria-label="Close agents"]')!);
    await choose("Agile Coach");
    check(savedReview.chatAgent.prompt === "Act as an Agile Coach.", "Saved agent must be selectable");
    await type(document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')!, "Help me prioritize");
    await click(document.querySelector<HTMLElement>('[aria-label="Send Review Agent message"]')!);
    check(agentSend.agentPrompt === "Act as an Agile Coach." && agentSend.agentThreadId === null && !agentSend.taskId, "Workspace sends must include the role and start a new thread");
    check(picker().disabled, "Agent switching must be disabled during responses");
    await event({ kind: "assistantMessageCompleted", finalText: "Prioritize outcomes." });
    await event({ kind: "completed" });
    const historyCount = savedReview.chatMessages.length;
    const originalThread = savedReview.agentThreadId;
    await choose("Agile Coach");
    check(savedReview.chatMessages.length === historyCount && savedReview.agentThreadId === originalThread, "Selecting the current role must preserve the conversation");
    await click(picker()); await click(menuItem("Manage agents"));
    await click(savedAgent("Agile Coach"));
    await type(manager().querySelector<HTMLTextAreaElement>("textarea")!, "Act as an Agile Coach. Focus on teams.");
    await click(button("Save"));
    await click(document.querySelector<HTMLElement>('[aria-label="Close agents"]')!);
    check(savedReview.chatAgent.prompt === "Act as an Agile Coach." && savedReview.chatMessages.length === historyCount, "Editing a saved role must preserve ongoing chats");
    await choose("Agile Coach");
    check(savedReview.chatAgent.prompt === "Act as an Agile Coach. Focus on teams." && !savedReview.chatMessages.length && savedReview.agentThreadId === null, "Selecting an edited role must apply it in a fresh conversation");
    await choose("None");
    check(savedReview.chatAgent === null && !savedReview.chatMessages.length && savedReview.agentThreadId === null, "Switching to None must clear workspace history and thread");
    await click(button("Tasks"));
    await click(document.querySelector<HTMLElement>(`[aria-label="Drag ${task.title}"]`)!);
    check(picker().textContent === "None" && storedTask().chatMessages.length > 0, "Tasks must have independent roles");
    check(chat().querySelector('[aria-label="Queued messages"]'), "Fixture must include a paused queued message");
    await choose("Product Owner");
    check(storedTask().chatAgent?.id === "owner" && !storedTask().chatMessages.length && storedTask().agentThreadId === null, "Switching task agents must clear history and thread");
    check(!chat().querySelector('[aria-label="Queued messages"]'), "Switching agents must discard old queued prompts");
    await type(composer(), "Write acceptance criteria");
    await click(chat().querySelector<HTMLElement>('[aria-label="Send Review Agent message"]')!);
    check(agentSend.agentPrompt === "Act as an Agile Product Owner." && agentSend.agentThreadId === null && agentSend.taskId === task.id, "Task sends must include their selected role and start a fresh thread");
    check(picker().disabled, "Task role switching must be disabled while running");
    await event({ kind: "assistantMessageCompleted", finalText: "Criteria ready." });
    await event({ kind: "completed" });
    await click(dialog().querySelector<HTMLElement>('[aria-label="Close task modal"]')!);
    await click(document.querySelector<HTMLElement>(`[aria-label="Drag ${task.title}"]`)!);
    check(picker().textContent === "Product Owner", "Task role must survive reopening");
    await choose("None");
    check(storedTask().chatAgent === null && !storedTask().chatMessages.length && storedTask().agentThreadId === null, "Removing the role must clear the task conversation");
    await type(composer(), "Use the default behavior");
    await click(chat().querySelector<HTMLElement>('[aria-label="Send Review Agent message"]')!);
    check(agentSend.agentPrompt === "" && agentSend.agentThreadId === null, "None must send without the previous role in a new thread");
    await event({ kind: "completed" });
    await click(picker()); await click(menuItem("Manage agents"));
    await click(savedAgent("Agile Coach"));
    await type(manager().querySelector<HTMLInputElement>("input")!, "Unsaved title");
    await click(document.querySelector<HTMLElement>('[aria-label="Close agents"]')!);
    check(document.querySelector('[role="alertdialog"]'), "Unsaved changes must have a discard guard");
    await click(button("Discard"));
    await click(picker()); await click(menuItem("Manage agents"));
    await click(savedAgent("Agile Coach")); await click(button("Delete"));
    await click([...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((item) => item.textContent?.trim() === "Delete")!);
    check(JSON.parse(storage["chaoticreview.agents"]).length === 1, "Deleting an agent must persist");
    await click(document.querySelector<HTMLElement>('[aria-label="Close agents"]')!);
    document.getElementById("result")!.textContent = "PASS: agent picker placement, None defaults, manager creation/validation/save/delete/discard guard, workspace and task role prompts, persistence, fresh threads, cleared history/queues and disabled switching during runs.";
  } else if (notificationCheck) {
    const target = { windowLabel: "main", repositoryRoot: repo.rootPath, taskId: task.id };
    const tap = async (extra: any, actionId = "tap") => {
      await act(async () => notificationAction({ actionId, notification: { extra } })); await settle();
    };
    for (const view of ["List", "Kanban", "Gantt"]) {
      await click(button("Tasks"));
      await click(button(view));
      await click(button("Workspace"));
      const before = windowActions.length;
      for (const extra of [{ ...target, windowLabel: "review-other" }, { ...target, repositoryRoot: "/other" }, { ...target, taskId: 12 }, undefined]) await tap(extra);
      await tap(target, "dismiss");
      check(button("Workspace").getAttribute("aria-pressed") === "true" && windowActions.length === before, "Unrelated or invalid notification actions must not navigate or focus this window");
      await tap(target);
      check(button("Tasks").getAttribute("aria-pressed") === "true", "Task notification must switch to Tasks");
      check(visible(dialog()) && dialog().textContent?.includes(task.title) && visible(composer()), `${view}: task notification must open the task dialog and chat`);
      check(windowActions.slice(before).filter((command) => ["plugin:window|show", "plugin:window|unminimize", "plugin:window|set_focus"].includes(command)).join(",") === "plugin:window|show,plugin:window|unminimize,plugin:window|set_focus", "Notification must show, unminimize and focus its window");
      check(!JSON.parse(storage[taskStorageKey(repo.rootPath)]).find((entry: any) => entry.id === task.id).unreadAgentResult, "Opening a task notification must mark its result read");
      await click(tab("Changes"));
      await tap({ ...target, taskId: null });
      check(button("Workspace").getAttribute("aria-pressed") === "true" && !visible(dialog()), "Workspace notification must open Workspace and close the task dialog");
      check(visible(document.querySelector('[aria-label="Review Agent message"]')), "Workspace chat must be visible after a workspace notification");
      await tap(target);
      check(visible(dialog()) && tab("Changes").getAttribute("aria-selected") === "true", "Task notifications must restore the saved task panel");
      await tap({ ...target, taskId: "deleted-task" });
      check(button("Tasks").getAttribute("aria-pressed") === "true" && !visible(dialog()), "A deleted task notification must open Tasks without showing another task");
    }
    document.getElementById("result")!.textContent = "PASS: Notification clicks open task dialogs and chat from List/Kanban/Gantt, restore panels, mark results read, focus the correct window, open Workspace, and ignore invalid or unrelated actions.";
  } else if (chatScrollCheck) {
    await click(button("Tasks"));
    await click(document.querySelector<HTMLElement>(`[aria-label="Drag ${task.title}"]`)!);
    const chatScroll = chat().querySelector<HTMLElement>(".ios-chat-scroll")!;
    const codeBlock = chatScroll.querySelector<HTMLElement>(".chat-code-block .cm-editor")!;
    check(codeBlock, "Saved chat code block must be mounted");
    const content = codeBlock.querySelector<HTMLElement>(".cm-content")!;
    const scroller = codeBlock.querySelector<HTMLElement>(".cm-scroller")!;
    check(getComputedStyle(content).fontFamily.includes("monospace"), "Chat code must use a monospace font");
    check(getComputedStyle(content).whiteSpace === "pre" && content.textContent?.startsWith("    let"), "Chat code must preserve indentation and line breaks");
    check(codeBlock.querySelector(".cm-lineNumbers"), "Chat code must show line numbers");
    check(scroller.scrollWidth > scroller.clientWidth && getComputedStyle(scroller).overflowX === "auto", "Long code must scroll horizontally inside its block");
    check(content.contentEditable === "false", "Agent code examples must be read-only");
    check(chatScroll.querySelector("p code")?.textContent === "savedCode", "Inline code must stay inline");
    chatScroll.scrollTop = 80;
    await settle();
    const chatTop = chatScroll.scrollTop;
    const chatHeight = chatScroll.scrollHeight;
    check(chatTop > 0, "Chat must overflow for the scroll regression check");
    for (let update = 0; update < 3; update++) {
      await act(async () => fixtureRoot!.render(<App />)); await settle();
      check(chatScroll.querySelector(".chat-code-block .cm-editor") === codeBlock, "Background App updates must preserve saved chat code editors");
      check(chatScroll.scrollHeight === chatHeight && Math.abs(chatScroll.scrollTop - chatTop) < 1, "Background App updates must preserve chat height and scroll position");
    }
    document.getElementById("result")!.textContent = "PASS: Task chat preserves code editors, content height and manual scroll position across background App updates.";
  } else if (new URLSearchParams(location.search).has("changes")) {
    await click(button("Tasks"));
    await click(document.querySelector<HTMLElement>(`[aria-label="Drag ${task.title}"]`)!);
    await click(tab("Changes")); assertSplit();
    await checkChanges();
    const comparisonToolbar = changesPanel().querySelector<HTMLElement>('.task-changes-toolbar')!;
    check(changesPanel().querySelector<HTMLElement>('.task-changes-header')!.getBoundingClientRect().height <= 52, "The comparison header must stay on one compact row");
    check(comparisonToolbar.scrollWidth <= comparisonToolbar.clientWidth, "The comparison must fit without horizontal overflow");
    changesPanel().style.width = "320px";
    check(comparisonToolbar.scrollWidth <= comparisonToolbar.clientWidth && comparisonToolbar.getBoundingClientRect().height <= 32, "Long branch names must fit a narrow comparison toolbar on one row");
    changesPanel().style.width = "";
    const source = changesPanel().querySelector<HTMLElement>('[aria-label="Copy source branch name"]')!;
    check(source.title.includes(fixtureBranch), "The full source branch must remain available");
    if (fixtureBranch.startsWith("lotse/task/")) check(source.textContent === "Task branch", "Generated branch identifiers must use a readable label");
    check(storage[`chaoticreview.task-comparison-base:${repo.rootPath}:${task.id}`] === "develop", "The selected base must be persisted per repository and task");
    document.getElementById("result")!.textContent = "PASS: Changes layout, branch selection and persistence, matching diff base, file expansion, binary totals, live polling and stale diff invalidation.";
  } else {
  for (const manualStatus of [null, "inbox", "inProgress", "inReview"]) {
    const id = crypto.randomUUID();
    await act(async () => { await emit("mcp-task-added", { repositoryRoot: repo.rootPath, task: { id, title: "Imported task", manualStatus } }); }); await settle();
    const imported = JSON.parse(storage[taskStorageKey(repo.rootPath)]).find((entry: { id: string }) => entry.id === id);
    check(imported.chatMode === "default" && imported.chatModel === "synthetic-default" && imported.chatEffort === "low", "Imported tasks must use normal chat defaults regardless of status or legacy settings");
  }
  await click(button("Tasks"));
  await click(button("Gantt"));
  const unreadBar = document.querySelector<HTMLElement>(`.task-gantt-bar[aria-label^="${task.title}:"]`)!;
  check(unreadBar.querySelector('[aria-label="New agent result"]') && document.querySelector(`[title="${task.title}"] [aria-label="New agent result"]`), "Unread agent results must show the warning indicator in both Gantt locations");
  await click(button("Kanban"));
  await click(document.querySelector<HTMLElement>(`[aria-label="Drag ${task.title}"]`)!);
  assertSplit();
  assertComposerRow();
  const copyButtons = chat().querySelectorAll<HTMLButtonElement>('[aria-label="Copy response"]');
  check(copyButtons.length === 2, "Both historical and latest agent responses must have a copy button");
  const originalWriteText = navigator.clipboard.writeText;
  let copied = "";
  navigator.clipboard.writeText = async (text) => { copied = text; };
  try {
    for (const [index, expected] of [task.chatMessages[0].body, task.chatMessages[2].body].entries()) {
      await click(copyButtons[index]);
      check(copied === expected, "Each copy button must copy its own complete response");
    }
  } finally { navigator.clipboard.writeText = originalWriteText; }
  await click(tab("Browser"));
  check(browserViews.at(-1)?.visible && browserViews.at(-1).bounds.width > 0, "Browser tab must attach its native viewport in the task dialog");
  const browserAddress = dialog().querySelector<HTMLInputElement>('[aria-label="Browser address"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(browserAddress, "example.com");
    browserAddress.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { dialog().querySelector('[aria-label="Browser navigation"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await settle();
  check(browserAddress.value === "https://example.com/", "Browser URL must synchronize in the full App");
  check(getComputedStyle(dialog()).animationName === "none", "Task dialog must not zoom independently of its native browser");
  let releaseHide!: () => void;
  browserHideGate = new Promise<void>((resolve) => { releaseHide = resolve; });
  await act(async () => dialog().querySelector<HTMLButtonElement>('[aria-label="Close task modal"]')!.click());
  check(visible(dialog()), "Dialog must stay visible until native hiding is acknowledged");
  await act(async () => { browserHideGate = undefined; releaseHide(); }); await settle();
  check(!visible(dialog()), "Dialog must close after native hiding is acknowledged");
  await click(button(task.title));
  check(dialog().querySelector<HTMLInputElement>('[aria-label="Browser address"]')!.value === "https://example.com/", "Reopening Browser must retain the address");
  await click(tab("Detail"));
  check(!browserViews.at(-1).visible && browserUrl === "https://example.com/", "Leaving Browser must hide and retain the task page");
  const scrollForm = dialog().querySelector<HTMLElement>(".task-details-form")!;
  const descriptionEditor = scrollForm.querySelector<HTMLElement>('[contenteditable="true"]')!;
  const storedDescription = () => JSON.parse(storage[taskStorageKey(repo.rootPath)])[0].description as string;
  const typeDescription = async (text: string) => {
    await act(async () => {
      const editor = dialog().querySelector<HTMLElement>('.task-description-editor [contenteditable="true"]')!;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      check(document.execCommand("insertText", false, text), "Typing must reach the Markdown editor");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  const writesBeforeTyping = taskWrites;
  const contextsBeforeTyping = contextWrites;
  for (const text of [" Fast", " description", " typing"]) await typeDescription(text);
  check(descriptionEditor.textContent?.endsWith(" Fast description typing"), "Keystrokes must appear immediately");
  check(taskWrites === writesBeforeTyping && contextWrites === contextsBeforeTyping, "Typing must not persist or republish all tasks on each keystroke");
  await settle();
  check(taskWrites === writesBeforeTyping && contextWrites === contextsBeforeTyping && !storedDescription().endsWith(" Fast description typing"), "Pausing must keep the description local without saving or publishing context");
  const saveDescription = scrollForm.querySelector<HTMLButtonElement>('[aria-label="Save description"]')!;
  check(!saveDescription.disabled, "An edited description must offer explicit saving");
  await click(saveDescription);
  check(storedDescription().endsWith(" Fast description typing") && saveDescription.disabled, "Explicit save must persist the draft and clear its dirty state");
  await typeDescription(" saved on blur");
  await act(async () => scrollForm.querySelector<HTMLInputElement>('.task-details-title-input')!.focus());
  check(storedDescription().endsWith(" saved on blur"), "Leaving the description must immediately save pending text");
  await typeDescription(" saved before close");
  await act(async () => { await emit("tauri://close-requested"); });
  check(storedDescription().endsWith(" saved before close"), "Closing the native window must flush pending description text");
  await typeDescription(" preserved local draft");
  const localDescription = descriptionEditor.textContent;
  const caretNode = document.createTreeWalker(descriptionEditor.querySelector("p")!, NodeFilter.SHOW_TEXT).nextNode()!;
  await act(async () => {
    const range = document.createRange(); range.setStart(caretNode, 5); range.collapse(true);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  });
  const remoteDescription = task.description + "\n\nFresh agent description.";
  await act(async () => { await emit("mcp-tasks-updated", { repositoryRoot: repo.rootPath, tasks: [task], descriptionChange: { taskId: task.id, description: remoteDescription } }); });
  await settle();
  check(storedDescription() === remoteDescription && descriptionEditor.textContent === localDescription, "Agent edits must not replace the local draft");
  check(getSelection()!.anchorNode === caretNode && getSelection()!.anchorOffset === 5 && document.activeElement === descriptionEditor, "An agent update must preserve the cursor in the middle of the description");
  await act(async () => { await emit("frontend-storage-changed", { key: taskStorageKey(repo.rootPath), value: storage[taskStorageKey(repo.rootPath)], source: "other-window" }); }); await settle();
  check(descriptionEditor.textContent === localDescription && getSelection()!.anchorNode === caretNode && getSelection()!.anchorOffset === 5, "Another window must not replace the draft or move its cursor");
  await act(async () => { check(document.execCommand("insertText", false, "middle edit "), "Typing must continue at the preserved cursor"); });
  check(descriptionEditor.querySelector("p")!.textContent?.startsWith("Revie" + "middle edit " + "w"), "The next edit must land at the preserved cursor position");
  await click(saveDescription);
  check(storedDescription().includes("middle edit ") && storedDescription().endsWith(" preserved local draft") && !storedDescription().includes("Fresh agent description."), "Saving must commit the local draft after a concurrent external change");
  await act(async () => descriptionEditor.focus());
  const cleanDescription = descriptionEditor.textContent;
  await act(async () => { await emit("mcp-tasks-updated", { repositoryRoot: repo.rootPath, tasks: [task], descriptionChange: { taskId: task.id, description: remoteDescription } }); }); await settle();
  check(descriptionEditor.textContent === cleanDescription, "External updates must also wait while an unchanged editor has focus");
  await act(async () => scrollForm.querySelector<HTMLInputElement>('.task-details-title-input')!.focus()); await settle();
  check(descriptionEditor.textContent?.endsWith("Fresh agent description."), "Leaving an unchanged editor must load the latest external description");
  scrollForm.scrollTop = scrollForm.scrollHeight;
  const scrolledTop = scrollForm.scrollTop;
  check(scrolledTop > 0, "Task details must overflow for the scroll regression check");
  check(scrollForm.scrollTop === scrolledTop, `Background updates must preserve the task detail scroll position (${scrolledTop} -> ${scrollForm.scrollTop})`);
  await act(async () => { await emit("frontend-storage-changed", { key: taskStorageKey(repo.rootPath), value: storage[taskStorageKey(repo.rootPath)], source: "other-window" }); }); await settle();
  check(scrollForm.scrollTop === scrolledTop, `Task storage updates must preserve the task detail scroll position (${scrolledTop} -> ${scrollForm.scrollTop})`);
  for (const update of [1, 2]) {
    const description = task.description + `\n\nUpdated by the agent ${update}.`;
    await act(async () => { await emit("mcp-tasks-updated", { repositoryRoot: repo.rootPath, tasks: [task], descriptionChange: { taskId: task.id, description } }); }); await settle();
    check(descriptionEditor.textContent?.includes(`Updated by the agent ${update}.`), "Agent description updates must still appear");
    check(scrollForm.scrollTop === scrolledTop, `Description updates must preserve the task detail scroll position (${scrolledTop} -> ${scrollForm.scrollTop})`);
  }
  const commentCheckbox = scrollForm.querySelector<HTMLInputElement>('[aria-label="Toggle checklist item"]')!;
  await act(async () => commentCheckbox.focus());
  scrollForm.scrollTop += commentCheckbox.getBoundingClientRect().top - scrollForm.getBoundingClientRect().top + 300;
  const commentTop = scrollForm.scrollTop;
  await act(async () => { await emit("prompt-schedules-changed"); }); await settle();
  check(scrollForm.scrollTop === commentTop, `An idle refresh must preserve comment scroll position (${commentTop} -> ${scrollForm.scrollTop})`);
  check(scrollForm.querySelector('[aria-label="Toggle checklist item"]') === commentCheckbox, "An idle refresh must preserve comment DOM nodes");
  check(document.activeElement === commentCheckbox, "An idle refresh must preserve comment keyboard focus");
  for (let poll = 0; poll < 6; poll++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2600)); });
    check(dialog().querySelector(".task-details-form") === scrollForm, "Idle polling must not remount the detail form");
    check(scrollForm.scrollTop === commentTop, `Idle polling must preserve comment scroll position (${commentTop} -> ${scrollForm.scrollTop})`);
  }
  await click(commentCheckbox);
  check(JSON.parse(storage[taskStorageKey(repo.rootPath)])[0].comments[0].body.startsWith("- [x]"), "Comment checkboxes must still save after an idle refresh");
  scrollForm.scrollTop = 0;
  const planButton = () => chat().querySelector<HTMLButtonElement>('[aria-label="Disable Plan mode"]');
  const savedTask = () => JSON.parse(storage[taskStorageKey(repo.rootPath)])[0];
  check(!planButton() && savedTask().chatMode === "default", "Inbox tasks without an explicit mode must start with Plan Off, even with the legacy default enabled");
  const checkStatusChanges = async () => {
    const { chatMode, chatModel, chatEffort } = savedTask();
    for (const status of ["Needs planning", "In development", "In review", "Done", "Inbox"]) {
      await click(dialog().querySelector<HTMLElement>('[aria-label="Task status"]')!);
      await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) => element.textContent?.trim() === status)!);
      const updated = savedTask();
      check(updated.chatMode === chatMode && updated.chatModel === chatModel && updated.chatEffort === chatEffort, `Changing status to ${status} must preserve chat settings`);
    }
  };
  await checkStatusChanges();
  await click(chat().querySelector<HTMLElement>('[aria-label="Add to chat"]')!);
  await click(document.querySelector<HTMLElement>('[role="switch"][aria-checked="false"]')!);
  check(planButton()?.textContent === "Plan On" && !planButton()!.disabled, "Manually enabling Plan must show an enabled composer button");
  await checkStatusChanges();
  await click(planButton()!);
  check(!planButton() && savedTask().chatMode === "default", "Clicking Plan On must disable Plan mode and hide the button");
  check(savedTask().chatModel === "synthetic-default" && savedTask().chatEffort === "low", "Disabling Plan mode must apply the normal mode model and effort defaults");
  await click(chat().querySelector<HTMLElement>('[aria-label="Add to chat"]')!);
  await click(document.querySelector<HTMLElement>('[role="switch"][aria-checked="false"]')!);
  check(planButton() && savedTask().chatMode === "plan", "The plus menu must reactivate Plan mode and restore its button");
  check(savedTask().chatModel === "synthetic-plan" && savedTask().chatEffort === "high", "Reactivating Plan mode must apply its model and effort defaults");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(composer(), "Check the active Plan mode button");
    composer().dispatchEvent(new Event("input", { bubbles: true }));
  });
  const drawing = JSON.stringify({ type: "excalidraw", version: 2, elements: convertToExcalidrawElements([{ id: "drawing-box", type: "rectangle", x: 4000, y: 3000, width: 160, height: 100 }, { id: "distant-box", type: "rectangle", x: 6000, y: 4500, width: 1000, height: 1000 }], { regenerateIds: false }), appState: { viewBackgroundColor: "#ffffff" }, files: {} });
  const tasksWithDrawing = JSON.parse(storage[taskStorageKey(repo.rootPath)]);
  tasksWithDrawing[0].drawing = drawing;
  storage[taskStorageKey(repo.rootPath)] = JSON.stringify(tasksWithDrawing);
  await act(async () => { await emit("frontend-storage-changed", { key: taskStorageKey(repo.rootPath), value: storage[taskStorageKey(repo.rootPath)], source: "other-window" }); }); await settle();
  const checkDrawingCentered = () => {
    const canvas = dialog().querySelector<HTMLCanvasElement>('[aria-label="Task drawing"] canvas.static')!;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
    for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) {
      const pixel = (y * canvas.width + x) * 4;
      if (pixels[pixel + 3] > 0 && [0, 1, 2, 3].some((channel) => Math.abs(pixels[pixel + channel] - pixels[channel]) > 40)) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    check(right > left && bottom > top, "Offscreen drawing elements must render when the tab opens");
    check(left > canvas.width * .02 && right < canvas.width * .98 && top > canvas.height * .02 && bottom < canvas.height * .98, "The complete drawing must fit with padding");
    check(Math.abs((left + right) / 2 - canvas.width / 2) < canvas.width * .08 && Math.abs((top + bottom) / 2 - canvas.height / 2) < canvas.height * .08, "The drawing must be centered in the canvas");
  };
  const originalMatchMedia = window.matchMedia;
  const appearance = Object.assign(new EventTarget(), { matches: true, media: "(prefers-color-scheme: dark)" });
  window.matchMedia = ((query: string) => query === appearance.media ? appearance : originalMatchMedia.call(window, query)) as typeof window.matchMedia;
  try {
    await act(async () => {
      tab("Draw").click();
      await import("../src/components/TaskDrawing");
    });
    await waitFor(() => { try { checkDrawingCentered(); return true; } catch { return false; } }, "Drawing must fit its initial viewport");
    const drawingCanvas = dialog().querySelector('[aria-label="Task drawing"] canvas');
    const drawingEditor = dialog().querySelector('[aria-label="Task drawing"] .excalidraw')!;
    const checkDrawingColors = () => {
      const style = getComputedStyle(drawingEditor);
      const app = getComputedStyle(document.documentElement);
      for (const [drawingToken, appToken] of [["--color-primary", "--ios-tint"], ["--color-selection", "--ios-tint"], ["--color-surface-primary-container", "--ios-fill-strong"], ["--color-on-primary-container", "--ios-label"]]) {
        check(style.getPropertyValue(drawingToken).trim() === app.getPropertyValue(appToken).trim(), `${drawingToken} must follow the app's neutral palette`);
      }
      const selectedTool = drawingEditor.querySelector('.ToolIcon_type_radio:checked + .ToolIcon__icon')!;
      check(selectedTool, "The selected drawing tool must be visible");
      for (const color of [getComputedStyle(selectedTool).backgroundColor, getComputedStyle(selectedTool).color]) {
        const channels = color.match(/[\d.]+/g)!;
        check(channels[0] === channels[1] && channels[1] === channels[2], "Selected drawing tools must use neutral gray colors");
      }
    };
    checkDrawingColors();
    check(drawingEditor.classList.contains("theme--dark"), "Drawing must initially follow Lotse's dark appearance");
    await act(async () => { window.dispatchEvent(new Event("flush-task-drawing")); });
    await settle();
    const drawingBeforeThemeChange = savedTask().drawing;
    for (const dark of [false, true]) {
      await act(async () => { appearance.matches = dark; appearance.dispatchEvent(new Event("change")); });
      await settle();
      check(drawingEditor.classList.contains("theme--dark") === dark, "Drawing must follow live light/dark appearance changes");
      checkDrawingColors();
      check(dialog().querySelector('[aria-label="Task drawing"] canvas') === drawingCanvas, "Theme changes must preserve the mounted canvas");
      check(savedTask().drawing === drawingBeforeThemeChange, "Theme changes must preserve saved drawing content");
    }
  } finally { window.matchMedia = originalMatchMedia; }
  check(visible(dialog().querySelector('[aria-label="Task drawing"] canvas')), "Draw must mount the real Excalidraw canvas");
  check(visible(composer()), "Chat must remain visible alongside the drawing");
  const { applyTaskDrawingUpdate } = await import("../src/editTaskDrawing");
  let canvas = dialog().querySelector<HTMLCanvasElement>('[aria-label="Task drawing"] canvas')!;
  let beforeCanvas = canvas.toDataURL();
  await act(async () => { window.dispatchEvent(new Event("flush-task-drawing")); });
  await settle();
  const writesBeforePan = taskWrites;
  const contextsBeforePan = contextWrites;
  const imageBeforePan = canvas.toDataURL();
  let sceneSerializations = 0;
  const stringify = JSON.stringify;
  JSON.stringify = ((value: any, ...args: any[]) => {
    if (value?.type === "excalidraw" && Array.isArray(value.elements)) sceneSerializations++;
    return Reflect.apply(stringify, JSON, [value, ...args]);
  }) as typeof JSON.stringify;
  try {
    const pointerCanvas = dialog().querySelector<HTMLCanvasElement>('[aria-label="Task drawing"] canvas.interactive')!;
    check(pointerCanvas, "The drawing must expose its interactive canvas");
    const bounds = pointerCanvas.getBoundingClientRect();
    for (let move = 0; move < 12; move++) {
      await act(async () => {
        pointerCanvas.dispatchEvent(new WheelEvent("wheel", { deltaX: 4, deltaY: 3, clientX: bounds.left + 300, clientY: bounds.top + 300, bubbles: true, cancelable: true }));
        await new Promise(requestAnimationFrame);
      });
    }
    check(canvas.toDataURL() !== imageBeforePan, "The regression check must actually pan the canvas");
    check(sceneSerializations === 0, "Panning must not serialize the full scene on the pointer-update path");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
    check(sceneSerializations <= 1, "Panning must serialize at most once after becoming idle");
    check(taskWrites === writesBeforePan && contextWrites === contextsBeforePan, "Panning must not rewrite tasks or republish agent context");
  } finally { JSON.stringify = stringify; }
  const retainedCanvas = canvas;
  const retainedImage = canvas.toDataURL();
  await click(tab("Detail"));
  await click(tab("Draw"));
  check(dialog().querySelector('[aria-label="Task drawing"] canvas') === retainedCanvas, "Tab switches must retain the drawing canvas");
  await waitFor(() => canvas.toDataURL() === retainedImage, "Returning to Draw must preserve the panned viewport");
  canvas = dialog().querySelector<HTMLCanvasElement>('[aria-label="Task drawing"] canvas')!;
  beforeCanvas = canvas.toDataURL();


  const requestDrawingUpdate = async (update: unknown, root = repo.rootPath, taskId = task.id) => {
    const requestId = crypto.randomUUID();
    let response: { drawing?: string; error?: string } | undefined;
    const stop = await listen<{ drawing?: string; error?: string }>(`task-drawing-result-${requestId}`, (event) => { response = event.payload; });
    await act(async () => { await emit("mcp-task-drawing-update", { repositoryRoot: root, taskId, requestId, update }); });
    await settle();
    stop();
    check(response, "The drawing tool must receive a success or failure response");
    return response!;
  };
  let reply = await requestDrawingUpdate({ elements: [
    { id: "drawing-box", backgroundColor: "#a5d8ff" },
    { id: "agent-label", type: "text", x: 260, y: 240, text: "Agent drawing", fontSize: 24 },
    { id: "agent-arrow", type: "arrow", x: 200, y: 120, width: 160, height: 120, points: [[0, 0], [160, 120]], endArrowhead: "arrow" },
    { id: "agent-stroke", type: "freedraw", x: 240, y: 330, width: 80, height: 40, points: [[0, 0], [40, 40], [80, 0]] }
  ] });
  check(!reply.error && reply.drawing === savedTask().drawing, "Tool success must follow durable drawing storage");
  let agentScene = JSON.parse(savedTask().drawing);
  check(agentScene.elements.find((element: any) => element.id === "drawing-box").width === 160, "Patching a shape must retain omitted fields");
  check(agentScene.elements.some((element: any) => element.id === "agent-label" && element.text === "Agent drawing"), "Agents must be able to add text");
  check(agentScene.elements.some((element: any) => element.id === "agent-arrow") && agentScene.elements.some((element: any) => element.id === "agent-stroke" && element.simulatePressure && Array.isArray(element.pressures)), "Agents must be able to draw arrows and renderable freehand strokes");
  check(dialog().querySelector('[aria-label="Task drawing"] canvas') === canvas && canvas.toDataURL() !== beforeCanvas, "Agent edits must update the mounted canvas without remounting it");
  reply = await requestDrawingUpdate({ elements: [{ id: "agent-label", text: "Updated by agent" }], deleteElementIds: ["agent-arrow"] });
  check(!reply.error, "Agents must be able to update and delete elements");
  agentScene = JSON.parse(savedTask().drawing);
  check(agentScene.elements.find((element: any) => element.id === "agent-label").originalText === "Updated by agent", "Text edits must update the source text");
  check(!agentScene.elements.some((element: any) => element.id === "agent-arrow" && !element.isDeleted), "Deleted elements must disappear from the saved drawing");
  const unchanged = savedTask().drawing;
  for (const invalid of [{}, { elements: [{ id: "bad", type: "script", x: 0, y: 0 }] }, { elements: [{ id: "drawing-box", width: -1 }] }, { elements: [{ id: "drawing-box", type: "text" }] }, { deleteElementIds: ["missing"] }, { elements: [{ id: "drawing-box" }], deleteElementIds: ["drawing-box"] }]) {
    check((await requestDrawingUpdate(invalid)).error && savedTask().drawing === unchanged, "Invalid updates must fail without changing the drawing");
  }
  check((await requestDrawingUpdate({ deleteElementIds: ["agent-label"] }, "/other-repository")).error && savedTask().drawing === unchanged, "Drawing writes must stay within the agent repository");
  check((await requestDrawingUpdate({ deleteElementIds: ["agent-label"] }, repo.rootPath, "missing-task")).error && savedTask().drawing === unchanged, "Drawing writes must stay within the agent task");
  for (const invalid of [{ elements: [{ id: "bad", type: "text", x: 0, y: 0 }] }, { elements: [{ id: "bad", type: "rectangle", x: NaN, y: 0, width: 10, height: 10 }] }, { elements: [{ id: "bad", type: "arrow", x: 0, y: 0, width: 10, height: 10, points: [[0, 0], ["bad", 10]] }] }]) {
    let rejected = false;
    try { applyTaskDrawingUpdate(unchanged, invalid); } catch { rejected = true; }
    check(rejected, "Malformed coordinates and incomplete new elements must be rejected");
  }

  await click(tab("Detail"));
  check(JSON.parse(savedTask().drawing).elements.some((element: any) => element.id === "drawing-box"), "Switching tabs must preserve the editable drawing");
  check(JSON.parse(mcpTasks.find((entry) => entry.id === task.id).details.drawing).elements[0].id === "drawing-box", "The agent MCP context must contain the drawing scene");
  await click(chat().querySelector<HTMLElement>('[aria-label="Send Review Agent message"]')!);
  check(taskBoardStatus(savedTask()) === "inbox", "Starting a plan must preserve the task status");
  check(!agentSend.chatContext.attachments.some((attachment: any) => attachment.name === "Task drawing.png"), "Drawings must be read on demand, never attached automatically");
  check(agentSend?.collaborationMode === "plan" && planButton()?.disabled, "Plan mode must remain visible and disabled during a running response");
  assertComposerRow();
  await click(planButton()!);
  check(savedTask().chatMode === "plan", "A disabled Plan mode button must not change the mode");
  const agentEvent = async (payload: Record<string, unknown>) => {
    await act(async () => agentSend.events.onmessage({ type: "chat", payload: { requestId: "plan-check", threadId: "plan-thread", turnId: "plan-turn", ...payload } })); await settle();
  };
  await agentEvent({ kind: "assistantMessageCompleted", finalText: "<proposed_plan>Implement the report.</proposed_plan>" });
  await agentEvent({ kind: "completed" });
  check(savedTask().planReady && taskBoardStatus(savedTask()) === "inbox", "A completed plan must remain implementable without moving the task");
  check(dialog().querySelector('[aria-label="Task status"]')?.textContent?.startsWith("Inbox"), "Plan readiness must not replace the selected status");
  check(planButton() && !planButton()!.disabled, "The Plan mode button must become enabled after the response finishes");
  await act(async () => { await emit("mcp-tasks-updated", { repositoryRoot: repo.rootPath, tasks: [{ ...savedTask(), completed: true }] }); }); await settle();
  await click(button("Implement now"));
  check(agentSend.collaborationMode === "default" && taskBoardStatus(savedTask()) === "done", "Starting implementation must not reopen a completed task");
  await agentEvent({ kind: "completed" });
  check(taskBoardStatus(savedTask()) === "done", "Completing implementation must preserve the task status");
  await act(async () => { await emit("mcp-tasks-updated", { repositoryRoot: repo.rootPath, tasks: [{ ...savedTask(), completed: false, manualStatus: "inbox" }] }); }); await settle();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(composer(), "Continue implementation");
    composer().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(chat().querySelector<HTMLElement>('[aria-label="Send Review Agent message"]')!);
  check(taskBoardStatus(savedTask()) === "inbox", "Starting implementation must not move an Inbox task");
  await act(async () => { await emit("mcp-tasks-updated", { repositoryRoot: repo.rootPath, tasks: [{ ...savedTask(), manualStatus: "inReview" }] }); }); await settle();
  await agentEvent({ kind: "cancelled" });
  check(taskBoardStatus(savedTask()) === "inReview", "Finishing a run must preserve explicit agent status changes");
  const details = dialog().querySelector<HTMLElement>('[aria-label="Task details"]')!;
  const properties = details.querySelector<HTMLElement>('[aria-label="Task properties"]')!;
  check(!details.querySelector('[aria-label="Parent task"]'), "Parent task must not appear in the detail form");
  check(details.querySelectorAll('[aria-label="Task status"]').length === 1, "Properties must contain one status control");
  check(details.querySelector('input')?.closest('label')?.textContent === "Task title", "The prominent title must retain its accessible label");
  check(details.querySelector('[aria-label="Issue description"]')!.getBoundingClientRect().top < properties.getBoundingClientRect().top, "Description must precede secondary task properties");
  for (const control of properties.querySelectorAll<HTMLElement>('button, input[type="date"]')) {
    const bounds = control.getBoundingClientRect(), panel = details.getBoundingClientRect();
    check(bounds.left >= panel.left && bounds.right <= panel.right, "Task property controls must fit inside the detail column");
  }
  const form = details.querySelector<HTMLElement>(".task-details-form")!;
  check(!properties.querySelector('.task-details-row > p:not(.task-details-control), .task-details-schedule > p:not([role="alert"])'), "Properties must omit explanatory helper text");
  const statusControl = properties.querySelector<HTMLElement>('[aria-label="Task status"]')!;
  await act(async () => statusControl.focus());
  const focusStyle = getComputedStyle(statusControl);
  check(parseFloat(focusStyle.outlineWidth) <= 1 && focusStyle.boxShadow === "none" && focusStyle.borderColor === "rgba(0, 0, 0, 0)", "Select focus must not show a double frame or ring");
  const propertyRows = [...properties.querySelectorAll<HTMLElement>(".task-details-row")];
  const savedStyle = form.style.cssText;
  form.style.width = "640px";
  form.style.flex = "none";
  await settle();
  const wideHeight = properties.getBoundingClientRect().height;
  check(Math.abs(propertyRows[0].getBoundingClientRect().top - propertyRows[1].getBoundingClientRect().top) < 1, "Status and color must share a row in wide detail forms");
  check(Math.abs(propertyRows[2].getBoundingClientRect().top - propertyRows[3].getBoundingClientRect().top) < 1, "Location and branch must share a row in wide detail forms");
  form.style.width = "300px";
  await settle();
  check(propertyRows[1].getBoundingClientRect().top >= propertyRows[0].getBoundingClientRect().bottom, "Narrow forms must stack properties without overlap");
  check(properties.getBoundingClientRect().height > wideHeight, "Two-column properties must use less vertical space");
  for (const control of properties.querySelectorAll<HTMLElement>('button, input[type="date"]')) {
    const bounds = control.getBoundingClientRect(), panel = form.getBoundingClientRect();
    check(bounds.left >= panel.left && bounds.right <= panel.right, "Narrow form controls must remain inside the form");
  }
  form.style.cssText = savedStyle;
  await settle();
  await click(properties.querySelector<HTMLElement>('[aria-label="Task status"]')!);
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) => element.textContent?.trim() === "In review")!);
  check(JSON.parse(storage[taskStorageKey(repo.rootPath)])[0].manualStatus === "inReview", "Grouped status control must still save changes");
  check(tab("Detail").getAttribute("aria-selected") === "true", "Legacy Chat tab preference must open Detail with Chat visible");
  check(["Detail", "Draw", "Sandbox", "Changes"].every((name) => tab(name)) && visible(composer()), "Detail, Draw, Sandbox and Changes should be tabs; Chat must remain visible");
  check(!JSON.parse(storage[taskStorageKey(repo.rootPath)])[0].unreadAgentResult, "Opening the visible chat must mark its result read");
  const asset = { id: "agent-123-456-1.txt", name: "Agent report.txt", image: false };
  const assetEvent = { repositoryRoot: repo.rootPath, taskId: task.id, assets: [asset] };
  const savedAssets = () => JSON.parse(storage[taskStorageKey(repo.rootPath)])[0].assets;
  await act(async () => { await emit("mcp-task-assets-added", { ...assetEvent, repositoryRoot: "/other-repository" }); }); await settle();
  check(savedAssets().length === 0, "Asset events from another repository must be ignored");
  await act(async () => { await emit("mcp-task-assets-added", { ...assetEvent, taskId: "missing-task" }); }); await settle();
  check(savedAssets().length === 0, "Assets must attach only to their target task");
  await act(async () => { await emit("mcp-task-assets-added", assetEvent); }); await settle();
  check(savedAssets().length === 1 && savedAssets()[0].id === asset.id, "Agent assets must persist with the task");
  check(dialog().textContent?.includes(asset.name), "Agent assets must appear in task details");
  await act(async () => { await emit("mcp-task-assets-added", assetEvent); }); await settle();
  check(savedAssets().length === 1, "Repeated asset events must not duplicate attachments");
  const originalComposer = composer();
  await act(async () => {
    originalComposer.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(originalComposer, "Keep this draft while I review changes");
    originalComposer.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(tab("Changes")); assertSplit();
  await checkChanges();
  check(composer() === originalComposer && composer().value.includes("Keep this draft"), "Switching left tabs must preserve the chat and its draft");
  await click(tab("Detail")); assertSplit();
  await click(dialog().querySelector<HTMLElement>('[aria-label="Close task modal"]')!);
  await click(button("Gantt"));
  const ganttBar = document.querySelector<HTMLElement>(`.task-gantt-bar[aria-label^="${task.title}:"]`)!;
  check(!ganttBar.querySelector('[role="img"]') && !document.querySelector(`[title="${task.title}"] [aria-label="New agent result"]`), "Reading an agent reply must remove its indicator from both Gantt locations");
  await click(ganttBar); assertSplit();
  await click(tab("Changes")); assertSplit();
  check(changesPanel().querySelector('.task-changes-branches')?.textContent?.includes("develop"), "The comparison base must survive reopening the task");
  await chooseBase("main");
  check(composer().value.includes("Keep this draft"), "Gantt must share the task chat draft");
  await click(dialog().querySelector<HTMLElement>('[aria-label="Task actions"]')!);
  const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  check(items.some((item) => item.textContent?.includes("Clear conversation")) && items.some((item) => item.textContent?.includes("Delete task")), "Secondary chat and task actions must remain reachable");
  await click(items.find((item) => item.textContent?.includes("Enter Zen Mode"))!);
  check(visible(document.querySelector('[aria-label="Exit Zen Mode"]')), "Zen mode must remain reachable from the split chat");
  await click(document.querySelector<HTMLElement>('[aria-label="Exit Zen Mode"]')!); assertSplit();
  check(composer().value.includes("Keep this draft"), "Zen mode must preserve the chat draft");
  await click(tab("Detail"));
  await click(dialog().querySelector<HTMLElement>('[aria-label="Close task modal"]')!);
  await click(button("List"));
  check(!document.querySelector('[aria-label="Task orchestrator"]'), "The separate orchestrator sidebar must be removed");
  check(![...document.querySelectorAll('[aria-label="Review Agent message"]')].some(visible), "List must open code chat in the task dialog");
  await click(button(task.title)); assertSplit();
  check(composer().value.includes("Keep this draft"), "List must share the task chat draft");
  await click(tab("Changes")); assertSplit();
  await click(tab("Detail"));
  await click(dialog().querySelector<HTMLElement>('[aria-label="Task actions"]')!);
  const listActions = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  check(listActions.some((item) => item.textContent?.includes("Clear conversation")), "List chat actions must stay reachable");
  await click(listActions.find((item) => item.textContent?.includes("Enter Zen Mode"))!);
  await click(document.querySelector<HTMLElement>('[aria-label="Exit Zen Mode"]')!); assertSplit();
  await click(tab("Changes"));
  await click(button("Merge…"));
  const mergeButton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].filter((item) => item.textContent?.trim() === "Squash & merge").at(-1)!;
  check(mergeButton && !mergeButton.disabled, "Pending task changes must not block merging committed changes");
  await click(mergeButton);
  check(merges.length === 1 && merges[0].taskId === task.id && merges[0].targetBranch === "main", "Merge with pending changes did not reach the backend");
  check(taskBoardStatus(savedTask()) === "inReview", "Merging must not mark the task as Done");
  await click(tab("Detail"));
  await typeDescription(" saved when task closes");
  await act(async () => dialog().querySelector<HTMLButtonElement>('[aria-label="Close task modal"]')!.click());
  check(storedDescription().endsWith(" saved when task closes"), "Closing the task modal must save the description draft");
  await click(button(task.title));
  await typeDescription(" saved in original repository");
  currentRepository = { ...repo, rootPath: "/another-synthetic-repository", name: "Another repository" };
  await act(async () => { await emit("repository-changed", { rootPath: repo.rootPath, paths: [] }); });
  await settle();
  check(storedDescription().endsWith(" saved in original repository"), "Repository switching must save a pending description in its original repository");
  check(JSON.parse(storage[taskStorageKey(currentRepository.rootPath)] ?? "[]")?.length === 0, "Pending edits must not leak into the next repository");
  document.getElementById("result")!.textContent = "PASS: initial Draw fits distant elements and subsequent tab switches preserve its viewport; drawing follows initial and live Lotse light/dark theme without remounting or content changes; panning avoids scene serialization and task/context writes during movement; Excalidraw tab, live agent drawing additions/edits/deletions, validation, scoped writes, drawing persistence and on-demand access without automatic attachments; description drafts stay local until explicit save or leaving, survive concurrent agent/window changes with their cursor, flush on native close and repository changes; preserved detail scroll, Plan mode, shared List/Kanban/Gantt task dialog, compact headers, responsive width, tabs, Git toolbar, chat drafts, secondary actions, Zen mode and merging with pending task changes.";
  }
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`;
  console.error(error);
} finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
