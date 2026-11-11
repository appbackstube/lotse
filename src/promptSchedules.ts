import { invoke } from "@tauri-apps/api/core";
import type { RepositoryTask } from "./types";
import type { QueuedChatMessage } from "./chatQueue";

export type ScheduledRun = {
  id: string; scheduledAt: number; startedAt: number; finishedAt: number | null;
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted"; error: string | null;
};
export type PromptSchedule = {
  id: string; repositoryRoot: string; taskId: string; title: string; prompt: string;
  runAt: number; intervalMinutes: number | null; enabled: boolean; nextRunAt: number | null;
  runNowRequested: boolean; pauseReason: string | null; latestRun: ScheduledRun | null;
};

export function scheduleDue(schedule: PromptSchedule, now: number): boolean {
  return schedule.latestRun?.status !== "running" && (schedule.runNowRequested || schedule.enabled && schedule.nextRunAt !== null && schedule.nextRunAt <= now);
}

export function scheduleBlockReason(task: RepositoryTask | undefined, busy: boolean, queued: boolean): string | null {
  if (!task) return "Task no longer exists in this repository.";
  if (task.completed) return "Task is Done. Reopen it before resuming its schedules.";
  if (queued) return "Waiting for queued messages";
  if (busy) return "Waiting for the task to become idle";
  return null;
}

export function scheduledMessage(schedule: PromptSchedule, task: RepositoryTask): QueuedChatMessage {
  if (!schedule.latestRun || schedule.latestRun.status !== "running") throw new Error("Schedule has not been claimed");
  return { id: schedule.latestRun.id, body: schedule.prompt, context: { mode: "auto", attachments: [] }, selection: null,
    mode: task.chatMode, model: task.chatModel, effort: task.chatEffort };
}

export async function finishSchedule(schedule: Pick<PromptSchedule, "id" | "latestRun">, status: Exclude<ScheduledRun["status"], "running">, error: string | null = null): Promise<void> {
  if (schedule.latestRun) await invoke("scheduler_finish", { id: schedule.id, occurrenceId: schedule.latestRun.id, status, error });
}

export function scheduleInterval(minutes: number | null): string {
  if (minutes === null) return "One-time";
  const unit = minutes % 1440 === 0 ? "day" : minutes % 60 === 0 ? "hour" : "minute";
  const count = minutes / (unit === "day" ? 1440 : unit === "hour" ? 60 : 1);
  return `Every ${count} ${unit}${count === 1 ? "" : "s"}`;
}
