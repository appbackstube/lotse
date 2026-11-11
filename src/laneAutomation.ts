import { taskBoardStatus, taskStartSelected, type TaskBoardStatus } from "./tasks.ts";
import type { RepositoryTask } from "./types.ts";
import type { QueuedChatMessage } from "./chatQueue.ts";

export const laneStatuses: TaskBoardStatus[] = ["inbox", "clear", "inProgress", "inReview", "done"];
export type LaneConfig = { enabled: boolean; prompt: string; baseBranch: string; baseKind: "branch" | "remote"; workers: number };
export type LaneAttempt = { id: string; taskId: string; status: "running" | "processed" | "failed" | "interrupted" | "held"; error: string | null };
export type LaneState = LaneConfig & { attempts: Record<string, LaneAttempt> };
export type LaneAutomations = Record<TaskBoardStatus, LaneState>;
export type LaneRun = { root: string; lane: TaskBoardStatus; id: string; taskId: string };
export const laneStorageKey = (root: string) => `chaoticreview.lane-automation:${root}`;
export const emptyLane = (): LaneState => ({ enabled: false, prompt: "", baseBranch: "", baseKind: "branch", workers: 1, attempts: {} });

export function laneConfigError(config: LaneConfig): string | null {
  if (config.prompt.length > 20_000) return "Use a prompt of up to 20,000 characters.";
  if (!Number.isSafeInteger(config.workers) || config.workers < 1) return "Workers must be a positive whole number.";
  if (config.baseKind !== "branch" && config.baseKind !== "remote") return "Choose a local or remote base branch.";
  if (config.enabled && (!config.prompt.trim() || !config.baseBranch.trim())) return "Choose a base branch and enter a prompt before enabling automation.";
  return null;
}

export function readLaneAutomations(raw: string | null, recover = false): LaneAutomations {
  const stored = JSON.parse(raw ?? "{}");
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) throw new Error("Invalid lane automation storage.");
  return Object.fromEntries(laneStatuses.map((status) => {
    const lane = stored[status] ?? emptyLane();
    if (typeof lane.enabled !== "boolean" || typeof lane.prompt !== "string" || typeof lane.baseBranch !== "string" || laneConfigError(lane)
      || !lane.attempts || typeof lane.attempts !== "object" || Array.isArray(lane.attempts)) throw new Error("Invalid lane automation configuration.");
    const attempts = Object.fromEntries(Object.entries(lane.attempts).map(([taskId, value]) => {
      const attempt = value as LaneAttempt;
      if (!attempt || typeof attempt.id !== "string" || attempt.taskId !== taskId || !["running", "processed", "failed", "interrupted", "held"].includes(attempt.status)
        || (attempt.error !== null && typeof attempt.error !== "string")) throw new Error("Invalid lane processing record.");
      return [taskId, recover && attempt.status === "running" ? { ...attempt, status: "interrupted", error: "The previous run was interrupted. Inspect the task before retrying." } : attempt];
    }));
    return [status, { ...lane, attempts }];
  })) as LaneAutomations;
}

export function laneCandidates(tasks: RepositoryTask[], status: TaskBoardStatus, lane: LaneState, busy: (task: RepositoryTask) => boolean): RepositoryTask[] {
  if (!lane.enabled || laneConfigError(lane)) return [];
  const available = lane.workers - Object.values(lane.attempts).filter((attempt) => attempt.status === "running").length;
  return tasks.filter((task) => taskBoardStatus(task) === status && !lane.attempts[task.id] && !busy(task)).slice(0, Math.max(0, available));
}

export function laneTask(task: RepositoryTask, lane: LaneConfig): RepositoryTask {
  return task.location === "worktree" && !task.started && !task.agentThreadId && !task.worktree && !taskStartSelected(task.worktreeStart)
    ? { ...task, worktreeStart: { kind: lane.baseKind, branch: lane.baseBranch } } : task;
}

export function laneMessage(task: RepositoryTask, lane: LaneConfig, id: string): QueuedChatMessage {
  return { id, body: lane.prompt.trim(), mode: "default", model: task.chatModel, effort: task.chatEffort, selection: null, context: { mode: "auto", attachments: [] } };
}

export function finishLaneAttempt(lanes: LaneAutomations, run: LaneRun, status: LaneAttempt["status"], error: string | null): LaneAutomations {
  const lane = lanes[run.lane];
  if (lane.attempts[run.taskId]?.id !== run.id || lane.attempts[run.taskId]?.status !== "running") return lanes;
  return { ...lanes, [run.lane]: { ...lane, attempts: { ...lane.attempts, [run.taskId]: { id: run.id, taskId: run.taskId, status, error } } } };
}

export function holdLaneTask(lanes: LaneAutomations, status: TaskBoardStatus, taskId: string, id: string): LaneAutomations {
  const lane = lanes[status];
  if (!lane.enabled || lane.attempts[taskId]) return lanes;
  return { ...lanes, [status]: { ...lane, attempts: { ...lane.attempts, [taskId]: { id, taskId, status: "held", error: "Created or moved by the task assistant. Start explicitly or approve a lane retry to run it." } } } };
}
