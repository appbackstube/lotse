import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowDown, ArrowUp, ChevronDown, GitBranch, LoaderCircle, RefreshCw } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { RepositoryTask, TaskGitStatus } from "../types";

type GitAction = "fetch" | "pull" | "push";
const actionLabels = { fetch: "Fetch", pull: "Pull", push: "Push" };
const busyLabels = { fetch: "Fetching…", pull: "Pulling…", push: "Pushing…" };
const actionIcons = { fetch: RefreshCw, pull: ArrowDown, push: ArrowUp };

export function TaskGitToolbar({ task, running, revision, busy, compact = false, onBusyChange, onPull, onSynced, onDirtyChange }: {
  task: RepositoryTask;
  running: boolean;
  revision: number;
  busy: GitAction | null;
  compact?: boolean;
  onBusyChange: (action: GitAction | null) => void;
  onPull: (pull: () => void) => void;
  onSynced: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [status, setStatus] = useState<TaskGitStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const operation = useRef(false);
  const dirtyChange = useRef(onDirtyChange);
  dirtyChange.current = onDirtyChange;
  useEffect(() => { dirtyChange.current?.(status?.dirty ?? false); }, [status?.dirty]);
  const ready = task.location === "workspace" || !!task.worktree;
  const taskId = task.location === "worktree" ? task.id : null;

  useEffect(() => {
    if (!ready || busy) return;
    let active = true;
    let loading = false;
    const load = async () => {
      if (loading || operation.current) return;
      loading = true;
      try {
        const next = await invoke<TaskGitStatus>("task_git_status", { taskId });
        if (active && !operation.current) { setStatus(next); setLoadError(""); }
      } catch (reason) {
        if (active && !operation.current) { setStatus(null); setLoadError(String(reason)); }
      } finally { loading = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    window.addEventListener("focus", load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [taskId, ready, running, revision, busy]);

  const diverged = (status?.pullCount ?? 0) > 0 && (status?.pushCount ?? 0) > 0;
  const disabledReason = (action: GitAction) => {
    if (!ready) return "The task worktree starts with the first Agent message.";
    if (!status) return loadError || "Loading Git status…";
    if (busy) return busyLabels[busy];
    if (!status.repository.hasOrigin) return "No origin remote configured.";
    if (action === "fetch") return "";
    if (!status.repository.currentBranch) return "Detached HEAD: switch to a branch before syncing.";
    if (running) return "An agent or another operation is using this task folder.";
    if (action === "pull") {
      if (!status.upstream) return "Publish this branch to set its upstream first.";
      if (diverged) return "Branches have diverged. Resolve them before pulling.";
    }
    if (action === "push" && (status.pullCount ?? 0) > 0) return "Pull incoming commits before pushing. Diverged branches need manual resolution.";
    return "";
  };
  const primary: GitAction = status && !status.upstream && status.repository.currentBranch ? "push"
    : diverged ? "fetch" : (status?.pullCount ?? 0) > 0 ? "pull" : (status?.pushCount ?? 0) > 0 ? "push" : "fetch";
  const label = (action: GitAction) => action === "push" && status && !status.upstream ? "Publish branch" : actionLabels[action];
  const PrimaryIcon = busy ? LoaderCircle : actionIcons[primary];

  const sync = async (action: GitAction) => {
    if (operation.current || disabledReason(action)) return;
    operation.current = true;
    onBusyChange(action); setActionError("");
    try {
      setStatus(await invoke<TaskGitStatus>("task_git_action", { taskId, action, expectedBranch: status!.repository.currentBranch }));
      onSynced();
    } catch (reason) { setActionError(String(reason)); }
    finally { operation.current = false; onBusyChange(null); }
  };
  const run = (action: GitAction) => { if (action === "pull") onPull(() => void sync(action)); else void sync(action); };

  const notice = <>
    {!compact && !ready && <p className="mt-1">The task worktree starts with the first Agent message.</p>}
    {!compact && status && !status.repository.hasOrigin && <p className="mt-1">No origin remote configured.</p>}
    {diverged && <p role="status" className="mt-1">Branches have diverged. Resolve them before syncing.</p>}
    {(actionError || loadError) && <p role="alert" className="mt-1 break-words text-[#FB7185]">{actionError || loadError}</p>}
  </>;

  return <div className={compact ? "task-git-compact relative min-w-0 text-xs text-[#7C9B88]" : "shrink-0 border-b border-[#294536] px-3 py-2 text-xs text-[#7C9B88]"} aria-label="Task Git" aria-busy={!!busy}>
    <div className={`flex min-w-0 items-center gap-2 ${compact ? "" : "flex-wrap"}`}>
      <GitBranch size={14} className="task-git-branch-icon shrink-0" aria-hidden="true" />
      <span className={`task-git-branch min-w-0 truncate ${compact ? "max-w-[220px]" : "flex-1"}`} title={status?.repository.currentBranch ?? undefined}>{ready ? status ? status.repository.currentBranch ?? "Detached HEAD" : "Loading Git status…" : "Worktree not started"}</span>
      {status?.upstream && (!compact || status.pullCount !== 0 || status.pushCount !== 0) && <span className="inline-flex shrink-0 gap-2 tabular-nums" title={`${status.upstream} · Known remote state; Fetch to refresh`}>
        {(!compact || status.pullCount !== 0) && <span aria-label={`${status.pullCount ?? "Unknown"} incoming commits`}>↓ {status.pullCount ?? "?"}</span>}
        {(!compact || status.pushCount !== 0) && <span aria-label={`${status.pushCount ?? "Unknown"} outgoing commits`}>↑ {status.pushCount ?? "?"}</span>}
      </span>}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" className="quiet-button h-7 px-2 disabled:opacity-40" disabled={!!disabledReason(primary)} aria-label={busy ? busyLabels[busy] : label(primary)} title={disabledReason(primary) || `${label(primary)} for this task`} onClick={() => run(primary)}>
          <PrimaryIcon size={13} className={busy ? "animate-spin" : undefined} aria-hidden="true" /><span className="task-git-action-label">{busy ? busyLabels[busy] : label(primary)}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Task Git actions" title={status?.repository.currentBranch ?? "Task Git actions"} className="quiet-button h-7 px-2" disabled={!!busy}><ChevronDown size={13} /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {(["fetch", "pull", "push"] as const).map((action) => {
              const Icon = actionIcons[action];
              const reason = disabledReason(action);
              return <DropdownMenuItem key={action} disabled={!!reason} onClick={() => run(action)} className="items-start py-2">
                <Icon size={14} className="mt-0.5" /><span><span className="block">{label(action)}</span><span className="block text-xs text-[var(--ios-secondary-label)]">{reason || (action === "fetch" ? "Refresh remote commits" : action === "pull" ? "Fast-forward this task branch" : "Upload this task branch")}</span></span>
              </DropdownMenuItem>;
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {compact ? (diverged || actionError || loadError) && <div className="task-git-notice">{notice}</div> : notice}
  </div>;
}
