// Open /scripts/github-ui.html through the Vite dev server. Uses synthetic IPC only.
import React, { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { emit } from "@tauri-apps/api/event";
import { GitHubInbox, GitHubSettings } from "../src/components/GitHubInbox";
import { useGitHubInbox, type GitHubInboxController } from "../src/useGitHubInbox";
import { initializeFileStore } from "../src/fileStore";
import { taskStorageKey, loadTasks, normalizeTask, saveTasks } from "../src/tasks";
import type { RepositoryTask } from "../src/types";
import "../src/App.css";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const preview = new URL(location.href).searchParams.has("preview");
if (new URL(location.href).searchParams.get("theme") === "dark") {
  const style = document.createElement("style");
  style.textContent = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
    .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText.includes("prefers-color-scheme: dark"))
    .flatMap((rule) => [...rule.cssRules].map((child) => child.cssText)).join("\n");
  document.head.append(style);
}
const previewItems = [
  { number: 4636, kind: "pullRequest", title: "Add iPhone Duo support: custom sidebar layout, fold-aware sizing and safe area fixes", description: "", state: "open", url: "" },
  { number: 4713, kind: "pullRequest", title: "Add invite link copying across groups, profiles and challenges", description: "", state: "merged", url: "" },
  { number: 4704, kind: "pullRequest", title: "Add post-as-group", description: "", state: "merged", url: "" },
];
let connected = true;
let accountId = 1;
let failStorage = false;
let notificationCalls = 0;
let repositoryResponse: Promise<{ id: number; fullName: string }> | undefined;
const writes: Record<string, unknown>[] = [];
const itemReads: number[] = [];
const storage: Record<string, string> = {};
let remote = { number: 3, kind: "issue", title: "Fix keyboard navigation", description: "Preserve focus when opening the inbox.", state: "open", url: "https://github.com/owner/repo/issues/3" };
mockWindows("main");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { if (failStorage) throw new Error("Synthetic storage failure"); storage[args.key] = args.value; return; }
  if (command === "github_connection") return connected ? { id: accountId, login: accountId === 1 ? "alice" : "bob" } : null;
  if (command === "github_repository") return repositoryResponse ?? { id: 2, fullName: "owner/repo" };
  if (command === "github_disconnect") { connected = false; await emit("github-connection-changed"); return; }
  if (command === "github_fetch_inbox") { notificationCalls++; if (preview) return previewItems.map((item) => ({ number: item.number, kind: item.kind, reason: "review_requested", updatedAt: "2026-10-27T12:00:00Z" })); return [3, 4].map((number) => ({ number, kind: "issue", reason: "mention", updatedAt: "2026-10-27T12:00:00Z" })); }
  if (command === "github_get_item") { itemReads.push(args.number); return preview ? previewItems.find((item) => item.number === args.number) : { ...remote, number: args.number }; }
  if (command === "github_update_item") {
    writes.push(args.update);
    throw new Error("GitHub writes must stay disabled");
  }
}, { shouldMockEvents: true });

let controller: GitHubInboxController;
let tasks: RepositoryTask[] = [];
let changeTasks: React.Dispatch<React.SetStateAction<RepositoryTask[]>>;
let remount: () => void;
let changeRoot: React.Dispatch<React.SetStateAction<string>>;
function Fixture() {
  const [rootPath, setRootPath] = useState("/synthetic-repo");
  changeRoot = setRootPath;
  const [value, setValue] = useState(() => loadTasks("/synthetic-repo"));
  tasks = value; changeTasks = setValue;
  useEffect(() => saveTasks("/synthetic-repo", value), [value]);
  controller = useGitHubInbox({ rootPath, ready: true, tasks: value, setTasks: setValue,
    makeTask: (item) => normalizeTask({ id: crypto.randomUUID(), title: item.title, location: "worktree", chatMode: "plan" })! });
  return <main className="p-8"><div className="flex items-center gap-4"><h1>Tasks</h1><GitHubInbox github={controller} onSettings={() => {}} /></div><GitHubSettings github={controller} /><p className="mt-4">Imported tasks: {value.length}</p></main>;
}
function App() {
  const [version, setVersion] = useState(0);
  remount = () => setVersion((value) => value + 1);
  return <Fixture key={version} />;
}
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const edit = async (changes: Partial<RepositoryTask>) => { await act(async () => changeTasks((tasks) => tasks.map((task) => ({ ...task, ...changes })))); };
const refresh = async () => { await act(async () => { await controller.refresh(); }); await settle(); };

