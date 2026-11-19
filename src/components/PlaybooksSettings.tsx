import type { Dispatch, SetStateAction } from "react";
import { ArrowDown, ArrowUp, Blocks, Check, Plus, Save, Trash2 } from "lucide-react";
import { movePlaybook, type Playbook } from "../playbooks";

export function PlaybooksSettings({ playbooks, setPlaybooks, selectedPlaybookId, playbookDraft, setPlaybookDraft, playbookError, playbookSaveNotice, createPlaybook, selectPlaybook, savePlaybook, deletePlaybook }: {
  playbooks: Playbook[];
  setPlaybooks: Dispatch<SetStateAction<Playbook[]>>;
  selectedPlaybookId: string;
  playbookDraft: Playbook;
  setPlaybookDraft: Dispatch<SetStateAction<Playbook>>;
  playbookError: string;
  playbookSaveNotice: string;
  createPlaybook: () => void;
  selectPlaybook: (playbook: Playbook) => void;
  savePlaybook: () => Playbook | null;
  deletePlaybook: () => void;
}) {
  return <section aria-label="Playbook manager" className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-[#294536] bg-[#0B110E]">
    <header className="flex min-h-[66px] flex-wrap items-center gap-3 border-b border-[#294536] px-5 py-3">
      <p className="text-xs text-[#7C9B88]">Reusable prompts for Agent Chat</p>
      <button type="button" onClick={createPlaybook} className="quiet-button ml-auto h-9"><Plus size={14} /> New playbook</button>
    </header>
    <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(140px,27%)_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto border-r border-[#294536] bg-[#0B110E] p-3" aria-label="Saved playbooks">
        <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7C9B88]">Saved playbooks</div>
        <div className="space-y-1">
          {selectedPlaybookId === playbookDraft.id && !playbooks.some((playbook) => playbook.id === playbookDraft.id) && (
            <div className="flex w-full items-start gap-2.5 rounded-lg border border-[#294536] bg-[#183522] px-3 py-3 text-left">
              <Plus size={15} className="mt-0.5 shrink-0 text-[#A3FF12]" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[#E8FFF0]">{playbookDraft.title || "New playbook"}</span>
                <span className="mt-1 block truncate text-xs text-[#7C9B88]">Unsaved draft</span>
              </span>
            </div>
          )}
          {playbooks.map((playbook, index) => (
            <div key={playbook.id} className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-3 ${selectedPlaybookId === playbook.id ? "border-[#294536] bg-[#183522]" : "border-transparent hover:bg-[#111A15]"}`}>
              <button type="button" onClick={() => selectPlaybook(playbook)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                <Blocks size={15} className="mt-0.5 shrink-0 text-[#A3FF12]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[#E8FFF0]">{playbook.title}</span>
                  <span className="mt-1 block truncate text-xs text-[#7C9B88]">{playbook.description || "Custom Agent Chat prompt"}</span>
                </span>
              </button>
              <div className="flex shrink-0 flex-col gap-0.5">
                <button type="button" className="grid size-6 place-items-center rounded text-[#7C9B88] hover:bg-[#294536] hover:text-white disabled:opacity-30" aria-label={`Move ${playbook.title} up`} title="Move up" disabled={index === 0} onClick={() => setPlaybooks((current) => movePlaybook(current, playbook.id, -1))}><ArrowUp size={14} /></button>
                <button type="button" className="grid size-6 place-items-center rounded text-[#7C9B88] hover:bg-[#294536] hover:text-white disabled:opacity-30" aria-label={`Move ${playbook.title} down`} title="Move down" disabled={index === playbooks.length - 1} onClick={() => setPlaybooks((current) => movePlaybook(current, playbook.id, 1))}><ArrowDown size={14} /></button>
              </div>
            </div>
          ))}
          {!playbooks.length && (
            <div className="rounded-lg border border-dashed border-[#294536] px-3 py-8 text-center text-xs text-[#7C9B88]">
              No saved playbooks
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-h-0 flex-col bg-[#111A15]">
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <label className="block text-xs font-bold text-[#7C9B88]">
            Title
            <input
              value={playbookDraft.title}
              onChange={(event) => {
                const title = event.currentTarget.value;
                setPlaybookDraft((draft) => ({ ...draft, title }));
              }}
              maxLength={200}
              className="mt-2 h-10 w-full rounded-md border border-[#294536] bg-[#050807] px-3 text-sm font-semibold text-[#E8FFF0] outline-none focus:border-[#A3FF12]"
            />
          </label>
          <label className="mt-4 block text-xs font-bold text-[#7C9B88]">
            Short description <span className="font-normal">(optional)</span>
            <input
              value={playbookDraft.description}
              onChange={(event) => {
                const description = event.currentTarget.value;
                setPlaybookDraft((draft) => ({ ...draft, description }));
              }}
              maxLength={240}
              className="mt-2 h-10 w-full rounded-md border border-[#294536] bg-[#050807] px-3 text-sm text-[#E8FFF0] outline-none focus:border-[#A3FF12]"
            />
          </label>
          <label className="mt-4 block text-xs font-bold text-[#7C9B88]">
            Prompt
            <textarea
              value={playbookDraft.prompt}
              onChange={(event) => {
                const prompt = event.currentTarget.value;
                setPlaybookDraft((draft) => ({ ...draft, prompt }));
              }}
              maxLength={20_000}
              rows={9}
              className="mt-2 min-h-44 w-full resize-y rounded-md border border-[#294536] bg-[#050807] p-3 text-sm leading-6 text-[#E8FFF0] outline-none focus:border-[#A3FF12]"
            />
          </label>
          <div className="mt-4 rounded-md border border-[#294536] bg-[#0B110E] p-3">
            <div className="flex items-center justify-between text-xs font-bold text-[#7C9B88]"><span>Variables <span className="font-normal">(use as {"{{NAME}}"} in the prompt)</span></span><button type="button" onClick={() => setPlaybookDraft((draft) => ({ ...draft, variables: [...draft.variables, { id: crypto.randomUUID(), name: "", label: "", type: "singleLine" }] }))} className="text-[#A3FF12]">+ Variable</button></div>
            {playbookDraft.variables.map((variable) => <div key={variable.id} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs text-[#7C9B88]">Name<input value={variable.name} onChange={(event) => { const name = event.currentTarget.value; setPlaybookDraft((draft) => ({ ...draft, variables: draft.variables.map((item) => item.id === variable.id ? { ...item, name } : item) })); }} placeholder="GOAL" className="mt-1 block h-9 w-32 rounded border border-[#294536] bg-[#050807] px-2 font-mono text-xs text-[#E8FFF0] outline-none focus:border-[#A3FF12]" /></label>
              <label className="min-w-36 flex-1 text-xs text-[#7C9B88]">Label<input value={variable.label} maxLength={200} onChange={(event) => { const label = event.currentTarget.value; setPlaybookDraft((draft) => ({ ...draft, variables: draft.variables.map((item) => item.id === variable.id ? { ...item, label } : item) })); }} placeholder="What should the agent focus on?" className="mt-1 block h-9 w-full rounded border border-[#294536] bg-[#050807] px-2 text-xs text-[#E8FFF0] outline-none focus:border-[#A3FF12]" /></label>
              <label className="text-xs text-[#7C9B88]">Type<select value={variable.type} onChange={(event) => { const type = event.currentTarget.value as typeof variable.type; setPlaybookDraft((draft) => ({ ...draft, variables: draft.variables.map((item) => item.id === variable.id ? { ...item, type } : item) })); }} className="mt-1 block h-9 rounded border border-[#294536] bg-[#050807] px-2 text-xs text-[#E8FFF0] outline-none focus:border-[#A3FF12]"><option value="singleLine">Single line</option><option value="multiLine">Multi line</option></select></label>
              <button type="button" onClick={() => setPlaybookDraft((draft) => ({ ...draft, variables: draft.variables.filter((item) => item.id !== variable.id) }))} className="h-9 px-1 text-xs text-[#fb7185]">Remove</button>
            </div>)}
            {playbookDraft.variables.length > 0 && <p className="mt-2 text-xs text-[#7C9B88]">Values are requested every time this playbook runs.</p>}
          </div>
          {playbookError && <p role="alert" className="mt-3 text-xs text-[#FB7185]">{playbookError}</p>}
          {playbookSaveNotice && <p role="status" aria-live="polite" className="mt-3 text-xs font-bold text-[#39FF88]">{playbookSaveNotice}</p>}
        </div>
        <footer className="flex h-16 shrink-0 items-center justify-between border-t border-[#294536] px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={deletePlaybook}
              disabled={!playbooks.some((playbook) => playbook.id === playbookDraft.id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-bold text-[#FB7185] hover:bg-[#3a1b24] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={savePlaybook} className="quiet-button h-9">
              {playbookSaveNotice ? <Check size={14} className="text-[#39FF88]" /> : <Save size={14} />} {playbookSaveNotice || "Save"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </section>;
}
