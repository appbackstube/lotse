import type { RepositoryTask } from "./types";

const dayMilliseconds = 86_400_000;

export function normalizeTaskDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

export function taskDateDay(value: string): number {
  return Date.parse(`${value}T00:00:00Z`) / dayMilliseconds;
}

export function taskDateFromDay(day: number): string {
  return new Date(day * dayMilliseconds).toISOString().slice(0, 10);
}

export function taskScheduleRange(task: Pick<RepositoryTask, "startDate" | "deadline">) {
  const start = normalizeTaskDate(task.startDate);
  const end = normalizeTaskDate(task.deadline);
  return start && end && start <= end ? { start: taskDateDay(start), end: taskDateDay(end) } : null;
}

export function taskGanttTimeline(tasks: Pick<RepositoryTask, "startDate" | "deadline">[], today: string) {
  const ranges = tasks.flatMap((task) => { const range = taskScheduleRange(task); return range ? [range] : []; });
  const first = ranges.reduce((day, range) => Math.min(day, range.start), Infinity);
  const last = ranges.reduce((day, range) => Math.max(day, range.end), -Infinity);
  const start = ranges.length ? Math.max(taskDateDay("0001-01-01"), first - 2) : taskDateDay(today) - 7;
  const end = Math.min(taskDateDay("9999-12-31"), ranges.length ? Math.max(last + 2, start + 13) : start + 27);
  const days = end - start + 1;
  const step = days <= 45 ? 1 : days <= 180 ? 7 : Math.ceil(days / 24);
  const ticks = Array.from({ length: Math.ceil(days / step) }, (_, index) => start + index * step);
  return { start, end, days, step, ticks };
}
