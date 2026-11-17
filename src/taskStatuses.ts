import { fileStore } from "./fileStore.ts";
import type { RepositoryTask } from "./types";

export type TaskStatus = { id: string; label: string };
export type TaskStatusSettings = { statuses: TaskStatus[]; defaultStatus: string; replacements: Record<string, string> };
export const taskStatusStorageKey = (root: string) => `chaoticreview.task-statuses:${root}`;
export const defaultTaskStatuses: TaskStatusSettings = {
  statuses: [
    { id: "inbox", label: "Inbox" },
    { id: "clear", label: "Planning" },
    { id: "inProgress", label: "In development" },
    { id: "inReview", label: "In review" },
    { id: "done", label: "Done" },
  ],
  defaultStatus: "inbox",
  replacements: {},
};

export function validateTaskStatuses(settings: TaskStatusSettings): void {
  const { statuses, defaultStatus, replacements } = settings;
  if (!Array.isArray(statuses) || statuses.length < 2 || !statuses.some((status) => status.id === "done")) throw new Error("Keep a completed status and at least one other status.");
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const status of statuses) {
    if (typeof status.id !== "string" || !/^[\w-]{1,100}$/.test(status.id) || ids.has(status.id)) throw new Error("Status IDs must be unique.");
    const label = typeof status.label === "string" ? status.label.trim() : "";
    if (!label || label.length > 80 || labels.has(label.toLowerCase())) throw new Error("Status names must be unique, non-empty and at most 80 characters.");
    ids.add(status.id); labels.add(label.toLowerCase());
  }
  if (!ids.has(defaultStatus)) throw new Error("Choose an existing default status.");
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)
    || Object.entries(replacements).some(([id, target]) => ids.has(id) || !ids.has(target))) throw new Error("Invalid status replacements.");
}

export function loadTaskStatuses(root?: string | null): TaskStatusSettings {
  try {
    const saved = root ? fileStore.getItem(taskStatusStorageKey(root)) : null;
    if (!saved) return defaultTaskStatuses;
    const settings: TaskStatusSettings = JSON.parse(saved);
    validateTaskStatuses(settings);
    return settings;
  } catch { return defaultTaskStatuses; }
}

export function saveTaskStatuses(root: string, settings: TaskStatusSettings): void {
  validateTaskStatuses(settings);
  fileStore.setJSON(taskStatusStorageKey(root), settings);
}

export function resolveTaskStatus(settings: TaskStatusSettings, status: string): string {
  return settings.statuses.some((item) => item.id === status) ? status
    : Object.prototype.hasOwnProperty.call(settings.replacements, status) ? settings.replacements[status] : settings.defaultStatus;
}

export function taskStatusFields(status: string): Pick<RepositoryTask, "manualStatus" | "completed"> {
  return { completed: status === "done", manualStatus: status === "clear" || status === "done" ? null : status };
}

export function reconcileTaskStatuses(tasks: RepositoryTask[], settings: TaskStatusSettings): RepositoryTask[] {
  return tasks.map((task) => {
    const status = task.completed ? "done" : task.manualStatus ?? "clear";
    const resolved = resolveTaskStatus(settings, status);
    return resolved === status ? task : { ...task, ...taskStatusFields(resolved), planReady: false };
  });
}

export function deleteTaskStatus(settings: TaskStatusSettings, id: string, replacement: string): TaskStatusSettings {
  if (id === "done") throw new Error("Completed tasks need this status. You can rename or reorder it.");
  if (id === replacement || !settings.statuses.some((status) => status.id === id) || !settings.statuses.some((status) => status.id === replacement)) throw new Error("Choose another status for these tasks.");
  const next = {
    statuses: settings.statuses.filter((status) => status.id !== id),
    defaultStatus: settings.defaultStatus === id ? replacement : settings.defaultStatus,
    replacements: { ...Object.fromEntries(Object.entries(settings.replacements).map(([key, value]) => [key, value === id ? replacement : value])), [id]: replacement },
  };
  validateTaskStatuses(next);
  return next;
}
