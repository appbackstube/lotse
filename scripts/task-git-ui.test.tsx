// Open /scripts/task-git-ui.html through Vite. All remote operations use synthetic IPC.
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "./mockTauri";
import { TaskGitToolbar } from "../src/components/TaskGitToolbar";
import { normalizeTask } from "../src/tasks";
import type { TaskGitStatus } from "../src/types";
import "../src/App.css";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); }); };
const initial: TaskGitStatus = { repository: { rootPath: "/synthetic/task", name: "Task", currentBranch: "feature/monthly-report", hasOrigin: true }, upstream: "origin/feature/monthly-report", pullCount: 0, pushCount: 3, dirty: false };
let status = structuredClone(initial);
let failure = "";
let statusFailure = "";
let hold = false;
let release: (() => void) | undefined;
const actions: Record<string, unknown>[] = [];
const reads: Record<string, unknown>[] = [];
mockIPC(async (command, args: any) => {
  if (command === "task_git_status") {
    reads.push(args);
    if (statusFailure) throw statusFailure;
    return structuredClone(status);
  }
  if (command === "task_git_action") {
    actions.push(args);
    if (hold) await new Promise<void>((resolve) => { release = resolve; });
    if (failure) throw failure;
    if (args.action === "push") status = { ...status, upstream: "origin/feature/monthly-report", pushCount: 0 };
    if (args.action === "pull") status = { ...status, pullCount: 0 };
    return structuredClone(status);
  }
  throw new Error(`Unexpected IPC command: ${command}`);
});
let task = normalizeTask({ id: "synthetic-task", title: "Monthly Report", location: "worktree", worktree: { branch: "feature/monthly-report", baseOid: "abc", baseBranch: "main" } })!;
let running = false;
let revision = 0;
let mounts = 0;
let synced = 0;
let compact = false;
function Fixture() {
  const [busy, setBusy] = useState<"fetch" | "pull" | "push" | null>(null);
  return <main className="ios-app mx-auto mt-8 w-full max-w-[600px] rounded-xl border border-[#294536] bg-[var(--ios-grouped-background)]">
    <div className="flex h-12 items-center gap-6 border-b border-[#294536] px-3 text-sm"><span>Detail</span><span>Chat</span><span>Changes</span></div>
    <TaskGitToolbar key={`${task.id}:${task.location}:${mounts}`} task={task} running={running} revision={revision} busy={busy} compact={compact} onBusyChange={setBusy} onPull={(pull) => pull()} onSynced={() => { synced++; }} />
  </main>;
}
const root = (fixtureRoot = createRoot(document.getElementById("root")!));
const render = async () => { revision++; await act(async () => root.render(<Fixture />)); await settle(); };
const primary = () => document.querySelector<HTMLButtonElement>('[aria-label="Task Git"] button')!;
const menu = async () => { await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Task Git actions"]')!.click()); await settle(); };
const item = (name: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent?.startsWith(name))!;
const closeMenu = async () => { await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))); await settle(); };
try {
  await render();
  check(primary().textContent === "Push" && !primary().disabled, "Outgoing commits must offer Push");
  check(document.querySelector('[aria-label="3 outgoing commits"]'), "Outgoing count is missing");
  await act(async () => primary().click()); await settle();
  check(actions[0].taskId === task.id && actions[0].expectedBranch === initial.repository.currentBranch && actions[0].action === "push", "Push must target the task and displayed branch");
  check(synced === 1 && primary().textContent === "Fetch", "Success must refresh the parent and primary action");
  await menu();
  check(item("Fetch") && item("Pull") && item("Push"), "All three actions must be reachable in the menu");
  await act(async () => item("Fetch").click()); await settle();
  check(actions.at(-1)?.action === "fetch", "Fetch menu action did not run");

  status = { ...status, pullCount: 2, dirty: true }; await render();
  check(primary().textContent === "Pull" && !primary().disabled, "Dirty worktrees must allow Pull and let Git check for conflicts");
  await act(async () => primary().click()); await settle();
  check(actions.at(-1)?.action === "pull" && status.dirty, "Pull must run with local changes");
  status = { ...status, dirty: false, pullCount: 2 }; running = true; await render();
  check(primary().disabled && primary().title.includes("agent"), "Running agents must prevent Pull");
  await menu();
  check(item("Fetch").getAttribute("aria-disabled") !== "true", "Fetch should remain available while an agent runs");
  await closeMenu();
  running = false; await render();
  await act(async () => primary().click()); await settle();
  check(actions.at(-1)?.action === "pull", "Incoming commits must offer Pull");

  status = { ...status, pushCount: 1, pullCount: 2 }; await render();
  check(primary().textContent === "Fetch" && document.body.textContent?.includes("Branches have diverged"), "Divergence must be explained without offering unsafe sync");
  await menu();
  check(item("Pull").getAttribute("aria-disabled") === "true" && item("Push").getAttribute("aria-disabled") === "true", "Diverged branches must disable Pull and Push");
  await closeMenu();

  status = { ...status, pushCount: null, pullCount: null, upstream: null }; await render();
  check(primary().textContent === "Publish branch" && !primary().disabled, "Branches without upstream must offer publication");
  failure = "Synthetic push rejection";
  await act(async () => primary().click()); await settle();
  check(document.querySelector('[role="alert"]')?.textContent?.includes(failure), "Operation failures must be visible");
  failure = ""; hold = true;
  const before = actions.length;
  await act(async () => { primary().click(); primary().click(); }); await settle();
  check(actions.length === before + 1 && primary().disabled && primary().textContent === "Pushing…", "Busy state must prevent duplicate operations");
  mounts++; await render();
  check(primary().disabled && primary().textContent === "Pushing…", "Switching views must preserve the operation lock");
  hold = false;
  await act(async () => release!()); await settle();

  status = { ...status, repository: { ...status.repository, currentBranch: null } }; await render();
  await menu();
  check(item("Push").getAttribute("aria-disabled") === "true" && item("Pull").getAttribute("aria-disabled") === "true", "Detached HEAD must prevent Pull and Push");
  await closeMenu();
  status = { ...status, repository: { ...status.repository, hasOrigin: false } }; await render();
  check(primary().disabled && document.body.textContent?.includes("No origin remote"), "Missing origin must be explained");

  const beforeReads = reads.length;
  task = { ...task, worktree: null }; mounts++; await render();
  check(primary().disabled && reads.length === beforeReads && document.body.textContent?.includes("Worktree not started"), "Unstarted worktrees must never fall back to workspace operations");
  task = { ...task, location: "workspace" }; status = structuredClone(initial); mounts++; await render();
  await act(async () => primary().click()); await settle();
  check(actions.at(-1)?.taskId === null && reads.at(-1)?.taskId === null, "Workspace tasks must explicitly target the workspace");
  statusFailure = "Synthetic status failure"; await render();
  check(primary().disabled && document.querySelector('[role="alert"]')?.textContent?.includes(statusFailure), "Failed status reads must disable operations");
  statusFailure = ""; status = structuredClone(initial); await render();
  check(!primary().disabled, "Status reads must recover after errors");
  compact = true; status = { ...initial, pushCount: 0 }; await render();
  check(!document.querySelector('[aria-label="0 incoming commits"]') && !document.querySelector('[aria-label="0 outgoing commits"]'), "Compact headers must omit empty counters");
  status = structuredClone(initial); await render();
  check(document.querySelector('[aria-label="3 outgoing commits"]'), "Compact headers must still show outgoing work");
  failure = "Compact push rejection";
  await act(async () => primary().click()); await settle();
  check(document.querySelector('.task-git-notice [role="alert"]')?.textContent?.includes(failure), "Compact headers must keep Git failures visible");
  failure = "";
  await act(async () => primary().click()); await settle();
  document.getElementById("result")!.textContent = "PASS: task/workspace targeting, menu actions, counts, publication, dirty/running/diverged/detached guards, no-remote/unstarted states, duplicate prevention, view-switch lock, errors and recovery.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`;
  console.error(error);
} finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
