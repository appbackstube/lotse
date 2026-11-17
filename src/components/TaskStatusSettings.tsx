import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { deleteTaskStatus, type TaskStatusSettings as StatusSettings } from "../taskStatuses";

export function TaskStatusSettings({ settings, onChange }: {
  settings: StatusSettings;
  onChange: (settings: StatusSettings) => void;
}) {
  const [error, setError] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");
  const [newStatus, setNewStatus] = useState<string | null>(null);
  const change = (next: StatusSettings) => {
    try { onChange(next); setError(""); return true; }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); return false; }
  };
  const move = (id: string, index: number) => {
    const statuses = [...settings.statuses];
    const source = statuses.findIndex((status) => status.id === id);
    if (source < 0 || index < 0 || index >= statuses.length) return;
    const [status] = statuses.splice(source, 1);
    statuses.splice(index, 0, status);
    change({ ...settings, statuses });
  };
  const add = () => {
    let label = "New status";
    for (let number = 2; settings.statuses.some((status) => status.label.toLowerCase() === label.toLowerCase()); number++) label = `New status ${number}`;
    const status = { id: crypto.randomUUID(), label };
    if (change({ ...settings, statuses: [...settings.statuses, status] })) setNewStatus(status.id);
  };
  return <section className="mt-10" aria-labelledby="task-statuses-title">
    <div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="task-statuses-title" className="text-[17px] font-semibold">Task statuses</h2><p className="mt-1 text-sm text-[var(--ios-secondary-label)]">Customize the statuses for this repository. Their order determines the order of columns on your board.</p></div><button type="button" className="quiet-button shrink-0" onClick={add}><Plus size={14} /> Add status</button></div>
    <div className="task-status-settings-card">
      <div className="task-status-settings-heading" aria-hidden="true"><span /><span>Status name</span><span className="text-right">Order</span></div>
      {settings.statuses.map((status, index) => {
        const removable = status.id !== "done" && settings.statuses.length > 2;
        const reason = status.id === "done" ? "Completed tasks need this status. You can rename or reorder it." : settings.statuses.length <= 2 ? "Keep at least one open status." : `Delete ${status.label}`;
        return <div key={status.id} className="task-status-settings-row" data-dragging={dragged === status.id} data-drop-target={over === status.id} onDragOver={(event) => { if (dragged && dragged !== status.id) { event.preventDefault(); setOver(status.id); } }} onDrop={(event) => { event.preventDefault(); if (dragged) move(dragged, index); setDragged(null); setOver(null); }}>
          <span draggable className="task-status-settings-handle" title="Drag to reorder" aria-hidden="true" onDragStart={(event) => { event.dataTransfer.setData("text/plain", status.id); event.dataTransfer.effectAllowed = "move"; setDragged(status.id); }} onDragEnd={() => { setDragged(null); setOver(null); }}><GripVertical size={16} /></span>
          <Input key={`${status.id}:${status.label}`} defaultValue={status.label} maxLength={80} aria-label={`Status name: ${status.label}`} className="task-status-settings-name" autoFocus={newStatus === status.id} onFocus={(event) => { if (newStatus === status.id) { event.currentTarget.select(); setNewStatus(null); } }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { event.currentTarget.value = status.label; event.currentTarget.blur(); } }} onBlur={(event) => { const label = event.currentTarget.value.trim(); if (label !== status.label && !change({ ...settings, statuses: settings.statuses.map((item) => item.id === status.id ? { ...item, label } : item) })) event.currentTarget.value = status.label; }} />
          <div className="flex justify-end gap-0.5"><button type="button" className="task-status-settings-action" disabled={index === 0} aria-label={`Move ${status.label} up`} onClick={() => move(status.id, index - 1)}><ArrowUp size={15} /></button><button type="button" className="task-status-settings-action" disabled={index === settings.statuses.length - 1} aria-label={`Move ${status.label} down`} onClick={() => move(status.id, index + 1)}><ArrowDown size={15} /></button><button type="button" className="task-status-settings-action" disabled={!removable} aria-label={`Delete ${status.label}`} title={reason} onClick={() => { setDeleting(status.id); setReplacement(settings.statuses.find((item) => item.id !== status.id)!.id); }}><Trash2 size={15} /></button></div>
        </div>;
      })}
      <div className="task-status-settings-footer"><div><h3 className="text-sm font-medium">Default status</h3><p className="mt-1 text-sm text-[var(--ios-secondary-label)]">New tasks start in this status.</p></div><Select value={settings.defaultStatus} onValueChange={(value) => { if (value) change({ ...settings, defaultStatus: value }); }}><SelectTrigger aria-label="Default status" className="w-44"><SelectValue>{(value) => settings.statuses.find((status) => status.id === value)?.label}</SelectValue></SelectTrigger><SelectContent>{settings.statuses.map((status) => <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <p className="mt-3 text-xs text-[var(--ios-secondary-label)]">Drag statuses to reorder, or use the arrow buttons.</p>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--ios-red-label)]">{error}</p>}
    <Dialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}><DialogContent className="ios-sheet max-w-md p-5"><DialogTitle>Delete status?</DialogTitle><DialogDescription>Tasks using “{settings.statuses.find((status) => status.id === deleting)?.label}” will move to the selected status.</DialogDescription><div className="mt-3 space-y-2"><span className="text-sm">Move tasks to</span><Select value={replacement} onValueChange={(value) => { if (value) setReplacement(value); }}><SelectTrigger aria-label="Replacement status" className="w-full"><SelectValue>{(value) => settings.statuses.find((status) => status.id === value)?.label}</SelectValue></SelectTrigger><SelectContent>{settings.statuses.filter((status) => status.id !== deleting).map((status) => <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>)}</SelectContent></Select></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="quiet-button" onClick={() => setDeleting(null)}>Cancel</button><button type="button" className="quiet-button text-[var(--ios-red-label)]" onClick={() => { if (!deleting) return; try { if (change(deleteTaskStatus(settings, deleting, replacement))) setDeleting(null); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } }}>Delete status</button></div></DialogContent></Dialog>
  </section>;
}
