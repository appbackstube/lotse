import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fileStore } from "./fileStore";
import { finishSchedule, scheduleBlockReason, scheduleDue, scheduledMessage, type PromptSchedule } from "./promptSchedules";
import type { RepositoryTask } from "./types";
import type { QueuedChatMessage } from "./chatQueue";

type Options = {
  rootPath: string | undefined; ready: boolean; tasks: RepositoryTask[]; activity: string;
  busy: (task: RepositoryTask) => boolean; queued: (task: RepositoryTask) => boolean;
  send: (task: RepositoryTask, item: QueuedChatMessage, schedule: PromptSchedule) => Promise<boolean>;
};
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function usePromptScheduler(options: Options) {
  const [schedules, setSchedules] = useState<PromptSchedule[]>([]);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const latest = useRef(options);
  latest.current = options;
  const epoch = useRef(0);
  const invalidate = useCallback(() => { epoch.current++; }, []);
  const processing = useRef(false);
  const tickRef = useRef<() => Promise<void>>(async () => {});

  tickRef.current = async () => {
    if (processing.current || !latest.current.rootPath || !latest.current.ready) return;
    processing.current = true;
    const root = latest.current.rootPath;
    const generation = epoch.current;
    const active = () => generation === epoch.current && latest.current.rootPath === root && latest.current.ready;
    try {
      await fileStore.flush();
      if (!active()) return;
      const entries = await invoke<PromptSchedule[]>("scheduler_list");
      if (!active()) return;
      setSchedules(entries); setError("");
      for (const schedule of entries) {
        if (!active()) break;
        const state = latest.current;
        const task = state.tasks.find((task) => task.id === schedule.taskId);
        if (!task || !scheduleDue(schedule, Date.now()) || scheduleBlockReason(task, state.busy(task), state.queued(task))) continue;
        const claimed = await invoke<PromptSchedule | null>("scheduler_claim", { id: schedule.id });
        if (!claimed) continue;
        const current = latest.current;
        const currentTask = current.tasks.find((task) => task.id === schedule.taskId);
        if (!active() || !currentTask || scheduleBlockReason(currentTask, current.busy(currentTask), current.queued(currentTask))) {
          await finishSchedule(claimed, "interrupted", "Task or repository changed before dispatch. Inspect and resume the schedule.");
          continue;
        }
        try {
          const accepted = await current.send(currentTask, scheduledMessage(claimed, currentTask), claimed);
          if (!accepted) await finishSchedule(claimed, "failed", "The task could not start. Check its error before retrying.");
        } catch (error) { await finishSchedule(claimed, "failed", message(error)); }
      }
      if (active()) {
        const refreshed = await invoke<PromptSchedule[]>("scheduler_list");
        if (active()) setSchedules(refreshed);
      }
    } catch (error) { if (active()) setError(message(error)); }
    finally { processing.current = false; }
  };

  useEffect(() => {
    epoch.current++;
    setSchedules([]); setError("");
    let disposed = false;
    const tick = () => { if (!disposed) void tickRef.current(); };
    const interval = window.setInterval(tick, 15_000);
    const stop = listen("prompt-schedules-changed", tick);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => {
      disposed = true; invalidate();
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
      void stop.then((unlisten) => unlisten());
    };
  }, [options.rootPath, options.ready, invalidate]);

  const eligibility = JSON.stringify(options.tasks.map((task) => [task.id, task.completed]));
  useEffect(() => { void tickRef.current(); }, [eligibility, options.activity]);

  const action = async (command: string, args: Record<string, unknown>) => {
    setActionBusy(true); setError("");
    try {
      await fileStore.flush();
      await invoke(command, args);
      await tickRef.current();
    } catch (error) { setError(message(error)); }
    finally { setActionBusy(false); }
  };

  return { schedules, error, actionBusy,
    ready: options.ready,
    blockReason: (task: RepositoryTask | undefined) => scheduleBlockReason(task, !!task && options.busy(task), !!task && options.queued(task)),
    refresh: () => tickRef.current(),
    toggle: (schedule: PromptSchedule) => action("scheduler_update", { arguments: { id: schedule.id, enabled: !schedule.enabled } }),
    runNow: (schedule: PromptSchedule) => action("scheduler_run_now", { id: schedule.id }),
    remove: (schedule: PromptSchedule) => action("scheduler_delete", { id: schedule.id }),
  };
}

export type PromptSchedulerController = ReturnType<typeof usePromptScheduler>;
