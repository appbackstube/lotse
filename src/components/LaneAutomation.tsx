import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./ui/select";
import { laneConfigError, type LaneConfig } from "../laneAutomation";
import { taskBoardStatus, type TaskBoardStatus } from "../tasks";
import type { LaneAutomationController } from "../useLaneAutomation";
import type { BranchRefs, RepositoryTask } from "../types";

export function LaneAutomation({ status, label, controller, branches, tasks, onClose, onOpenTask }: {
  status: TaskBoardStatus; label: string; controller: LaneAutomationController; branches: BranchRefs | null;
  tasks: RepositoryTask[]; onClose: () => void; onOpenTask: (task: RepositoryTask) => void;
}) {
  const lane = controller.lanes[status];
  const [config, setConfig] = useState<LaneConfig>(lane);
  const [error, setError] = useState("");
  const entries = tasks.filter((task) => taskBoardStatus(task) === status || lane.attempts[task.id]);
  const count = (state: string) => entries.filter((task) => (lane.attempts[task.id]?.status ?? "pending") === state).length;
  const baseValue = `${config.baseKind}:${config.baseBranch}`;
  const missingBase = config.baseBranch && !(config.baseKind === "remote" ? branches?.remoteRefs : branches?.refs)?.includes(config.baseBranch);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
      <DialogTitle>{label} automation</DialogTitle>
      <DialogDescription>Send this prompt once per task in this lane, using its existing chat and model. New tasks join automatically while this repository is open.</DialogDescription>
      <form className="flex min-h-0 min-w-0 flex-col gap-4" onSubmit={(event) => {
        event.preventDefault();
        const invalid = laneConfigError(config) ?? (config.enabled && (!branches || missingBase) ? "Select an available base branch." : null);
        if (invalid) { setError(invalid); return; }
        void controller.save(status, config).then((saved) => { if (saved) onClose(); });
      }}>
        <div className="min-h-0 space-y-4 overflow-y-auto overflow-x-hidden px-1">
        <label className="flex items-center justify-between gap-3 pr-3 text-sm font-medium">Enable automation<Switch checked={config.enabled} onCheckedChange={(enabled) => setConfig({ ...config, enabled })} aria-label={`Enable ${label} automation`} /></label>
        <label className="block space-y-2"><span className="text-sm font-medium">Prompt</span><Textarea value={config.prompt} onChange={(event) => setConfig({ ...config, prompt: event.currentTarget.value })} maxLength={20_000} aria-label="Lane automation prompt" className="min-h-40" placeholder="Describe what the agent should do with each task, including any status changes." /></label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><span className="text-sm font-medium">Base branch</span><Select value={config.baseBranch ? baseValue : null} onValueChange={(value) => { if (value) { const colon = value.indexOf(":"); setConfig({ ...config, baseKind: value.slice(0, colon) as LaneConfig["baseKind"], baseBranch: value.slice(colon + 1) }); } }}><SelectTrigger className="w-full" aria-label="Automation base branch"><SelectValue placeholder={branches ? "Choose branch" : "Loading branches…"}>{() => config.baseBranch || "Choose branch"}</SelectValue></SelectTrigger><SelectContent>{missingBase && <SelectItem value={baseValue} disabled>{config.baseBranch} (unavailable)</SelectItem>}<SelectGroup><SelectLabel>Local branches</SelectLabel>{branches?.refs.map((branch) => <SelectItem key={`branch:${branch}`} value={`branch:${branch}`}>{branch}</SelectItem>)}</SelectGroup><SelectGroup><SelectLabel>Remote branches</SelectLabel>{branches?.remoteRefs.map((branch) => <SelectItem key={`remote:${branch}`} value={`remote:${branch}`}>{branch}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
          <label className="block space-y-2"><span className="text-sm font-medium">Maximum workers</span><Input type="number" min={1} step={1} required aria-label="Maximum concurrent lane workers" value={Number.isNaN(config.workers) ? "" : config.workers} onChange={(event) => setConfig({ ...config, workers: event.currentTarget.valueAsNumber })} /></label>
        </div>
        <p className="text-xs text-[#7C9B88]">New worktrees without a start point use this base branch. Existing chats and configured work locations are reused. The prompt controls task edits and status changes. Pausing lets running agents finish.</p>
        <div className="flex flex-wrap gap-3 text-xs text-[#7C9B88]" role="status"><span>{count("pending")} pending</span><span>{count("running")} running</span><span>{count("processed")} processed</span><span>{count("failed") + count("interrupted") + count("held")} need retry</span></div>
        <div className="max-h-52 overflow-y-auto divide-y divide-[#294536]">{entries.map((task) => {
          const attempt = lane.attempts[task.id];
          const retry = attempt?.status === "failed" || attempt?.status === "interrupted" || attempt?.status === "held";
          return <div key={task.id} className="py-2 text-sm"><div className="flex items-center gap-2"><button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpenTask(task)}>{task.title}</button><span className="text-xs text-[#7C9B88]">{attempt?.status === "held" ? "awaiting start approval" : attempt?.status ?? "pending"}</span>{retry && <button type="button" disabled={controller.saving || !controller.ready} className="quiet-button h-7 px-2 text-xs" onClick={() => void controller.retry(status, task.id)}>{attempt?.status === "held" ? "Start" : "Retry"}</button>}</div>{attempt?.error && <p className="mt-1 text-xs text-[#FB7185]">{attempt.error}</p>}</div>;
        })}{!entries.length && <p className="py-2 text-sm text-[#7C9B88]">No tasks in this lane yet.</p>}</div>
        </div>
        {(error || controller.error) && <p role="alert" className="text-sm text-[#FB7185]">{error || controller.error}</p>}
        <div className="flex shrink-0 justify-end gap-2"><button type="button" onClick={onClose} className="quiet-button">Cancel</button><button type="submit" disabled={!controller.ready || controller.saving} className="accent-button">{controller.saving ? "Saving…" : "Save automation"}</button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
