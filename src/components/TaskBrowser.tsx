import { useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, ArrowRight, LoaderCircle, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { fileStore } from "../fileStore";

type BrowserState = { repositoryRoot: string; taskId: string; url: string; title: string; canGoBack: boolean; canGoForward: boolean; loading: boolean; error: string | null };
type Action = { action: "navigate"; url: string } | { action: "back" | "forward" | "reload" };
type Bounds = { x: number; y: number; width: number; height: number };

const rememberedStates = new Map<string, BrowserState>();
let presentationRevision = Date.now() * 1000;
const nextPresentationRevision = () => ++presentationRevision;

export function hideTaskBrowsers() {
  return invoke<void>("task_browser_hide", { revision: nextPresentationRevision() });
}

export function TaskBrowser({ repositoryRoot, taskId, active }: { repositoryRoot: string; taskId: string; active: boolean }) {
  const stateKey = `${repositoryRoot}:${taskId}`;
  const [state, setState] = useState<BrowserState | null>(() => rememberedStates.get(stateKey) ?? null);
  const [address, setAddress] = useState(() => rememberedStates.get(stateKey)?.url ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const addressEditing = useRef(false);
  const currentUrl = useRef(state?.url ?? "");

  useLayoutEffect(() => {
    let cancelled = false;
    const update = (value: BrowserState | null) => {
      if (cancelled || !value || value.repositoryRoot !== repositoryRoot || value.taskId !== taskId) return;
      rememberedStates.set(`${repositoryRoot}:${taskId}`, value);
      setState(value);
      if (value.url !== currentUrl.current && !addressEditing.current) setAddress(value.url);
      currentUrl.current = value.url;
    };
    const unlisten = listen<BrowserState>("task-browser-state", (event) => update(event.payload));
    let frame = 0;
    let inFlight = false;
    let pending = false;
    let lastGeometry = "";
    let lastPoll = 0;
    let prepared = rememberedStates.has(`${repositoryRoot}:${taskId}`);
    const sync = async () => {
      if (cancelled) return;
      if (inFlight) { pending = true; return; }
      const element = viewport.current;
      const rect = element?.getBoundingClientRect();
      const bounds: Bounds | null = rect ? { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height } : null;
      const overlays = document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-slot="popover-content"]');
      const obstructed = !!rect && Array.from(overlays).some((overlay) => {
        if (element && overlay.contains(element)) return false;
        const other = overlay.getBoundingClientRect();
        return other.width > 0 && other.height > 0 && other.left < rect.right && other.right > rect.left && other.top < rect.bottom && other.bottom > rect.top;
      });
      const visible = active && document.visibilityState !== "hidden" && !!bounds && bounds.width > 0 && bounds.height > 0 && !obstructed;
      const geometry = JSON.stringify({ bounds, visible });
      if (geometry === lastGeometry && (!visible || Date.now() - lastPoll < 500)) return;
      inFlight = true;
      lastGeometry = geometry;
      lastPoll = Date.now();
      const revision = nextPresentationRevision();
      try {
        if (!visible) { await hideTaskBrowsers(); return; }
        if (!prepared) { await fileStore.flush(); prepared = true; }
        if (!cancelled) update(await invoke<BrowserState | null>("task_browser_view", { repositoryRoot, taskId, bounds, visible, revision }));
      } catch (reason) { if (!cancelled) { setError(String(reason)); lastGeometry = ""; } }
      finally { inFlight = false; if (pending && !cancelled) { pending = false; schedule(); } }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; void sync(); }); };
    const resize = new ResizeObserver(schedule);
    if (viewport.current) resize.observe(viewport.current);
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden", "data-state", "aria-hidden"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    document.addEventListener("visibilitychange", schedule);
    // Also catches same-document navigation and animated layout changes.
    const timer = setInterval(schedule, 500);
    schedule();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearInterval(timer);
      resize.disconnect(); mutation.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      document.removeEventListener("visibilitychange", schedule);
      void unlisten.then((stop) => stop());
      void hideTaskBrowsers().catch(() => {});
    };
  }, [repositoryRoot, taskId, active]);

  const perform = async (action: Action) => {
    setBusy(true); setError("");
    try {
      await fileStore.flush();
      const value = await invoke<BrowserState>("task_browser_action", { repositoryRoot, taskId, action });
      rememberedStates.set(stateKey, value);
      setState(value);
      currentUrl.current = value.url;
      setAddress(value.url);
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };

  return <div className="flex h-full min-h-0 flex-1 flex-col" aria-label="Task browser">
    <form className="flex shrink-0 items-center gap-1 border-b border-[#294536] p-2" aria-label="Browser navigation" onSubmit={(event) => { event.preventDefault(); addressEditing.current = false; void perform({ action: "navigate", url: address }); }}>
      <Button type="button" variant="ghost" size="icon" aria-label="Browser back" title="Back" disabled={busy || !state?.canGoBack} onClick={() => void perform({ action: "back" })}><ArrowLeft /></Button>
      <Button type="button" variant="ghost" size="icon" aria-label="Browser forward" title="Forward" disabled={busy || !state?.canGoForward} onClick={() => void perform({ action: "forward" })}><ArrowRight /></Button>
      <Button type="button" variant="ghost" size="icon" aria-label="Reload browser" title="Reload" disabled={busy || !state?.url} onClick={() => void perform({ action: "reload" })}>{state?.loading ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <RotateCw />}</Button>
      <Input aria-label="Browser address" placeholder="Enter a website or localhost address" value={address} autoCapitalize="none" autoComplete="off" spellCheck={false} onBlur={() => { addressEditing.current = false; setAddress(currentUrl.current); }} onChange={(event) => { addressEditing.current = true; setAddress(event.target.value); }} />
    </form>
    {(error || state?.error) && <div role="alert" className="flex shrink-0 items-center justify-between gap-2 border-b border-[#482631] px-3 py-2 text-xs text-[#FB7185]"><span>{error || state?.error}</span><Button variant="ghost" size="sm" disabled={busy || !address.trim()} onClick={() => void perform({ action: "navigate", url: address })}>Retry</Button></div>}
    <div ref={viewport} className="relative min-h-0 flex-1 overflow-hidden bg-white" aria-label="Browser page" aria-busy={state?.loading ?? false}>
      {!state?.url && <p className="p-4 text-sm text-[#4B6657]">Enter an address above or ask the task agent to open a website here. Website logins are shared across tasks.</p>}
    </div>
  </div>;
}
