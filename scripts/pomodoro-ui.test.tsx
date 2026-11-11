// Open /scripts/pomodoro-ui.html through Vite. Uses a synthetic clock and no native IPC.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { PomodoroProvider, PomodoroSettings, PomodoroTimer } from "../src/components/PomodoroTimer";
import { Dialog, DialogContent, DialogTitle } from "../src/components/ui/dialog";
import { defaultPomodoroSettings, type PomodoroSettings as Settings } from "../src/pomodoro";
import "../src/App.css";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const completions: string[] = [];
let showSettings: (open: boolean) => void;
let saveSettings: (settings: Settings) => void;
let hideToolbar: (hidden: boolean) => void;
let showTaskDetails: (open: boolean) => void;
function Fixture() {
  const [settings, setSettings] = useState(defaultPomodoroSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [revision, setRevision] = useState(0);
  const [taskOpen, setTaskOpen] = useState(false);
  showSettings = setSettingsOpen;
  hideToolbar = setHidden;
  showTaskDetails = setTaskOpen;
  saveSettings = (value) => { setSettings(value); setRevision((revision) => revision + 1); };
  const openSettings = () => { setTaskOpen(false); setSettingsOpen(true); };
  return <PomodoroProvider settings={settings} revision={revision} onComplete={(body) => completions.push(body)}><main className="ios-app min-h-screen bg-[var(--ios-background)] text-[var(--ios-label)]">
    <header className="ios-navigation-bar flex items-center justify-end px-3" style={hidden ? { display: "none" } : undefined}><PomodoroTimer onSettings={openSettings} /></header>
    <Dialog open={taskOpen} onOpenChange={setTaskOpen}><DialogContent className="ios-app"><DialogTitle>Task details</DialogTitle><div className="task-modal-actions"><PomodoroTimer onSettings={openSettings} /></div></DialogContent></Dialog>
    {settingsOpen && <div className="mx-auto max-w-2xl p-6"><PomodoroSettings settings={settings} onSave={saveSettings} /></div>}
  </main></PomodoroProvider>;
}
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const click = async (label: string) => {
  const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  check(button, `Missing ${label}`);
  await act(async () => button!.click()); await settle();
};
const advance = async (milliseconds: number) => {
  now += milliseconds;
  await act(async () => window.dispatchEvent(new Event("focus"))); await settle();
};
const time = () => document.querySelector('[role="timer"]')?.textContent;
const root = (fixtureRoot = createRoot(document.getElementById("root")!));
try {
  await act(async () => root.render(<Fixture />)); await settle();
  await click("Pomodoro timer: Focus, 25:00");
  check(time() === "25:00", "Initial duration");
  await click("Start Pomodoro"); await advance(90_000);
  check(time() === "23:30", "Clock-based countdown");
  await click("Pomodoro timer: Focus, 23:30, running");
  await act(async () => showTaskDetails(true)); await settle();
  const taskTrigger = document.querySelector<HTMLButtonElement>('[role="dialog"] [title="Pomodoro timer"]');
  check(taskTrigger?.getAttribute("aria-label") === "Pomodoro timer: Focus, 23:30, running", "Task timer did not share toolbar countdown");
  await act(async () => taskTrigger!.click()); await settle();
  await click("Pause Pomodoro"); await advance(300_000);
  check(time() === "23:30", "Pause from task details did not freeze time");
  check([...document.querySelectorAll('[title="Pomodoro timer"]')].every((trigger) => trigger.getAttribute("aria-label") === "Pomodoro timer: Focus, 23:30"), "Pause did not synchronize both triggers");
  await click("Start Pomodoro");
  await act(async () => showTaskDetails(false)); await settle();
  await click("Pomodoro timer: Focus, 23:30, running");
  await act(async () => { showSettings(true); hideToolbar(true); });
  await advance(60_000);
  await act(async () => { showSettings(false); hideToolbar(false); });
  check(time() === "22:30", "Timer lost state across navigation or zen mode");
  await advance(99_000_000);
  check(time() === "05:00" && completions.length === 1, "Missed completion did not prepare break and notify once");
  await click("Pomodoro timer: Short break, 05:00");
  await act(async () => showTaskDetails(true)); await settle();
  const breakTrigger = document.querySelector<HTMLButtonElement>('[role="dialog"] [title="Pomodoro timer"]');
  check(breakTrigger?.getAttribute("aria-label") === "Pomodoro timer: Short break, 05:00", "Reopening task details lost the shared phase");
  await act(async () => breakTrigger!.click()); await settle();
  await advance(99_000_000);
  check(completions.length === 1 && time() === "05:00", "Idle break continued or duplicate notification");
  await click("Start Pomodoro"); await advance(300_000);
  check(time() === "25:00" && completions.length === 2, "Break did not return to focus");
  await click("Skip Pomodoro phase");
  check(completions.length === 2, "Skip must not notify completion");
  await click("Pomodoro settings");
  check(document.querySelector('input[name="focus"]')?.getAttribute("min") === "1", "Missing duration validation");
  const form = document.querySelector("form")!;
  const focus = form.querySelector<HTMLInputElement>('[name="focus"]')!;
  focus.value = "0";
  check(!form.checkValidity(), "Zero duration accepted");
  focus.value = "30";
  await act(async () => form.requestSubmit()); await settle();
  check(document.body.textContent?.includes("Saved"), "Settings save feedback missing");
  await click("Pomodoro timer: Focus, 30:00");
  check(time() === "30:00", "Saved settings did not reset timer");
  await click("Pomodoro timer: Focus, 30:00");
  await act(async () => showTaskDetails(true)); await settle();
  const savedTrigger = document.querySelector<HTMLButtonElement>('[role="dialog"] [title="Pomodoro timer"]');
  check(savedTrigger?.getAttribute("aria-label") === "Pomodoro timer: Focus, 30:00", "Saved settings did not reset task timer");
  await act(async () => savedTrigger!.click()); await settle();
  await click("Start Pomodoro"); await advance(1000); await click("Reset Pomodoro phase");
  check(time() === "30:00" && document.querySelector('[aria-label="Start Pomodoro"]'), "Reset did not stop and restore phase");
  check([...document.querySelectorAll('[title="Pomodoro timer"]')].every((trigger) => trigger.getAttribute("aria-label") === "Pomodoro timer: Focus, 30:00"), "Reset did not synchronize both triggers");
  await click("Start Pomodoro"); await advance(1000);
  await act(async () => saveSettings({ ...defaultPomodoroSettings, focus: 30 })); await settle();
  check(time() === "30:00" && document.querySelector('[aria-label="Start Pomodoro"]'), "Saving unchanged settings did not stop and reset the shared timer");
  check(completions.length === 2, "Saving settings must not notify completion");
  document.getElementById("result")!.textContent = "Pomodoro browser checks passed";
} catch (error) {
  document.getElementById("result")!.textContent = String(error);
  console.error(error);
} finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());

  Date.now = realNow;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
}
