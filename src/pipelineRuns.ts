import { fileStore } from "./fileStore.ts";
import type { QueuedChatMessage } from "./chatQueue.ts";

export type PipelineRunStatus = "pending" | "running" | "needsInput" | "needsApproval" | "paused" | "completed" | "failed" | "cancelled";
type MessageStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type PipelineRun = {
  runId: string; taskId: string; pipelineId: string; title: string; createdAt: number; updatedAt: number;
  stopRequested: boolean; error: string | null;
  messages: { messageId: string; stepIndex: number; position: number; status: MessageStatus; resultIds: string[] }[];
};
const storageKey = (key: string) => `chaoticreview.pipeline-runs:${key}`;
export function loadPipelineRuns(key: string): PipelineRun[] {
  try {
    const value: unknown = JSON.parse(fileStore.getItem(storageKey(key)) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((run): run is PipelineRun => !!run && typeof run.runId === "string" && typeof run.taskId === "string"
      && typeof run.pipelineId === "string" && typeof run.title === "string" && typeof run.createdAt === "number" && typeof run.updatedAt === "number"
      && typeof run.stopRequested === "boolean" && (run.error === null || typeof run.error === "string")
      && Array.isArray(run.messages) && run.messages.length > 0 && run.messages.length <= 2500 && run.messages.every((m: PipelineRun["messages"][number]) =>
        !!m && typeof m.messageId === "string" && Number.isInteger(m.stepIndex) && Number.isInteger(m.position)
        && ["pending", "running", "completed", "failed", "cancelled"].includes(m.status) && Array.isArray(m.resultIds) && m.resultIds.every((id) => typeof id === "string")));
  } catch { return []; }
}
export function removePipelineRuns(key: string): void {
  fileStore.removeItem(storageKey(key));
}
export function savePipelineRun(key: string, run: PipelineRun): void {
  // Only the latest 20 runs per task are retained, including the current run.
  const runs = [...loadPipelineRuns(key).filter((entry) => entry.runId !== run.runId), run];
  fileStore.setJSON(storageKey(key), runs.sort((a, b) => a.createdAt - b.createdAt).slice(-20));
}
export function newPipelineRun(taskId: string, pipelineId: string, items: QueuedChatMessage[]): PipelineRun {
  return { runId: items[0].pipeline!.runId, taskId, pipelineId, title: items[0].pipeline!.title,
    createdAt: Date.now(), updatedAt: Date.now(), stopRequested: false, error: null,
    messages: items.map((item) => ({ messageId: item.id, stepIndex: item.pipeline!.stepIndex, position: item.pipeline!.position, status: "pending", resultIds: [] })) };
}
export function updatePipelineMessage(key: string, runId: string, messageId: string, status: MessageStatus, error: string | null = null, resultIds: string[] = []): void {
  const run = loadPipelineRuns(key).find((run) => run.runId === runId);
  if (!run) return; // Old UI queues can predate run tracking.
  savePipelineRun(key, { ...run, updatedAt: Date.now(), error,
    messages: run.messages.map((m) => m.messageId === messageId ? { ...m, status, resultIds } : m) });
}
export function observePipelineRun(run: PipelineRun, state: { activeMessageId?: string; starting: boolean; paused: boolean; queueIds: string[]; input?: unknown; approval?: unknown }) {
  const active = run.messages.find((m) => m.messageId === state.activeMessageId);
  const pending = run.messages.find((m) => m.status !== "completed");
  const queued = run.messages.some((m) => state.queueIds.includes(m.messageId));
  const status: PipelineRunStatus = active ? state.approval ? "needsApproval" : state.input ? "needsInput" : "running"
    : !pending ? "completed" : state.starting ? "pending"
    : run.stopRequested ? run.messages.some((m) => m.status === "running") ? "paused" : "cancelled"
    : pending.status === "failed" ? "failed" : pending.status === "cancelled" ? "cancelled"
    : state.paused || !queued || pending.status === "running" ? "paused" : "pending";
  return { ...run, status, completedMessages: run.messages.filter((m) => m.status === "completed").length, totalMessages: run.messages.length,
    currentMessageId: active?.messageId ?? pending?.messageId ?? null, stepIndex: active?.stepIndex ?? pending?.stepIndex ?? null,
    queuePaused: state.paused, question: active ? state.input ?? null : null, approval: active ? state.approval ?? null : null };
}
