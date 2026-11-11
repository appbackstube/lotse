import { Fragment, useId, useMemo, type CSSProperties, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import type { RepositoryTask } from "../types";
import { normalizeTaskDate, taskDateDay, taskDateFromDay, taskGanttTimeline, taskScheduleRange } from "../taskSchedule";
import { taskColors, taskDepth, type TaskBoardStatus } from "../tasks";
import { useTaskFieldDraft } from "../useTaskFieldDraft";

type Schedule = Pick<RepositoryTask, "startDate" | "deadline">;
const dateLabel = (date: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export function TaskScheduleFields({ task, onChange }: { task: RepositoryTask; onChange: (schedule: Schedule) => void }) {
  const value = useMemo(() => ({ startDate: task.startDate, deadline: task.deadline }), [task.startDate, task.deadline]);
  const [schedule, setSchedule, flush] = useTaskFieldDraft(value, (next) => {
    if (!next.startDate || !next.deadline || next.startDate <= next.deadline) onChange(next);
  });
  const invalid = !!schedule.startDate && !!schedule.deadline && schedule.startDate > schedule.deadline;
  const change = (field: keyof Schedule, value: string) => {
    if (value && !normalizeTaskDate(value)) return;
    if (schedule[field] !== (value || null)) setSchedule({ ...schedule, [field]: value || null });
  };
  return <div className="task-details-schedule space-y-2">
    <div className="grid grid-cols-2 gap-3">
      <label className="min-w-0 space-y-2"><span className="text-xs font-semibold text-[#7C9B88]">Start date</span><Input type="date" min="0001-01-01" max={schedule.deadline ?? "9999-12-31"} value={schedule.startDate ?? ""} onChange={(event) => { if (!event.currentTarget.validity.badInput) change("startDate", event.currentTarget.value); }} onBlur={flush} aria-invalid={invalid} className="task-details-control h-10 w-full min-w-0 px-2 text-sm" /></label>
      <label className="min-w-0 space-y-2"><span className="text-xs font-semibold text-[#7C9B88]">Deadline</span><Input type="date" min={schedule.startDate ?? "0001-01-01"} max="9999-12-31" value={schedule.deadline ?? ""} onChange={(event) => { if (!event.currentTarget.validity.badInput) change("deadline", event.currentTarget.value); }} onBlur={flush} aria-invalid={invalid} className="task-details-control h-10 w-full min-w-0 px-2 text-sm" /></label>
    </div>
    {invalid && <p role="alert" className="text-xs text-[#FB7185]">Deadline must be on or after the start date. This change has not been saved.</p>}
  </div>;
}

export function TaskGantt({ tasks, groups, onOpenTask, renderAgentStatus, renderTaskOptions, renderStatusOptions }: { tasks: RepositoryTask[]; groups: { key: string; label: string; status: TaskBoardStatus; tasks: RepositoryTask[] }[]; onOpenTask: (task: RepositoryTask) => void; renderAgentStatus: (task: RepositoryTask) => ReactNode; renderTaskOptions: (task: RepositoryTask) => ReactNode; renderStatusOptions: (group: { status: TaskBoardStatus; label: string }) => ReactNode }) {
  const agentStatusId = useId();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const timeline = taskGanttTimeline(tasks, today);
  const todayDay = taskDateDay(today);
  const tickWidth = timeline.step / timeline.days * 100;
  const todayPosition = (todayDay - timeline.start + 0.5) / timeline.days * 100;
  const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  return <div className="task-gantt-scroll min-h-0 flex-1 overflow-auto px-4 pb-4" aria-label="Task Gantt chart">
    {!tasks.length && <p className="py-4 text-sm text-[#7C9B88]">Create tasks in List or Kanban, then set their start date and deadline to plan them here.</p>}
    <div className="task-gantt-table" style={{ minWidth: 260 + Math.max(640, timeline.ticks.length * 48), "--gantt-tick-width": `${tickWidth}%` } as CSSProperties}>
      <div className="task-gantt-row task-gantt-header">
        <div className="task-gantt-label"><strong>Tasks</strong><span>{dateLabel(taskDateFromDay(timeline.start))} – {dateLabel(taskDateFromDay(timeline.end))}</span></div>
        <div className="task-gantt-ticks">{timeline.ticks.map((day) => <span key={day} style={{ left: `${(day - timeline.start) / timeline.days * 100}%` }}>{shortDate.format(new Date(`${taskDateFromDay(day)}T00:00:00Z`))}</span>)}{todayPosition >= 0 && todayPosition <= 100 && <time dateTime={today} title={`Today: ${dateLabel(today)}`} className="task-gantt-today-marker" style={{ left: `${todayPosition}%` }}><span>Today</span></time>}</div>
      </div>
      {groups.map((group) => <Fragment key={group.key}>
        <div className="task-gantt-row task-gantt-group">
          <div className="task-gantt-label"><h3>{group.label}</h3><span>{group.tasks.length}</span>{renderStatusOptions(group)}</div>
          <div className="task-gantt-track" />
        </div>
        {group.tasks.map((task) => {
          const range = taskScheduleRange(task);
          const agentStatus = renderAgentStatus(task);
          const color = task.color === "clear" ? undefined : taskColors.find((item) => item.value === task.color)?.color;
          const dates = [task.startDate ? dateLabel(task.startDate) : "No start date", task.deadline ? dateLabel(task.deadline) : "No deadline"].join(" – ");
          return <div key={task.id} className="task-gantt-row">
            <div className="task-gantt-label task-gantt-task-label" style={{ paddingLeft: 12 + taskDepth(task, tasks) * 16, borderLeft: color ? `3px solid ${color}` : undefined }}><button type="button" onClick={() => onOpenTask(task)} className="task-gantt-task-button" title={task.title}><span className="task-gantt-agent-status">{agentStatus}</span><span className="task-gantt-task-content"><span className="task-gantt-heading"><strong className={task.completed ? "line-through opacity-60" : undefined}>{task.title}</strong></span><span className="task-gantt-dates" title={dates}>{dates}</span></span></button>{renderTaskOptions(task)}</div>
            <div className="task-gantt-track">
              {todayPosition >= 0 && todayPosition <= 100 && <span className="task-gantt-today" style={{ left: `${todayPosition}%` }} aria-hidden="true" />}
              {range ? <button type="button" onClick={() => onOpenTask(task)} aria-label={`${task.title}: ${dates}${task.completed ? ", done" : ""}`} aria-describedby={`${agentStatusId}-${task.id}`} title={`${task.title}\n${dates}`} className={`task-gantt-bar ${task.completed ? "task-gantt-completed" : ""}`} style={{ left: `${(range.start - timeline.start) / timeline.days * 100}%`, width: `${(range.end - range.start + 1) / timeline.days * 100}%`, borderLeft: color ? `3px solid ${color}` : undefined }}><span id={`${agentStatusId}-${task.id}`} className="task-gantt-agent-status">{agentStatus}</span><span className="task-gantt-bar-title">{task.title}</span></button> : <button type="button" onClick={() => onOpenTask(task)} className="task-gantt-unscheduled">{task.startDate && task.deadline ? "Check task dates" : "Set start date and deadline"}</button>}
            </div>
          </div>;
        })}
      </Fragment>)}
      <div className="task-gantt-row task-gantt-footer"><div className="task-gantt-label">{tasks.filter((task) => !!taskScheduleRange(task)).length} of {tasks.length} scheduled</div></div>
    </div>
  </div>;
}
