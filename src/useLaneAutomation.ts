import { useEffect, useRef, useState } from "react";
import { fileStore } from "./fileStore";
import { finishLaneAttempt, holdLaneTask, laneCandidates, laneConfigError, laneMessage, laneStatuses, laneStorageKey, laneTask, readLaneAutomations, type LaneAutomations, type LaneConfig, type LaneRun } from "./laneAutomation";
import type { RepositoryTask } from "./types";
import { taskBoardStatus, type TaskBoardStatus } from "./tasks";
import type { QueuedChatMessage } from "./chatQueue";

type Options = {
  root: string | undefined; ready: boolean; tasks: RepositoryTask[]; activity: string;
  busy: (task: RepositoryTask) => boolean;
  send: (task: RepositoryTask, item: QueuedChatMessage, run: LaneRun) => Promise<boolean>;
};
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useLaneAutomation(options: Options) {
  const [lanes, setLanes] = useState<LaneAutomations>(() => readLaneAutomations(null));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const latest = useRef(options); latest.current = options;
  const state = useRef(lanes);
  const loadedRoot = useRef<string | undefined>(undefined);
  const processing = useRef(false);
  const blocked = useRef(false);
  const tick = useRef<() => Promise<void>>(async () => {});

  const persist = async (root: string, next: LaneAutomations) => {
    fileStore.setItem(laneStorageKey(root), JSON.stringify(next));
    if (loadedRoot.current === root) { state.current = next; setLanes(next); }
    try { await fileStore.flush(); }
    catch (error) { if (loadedRoot.current === root) { blocked.current = true; setError(message(error)); } throw error; }
  };

  const finish = async (run: LaneRun, result: "completed" | "cancelled" | "failed", reason: string | null) => {
    try {
      const current = loadedRoot.current === run.root ? state.current : readLaneAutomations(fileStore.getItem(laneStorageKey(run.root)));
      await persist(run.root, finishLaneAttempt(current, run, result === "completed" ? "processed" : result === "cancelled" ? "interrupted" : "failed", reason ?? (result === "cancelled" ? "Run cancelled. Inspect the task before retrying." : null)));
    } catch (error) { setError(message(error)); }
  };

  tick.current = async () => {
    const root = latest.current.root;
    if (processing.current || blocked.current || saving || !root || loadedRoot.current !== root || !latest.current.ready) return;
    processing.current = true;
    const active = () => latest.current.root === root && loadedRoot.current === root && latest.current.ready && !blocked.current;
    try {
      for (const status of laneStatuses) {
        while (active()) {
          const current = latest.current;
          const lane = state.current[status];
          const task = laneCandidates(current.tasks, status, lane, current.busy)[0];
          if (!task) break;
          const run: LaneRun = { root, lane: status, id: crypto.randomUUID(), taskId: task.id };
          await persist(root, { ...state.current, [status]: { ...lane, attempts: { ...lane.attempts, [task.id]: { id: run.id, taskId: task.id, status: "running", error: null } } } });
          const next = latest.current;
          const fresh = next.tasks.find((item) => item.id === task.id);
          const currentLane = state.current[status];
          if (!active() || !currentLane.enabled || !fresh || next.busy(fresh) || taskBoardStatus(fresh) !== status
            || Object.values(currentLane.attempts).filter((attempt) => attempt.status === "running").length > currentLane.workers) {
            const current = loadedRoot.current === root ? state.current : readLaneAutomations(fileStore.getItem(laneStorageKey(root)));
            const attempts = { ...current[status].attempts }; delete attempts[task.id];
            await persist(root, { ...current, [status]: { ...current[status], attempts } });
            break;
          }
          try {
            const accepted = await next.send(laneTask(fresh, currentLane), laneMessage(fresh, currentLane, run.id), run);
            if (!accepted) await finish(run, "failed", "The agent could not start. Check the task error before retrying.");
          } catch (error) { await finish(run, "failed", message(error)); }
        }
      }
    } catch (error) { if (active()) setError(message(error)); }
    finally { processing.current = false; }
  };

  useEffect(() => {
    loadedRoot.current = undefined; blocked.current = false; setError("");
    if (!options.root || !options.ready) { state.current = readLaneAutomations(null); setLanes(state.current); return; }
    try {
      const next = readLaneAutomations(fileStore.getItem(laneStorageKey(options.root)), true);
      loadedRoot.current = options.root;
      void persist(options.root, next).then(() => tick.current()).catch(() => {});
    } catch (error) { blocked.current = true; setError(message(error)); }
    return () => { loadedRoot.current = undefined; };
  }, [options.root, options.ready]);

  useEffect(() => { void tick.current(); }, [options.tasks, options.activity, lanes, saving]);
  useEffect(() => { const timer = window.setInterval(() => void tick.current(), 1000); return () => window.clearInterval(timer); }, []);

  const save = async (status: TaskBoardStatus, config: LaneConfig) => {
    const root = latest.current.root;
    if (!root || loadedRoot.current !== root || blocked.current || saving) return false;
    const invalid = laneConfigError(config);
    if (invalid) { setError(invalid); return false; }
    setSaving(true); setError("");
    try {
      const { enabled, prompt, baseBranch, baseKind, workers } = config;
      await persist(root, { ...state.current, [status]: { ...state.current[status], enabled, prompt: prompt.trim(), baseBranch, baseKind, workers } });
      return true;
    }
    catch (error) { setError(message(error)); return false; }
    finally { setSaving(false); }
  };

  const retry = async (status: TaskBoardStatus, taskId: string) => {
    const lane = state.current[status];
    if (!latest.current.root || blocked.current || lane.attempts[taskId]?.status === "running") return false;
    const attempts = { ...lane.attempts }; delete attempts[taskId];
    try { await persist(latest.current.root, { ...state.current, [status]: { ...lane, attempts } }); await tick.current(); return true; }
    catch (error) { setError(message(error)); return false; }
  };

  const hold = async (status: TaskBoardStatus, taskId: string, id: string) => {
    const root = latest.current.root;
    if (!root || loadedRoot.current !== root || blocked.current) return false;
    try { await persist(root, holdLaneTask(state.current, status, taskId, id)); return true; }
    catch (error) { setError(message(error)); return false; }
  };

  return { lanes, error, saving, ready: options.ready && loadedRoot.current === options.root && !blocked.current, save, retry, finish, hold };
}

export type LaneAutomationController = ReturnType<typeof useLaneAutomation>;
