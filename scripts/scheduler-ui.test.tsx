// Open /scripts/scheduler-ui.html through Vite. All IPC and runs are synthetic.
import React, { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { emit } from "@tauri-apps/api/event";
import { PromptScheduler } from "../src/components/PromptScheduler";
import { usePromptScheduler, type PromptSchedulerController } from "../src/usePromptScheduler";
import { finishSchedule, scheduleDue, type PromptSchedule } from "../src/promptSchedules";
import { normalizeTask, saveTasks } from "../src/tasks";
import { initializeFileStore } from "../src/fileStore";
import type { QueuedChatMessage } from "../src/chatQueue";
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
const task = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Check the release build", chatMode: "plan", attachments: [{ kind: "image", path: "/synthetic/draft.png", name: "draft.png" }] })!;
const makeSchedule = (id: string, changes: Partial<PromptSchedule> = {}): PromptSchedule => ({ id, repositoryRoot: "/repo", taskId: task.id, title: `Check ${id}`, prompt: "Check the build and report any failures.\nKeep the result in this task.", runAt: Date.now() + 3600_000, intervalMinutes: 60, enabled: true, nextRunAt: Date.now() + 3600_000, runNowRequested: false, pauseReason: null, latestRun: null, ...changes });
let saved = [makeSchedule("build"), makeSchedule("tests", { intervalMinutes: null })];
const storage: Record<string, string> = {};
const sends: QueuedChatMessage[] = [];
let root = "/repo";
let failSend = false;
let holdClaim = false;
let releaseClaim: (() => void) | undefined;
let tasks = [task];
mockWindows("main");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "scheduler_list") {
    for (const s of saved.filter((s) => s.repositoryRoot === root)) {
      const target = tasks.find((t) => t.id === s.taskId);
      if (!target || target.completed) { s.enabled = false; s.runNowRequested = false; s.pauseReason = target ? "Task is Done" : "Task no longer exists"; }
    }
    return structuredClone(saved.filter((s) => s.repositoryRoot === root));
  }
  const s = saved.find((s) => s.id === (args.id ?? args.arguments?.id));
  if (command === "scheduler_claim") {
    if (!s || !scheduleDue(s, Date.now())) return null;
    s.latestRun = { id: crypto.randomUUID(), scheduledAt: s.nextRunAt ?? Date.now(), startedAt: Date.now(), finishedAt: null, status: "running", error: null };
    s.runNowRequested = false;
    const result = structuredClone(s);
    if (holdClaim) await new Promise<void>((resolve) => { releaseClaim = resolve; });
    return result;
  }
  if (command === "scheduler_finish") {
    if (s?.latestRun?.id === args.occurrenceId && s.latestRun.status === "running") {
      s.latestRun.status = args.status; s.latestRun.error = args.error; s.latestRun.finishedAt = Date.now();
      if (args.status === "completed") { s.nextRunAt = s.intervalMinutes ? Date.now() + s.intervalMinutes * 60_000 : null; if (s.nextRunAt === null) s.enabled = false; }
      else { s.enabled = false; s.pauseReason = `Run ${args.status}`; }
    }
    return;
  }
  if (command === "scheduler_update") { if (s) { s.enabled = args.arguments.enabled; s.pauseReason = s.enabled ? null : "Paused"; } return; }
  if (command === "scheduler_run_now") { if (s) s.runNowRequested = true; return; }
  if (command === "scheduler_delete") { saved = saved.filter((entry) => entry.id !== args.id); return; }
  throw new Error(`Unexpected IPC: ${command}`);
}, { shouldMockEvents: true });