try {
  await initializeFileStore();
  await act(async () => { (fixtureRoot = createRoot(document.getElementById("root")!)).render(<App />); });
  await settle();
  const badge = document.querySelector(".github-inbox-count")!;
  check(badge.textContent === (preview ? "3" : "2"), "Inbox badge count is missing");
  const badgeStyle = getComputedStyle(badge);
  check(badgeStyle.color !== badgeStyle.backgroundColor, "Inbox badge has no contrast");
  if (!preview) {
  check(controller!.inbox.pending.length === 2, "Initial background discovery failed");
  check(controller!.notificationsContext.available && controller!.notificationsContext.notifications[0].item?.title === remote.title, "Agent tool snapshot is missing inbox details");
  check(notificationCalls === 1, "Startup should have one inbox refresh");
  let resolveRepository!: (value: { id: number; fullName: string }) => void;
  repositoryResponse = new Promise((resolve) => { resolveRepository = resolve; });
  await act(async () => changeRoot("/other-repo")); await settle();
  check(!controller!.notificationsContext.available && controller!.notificationsContext.notifications.length === 0, "Repository switch exposed the previous inbox while resolving");
  await act(async () => resolveRepository({ id: 5, fullName: "owner/other" })); await settle();
  check(controller!.notificationsContext.repository?.id === 5 && controller!.notificationsContext.available, "New repository inbox was not exposed");
  repositoryResponse = undefined;
  await act(async () => changeRoot("/synthetic-repo")); await settle();
  check(controller!.notificationsContext.repository?.id === 2, "Returning to the original repository kept the wrong inbox");
  await act(async () => controller.ignore(controller.inbox.pending.find((item) => item.number === 4)!));
  await refresh();
  check(controller!.inbox.pending.length === 1, "Ignored item returned after refresh");
  failStorage = true;
  await act(async () => { await controller.importItem(controller.inbox.pending[0]); });
  check(controller!.inbox.imported.length === 0, "Failed task persistence must not create an import tombstone");
  failStorage = false;
  await act(async () => { await controller.importItem(controller.inbox.pending[0]); });
  await settle();
  check(tasks.length === 1 && tasks[0].github?.number === 3, "Import did not create a linked task");
  check(JSON.parse(storage[taskStorageKey("/synthetic-repo")]).length === 1, "Import retry did not persist the task");
  await refresh();
  check(controller!.inbox.pending.length === 0 && tasks.length === 1, "Import duplicated after refresh");
  const checkIndependent = async () => {
    const localBefore = JSON.stringify(tasks);
    const remoteBefore = JSON.stringify(remote);
    const readsBefore = itemReads.length;
    await refresh();
    check(JSON.stringify(tasks) === localBefore, "Inbox refresh changed an imported task");
    check(JSON.stringify(remote) === remoteBefore && writes.length === 0, "Inbox refresh wrote to GitHub");
    check(itemReads.length === readsBefore, "Inbox refresh fetched an already imported item");
  };
  for (const kind of ["issue", "pullRequest"] as const) {
    remote = { ...remote, kind, title: "Remote title", description: "Remote description", state: "open" };
    await edit({ github: { ...tasks[0].github!, kind, url: `https://github.com/owner/repo/${kind === "issue" ? "issues" : "pull"}/3` }, title: "Local title", description: "Local notes", completed: true });
    await checkIndependent();
    remote = { ...remote, title: "Changed on GitHub", description: "Changed remotely", state: "closed" };
    await edit({ completed: false });
    await checkIndependent();
    remote.state = "open";
    await edit({ completed: true });
    await checkIndependent();
  }
  await act(async () => controller.setInterval(15));
  const beforeRestart = JSON.stringify(tasks.map((task) => normalizeTask(task)));
  await act(async () => remount()); await settle();
  check(JSON.stringify(tasks) === beforeRestart && writes.length === 0, "Restart synced imported tasks");
  check(controller!.interval === 15 && controller!.inbox.pending.length === 0 && tasks.length === 1, "Restart persistence failed");

  const beforeWake = notificationCalls;
  const actualNow = Date.now;
  try {
    Date.now = () => actualNow() + 16 * 60_000;
    await act(async () => { window.dispatchEvent(new Event("focus")); }); await settle();
    check(notificationCalls === beforeWake + 1, "Waking did not trigger an overdue inbox refresh");
    check(JSON.stringify(tasks) === beforeRestart && writes.length === 0, "Wake synced imported tasks");
  } finally { Date.now = actualNow; }

  await edit({ title: "Keep this local task" });
  const previousWrites = writes.length;
  accountId = 99;
  await act(async () => { await emit("github-connection-changed"); }); await settle();
  check(writes.length === previousWrites, "Another account wrote Alice's linked task");
  check(controller!.notificationsContext.account?.id === 99 && controller!.notificationsContext.notifications.length === 2, "Account switch retained the old inbox decisions");
  await act(async () => { await controller.disconnect(); }); await settle();
  check(!controller!.account && tasks.length === 1, "Disconnect removed tasks");
  check(!controller!.notificationsContext.available && controller!.notificationsContext.notifications.length === 0, "Disconnected agent snapshot leaked cached notifications");
  document.getElementById("result")!.textContent = "PASS: notification refresh, ignore, import retries and deduplication, issue/PR sync disabled in both directions, interval/restart persistence, account isolation, wake scheduling, badge contrast, disconnect.";
  } else document.getElementById("result")!.textContent = "Synthetic UI preview — no live GitHub account or credentials.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`;
  console.error(error);
} finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
