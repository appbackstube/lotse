import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Info, MessageSquare, Plus, Route, Trash2 } from "lucide-react";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { newPipeline, newPipelineStep, pipelineError, type Pipeline, type PipelineStep } from "../pipelines";
import type { ChatAgent } from "../agents";

type Confirmation = { title: string; description: string; actionLabel: string; action: () => void };
export function PipelineDesigner({ pipelines, agents, onChange, onConfirm }: {
  pipelines: Pipeline[]; agents: ChatAgent[]; onChange: (pipelines: Pipeline[]) => void; onConfirm: (confirmation: Confirmation) => void;
}) {
  const [selectedId, setSelectedId] = useState(pipelines[0]?.id);
  const selected = pipelines.find((p) => p.id === selectedId) ?? pipelines[0];
  const update = (change: Partial<Pipeline>) => { if (selected) onChange(pipelines.map((p) => p.id === selected.id ? { ...p, ...change } : p)); };
  const stepUpdate = (id: string, change: Partial<PipelineStep>) => { if (selected) update({ steps: selected.steps.map((s) => s.id === id ? { ...s, ...change } : s) }); };
  const create = () => { const p = newPipeline(); onChange([...pipelines, p]); setSelectedId(p.id); };
  const move = (index: number, offset: number) => {
    if (!selected || index + offset < 0 || index + offset >= selected.steps.length) return;
    const steps = [...selected.steps]; [steps[index], steps[index + offset]] = [steps[index + offset], steps[index]]; update({ steps });
  };
  const error = selected ? pipelineError(selected, agents) : null;
  return <section className="pipeline-designer" aria-label="Pipeline designer">
    <p className="pipeline-intro">Reusable workflows for your tasks. Start one from the + menu in the task chat.</p>
    <div className="pipeline-layout">
      <aside className="pipeline-library" aria-label="Saved pipelines">
        <header><span>Pipelines</span><Button variant="ghost" size="icon-sm" onClick={create} aria-label="New pipeline"><Plus size={15} /></Button></header>
        {pipelines.map((p) => <button type="button" key={p.id} onClick={() => setSelectedId(p.id)} aria-current={selected?.id === p.id ? "true" : undefined} className="pipeline-library-item"><Route size={15} /><span><strong>{p.title || "Untitled pipeline"}</strong><small>{p.steps.length} steps · {p.steps.reduce((n, s) => n + s.messages.length, 0)} messages</small></span></button>)}
        {!pipelines.length && <p>No pipelines yet.</p>}
      </aside>
      {selected ? <div className="pipeline-editor">
        <header className="pipeline-editor-heading"><Input aria-label="Pipeline title" value={selected.title} maxLength={200} placeholder="Pipeline title" onChange={(e) => update({ title: e.currentTarget.value })} /><Input aria-label="Pipeline description" value={selected.description} maxLength={240} placeholder="What does this pipeline do?" onChange={(e) => update({ description: e.currentTarget.value })} /></header>
        <div className="pipeline-meta"><span>{selected.steps.length} steps</span><span><MessageSquare size={12} />{selected.steps.reduce((n, s) => n + s.messages.length, 0)} messages</span><span>One after another</span></div>
        {selected.steps.map((step, index) => <div key={step.id}>
          <article className="pipeline-step">
            <header><span className="pipeline-number">{index + 1}</span><Input aria-label={`Step ${index + 1} title`} value={step.title} maxLength={200} onChange={(e) => stepUpdate(step.id, { title: e.currentTarget.value })} /><div className="pipeline-step-tools"><Button variant="ghost" size="icon-sm" disabled={index === 0} aria-label={`Move step ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button><Button variant="ghost" size="icon-sm" disabled={index === selected.steps.length - 1} aria-label={`Move step ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button><Button variant="ghost" size="icon-sm" disabled={selected.steps.length === 1} aria-label={`Delete step ${index + 1}`} onClick={() => update({ steps: selected.steps.filter((s) => s.id !== step.id) })}><Trash2 size={14} /></Button></div></header>
            <div className="pipeline-step-body"><div className="pipeline-role"><label id={`pipeline-role-${step.id}`}>Agent role</label><Select value={step.agentId ?? "__none__"} onValueChange={(value) => { if (value) stepUpdate(step.id, { agentId: value === "__none__" ? null : value }); }}><SelectTrigger aria-labelledby={`pipeline-role-${step.id}`}><SelectValue>{() => step.agentId === null ? "None" : agents.find((a) => a.id === step.agentId)?.title ?? "Deleted role — choose another"}</SelectValue></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.title}</SelectItem>)}</SelectContent></Select></div>
              <p className="pipeline-messages-label">Messages · sent in order</p>
              {step.messages.map((text, messageIndex) => <div className="pipeline-message" key={messageIndex}><span>{messageIndex + 1}</span><Textarea aria-label={`Step ${index + 1} message ${messageIndex + 1}`} rows={3} value={text} maxLength={20_000} placeholder="What should this agent do?" onChange={(e) => stepUpdate(step.id, { messages: step.messages.map((m, i) => i === messageIndex ? e.currentTarget.value : m) })} /><Button variant="ghost" size="icon-sm" disabled={step.messages.length === 1} aria-label={`Delete message ${messageIndex + 1} from step ${index + 1}`} onClick={() => stepUpdate(step.id, { messages: step.messages.filter((_, i) => i !== messageIndex) })}><Trash2 size={13} /></Button></div>)}
              <Button variant="ghost" size="sm" className="pipeline-add-message" disabled={step.messages.length >= 50} onClick={() => stepUpdate(step.id, { messages: [...step.messages, ""] })}><Plus size={13} /> Add message</Button>
            </div>
          </article>
          <div className="pipeline-connector">{index === selected.steps.length - 1 ? "Then · pipeline complete" : step.agentId === selected.steps[index + 1].agentId ? "Then · continue with the same role" : "Then · switch role"}</div>
        </div>)}
        <Button variant="outline" className="pipeline-add-step" disabled={selected.steps.length >= 50} onClick={() => update({ steps: [...selected.steps, newPipelineStep()] })}><Plus size={15} /> Add step</Button>
        <p className="pipeline-note"><Info size={15} /><span>Messages run in order. Each waits for the agent to finish.<br />A role change starts a new chat with the recent conversation as handoff. Previous messages stay visible.</span></p>
        <footer className="pipeline-editor-footer"><span role="status">{error ? <><Info size={13} /> Draft · {error}</> : <><Check size={13} /> Saved automatically</>}</span><Button variant="ghost" size="sm" onClick={() => onConfirm({ title: `Delete “${selected.title || "Untitled pipeline"}”?`, description: "This removes the saved pipeline. Running tasks keep their own copy.", actionLabel: "Delete pipeline", action: () => onChange(pipelines.filter((p) => p.id !== selected.id)) })}><Trash2 size={14} /> Delete</Button></footer>
      </div> : <div className="pipeline-empty"><Route size={30} /><h3>Your next repeatable workflow</h3><p>Choose a role, add messages, then let Lotse follow the steps.</p><Button onClick={create}><Plus size={14} /> New pipeline</Button></div>}
    </div>
  </section>;
}
