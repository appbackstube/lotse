import { useState } from "react";
import { Check, Plus, Save, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { approvalReviewerLabels, newAgent, normalizeAgent, type ApprovalReviewer, type ChatAgent } from "../agents";
import { chatConfigurationError, modelEfforts, type ChatEffort, type ChatModel } from "../chatDefaults";
import { ModelPicker } from "./ModelPicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Confirmation = { title: string; description: string; actionLabel: string; action: () => void };

export function AgentsDialog({ agents, models, modelsLoaded, modelsStatus, onChange, onClose, onConfirm }: {
  agents: ChatAgent[];
  models: ChatModel[];
  modelsLoaded: boolean;
  modelsStatus: string;
  onChange: (agents: ChatAgent[]) => void;
  onClose: () => void;
  onConfirm: (confirmation: Confirmation) => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...(agents[0] ?? newAgent()) }));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const existing = agents.find((agent) => agent.id === draft.id);
  const select = (agent: ChatAgent) => { setDraft({ ...agent }); setError(""); setSaved(false); };
  const discard = (action: () => void) => {
    const initial = existing ?? { id: draft.id, title: "Untitled agent", prompt: "" };
    if (JSON.stringify(draft) === JSON.stringify(initial)) return action();
    onConfirm({ title: "Discard unsaved changes?", description: "Your changes to this agent have not been saved.", actionLabel: "Discard", action });
  };
  const save = () => {
    const agent = normalizeAgent({ ...draft, title: draft.title.trim(), prompt: draft.prompt.trim() });
    if (!agent) { setError("Add a title of at most 200 characters and a prompt of at most 20,000 characters."); return; }
    if (agent.modelConfig && models.some((model) => model.model === agent.modelConfig?.model) && !modelEfforts(agent.modelConfig.model, models).includes(agent.modelConfig.effort)) { setError("Select an effort supported by this model."); return; }
    onChange(existing ? agents.map((item) => item.id === agent.id ? agent : item) : [...agents, agent]);
    setDraft(agent); setError(""); setSaved(true);
  };
  const remove = () => {
    if (!existing) return;
    onConfirm({ title: `Delete “${existing.title}”?`, description: "This removes the saved agent. Existing chats keep their current role until you switch agents.", actionLabel: "Delete", action: () => {
      const next = agents.filter((agent) => agent.id !== existing.id);
      onChange(next); select(next[0] ?? newAgent());
    } });
  };
  return <Dialog open onOpenChange={(open) => { if (!open) discard(onClose); }}>
    <DialogContent showCloseButton={false} className="ios-sheet flex h-[min(630px,88vh)] w-[min(980px,94vw)] !max-w-none flex-col overflow-hidden rounded-xl border border-[#294536] bg-[#0B110E] p-0 shadow-2xl shadow-black/60">
      <header className="flex min-h-[66px] shrink-0 items-center gap-3 border-b border-[#294536] px-5 py-3">
        <div className="min-w-0"><DialogTitle className="text-[17px] font-bold text-[#E8FFF0]">Agents</DialogTitle><DialogDescription className="mt-0.5 text-xs text-[#7C9B88]">Reusable roles for Agent Chat. Select a role in the chat to apply it.</DialogDescription></div>
        <div className="ml-auto flex shrink-0 items-center gap-2"><button type="button" onClick={() => discard(() => select(newAgent()))} className="quiet-button h-9"><Plus size={14} /> New agent</button><button type="button" onClick={() => discard(onClose)} className="grid size-9 place-items-center rounded-md text-[#7C9B88] hover:bg-[#294536] hover:text-white" aria-label="Close agents"><X size={16} /></button></div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(140px,27%)_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-[#294536] p-3" aria-label="Saved agents">
          <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7C9B88]">Saved agents</div>
          <div className="space-y-1">
            {!existing && <div className="rounded-lg border border-[#294536] bg-[#183522] px-3 py-3 text-sm font-bold text-[#E8FFF0]">{draft.title || "New agent"}<span className="mt-1 block text-xs font-normal text-[#7C9B88]">Not saved</span></div>}
            {agents.map((agent) => <button key={agent.id} type="button" onClick={() => discard(() => select(agent))} className={`block w-full truncate rounded-lg border px-3 py-3 text-left text-sm font-bold text-[#E8FFF0] ${draft.id === agent.id ? "border-[#294536] bg-[#183522]" : "border-transparent hover:bg-[#111A15]"}`}>{agent.title}</button>)}
            {!agents.length && <p className="px-2 py-4 text-xs text-[#7C9B88]">No saved agents</p>}
          </div>
        </aside>
        <div className="flex min-h-0 flex-col">
          <form id="agent-form" onSubmit={(event) => { event.preventDefault(); save(); }} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <label className="block text-xs font-bold text-[#7C9B88]">Title<Input value={draft.title} maxLength={200} onChange={(event) => { setDraft({ ...draft, title: event.currentTarget.value }); setSaved(false); }} placeholder="Agile Product Owner" className="mt-2" /></label>
            <label className="block text-xs font-bold text-[#7C9B88]">Prompt<Textarea value={draft.prompt} maxLength={20_000} onChange={(event) => { setDraft({ ...draft, prompt: event.currentTarget.value }); setSaved(false); }} placeholder="Act as an Agile Product Owner. Help clarify goals, prioritize the backlog, and write clear acceptance criteria." className="mt-2 min-h-64 resize-y font-normal" /></label>
            <div className="space-y-2"><span className="text-xs font-bold text-[#7C9B88]">Approval mode</span>
              <Select value={draft.approvalMode ?? "default"} onValueChange={(value) => { if (value === "default" || value === "user" || value === "auto_review" || value === "yolo") { setDraft({ ...draft, approvalMode: value === "default" ? undefined : value }); setSaved(false); } }}>
                <SelectTrigger className="h-9 w-full border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="Agent approval mode"><SelectValue>{(value) => value === "default" ? "Use default" : approvalReviewerLabels[value as ApprovalReviewer]}</SelectValue></SelectTrigger>
                <SelectContent className="ios-select-content"><SelectItem value="default">Use default</SelectItem><SelectItem value="user">Ask for approval</SelectItem><SelectItem value="auto_review">Approve for me</SelectItem><SelectItem value="yolo" title="Full access without approval prompts">YOLO mode</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-xs font-bold text-[#7C9B88]">Model and effort</span>
                {draft.modelConfig ? <button type="button" className="quiet-button h-8" onClick={() => { setDraft(({ modelConfig: _config, ...agent }) => agent); setSaved(false); }}>Remove</button> :
                  <button type="button" className="quiet-button h-8" disabled={!models.length} onClick={() => { const model = models[0].model; setDraft({ ...draft, modelConfig: { model, effort: modelEfforts(model, models)[0] ?? "medium" } }); setSaved(false); }}>Set model</button>}
              </div>
              {draft.modelConfig && <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                <ModelPicker value={draft.modelConfig.model} models={models} ariaLabel="Agent model" className="h-9 w-full rounded-md border border-[#294536] bg-[#050807] px-3 text-[#E8FFF0]" onChange={(model) => { const efforts = modelEfforts(model, models); setDraft({ ...draft, modelConfig: { model, effort: efforts.includes(draft.modelConfig!.effort) ? draft.modelConfig!.effort : efforts[0] ?? draft.modelConfig!.effort } }); setSaved(false); }} />
                <Select value={draft.modelConfig.effort} onValueChange={(value) => { if (value && draft.modelConfig) { setDraft({ ...draft, modelConfig: { ...draft.modelConfig, effort: value as ChatEffort } }); setSaved(false); } }}>
                  <SelectTrigger className="h-9 w-full border-[#294536] bg-[#050807] text-[#E8FFF0]" aria-label="Agent effort"><SelectValue /></SelectTrigger>
                  <SelectContent className="ios-select-content">{modelEfforts(draft.modelConfig.model, models).map((effort) => <SelectItem key={effort} value={effort}>{effort[0].toUpperCase() + effort.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>}
              {draft.modelConfig && chatConfigurationError(draft.modelConfig.model, draft.modelConfig.effort, models, modelsLoaded) && <p role="status" className="text-xs text-[#FB7185]">{modelsLoaded ? chatConfigurationError(draft.modelConfig.model, draft.modelConfig.effort, models, true) : modelsStatus}</p>}
              {!draft.modelConfig && modelsStatus && <p className="text-xs text-[#7C9B88]">{modelsStatus}</p>}
            </div>
            {error && <p role="alert" className="text-xs text-[#FB7185]">{error}</p>}
            {saved && <p role="status" className="text-xs font-bold text-[#39FF88]">Saved</p>}
          </form>
          <footer className="flex shrink-0 items-center justify-between border-t border-[#294536] px-5 py-4"><button type="button" onClick={remove} disabled={!existing} className="quiet-button h-9 text-[#FB7185] disabled:opacity-40"><Trash2 size={14} /> Delete</button><button type="submit" form="agent-form" className="quiet-button h-9">{saved ? <Check size={14} /> : <Save size={14} />}{saved ? "Saved" : "Save"}</button></footer>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
