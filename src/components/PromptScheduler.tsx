import { useState } from "react";
import { Clock3, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { scheduleDue, scheduleInterval, type PromptSchedule } from "../promptSchedules";
import type { PromptSchedulerController } from "../usePromptScheduler";
import type { RepositoryTask } from "../types";

export function PromptScheduler({ scheduler, tasks, onOpenTask }: {
  scheduler: PromptSchedulerController; tasks: RepositoryTask[]; onOpenTask: (task: RepositoryTask) => void;
}) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [taskFilter, setTaskFilter] = useState("all");
  const count = scheduler.schedules.filter((s) => s.enabled).length;
  const entries = [...scheduler.schedules].sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity));
  const openTask = (task: RepositoryTask) => { setOpen(false); setModal(false); onOpenTask(task); };

  const rows = (items: PromptSchedule[], full: boolean) => items.length ? <ScrollArea className={`github-inbox-list ${full ? "scheduler-modal-list" : ""}`}><div>{items.map((schedule) => {
    const task = tasks.find((task) => task.id === schedule.taskId);
    const running = schedule.latestRun?.status === "running";
    const invalidTarget = !task || task.completed;
    const waiting = scheduler.blockReason(task);
    const due = scheduleDue(schedule, Date.now());
    const status = running ? "Running" : schedule.runNowRequested ? waiting ?? "Starting…"
      : !schedule.enabled ? schedule.pauseReason ?? (schedule.nextRunAt === null ? "Finished" : "Paused")
      : due ? waiting ?? "Starting…" : "Scheduled";
    return <article key={schedule.id} className="github-inbox-row" aria-label={schedule.title}>
      <Clock3 size={16} className="github-inbox-item-icon" aria-hidden="true" />
      <div className="min-w-0">
        <Button variant="ghost" className="github-inbox-title" disabled={!task} title={`Open task: ${task?.title ?? "Deleted task"}`} onClick={() => { if (task) openTask(task); }}><span>{schedule.title}</span></Button>
        <div className="github-inbox-meta scheduler-task-name">{task?.title ?? "Deleted task"}</div>
        <div className="github-inbox-meta"><span>{schedule.nextRunAt === null ? "No next run" : new Date(schedule.nextRunAt).toLocaleString()}</span><span>{scheduleInterval(schedule.intervalMinutes)}</span></div>
        <div className="github-inbox-row-footer">
          <span className="github-inbox-meta" role="status">{status}</span>
          <div className="github-inbox-actions">
            <Button variant="ghost" size="icon-sm" disabled={scheduler.actionBusy || !scheduler.ready || (!schedule.enabled && (invalidTarget || schedule.nextRunAt === null))} aria-label={`${schedule.enabled ? "Pause" : "Resume"} ${schedule.title}`} title={schedule.enabled ? "Pause schedule" : "Resume schedule"} onClick={() => void scheduler.toggle(schedule)}>{schedule.enabled ? <Pause size={14} /> : <Play size={14} />}</Button>
            <Button variant="secondary" size="icon-sm" disabled={scheduler.actionBusy || !scheduler.ready || invalidTarget || running || schedule.runNowRequested} aria-label={`Run ${schedule.title} now`} title="Run now (waits until the task is idle)" onClick={() => void scheduler.runNow(schedule)}><Clock3 size={14} /></Button>
            <Button variant="ghost" size="icon-sm" disabled={scheduler.actionBusy || !scheduler.ready} aria-label={`Delete ${schedule.title}`} title="Delete schedule" onClick={() => void scheduler.remove(schedule)}><Trash2 size={14} /></Button>
          </div>
        </div>
        {schedule.latestRun && <p className="github-inbox-meta">Last run: {schedule.latestRun.status}{schedule.latestRun.finishedAt ? ` · ${new Date(schedule.latestRun.finishedAt).toLocaleString()}` : ""}</p>}
        {schedule.latestRun?.error && <p className="github-inbox-item-error">{schedule.latestRun.error}</p>}
        {full && <p className="scheduler-prompt">{schedule.prompt}</p>}
      </div>
    </article>;
  })}</div></ScrollArea> : <div className="github-inbox-empty" role="status"><Clock3 size={26} /><p>{scheduler.ready ? "No scheduled prompts. Ask an agent to schedule a task prompt." : "Open a repository to see scheduled task prompts."}</p></div>;

  return <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="top-button github-inbox-trigger" aria-label={`Scheduled prompts (${count})`} title="Scheduled prompts"><Clock3 size={15} />{count > 0 && <span className="github-inbox-count" aria-hidden="true">{count.toLocaleString()}</span>}</PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="github-inbox-popover">
        <header className="github-inbox-header"><PopoverTitle className="github-inbox-heading">Scheduled prompts</PopoverTitle><Button variant="ghost" size="icon-sm" disabled={!scheduler.ready || scheduler.actionBusy} aria-label="Refresh scheduled prompts" onClick={() => void scheduler.refresh()}><RefreshCw size={14} /></Button></header>
        {scheduler.error && <p role="alert" className="github-inbox-error">{scheduler.error}</p>}
        {rows(entries, false)}
        <footer className="github-inbox-footer"><span>Runs while this repository is open</span><Button variant="ghost" size="sm" onClick={() => { setOpen(false); setTaskFilter("all"); setModal(true); }}>View all</Button></footer>
      </PopoverContent>
    </Popover>
    <Dialog open={modal} onOpenChange={setModal}>
      <DialogContent className="scheduler-modal sm:max-w-2xl">
        <header className="github-inbox-header pr-12"><div><DialogTitle className="github-inbox-heading">Scheduled prompts</DialogTitle><DialogDescription className="github-inbox-repository">Agents create schedules. Manage them here; missed runs catch up once.</DialogDescription></div></header>
        <div className="px-[18px] pb-3"><Select value={taskFilter} onValueChange={(value) => { if (value) setTaskFilter(value); }}><SelectTrigger aria-label="Filter schedules by task" className="w-full"><SelectValue>{(value) => value === "all" ? "All tasks" : tasks.find((task) => task.id === value)?.title ?? "Deleted task"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All tasks</SelectItem>{tasks.filter((task) => entries.some((s) => s.taskId === task.id)).map((task) => <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>)}</SelectContent></Select></div>
        {scheduler.error && <p role="alert" className="github-inbox-error">{scheduler.error}</p>}
        {rows(entries.filter((s) => taskFilter === "all" || s.taskId === taskFilter), true)}
        <footer className="github-inbox-footer">Pausing or deleting a schedule leaves its running agent active. Fixed days are 24 hours.</footer>
      </DialogContent>
    </Dialog>
  </>;
}
