// Open /scripts/branch-name-ui.html through Vite. Uses synthetic repositories and IPC only.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { taskStorageKey, branchPrefixStorageKey, normalizeTask } from "../src/tasks";
import App from "../src/App";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let repo = { rootPath: "/synthetic-branch-repo", name: "Branch checks", currentBranch: "main", hasOrigin: true };
const firstRoot = repo.rootPath;
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const task = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Name this branch", location: "workspace" })!;
const originTask = normalizeTask({ id: "22345678-1234-1234-1234-123456789abc", title: "Continue an origin branch", location: "workspace" })!;
const suggestedTask = normalizeTask({ id: "32345678-1234-1234-1234-123456789abc", title: "Use a suggested branch", location: "workspace" })!;
const preparations: any[] = [];
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  [taskStorageKey(firstRoot)]: JSON.stringify([task, originTask, suggestedTask]),
  "chaoticreview.task-view": JSON.stringify({ [firstRoot]: "kanban" }),
};
let providerSettings = { activeProvider: "", providers: [] as { id: string; name: string; baseUrl: string; envKey: string }[], repositoryProviders: {} as Record<string, string>, ripgrepAvailable: true, mcpUrl: "" };
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "task_sandbox_supported") return true;
  if (command === "load_ai_settings") return providerSettings;
  if (command === "save_ai_provider_settings") {
    providerSettings = { ...providerSettings, ...args, providers: args.providers.map(({ secret: _secret, ...provider }: any) => provider) };
    return providerSettings;
  }
  if (command === "test_ai_provider") return "Synthetic provider credentials accepted";
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main", "origin/collision"], remoteRefs: ["origin/main", "origin/feature/continue", "origin/collision"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review" || command === "github_connection") return null;
  if (["scheduler_list", "list_memory", "agent_models", "load_mcp_servers"].includes(command)) return [];
  if (command === "task_git_status") return { repository: { ...repo, currentBranch: "feature/manual-name" }, upstream: null, pullCount: 0, pushCount: 0, dirty: false };
  if (command === "load_task_changes") return { comparison, pendingSnapshotId: "snapshot", pendingFiles: false, committedChanges: false, headOid: comparison.baseOid, squashMessage: "" };
  if (command === "prepare_task_worktree") { preparations.push(args); return { branch: args.startPoint.kind === "existing" ? args.startPoint.branch.replace(/^origin\//, "") : args.newBranchName, baseOid: comparison.baseOid, baseBranch: "main", created: true }; }
  if (command === "ai_chat_send") return { requestId: "branch-run", threadId: "branch-thread", turnId: "branch-turn" };
  if (["save_review", "set_mcp_context"].includes(command)) return;
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:window|outer_size" || command === "plugin:window|inner_size") return { width: innerWidth, height: innerHeight };
  if (command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  throw new Error(`Unexpected IPC command: ${command}`);
}, { shouldMockEvents: true });

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); }); };
const button = (label: string) => [...document.querySelectorAll<HTMLElement>("button")].find((item) => (item.textContent?.trim() === label || item.getAttribute("aria-label") === label) && item.getBoundingClientRect().width > 0)!;
const click = async (element: HTMLElement) => { check(element, "Missing control"); await act(async () => { element.focus(); element.click(); }); await settle(); };
const change = async (label: string, value: string) => {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(label === "Task title" ? ".task-details-title-input" : `[aria-label="${label}"]`)!;
  check(input, `Missing ${label}`);
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }); await settle();
};
const branch = () => document.querySelector<HTMLInputElement>('[aria-label="Branch name"]');
const openTask = async (selected = task) => { await click(button("Tasks")); await click(document.querySelector<HTMLElement>(`[aria-label="Drag ${selected.title}"]`)!); };
const chooseLocation = async (label: string) => {
  await click(button("Where the agent works"));
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === label)!);
};
let root = (fixtureRoot = createRoot(document.getElementById("root")!));
const mount = async () => { await initializeFileStore(); await act(async () => root.render(<App />)); await settle(); };
const remount = async () => { await act(async () => root.unmount()); await fileStore.flush(); root = (fixtureRoot = createRoot(document.getElementById("root")!)); await mount(); };
try {
  await mount(); check(document.body.textContent?.includes("Set up a model provider"), "Account-only installs must open provider setup even after completing old onboarding");
  check(!document.body.textContent?.includes("ChatGPT"), "Onboarding must not offer ChatGPT accounts");
  check((button("Continue") as HTMLButtonElement).disabled, "Setup must require a saved provider");
  await click(button("Test credentials"));
  check(document.body.textContent?.includes("Synthetic provider credentials accepted"), "Provider testing must remain available");
  await click(button("Save and use provider"));
  check(providerSettings.activeProvider === "openrouter", "The first saved provider must become the global default");
  check(providerSettings.repositoryProviders[firstRoot] === "openrouter", "Setup must activate the provider for the current repository");
  if (button("Continue")) await click(button("Continue"));
  await openTask();
  check(!branch(), "Workspace tasks must not show a new branch name");
  await chooseLocation("New Branch");
  check(branch()?.value === "feature/name-this-branch", "New Branch must suggest the title slug with the repository prefix");
  await click(document.querySelector<HTMLElement>(".task-details-title-input")!);
  await change("Task title", "Rename this branch!"); await click(branch()!);
  check(branch()?.value === "feature/rename-this-branch", "Untouched suggestions must follow title edits");
  await change("Task title", task.title); await click(branch()!);
  await change("Branch name", "feature/");
  await click(document.querySelector<HTMLElement>('[aria-label="Start from"] .model-picker-trigger') ?? document.querySelector<HTMLElement>('.task-details-row .model-picker-trigger')!);
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.includes("Current workspace"))!);
  await change("Review Agent message", "Start the task");
  await click(button("Send Review Agent message"));
  check(preparations.length === 0 && document.body.textContent?.includes("Enter a complete Branch name"), "The bare prefix must block manual startup");
  await change("Branch name", "feature/manual-name");
  await click(document.querySelector<HTMLElement>(".task-details-title-input")!);
  await change("Task title", "Keep my custom branch"); await click(branch()!);
  check(branch()?.value === "feature/manual-name", "Title edits must preserve a custom branch name");
  await change("Task title", task.title); await click(branch()!);
  await chooseLocation("Work on existing"); check(!branch(), "Existing branches must not show a new branch name");
  await click(document.querySelector<HTMLElement>('.task-details-row .model-picker-trigger')!);
  check([...document.querySelectorAll<HTMLElement>('[role="option"]')].some((item) => item.textContent === "origin/collision (local)"), "Local branches with remote-looking names must remain distinguishable");
  check([...document.querySelectorAll<HTMLElement>('[role="option"]')].some((item) => item.textContent === "origin/collision (remote)"), "Remote branches must remain distinguishable from local names");
  await change("Search branches", "origin/feature");
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === "origin/feature/continue")!);
  check(!branch(), "Origin selections must keep Work on existing mode");
  await remount(); await openTask();
  check(document.querySelector<HTMLElement>('.task-details-row .model-picker-trigger')?.textContent?.includes("origin/feature/continue"), "Restart must restore the origin selection");
  await chooseLocation("New Branch"); check(branch()?.value === "feature/manual-name", "Location changes must preserve the name draft");
  await click(button("Close task modal")); await click(button("Settings")); await click(button("Agent preferences"));
  check(!document.body.textContent?.includes("ChatGPT"), "Settings must offer providers without a ChatGPT account");
  check(document.querySelector<HTMLInputElement>('[aria-label="New branch prefix"]')?.value === "feature/", "Settings must show the default prefix");
  await change("New branch prefix", "fix/");
  check(storage[branchPrefixStorageKey(firstRoot)] === "fix/", "Settings must persist the prefix for this repository");
  await click(button("Close settings")); await openTask();
  check(branch()?.value === "feature/manual-name", "Changing the default must preserve existing drafts");
  await remount(); await openTask();
  check(branch()?.value === "feature/manual-name", "Restart must restore the branch name draft");
  await click(button("Close task modal")); await click(button("Settings")); await click(button("Agent preferences"));
  check(document.querySelector<HTMLInputElement>('[aria-label="New branch prefix"]')?.value === "fix/", "Restart must restore the repository prefix");
  repo = { ...repo, rootPath: "/synthetic-other-repo", name: "Other repository" };
  await remount(); await click(button("Settings")); await click(button("Agent preferences"));
  check(document.querySelector<HTMLInputElement>('[aria-label="New branch prefix"]')?.value === "feature/", "Other repositories need their own default");
  repo = { ...repo, rootPath: firstRoot, name: "Branch checks" };
  await remount(); await openTask();
  // Location changes reset the base selection; choose the workspace again before running.
  await click(document.querySelector<HTMLElement>('.task-details-row .model-picker-trigger')!);
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.includes("Current workspace"))!);
  await change("Review Agent message", "Start the task"); await click(button("Send Review Agent message"));
  check(preparations.length === 1 && preparations[0].newBranchName === "feature/manual-name" && preparations[0].startPoint.kind === "workspace", "IPC must receive the exact name and selected base");
  check(branch()?.disabled && branch()?.value === "feature/manual-name", "Started tasks must lock and display the actual branch name");
  check(JSON.parse(storage[taskStorageKey(firstRoot)])[0].newBranchName === "feature/manual-name", "The started task must retain the actual branch name");
  await click(button("Close task modal")); await openTask(originTask);
  await chooseLocation("Work on existing");
  await click(document.querySelector<HTMLElement>('.task-details-row .model-picker-trigger')!);
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === "origin/feature/continue")!);
  await change("Review Agent message", "Continue this branch"); await click(button("Send Review Agent message"));
  check(preparations.length === 2 && preparations[1].startPoint.kind === "existing" && preparations[1].startPoint.remote === true && preparations[1].startPoint.branch === "origin/feature/continue" && preparations[1].newBranchName === null, "IPC must continue the selected origin branch without a new task branch");
  check(!branch(), "Started origin tasks must keep Work on existing mode");
  await click(button("Close task modal")); await openTask(suggestedTask);
  await chooseLocation("New Branch");
  check(branch()?.value === "fix/use-a-suggested-branch", "Suggestions must use the configured repository prefix");
  await click(document.querySelector<HTMLElement>('.task-details-row .model-picker-trigger')!);
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.includes("Current workspace"))!);
  await change("Review Agent message", "Use the suggested name"); await click(button("Send Review Agent message"));
  check(preparations.length === 3 && preparations[2].newBranchName === "fix/use-a-suggested-branch", "IPC must use the displayed suggestion without requiring a manual edit");
  check(branch()?.disabled && branch()?.value === "fix/use-a-suggested-branch", "Started suggestions must show and lock the actual branch name");
  document.getElementById("result")!.textContent = "PASS: origin branch search, local/remote disambiguation, existing mode, persistence, exact origin IPC, tracking branch display, provider-only onboarding, no account controls, provider testing, global/repository activation, visibility, prefix value, name validation, location changes, draft preservation, per-repository settings, restart, exact IPC and locking after start. Synthetic IPC only.";
} catch (error) { document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`; } finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
