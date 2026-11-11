export const pomodoroSettingsKey = "chaoticreview.pomodoro-settings";
export const defaultPomodoroSettings = { focus: 25, shortBreak: 5, longBreak: 15, sessionsBeforeLongBreak: 4 };
export type PomodoroSettings = typeof defaultPomodoroSettings;
export type PomodoroPhase = "focus" | "shortBreak" | "longBreak";
export const pomodoroLabels: Record<PomodoroPhase, string> = { focus: "Focus", shortBreak: "Short break", longBreak: "Long break" };

export function normalizePomodoroSettings(value: unknown): PomodoroSettings {
  const settings = { ...defaultPomodoroSettings };
  if (!value || typeof value !== "object") return settings;
  for (const key of Object.keys(settings) as (keyof PomodoroSettings)[]) {
    const number = (value as Record<string, unknown>)[key];
    if (typeof number === "number" && Number.isInteger(number) && number >= 1 && number <= (key === "sessionsBeforeLongBreak" ? 12 : 180)) settings[key] = number;
  }
  return settings;
}

export type PomodoroTimerState = { phase: PomodoroPhase; completed: number; remainingMs: number; endsAt: number | null };
export type PomodoroAction = "start" | "pause" | "reset" | "skip" | "tick";

export function createPomodoro(settings: PomodoroSettings): PomodoroTimerState {
  return { phase: "focus", completed: 0, remainingMs: settings.focus * 60_000, endsAt: null };
}

export function pomodoroRemaining(timer: PomodoroTimerState, now: number): number {
  return timer.endsAt === null ? timer.remainingMs : Math.max(0, timer.endsAt - now);
}

export function updatePomodoro(timer: PomodoroTimerState, action: PomodoroAction, settings: PomodoroSettings, now: number): PomodoroTimerState {
  const remainingMs = pomodoroRemaining(timer, now);
  const finished = timer.endsAt !== null && remainingMs === 0;
  if (action === "skip" || (finished && (action === "tick" || action === "pause"))) {
    const completed = timer.completed + (timer.phase === "focus" && action !== "skip" ? 1 : 0);
    let phase: PomodoroPhase = timer.phase === "focus" ? "shortBreak" : "focus";
    if (timer.phase === "focus" && action !== "skip" && completed % settings.sessionsBeforeLongBreak === 0) phase = "longBreak";
    return { phase, completed, remainingMs: settings[phase] * 60_000, endsAt: null };
  }
  if (action === "start" && timer.endsAt === null) return { ...timer, endsAt: now + remainingMs };
  if (action === "pause") return { ...timer, remainingMs, endsAt: null };
  if (action === "reset") return { ...timer, remainingMs: settings[timer.phase] * 60_000, endsAt: null };
  return timer;
}

export function formatPomodoroTime(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
