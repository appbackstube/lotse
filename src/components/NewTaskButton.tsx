import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import type { RepositoryTask } from "../types";
import type { TaskBoardStatus } from "../tasks";

export type NewTaskDraft = Pick<RepositoryTask, "title" | "description"> & { status: TaskBoardStatus };

export function NewTaskButton({ onCreate }: { onCreate: (draft: NewTaskDraft) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TaskBoardStatus>("inbox");
  const [description, setDescription] = useState("");
  useEffect(() => {
    const openTask = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "n") return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", openTask);
    return () => window.removeEventListener("keydown", openTask);
  }, []);
  const close = () => { setOpen(false); setTitle(""); setStatus("inbox"); setDescription(""); };
  return <Dialog open={open} onOpenChange={(open) => { if (open) setOpen(true); else close(); }}>
    <DialogTrigger render={<Button variant="ghost" size="icon" />} aria-label="New task" aria-keyshortcuts="Meta+Shift+N Control+Shift+N" title="New task (⌘⇧N / Ctrl+Shift+N)"><Plus size={16} /></DialogTrigger>
    <DialogContent className="ios-sheet max-h-[90dvh] w-[min(440px,94vw)] overflow-y-auto border border-[#294536] bg-[#111A15] p-5">
      <DialogTitle>New task</DialogTitle>
      <DialogDescription>Add a title, choose a status, and describe the task.</DialogDescription>
      <form onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onCreate({ title: title.trim(), status, description }); close(); }} className="space-y-4">
        <label className="grid gap-2 text-sm font-medium text-[var(--ios-label)]">Title<Input autoFocus value={title} onChange={(event) => setTitle(event.currentTarget.value)} placeholder="Task title" required maxLength={500} /></label>
        <div className="grid gap-2 text-sm font-medium text-[var(--ios-label)]"><span>Status</span><Select value={status} onValueChange={(value) => value && setStatus(value as TaskBoardStatus)}><SelectTrigger className="w-full" aria-label="Status"><SelectValue>{(value) => value === "inbox" ? "Inbox" : value === "inProgress" ? "In development" : value === "inReview" ? "In review" : value === "done" ? "Done" : "Needs planning"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="inbox">Inbox</SelectItem><SelectItem value="clear">Needs planning</SelectItem><SelectItem value="inProgress">In development</SelectItem><SelectItem value="inReview">In review</SelectItem><SelectItem value="done">Done</SelectItem></SelectContent></Select></div>
        <label className="grid gap-2 text-sm font-medium text-[var(--ios-label)]">Description<Textarea value={description} onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Describe the task…" rows={4} maxLength={20_000} /></label>
        <div className="flex justify-end gap-2"><DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose><Button type="submit" disabled={!title.trim()}>Create task</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
