import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw, restoreElements, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import "./TaskDrawing.css";
import { readTaskDrawing } from "../taskDrawing";

export default function TaskDrawing({ value, onChange, active = true }: { value?: string; onChange: (drawing: string) => void; active?: boolean }) {
  const [initialData] = useState(() => readTaskDrawing(value));
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  useEffect(() => {
    if (!api || !active) return;
    api.refresh();
    if (fitted.current) return;
    let frame: number;
    const fitDrawing = () => {
      const bounds = container.current?.getBoundingClientRect();
      const state = api.getAppState();
      if (state.isLoading || !state.width || !state.height || !bounds?.width || !bounds.height) {
        frame = requestAnimationFrame(fitDrawing);
        return;
      }
      if (api.getSceneElements().length) api.scrollToContent(undefined, { fitToContent: true, viewportZoomFactor: 0.85, animate: false });
      fitted.current = true;
    };
    frame = requestAnimationFrame(fitDrawing);
    return () => cancelAnimationFrame(frame);
  }, [api, active]);
  const [theme, setTheme] = useState<"light" | "dark">(() => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  useEffect(() => {
    const appearance = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => setTheme(appearance.matches ? "dark" : "light");
    updateTheme();
    appearance.addEventListener("change", updateTheme);
    return () => appearance.removeEventListener("change", updateTheme);
  }, []);
  const saved = useRef(value);
  const pending = useRef<Parameters<NonNullable<ExcalidrawProps["onChange"]>> | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      const [elements, appState, files] = pending.current;
      pending.current = null;
      const drawing = serializeAsJSON(elements, appState, files, "local");
      if (drawing !== saved.current) {
        saved.current = drawing;
        change.current(drawing);
      }
    }
  }, []);
  const onSceneChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>((elements, appState, files) => {
    // Keep scene serialization and task persistence off the pointer-move path.
    pending.current = [elements, appState, files];
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }, [flush]);
  useEffect(() => {
    window.addEventListener("flush-task-drawing", flush);
    return () => { window.removeEventListener("flush-task-drawing", flush); flush(); };
  }, [flush]);
  useEffect(() => { if (!active) flush(); }, [active, flush]);
  useEffect(() => {
    if (!api || value === saved.current) return;
    const scene = readTaskDrawing(value);
    if (!scene) return;
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    saved.current = value;
    api.addFiles(Object.values(scene.files ?? {}));
    api.updateScene({ elements: restoreElements(scene.elements, api.getSceneElementsIncludingDeleted(), { refreshDimensions: true, repairBindings: true }), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [api, value]);
  return <div ref={container} className="flex h-full min-h-0 flex-col" aria-label="Task drawing">
    <div className="min-h-0 flex-1"><Excalidraw theme={theme} zenModeEnabled excalidrawAPI={setApi} initialData={initialData} onChange={onSceneChange} UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false } }} /></div>
  </div>;
}
