// Open /scripts/kanban-drag-ui.html through Vite. Real App and dnd-kit, synthetic tasks and IPC.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { initializeFileStore } from "../src/fileStore";
import { taskStorageKey, normalizeTask, taskBoardStatus } from "../src/tasks";
import App from "../src/App";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-kanban", name: "Kanban drag", currentBranch: "main", hasOrigin: false };
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const tasks = Array.from({ length: 200 }, (_, index) => normalizeTask({ id: `task-${index}`, title: `Card ${index}`, manualStatus: ["inbox", null, "inProgress", "inReview"][index % 4], chatMode: "plan", chatModel: "custom-plan", chatEffort: "high" })!);
const taskKey = taskStorageKey(repo.rootPath);
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  "chaoticreview.chat-defaults": JSON.stringify({ default: { model: "default-model", effort: "low" }, plan: { model: "plan-model", effort: "high" } }),
  [taskKey]: JSON.stringify(tasks),
  "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: "kanban" }),
};
let writes = 0;
mockWindows("main");
mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "task_sandbox_supported") return true;
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; if (args.key === taskKey) writes++; return; }
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review" || command === "github_connection") return null;
  if (["agent_models", "scheduler_list", "list_memory"].includes(command)) return [];
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: [], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:window|outer_size" || command === "plugin:window|inner_size") return { width: innerWidth, height: innerHeight };
  if (command === "save_review" || command === "set_mcp_context" || command.startsWith("plugin:window|") || command.startsWith("plugin:notification|")) return;
  throw new Error(`Unexpected IPC: ${command}`);
}, { shouldMockEvents: true });
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  await act(async () => { await new Promise(requestAnimationFrame); });
};
const waitFor = async (condition: () => boolean, message: string) => {
  const deadline = performance.now() + 3000;
  while (!condition() && performance.now() < deadline) await settle();
  check(condition(), message);
};
const scrollTo = async (element: Element) => {
  await act(async () => element.scrollIntoView({ block: "nearest", inline: "nearest" }));
  await settle();
};
const stored = () => JSON.parse(storage[taskKey]) as typeof tasks;
const card = (id = "task-0") => document.querySelector<HTMLElement>(`[aria-label="Drag ${tasks.find((task) => task.id === id)!.title}"]:not([data-dnd-placeholder])`)!;
const key = async (code: string, target: EventTarget = document) => {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true })); });
  await settle();
};
const begin = async () => { await scrollTo(card()); card().focus(); await key("Space", card()); check(card().classList.contains("task-row-dragging"), "Keyboard must start dragging"); };
const pointer = async (type: string, x: number, y: number, target: EventTarget = document) => {
  await act(async () => { target.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true })); });
  await settle();
};
const column = () => {
  const bounds = card().getBoundingClientRect();
  const center = bounds.left + bounds.width / 2;
  return [...document.querySelectorAll(".task-board-column")].find((section) => { const rect = section.getBoundingClientRect(); return center >= rect.left && center <= rect.right; })?.getAttribute("aria-label");
};
try {
  await initializeFileStore();
  await act(async () => (fixtureRoot = createRoot(document.getElementById("root")!)).render(<App />)); await settle();
  const tasksButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Tasks")!;
  await act(async () => tasksButton.click()); await settle();
  check(document.querySelectorAll(".task-board-card").length === tasks.length, "Render all 200 cards");
  // Packaged Tauri policies can block the style element injected by dnd-kit.
  let feedbackStyles: CSSStyleSheet | null | undefined;
  try {
    await scrollTo(card());
    const original = card().getBoundingClientRect();
    const x = original.left + original.width / 2, y = original.top + 20;
    await pointer("pointerdown", x, y, card());
    feedbackStyles = [...document.querySelectorAll("style")].find((style) => style.textContent?.trim().startsWith(":is(:root,:host) [data-dnd-dragging]"))?.sheet;
    check(feedbackStyles, "Find the runtime drag stylesheet");
    feedbackStyles!.disabled = true;
    const checkPreview = (dx: number, dy: number) => {
      const preview = card().getBoundingClientRect();
      check(Math.abs(preview.width - original.width) < 1 && Math.abs(preview.height - original.height) < 1, "Bundled drag styles must preserve the card dimensions");
      check(Math.abs(preview.left - original.left - dx) < 1 && Math.abs(preview.top - original.top - dy) < 1, "Bundled drag styles must keep the card at the pointer instead of the window corner");
      check(getComputedStyle(card()).opacity === "1", "Bundled drag styles must keep the card readable");
    };
    checkPreview(0, 0);
    await pointer("pointermove", x + 12, y + 30);
    checkPreview(12, 30);
  } finally {
    if (feedbackStyles) feedbackStyles.disabled = false;
    await key("Escape", document.body);
  }
  check(!document.querySelector("[data-dnd-dragging], [data-dnd-placeholder]"), "Cancel must remove the preview and placeholder");
  const before = storage[taskKey];
  const beforeWrites = writes;
  await begin();
  for (let index = 0; index < 3; index++) {
    await key("ArrowRight");
    check(storage[taskKey] === before && writes === beforeWrites, "Hovering columns must not persist task/status/model changes");
  }
  check(column() === "In review tasks", `Preview must reach In review, got ${column()}`);
  await key("Escape");
  check(storage[taskKey] === before && writes === beforeWrites, "Cancel must leave tasks and storage untouched");
  check(column() === "Inbox tasks", "Cancel must restore the preview to Inbox");
  await begin(); await key("ArrowRight"); await key("ArrowRight");
  check(column() === "In development tasks", "Preview must reach In development");
  await key("Space");
  check(taskBoardStatus(stored().find((task) => task.id === "task-0")!) === "inProgress", "Drop must commit the final column");
  const checkChatMode = () => {
    const moved = stored().find((task) => task.id === "task-0")!;
    check(moved.chatMode === "plan" && moved.chatModel === "custom-plan" && moved.chatEffort === "high", "Status changes must preserve the selected chat mode, model and effort");
  };
  checkChatMode();
  check(writes === beforeWrites + 1, "Drop must persist once");
  for (let index = 0; index < 12; index++) {
    await begin(); await key(index % 2 === 0 ? "ArrowLeft" : "ArrowRight"); await key("Space");
    checkChatMode();
    check(document.querySelectorAll(".task-board-card").length === tasks.length, "Repeated drops must not lose or duplicate cards");
  }
  const order = stored().map((task) => task.id).join();
  const reorderWrites = writes;
  await begin(); await key("ArrowDown"); await key("Space");
  check(stored().map((task) => task.id).join() !== order && writes === reorderWrites + 1, "Reordering within a column must persist once");
  await scrollTo(card());
  const sourceRect = card().getBoundingClientRect();
  await pointer("pointerdown", sourceRect.left + sourceRect.width / 2, sourceRect.top + sourceRect.height / 2, card());
  check(card().classList.contains("task-row-dragging"), "Mouse must start dragging");
  const mouseWrites = writes;
  const mouseColumns = ["Inbox", "Planning", "In development", "In review", "Planning", "Inbox", "In review", "Done"];
  for (const [index, label] of mouseColumns.entries()) {
    const target = document.querySelector<HTMLElement>(`section[aria-label="${label} tasks"]`)!;
    await scrollTo(target);
    const rect = target.getBoundingClientRect();
    await pointer("pointermove", rect.left + rect.width / 2, rect.top + 100 + index * 5);
    check(writes === mouseWrites, "Crossing many columns by mouse must not persist intermediate statuses");
  }
  const doneRect = document.querySelector('section[aria-label="Done tasks"]')!.getBoundingClientRect();
  check(document.querySelector('section[aria-label="Done tasks"]')?.className.includes("border-[#A3FF12]"), "Mouse must target the empty Done column");
  await pointer("pointerup", doneRect.left + doneRect.width / 2, doneRect.top + 100 + (mouseColumns.length - 1) * 5);
  check(card().closest("section")?.getAttribute("aria-label") === "Done tasks" && taskBoardStatus(stored().find((task) => task.id === "task-0")!) === "done", "Mouse drop into an empty column must work");
  check(writes === mouseWrites + 1, "Mouse drop must persist once");
  const movingId = stored().find((task) => task.id !== "task-0" && taskBoardStatus(task) === "inbox")!.id;
  await scrollTo(card(movingId));
  const movingRect = card(movingId).getBoundingClientRect();
  await pointer("pointerdown", movingRect.right - 5, movingRect.top + 20, card(movingId));
  check(getComputedStyle(card(movingId)).opacity === "1", "Dragged card must stay readable");
  await scrollTo(document.querySelector('section[aria-label="Done tasks"]')!);
  const doneCardRect = card().getBoundingClientRect();
  const targetX = doneCardRect.left + 5;
  await pointer("pointermove", targetX, doneCardRect.top + 10);
  check(card().getAttribute("data-drop-position") === "before", "Populated lane must show the insertion point");
  check(document.querySelector('section[aria-label="Done tasks"]')?.getAttribute("data-drop-target") === "true", "Populated lane under the pointer must stay highlighted");
  const populatedWrites = writes;
  await pointer("pointerup", targetX, doneCardRect.top + 10);
  check(stored().filter((task) => taskBoardStatus(task) === "done").map((task) => task.id).join() === `${movingId},task-0`, "Drop must match the insertion marker");
  check(writes === populatedWrites + 1, "Populated lane drop must persist once");
  const nextRect = card(movingId).getBoundingClientRect();
  await pointer("pointerdown", nextRect.right - 5, nextRect.top + 20, card(movingId));
  const blankY = card().getBoundingClientRect().bottom + 30;
  await pointer("pointermove", targetX, blankY);
  check(card().getAttribute("data-drop-position") === "after", "Blank space must show insertion after the last card");
  const blankWrites = writes;
  await pointer("pointerup", targetX, blankY);
  check(stored().filter((task) => taskBoardStatus(task) === "done").map((task) => task.id).join() === `task-0,${movingId}`, "Blank-space drop must append instead of keeping the old order");
  check(writes === blankWrites + 1, "Blank-space drop must persist once");
  const gapSourceRect = card(movingId).getBoundingClientRect();
  await pointer("pointerdown", gapSourceRect.right - 5, gapSourceRect.top + 20, card(movingId));
  await scrollTo(document.querySelector('section[aria-label="Planning tasks"]')!);
  // Keep this gap check away from the horizontal auto-scroll activation zone.
  await act(async () => card("task-1").scrollIntoView({ block: "nearest", inline: "center" })); await settle();
  await waitFor(() => card("task-1").getBoundingClientRect().bottom <= card("task-5").getBoundingClientRect().top, "The adjacent cards must finish animating before targeting their gap");
  const firstRect = card("task-1").getBoundingClientRect();
  const secondRect = card("task-5").getBoundingClientRect();
  await pointer("pointermove", firstRect.left + 5, (firstRect.bottom + secondRect.top) / 2);
  await waitFor(() => card("task-5").getAttribute("data-drop-position") === "before", "Gap between cards must target the next card instead of the end of the lane");
  await key("Escape", document.body);
  await waitFor(() => !document.querySelector("[data-drop-position]"), "Cancel must clear insertion markers");
  check(writes === blankWrites + 1, "Cancel must not persist task changes");
  check(new Set(stored().map((task) => task.id)).size === tasks.length, "All task IDs must survive");
  document.getElementById("result")!.textContent = "PASS: 200 cards, no hover writes, Escape cancels, final status saved once with chat settings preserved, 12 repeated lane drops, keyboard reorder, mouse crossing 8 lanes, empty/populated lane drops, readable dragged card, pointer-based highlighting, insertion markers, blank-space append, no missing or duplicate tasks.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`;
  throw error;
} finally {
  if (document.querySelector(".task-row-dragging")) await key("Escape", document.body);
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