let controller: PromptSchedulerController;
let setBusy: React.Dispatch<React.SetStateAction<boolean>>;
let setQueued: React.Dispatch<React.SetStateAction<boolean>>;
let setTasks: React.Dispatch<React.SetStateAction<RepositoryTask[]>>;
let remount: () => void;
let openedTask = "";
function Fixture() {
  const [value, changeTasks] = useState([task]);
  const [busy, changeBusy] = useState(false);
  const [queued, changeQueued] = useState(false);
  tasks = value; setTasks = changeTasks; setBusy = changeBusy; setQueued = changeQueued;
  useEffect(() => saveTasks(root, value), [value]);
  controller = usePromptScheduler({ rootPath: root, ready: true, tasks: value, activity: `${busy}:${queued}`, busy: () => busy, queued: () => queued,
    send: async (_task, item, schedule) => {
      sends.push(item);
      if (failSend) return false;
      await finishSchedule(schedule, "completed");
      return true;
    } });
  return <main className="ios-app min-h-screen p-8"><header className="flex items-center gap-3"><h1>Tasks</h1><PromptScheduler scheduler={controller} tasks={value} onOpenTask={(task) => { openedTask = task.id; }} /></header><p className="mt-8">Synthetic workspace view — task scheduler stays active here.</p><textarea aria-label="Task draft" defaultValue="Keep my unfinished prompt" /></main>;
}
function App() {
  const [version, setVersion] = useState(0); remount = () => setVersion((v) => v + 1);
  return <Fixture key={version} />;
}
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const refresh = async () => { await act(async () => { await controller.refresh(); }); await settle(); };
const click = async (label: string) => { const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`); check(button, `Missing ${label}`); await act(async () => { button!.click(); }); await settle(); };

try {
  await initializeFileStore();
  await act(async () => { (fixtureRoot = createRoot(document.getElementById("root")!)).render(<App />); });
  await settle();
  await click("Scheduled prompts (2)");
  check(document.querySelector(".github-inbox-popover"), "Popover did not open");
  const badge = getComputedStyle(document.querySelector(".github-inbox-count")!);
  check(badge.color !== badge.backgroundColor, "Badge lacks contrast");
  if (!preview) {
    await click("Pause Check build");
    check(!saved[0].enabled, "Pause did not persist");
    await click("Resume Check build");
    check(saved[0].enabled, "Resume did not persist");
    await act(async () => { setBusy(true); }); await settle();
    saved[0].nextRunAt = Date.now() - 3600_000;
    await refresh(); check(sends.length === 0, "Busy task was interrupted");
    await act(async () => { setQueued(true); setBusy(false); }); await settle();
    check(sends.length === 0, "Scheduled prompt jumped the queue");
    await act(async () => { setQueued(false); }); await settle();
    check(sends.length === 1, "Idle task did not catch up");
    await refresh(); check(sends.length === 1, "Catch-up duplicated");
    check(sends[0].selection === null && sends[0].context.attachments.length === 0, "Draft attachments leaked into schedule");
    check((document.querySelector('[aria-label="Task draft"]') as HTMLTextAreaElement).value === "Keep my unfinished prompt", "Draft changed");
    check(tasks[0].attachments.length === 1, "Pending attachments changed");
    await click("Run Check tests now");
    check(sends.length === 2 && saved[1].latestRun?.status === "completed", "Run now failed");
    failSend = true;
    await click("Run Check build now");
    check(!saved[0].enabled && saved[0].latestRun?.status === "failed", "Startup failure did not pause");
    failSend = false;
    await act(async () => { setTasks((items) => items.map((t) => ({ ...t, completed: true }))); }); await refresh();
    check(saved.every((s) => !s.enabled), "Done task schedules stayed enabled");
    check(document.querySelector<HTMLButtonElement>('[aria-label="Resume Check build"]')!.disabled, "Done task can resume");
    await act(async () => { setTasks([task]); }); await settle();
    // Closing/reopening a controller retains the durable schedule and catches up once.
    saved[0].enabled = true; saved[0].nextRunAt = Date.now() - 60_000;
    const before = sends.length;
    await act(async () => { remount(); }); await settle();
    check(sends.length === before + 1, "Reopening did not catch up");
    await refresh(); check(sends.length === before + 1, "Reopen replayed multiple occurrences");
    root = "/other";
    await act(async () => { remount(); }); await settle();
    check(controller.schedules.length === 0, "Repository schedules leaked across windows");
    root = "/repo";
    await act(async () => { remount(); }); await settle();
    // An IPC claim returning after a repository switch must never dispatch into it.
    holdClaim = true; saved[0].nextRunAt = Date.now() - 1;
    const countBeforeSwitch = sends.length;
    await act(async () => { void controller.refresh(); }); await settle();
    check(releaseClaim, "Delayed claim was not started");
    root = "/other";
    await act(async () => { remount(); }); await settle();
    await act(async () => { releaseClaim!(); }); await settle();
    check(sends.length === countBeforeSwitch, "Delayed claim dispatched in the wrong repository");
    check(saved[0].latestRun?.status === "interrupted", "Abandoned claim was not paused");
    holdClaim = false; root = "/repo";
    await act(async () => { remount(); }); await settle();
    await click(`Scheduled prompts (${saved.filter((s) => s.enabled).length})`);
  }
  const viewAll = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "View all")!;
  await act(async () => { viewAll.click(); }); await settle();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
  check(document.querySelector('[role="dialog"] .scheduler-prompt'), "Modal omitted full prompt");
  const bounds = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
  check(bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.top >= -1 && bounds.bottom <= innerHeight + 1, "Modal extends outside the viewport");
  check(document.querySelector('[aria-label="Filter schedules by task"]'), "Missing task filter");
  if (!preview) {
    await click("Delete Check tests");
    check(saved.length === 1, "Delete failed");
    const title = document.querySelector<HTMLButtonElement>(".scheduler-modal .github-inbox-title")!;
    await act(async () => { title.click(); }); await settle();
    check(openedTask === task.id, "Task navigation failed");
  }
  document.getElementById("result")!.textContent = preview ? "Synthetic scheduler preview — no live agents." : "PASS: badge, controls, idle/queue deferral, catch-up, isolated message, failure pause, Done guard, reopening, repository isolation, delayed claim guard, modal, delete, task navigation.";
} catch (error) { document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`; } finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
