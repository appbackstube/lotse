import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fileStore } from "../fileStore";
import { sandboxLinkUrl } from "../taskSandbox";

type Preview = { token: string; url: string };

export function TaskSandbox({ repositoryRoot, taskId, value, active = true }: { repositoryRoot: string; taskId: string; value?: string; active?: boolean }) {
  const [preview, setPreview] = useState<(Preview & { html: string }) | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(!!value);
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const activeRef = useRef(active);
  const onFrameLoad = useRef(() => {});
  useLayoutEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    let cancelled = false;
    let openingLink = false;
    let token: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ready = false;
    let loaded = false;
    const finish = () => { if (ready && loaded) { clearTimeout(timer); setLoading(false); } };
    onFrameLoad.current = () => { loaded = true; finish(); };
    setPreview(null);
    setErrors([]);
    setLoading(!!value);
    const report = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow || event.origin !== "null") return;
      if (event.data?.type === "task-sandbox-open-link") {
        if (!activeRef.current || !frame.current.getBoundingClientRect().width) return;
        const url = sandboxLinkUrl(event.data.url, frame.current.src);
        if (!url || !navigator.userActivation?.isActive || openingLink) return;
        openingLink = true;
        void openUrl(url).catch((reason) => {
          if (!cancelled) setErrors((current) => current.length < 10 ? [...current, `Could not open link: ${String(reason).slice(0, 2000)}`] : current);
        }).finally(() => { openingLink = false; });
        return;
      }
      if (event.data?.type === "task-sandbox-ready") { ready = true; finish(); }
      if (event.data?.type === "task-sandbox-error" && typeof event.data.message === "string") {
        setErrors((current) => current.length < 10 ? [...current, event.data.message.slice(0, 2000)] : current);
      }
    };
    window.addEventListener("message", report);
    if (value) void (async () => {
      try {
        await fileStore.flush();
        if (cancelled) return;
        const result = await invoke<Preview>("prepare_task_sandbox", { repositoryRoot, taskId });
        token = result.token;
        if (cancelled) { await invoke("release_task_sandbox", { token }); return; }
        setPreview({ ...result, html: value });
        timer = setTimeout(() => { setLoading(false); setErrors((current) => [...current, "Preview did not start. Try loading it again."]); }, 15_000);
      } catch (reason) {
        if (!cancelled) { setLoading(false); setErrors([String(reason)]); }
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      onFrameLoad.current = () => {};
      window.removeEventListener("message", report);
      if (token) void invoke("release_task_sandbox", { token }).catch(console.error);
    };
  }, [repositoryRoot, taskId, value, attempt]);

  return <div className="relative flex h-full min-h-0 flex-1 flex-col" aria-label="Task sandbox" aria-busy={loading}>
    {!value && <p className="p-4 text-sm text-[#7C9B88]">Ask the task agent to build a design, prototype or interactive tool here. Review it in this tab and share feedback in the task chat.</p>}
    {errors.length > 0 && <div role="alert" className="max-h-32 shrink-0 overflow-auto border-b border-[#482631] px-3 py-2 text-xs text-[#FB7185]">{errors.map((error, index) => <p key={index} className="whitespace-pre-wrap break-words">{error}</p>)}<button type="button" onClick={() => setAttempt((value) => value + 1)} className="quiet-button mt-2">Reload preview</button></div>}
    {preview && preview.html === value && <iframe key={preview.token} ref={frame} src={preview.url} title="Task sandbox preview" sandbox="allow-scripts" referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; display-capture 'none'" className={`task-sandbox-frame min-h-0 w-full flex-1 border-0 bg-white ${loading ? "opacity-0" : "opacity-100"}`} onLoad={() => onFrameLoad.current()} onError={() => { setLoading(false); setErrors((current) => [...current, "Could not load preview. Try loading it again."]); }} />}
    {loading && <div role="status" aria-label="Preparing preview" className="task-panel-placeholder pointer-events-none absolute inset-0"><span className="sr-only">Preparing preview</span></div>}
  </div>;
}
