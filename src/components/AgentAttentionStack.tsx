import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChevronRight, Layers, Minus } from "lucide-react";
import { Button } from "./ui/button";

export type AgentAttentionRequest = {
  id: string;
  requestId: number;
  taskId: string | null;
  taskTitle: string;
  kind: "question" | "approval";
  title: string;
};

export function AgentAttentionStack({ requests, onOpen }: {
  requests: AgentAttentionRequest[];
  onOpen: (request: AgentAttentionRequest) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [minimizedIds, setMinimizedIds] = useState<string[]>([]);
  const stack = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!requests.length) return;
    const focusRequests = (event: KeyboardEvent) => {
      if (event.key !== "F6" || !stack.current) return;
      event.preventDefault();
      if (stack.current.contains(document.activeElement) && previousFocus.current?.isConnected) previousFocus.current.focus();
      else {
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        stack.current.querySelector("button")?.focus();
      }
    };
    document.addEventListener("keydown", focusRequests);
    return () => document.removeEventListener("keydown", focusRequests);
  }, [requests.length]);
  const active = requests.find((request) => request.id === activeId) ?? requests[0];
  if (!active) return null;
  const minimized = requests.every((request) => minimizedIds.includes(request.id));
  const behind = requests.filter((request) => request.id !== active.id).slice(0, 2);
  const content = <aside ref={stack} className="agent-attention-stack" aria-label="Agent requests" aria-live="polite" aria-atomic="false" aria-keyshortcuts="F6">
    {minimized ? <Button variant="outline" size="sm" className="agent-attention-compact" onClick={() => setMinimizedIds([])} aria-label="Show agent requests" title="Agent requests (F6)"><Layers />{requests.length} {requests.length === 1 ? "request needs" : "requests need"} you</Button> : <>
      <div className="agent-attention-pile" style={{ paddingBottom: behind.length * 5 }}>
        {behind.map((request, index) => <div key={request.id} className="agent-attention-behind" style={{ top: (index + 1) * 5, bottom: (behind.length - index - 1) * 5, insetInline: (index + 1) * 7, zIndex: behind.length - index }} aria-hidden="true" />)}
        <article className="agent-attention-card">
          <header className="agent-attention-heading">
            <Layers size={13} aria-hidden="true" /><span className="agent-attention-task" title={active.taskTitle}>{active.taskTitle}</span>
            <Button variant="ghost" size="icon-xs" aria-label="Minimize agent requests" onClick={() => setMinimizedIds(requests.map((request) => request.id))}><Minus /></Button>
          </header>
          <span className="agent-attention-kind">{active.kind === "question" ? "Answer needed" : "Approval needed"}</span>
          <h2 title={active.title}>{active.title}</h2>
          <footer>
            <Button size="sm" onClick={() => { setMinimizedIds(requests.map((request) => request.id)); onOpen(active); }}>{active.kind === "question" ? "Answer" : "Review approval"}<ArrowUpRight /></Button>
            <span className="agent-attention-count" role="status">{requests.length} {requests.length === 1 ? "request" : "requests"}</span>
            {requests.length > 1 && <Button variant="ghost" size="icon-sm" aria-label="Next request" title="Next request" onClick={() => setActiveId(requests[(requests.findIndex((request) => request.id === active.id) + 1) % requests.length].id)}><ChevronRight /></Button>}
          </footer>
        </article>
      </div>
    </>}
  </aside>;
  return createPortal(content, document.body);
}
