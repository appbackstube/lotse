// Open /scripts/goal-mode-ui.html through Vite. The real App uses synthetic IPC; no live agents run.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { taskStorageKey, normalizeTask } from "../src/tasks";
import App from "../src/App";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-repository", name: "Monthly Report", currentBranch: "main", hasOrigin: true };
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const savedAgent = { id: "owner", title: "Product owner", prompt: "Clarify goals" };
const first = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Polish keyboard navigation", manualStatus: "inbox", chatMode: "default", location: "workspace", chatAgent: savedAgent, attachments: [] })!;
const sends: any[] = [];
const failures: string[] = [];

const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  "chaoticreview.agents": JSON.stringify([savedAgent]),
  "chaoticreview.default-agent": savedAgent.id,
  "chaoticreview.chat-model-favorites": JSON.stringify(["custom-model"]),
  [taskStorageKey(repo.rootPath)]: JSON.stringify([first]),
  "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: "kanban" }),
  "chaoticreview.task-board-tabs": JSON.stringify({ [repo.rootPath]: {} }),
};
mockWindows("main");
mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "task_sandbox_supported") return true;
  if (command === "task_browser_supported") return false;
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") {
    storage[args.key] = args.value; return;
  }
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main", "feature/monthly-report"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "agent_models") return [{ model: "custom-model", displayName: "Custom model" }];
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
  if (command === "ai_chat_send") { sends.push(args); return { requestId: `run-${sends.length}`, threadId: `thread-${sends.length}`, turnId: `turn-${sends.length}` }; }
  failures.push(command); throw new Error(`Unexpected IPC command: ${command}`);
}, { shouldMockEvents: true });

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); };
const visible = (element: Element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const button = (label: string) => [...document.querySelectorAll<HTMLElement>("button")].find((item) => visible(item) && (item.textContent?.trim() === label || item.getAttribute("aria-label") === label))!;
const click = async (element: HTMLElement) => { check(element, "Missing control"); await act(async () => { element.focus(); element.click(); }); await settle(); };
const storedTasks = () => JSON.parse(storage[taskStorageKey(repo.rootPath)]);
const event = async (index: number, payload: Record<string, unknown>) => { await act(async () => sends[index].events.onmessage({ type: "chat", payload: { requestId: `run-${index + 1}`, threadId: `thread-${index + 1}`, turnId: `turn-${index + 1}`, ...payload } })); await settle(); };
const root = (fixtureRoot = createRoot(document.getElementById("root")!));
const typeValue = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  check(element, "Missing input");
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
};
try {
  await initializeFileStore();
  await act(async () => root.render(<App />)); await settle();
  await click(button("Workspace"));
  const enableGoal = async () => {
    await click(button("Add to chat"));
    const goal = [...document.querySelectorAll<HTMLElement>('button[role="switch"]')].find((b) => visible(b) && b.textContent?.startsWith("Goal"))!;
    check(goal && !goal.querySelector("svg"), "Plus menu must contain Goal without a decorative icon");
    await click(goal);
    check(button("Goal settings"), "Enabling Goal must show the Goal On chip");
  };
  await click(button("Model and effort"));
  await click(button("Custom model"));
  await click(button("Model and effort"));
  await click(button("Effort"));
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => visible(item) && item.textContent === "High")!);
  await act(async () => document.querySelector('.ios-chat-config-popover')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await settle();
  await enableGoal();
  check(button("Model and effort").textContent?.includes("Custom model") && button("Model and effort").textContent?.includes("High"), "Enabling Goal must preserve the selected model and effort");
  await click(button("Goal settings"));
  const limit = () => [...document.querySelectorAll<HTMLElement>('button[role="switch"]')].find((b) => visible(b) && b.textContent?.includes("Limit token usage"))!;
  check(limit().getAttribute("aria-checked") === "false", "Token budget must start optional");
  await click(limit());
  check(visible(document.querySelector('[aria-label="Token budget"]')!), "Enabling token limit must leave the goal popover open");
  check(!document.querySelector(".ios-chat-goal-popover svg"), "Goal settings must have text-only actions");
  await typeValue(document.querySelector('[aria-label="Token budget"]')!, "25000");
  await act(async () => document.querySelector<HTMLInputElement>('[aria-label="Token budget"]')!.focus());
  await act(async () => document.querySelector<HTMLInputElement>('[aria-label="Token budget"]')!.blur());
  await settle();
  await fileStore.flush();
  await act(async () => document.querySelector('.ios-chat-goal-popover')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await settle();
  await typeValue(document.querySelector('.ios-chat-textarea')!, "Finish the workspace goal");
  await click(button("Send Review Agent message"));
  check(sends[0].model === "custom-model" && sends[0].effort === "high", "Editing Goal settings must preserve the selected model and effort in the request");
  check(sends[0].goal.enabled && sends[0].goal.tokenBudget === 25000, "Workspace sends must forward enabled Goal and the edited budget");
  check(button("Goal settings").hasAttribute("disabled"), "Goal settings must not mutate during a run");
  await event(0, { kind: "completed" });
  await click(button("Goal settings"));
  await click(button("Turn off Goal"));
  check(!button("Goal settings"), "Turning Goal off must remove its chip");
  await typeValue(document.querySelector('.ios-chat-textarea')!, "A normal follow-up");
  await click(button("Send Review Agent message"));
  check(sends[1].goal.enabled === false, "Normal follow-up must explicitly disable the server goal");
  await event(1, { kind: "completed" });
  await click(button("Tasks"));
  await click([...document.querySelectorAll<HTMLElement>(".task-card-title")].find((item) => item.textContent === first.title) ?? button(first.title));
  check(!button("Goal settings"), "Goal configuration must be isolated between review and task chats");
  await enableGoal();
  await click(button("Goal settings"));
  await click(limit());
  await fileStore.flush();
  check(normalizeTask(storedTasks().find((task: any) => task.id === first.id))!.chatGoal?.tokenBudget === 50000, "Task Goal settings must survive normalization and storage");
  await act(async () => document.querySelector('.ios-chat-goal-popover')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await settle();
  await click(button("Add to chat"));
  await click([...document.querySelectorAll<HTMLElement>('button[role="switch"]')].find((b) => visible(b) && b.textContent?.startsWith("Plan"))!);
  check(!button("Goal settings") && button("Disable Plan mode"), "Plan must disable Goal");
  await enableGoal();
  check(!button("Disable Plan mode"), "Enabling Goal must leave Plan mode");
  await typeValue(document.querySelector('.ios-chat-textarea')!, "Finish the task goal");
  await click(button("Send Review Agent message"));
  check(sends[2].taskId === first.id && sends[2].goal.enabled && sends[2].goal.tokenBudget === 50000 && sends[2].collaborationMode === "default", "Task goal must reach the agent in Default mode with its own budget");
  await event(2, { kind: "completed" });
  check(!failures.length, `Unexpected IPC commands: ${failures.join(", ")}`);
  document.getElementById("result")!.textContent = "PASS: Goal in plus menu, text-only settings, open token-limit popover, budget editing, review/task isolation, persistence, Plan switching and Goal on/off IPC (synthetic agent).";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`;
} finally {
  await act(async () => fixtureRoot?.unmount());
}
