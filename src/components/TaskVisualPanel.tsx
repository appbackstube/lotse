import { startTransition, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { TaskSandbox } from "./TaskSandbox";

type Drawing = typeof import("./TaskDrawing").default;
let loadedDrawing: Drawing | undefined;
let drawingModule: Promise<typeof import("./TaskDrawing")> | undefined;
function loadDrawing() {
  return drawingModule ??= import("./TaskDrawing").then((module) => {
    loadedDrawing = module.default;
    return module;
  }).catch((error) => { drawingModule = undefined; throw error; });
}

export function TaskPanelPlaceholder({ label }: { label: string }) {
  return <div className="task-panel-placeholder min-h-0 flex-1" role="status" aria-label={label}><span className="sr-only">{label}</span></div>;
}

function RetainedTaskPanel({ active, label, children }: { active: boolean; label: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!active || opened) return;
    // Let the selected tab paint before initializing a canvas or preview.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => startTransition(() => setOpened(true)));
    });
    return () => cancelAnimationFrame(frame);
  }, [active, opened]);
  return <div className="flex h-full min-h-0 flex-1 flex-col">{opened ? children : <TaskPanelPlaceholder label={label} />}</div>;
}

function DrawingContent(props: ComponentProps<Drawing>) {
  const [DrawingEditor, setDrawingEditor] = useState(() => loadedDrawing);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (DrawingEditor) return;
    let cancelled = false;
    void loadDrawing().then((module) => { if (!cancelled) setDrawingEditor(() => module.default); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [DrawingEditor, attempt]);
  if (error) return <div role="alert" className="p-4 text-sm"><p>The drawing could not be opened.</p><button type="button" className="quiet-button mt-2" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>Try again</button></div>;
  return DrawingEditor ? <div className="task-panel-ready min-h-0 flex-1"><DrawingEditor {...props} /></div> : <TaskPanelPlaceholder label="Preparing drawing" />;
}

export function TaskDrawingPanel(props: ComponentProps<Drawing> & { active: boolean }) {
  useEffect(() => {
    if (loadedDrawing) return;
    // Speculative loading has no UI effects; an actual open reports load failures.
    const prepare = () => { void loadDrawing().catch(() => {}); };
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(prepare);
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(prepare, 250);
    return () => clearTimeout(timer);
  }, []);
  return <RetainedTaskPanel active={props.active} label="Preparing drawing"><DrawingContent {...props} /></RetainedTaskPanel>;
}

export function TaskSandboxPanel(props: ComponentProps<typeof TaskSandbox> & { active: boolean }) {
  return <RetainedTaskPanel active={props.active} label="Preparing preview"><TaskSandbox {...props} /></RetainedTaskPanel>;
}
