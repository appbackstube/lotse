import type { RepositoryTask, TaskCustomField } from "./types.ts";
import { moveTask, reparentTask, taskBoardStatus, taskColors, taskSubtreeIds } from "./tasks.ts";
import { laneStatuses } from "./laneAutomation.ts";
import { normalizeTaskDate } from "./taskSchedule.ts";

export const metadataKeys = ["title", "description", "status", "parentId", "position", "color", "startDate", "deadline", "customFields"];
export function argumentsFor(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) throw new Error("Invalid or unknown tool arguments.");
  return value as Record<string, unknown>;
}
export function requiredText(value: unknown, name: string, maximum = 20_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`${name} must be nonempty and at most ${maximum} characters.`);
  return value.trim();
}
export function getTask(tasks: RepositoryTask[], id: unknown): RepositoryTask {
  const task = tasks.find((task) => task.id === id);
  if (!task) throw new Error("Task not found. Read tasks again.");
  return task;
}
export function taskMetadata(tasks: RepositoryTask[], original: RepositoryTask, args: Record<string, unknown>, fields: TaskCustomField[]): RepositoryTask[] {
  let task = { ...original, customFields: { ...original.customFields } };
  if ("title" in args) task.title = requiredText(args.title, "Title", 500);
  if ("description" in args) { if (typeof args.description !== "string" || args.description.length > 20_000) throw new Error("Description must be at most 20,000 characters."); task.description = args.description; }
  if ("color" in args) { if (!taskColors.some((color) => color.value === args.color)) throw new Error("Invalid task color."); task.color = args.color as RepositoryTask["color"]; }
  if ("status" in args) {
    if (!laneStatuses.includes(args.status as typeof laneStatuses[number])) throw new Error("Invalid task status.");
    task = { ...task, completed: args.status === "done", manualStatus: args.status === "inbox" || args.status === "inProgress" || args.status === "inReview" ? args.status : null, planReady: false };
  }
  for (const key of ["startDate", "deadline"] as const) if (key in args) {
    if (args[key] !== null && !normalizeTaskDate(args[key])) throw new Error("Dates must be valid YYYY-MM-DD values or null.");
    task[key] = args[key] as string | null;
  }
  if (task.startDate && task.deadline && task.startDate > task.deadline) throw new Error("Deadline must be on or after the start date.");
  if ("customFields" in args) {
    const values = argumentsFor(args.customFields, fields.map((field) => field.id));
    for (const [id, value] of Object.entries(values)) {
      const field = fields.find((field) => field.id === id)!;
      if (value === null) delete task.customFields[id];
      else {
        if (typeof value !== "string" || !value.trim() || value.length > 5000 || (field.type === "select" && !field.options.some((option) => option.id === value))
          || (field.type === "text" && !field.multiline && /[\r\n\u2028\u2029]/.test(value))) throw new Error(`Invalid value for ${field.name}.`);
        task.customFields[id] = value;
      }
    }
  }
  let next = tasks.map((entry) => entry.id === task.id ? task : entry);
  if ("parentId" in args) {
    if (args.parentId !== null && (typeof args.parentId !== "string" || !next.some((entry) => entry.id === args.parentId) || taskSubtreeIds(next, [task.id]).has(args.parentId))) throw new Error("Invalid parent or cyclic task hierarchy.");
    next = reparentTask(next, task.id, args.parentId as string | null);
  }
  if ("position" in args) {
    const current = getTask(next, task.id);
    const siblings = next.filter((entry) => entry.id !== task.id && entry.parentId === current.parentId);
    const position = args.position as number;
    if (!Number.isSafeInteger(position) || position < 0 || position > siblings.length) throw new Error("Position is outside the sibling list.");
    const target = siblings[Math.min(position, siblings.length - 1)];
    if (target) next = moveTask(next, task.id, target.id, position === siblings.length ? "after" : "before");
  }
  return next;
}
export function taskSummary(task: RepositoryTask) {
  return { id: task.id, url: `#task=${task.id}`, createdAt: task.createdAt, updatedAt: task.updatedAt, title: task.title, description: task.description, status: taskBoardStatus(task), parentId: task.parentId, color: task.color,
    startDate: task.startDate, deadline: task.deadline, customFields: task.customFields, location: task.location, newBranchName: task.newBranchName ?? null, worktreeStart: task.worktreeStart, started: task.started };
}
export function taskObservation(task: RepositoryTask, state: { starting?: boolean; running?: boolean; approvalId?: number; inputId?: number; queueIds: string[]; queuePaused?: boolean }) {
  const user = [...task.chatMessages].reverse().find((entry) => entry.role === "user");
  const userIndex = user ? task.chatMessages.indexOf(user) : -1;
  const result = task.chatMessages.slice(userIndex + 1).filter((entry) => entry.role === "assistant").map((entry) => entry.body).join("\n");
  const messageId = user?.id ?? state.queueIds[state.queueIds.length - 1] ?? null;
  const status = state.approvalId !== undefined ? "needsApproval" : state.inputId !== undefined ? "needsInput" : state.running ? "running" : state.starting ? "starting"
    : user?.runStatus ? user.runStatus === "running" ? "interrupted" : user.runStatus : result ? "completed" : user ? "interrupted" : "idle";
  const outcomes = task.chatMessages.flatMap((entry, index) => {
    if (entry.role !== "user" || entry.id === messageId || !entry.runStatus || entry.runStatus === "running") return [];
    const next = task.chatMessages.findIndex((candidate, position) => position > index && candidate.role === "user");
    const result = entry.runError ?? task.chatMessages.slice(index + 1, next < 0 ? undefined : next).filter((candidate) => candidate.role === "assistant").map((candidate) => candidate.body).join("\n");
    return [{ messageId: entry.id, status: entry.runStatus, startedAt: Date.parse(entry.createdAt), result: result.slice(-20_000) }];
  });
  return { taskId: task.id, title: task.title, messageId, outcomes, startedAt: user ? Date.parse(user.createdAt) : 0, queuedMessageIds: state.queueIds, queuePaused: state.queuePaused === true, status, attentionId: state.approvalId ?? state.inputId ?? null, result: (user?.runError ?? result).slice(-20_000) };
}

export function taskStartPoint(value: unknown, branches: string[], remoteBranches: string[]): NonNullable<RepositoryTask["worktreeStart"]> {
  const args = argumentsFor(value, ["kind", "branch", "remote"]);
  if ("remote" in args && (args.kind !== "existing" || typeof args.remote !== "boolean")) throw new Error("Only existing branches accept a remote flag.");
  if (args.kind === "workspace") { if ("branch" in args) throw new Error("Workspace start does not accept a branch."); return { kind: "workspace" }; }
  if (args.kind !== "branch" && args.kind !== "remote" && args.kind !== "existing") throw new Error("Invalid task start kind.");
  const branch = requiredText(args.branch, "Start branch", 500);
  if (!(args.kind === "remote" || args.remote === true ? remoteBranches : branches).includes(branch)) throw new Error("Choose an available local or remote branch.");
  return { kind: args.kind, branch, ...(args.remote === true ? { remote: true } : {}) };
}
