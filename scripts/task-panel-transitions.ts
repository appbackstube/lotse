import { act } from "react";
import { emit } from "@tauri-apps/api/event";
import { taskStorageKey } from "../src/tasks";

export async function checkTaskPanelTransitions({ repositoryRoot, taskId, taskTitle, otherTaskTitle, storage, preparedPreviews, releasedPreviews, openedUrls, deferPreview, failNextPreview }: {
  repositoryRoot: string; taskId: string; taskTitle: string; otherTaskTitle: string; storage: Record<string, string>;
  preparedPreviews: { token: string; taskId: string }[]; releasedPreviews: string[]; openedUrls: string[];
  deferPreview: () => () => void; failNextPreview: () => void;
}) {
  const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const tick = async (ms = 30) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); };
  const waitFor = async (condition: () => unknown, message: string) => {
    const deadline = performance.now() + 20_000;
    while (!condition() && performance.now() < deadline) await tick();
    check(condition(), message);
  };
  const surface = () => document.querySelector<HTMLElement>('[aria-label="Task workspace"], [role="dialog"][data-slot="dialog-content"]')!;
  const tab = (name: string) => [...surface().querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((element) => element.textContent?.trim().startsWith(name))!;
  const click = async (element: HTMLElement) => { check(element, "Missing tab/control"); await act(async () => { element.focus(); element.click(); }); };
  const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === name && element.getBoundingClientRect().width)!;
  const iframe = () => surface().querySelector<HTMLIFrameElement>('iframe[title="Task sandbox preview"]');
  const canvas = () => surface().querySelector<HTMLCanvasElement>('[aria-label="Task drawing"] canvas.static');
  const previewReady = () => !!iframe() && surface().querySelector('[aria-label="Task sandbox"]')?.getAttribute("aria-busy") === "false";

  await waitFor(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/components/TaskDrawing")), "Drawing code must load while Detail is open, before its first use");
  check(!canvas() && !preparedPreviews.length, "Preparing drawing code must not mount a canvas or execute a sandbox");
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const key = taskStorageKey(repositoryRoot);
  const tasks = JSON.parse(storage[key]);
  tasks.find((task: { id: string }) => task.id === taskId).drawing = JSON.stringify({ type: "excalidraw", version: 2, elements: convertToExcalidrawElements([{ type: "rectangle", x: 1000, y: 800, width: 300, height: 200 }]), appState: { viewBackgroundColor: "#ffffff" }, files: {} });
  storage[key] = JSON.stringify(tasks);
  await act(async () => { await emit("frontend-storage-changed", { key, value: storage[key], source: "other-window" }); });
  await click(tab("Draw"));
  check(tab("Draw").getAttribute("aria-selected") === "true" && !canvas(), "Draw selection must commit before the expensive canvas is mounted");
  await waitFor(() => !!canvas()?.width && !!surface().querySelector('.excalidraw'), "The real drawing must initialize");
  await tick(200);
  const drawingCanvas = canvas()!;
  const zoomIn = surface().querySelector<HTMLElement>('.excalidraw .zoom-in-button');
  if (zoomIn) { await click(zoomIn); await tick(100); }
  const zoom = () => surface().querySelector('.excalidraw .reset-zoom-button')?.textContent;
  const retainedZoom = zoom();
  const interactive = surface().querySelector<HTMLCanvasElement>('[aria-label="Task drawing"] canvas.interactive')!;
  const bounds = interactive.getBoundingClientRect();
  const beforePan = drawingCanvas.toDataURL();
  await act(async () => { interactive.dispatchEvent(new WheelEvent("wheel", { deltaX: 80, deltaY: 60, clientX: bounds.left + 200, clientY: bounds.top + 200, bubbles: true, cancelable: true })); });
  await tick(100);
  const pannedImage = drawingCanvas.toDataURL();
  check(pannedImage !== beforePan, "The viewport regression must actually pan the drawing");
  await click(tab("Detail"));
  check(drawingCanvas.isConnected && getComputedStyle(drawingCanvas).visibility === "hidden", "Leaving Draw must hide and retain its canvas");
  await click(tab("Draw"));
  check(canvas() === drawingCanvas && tab("Draw").getAttribute("aria-selected") === "true", "A warmed Draw tab must return the same canvas immediately");
  await waitFor(() => canvas()?.toDataURL() === pannedImage, "Returning to Draw must preserve the panned viewport");
  check(zoom() === retainedZoom, "Returning to Draw must preserve zoom");

  const releaseFirst = deferPreview();
  await click(tab("Sandbox"));
  check(tab("Sandbox").getAttribute("aria-selected") === "true" && !iframe(), "Sandbox selection must commit before native preparation");
  await waitFor(() => preparedPreviews.length === 1, "Sandbox preparation must begin after the selected tab paints");
  const panel = surface().querySelector<HTMLElement>('[aria-label="Task sandbox"]')!;
  const loadingBounds = panel.getBoundingClientRect();
  await act(async () => releaseFirst());
  await waitFor(previewReady, "The native-bootstrap sandbox must load under its actual CSP");
  const previewFrame = iframe()!;
  check(Math.abs(previewFrame.getBoundingClientRect().height - loadingBounds.height) < 1, `Preparing preview must reserve its final height (${loadingBounds.height} -> ${previewFrame.getBoundingClientRect().height}) without a layout jump`);
  check(previewFrame.getAttribute("sandbox") === "allow-scripts" && previewFrame.referrerPolicy === "no-referrer", "Retained previews must preserve their opaque-origin isolation");
  const state = async (command: string) => {
    let result: { boot: string; count: number; draft: string; scrollY: number } | undefined;
    const receive = (event: MessageEvent) => { if (event.source === previewFrame.contentWindow && event.origin === "null" && event.data?.type === "qa-sandbox-state") result = event.data; };
    window.addEventListener("message", receive);
    try {
      await act(async () => { previewFrame.contentWindow!.postMessage({ type: "qa-sandbox-command", command }, "*"); await new Promise((resolve) => setTimeout(resolve, 30)); });
      await waitFor(() => result, "The retained preview must answer state requests"); return result!;
    } finally { window.removeEventListener("message", receive); }
  };
  const before = await state("edit");
  check(before.count === 1 && before.draft === "Retained preview draft" && before.scrollY === 400, "Preview must contain meaningful state before switching");
  await click(tab("Draw")); await click(tab("Sandbox"));
  check(iframe() === previewFrame && previewReady() && preparedPreviews.length === 1 && !releasedPreviews.length, "A repeated Sandbox switch must neither prepare nor replace its iframe");
  const after = await state("state");
  check(JSON.stringify(after) === JSON.stringify(before), `Preview input, script state and scroll position must survive tab switches (${JSON.stringify(before)} -> ${JSON.stringify(after)})`);
  const activation = Object.getOwnPropertyDescriptor(navigator, "userActivation");
  Object.defineProperty(navigator, "userActivation", { configurable: true, value: { isActive: true } });
  try {
    const links = openedUrls.length;
    await state("link"); check(openedUrls.length === links + 1, "Visible activated preview links must remain functional");
    await click(tab("Detail")); await state("link");
    check(openedUrls.length === links + 1, "An inactive retained preview must not open external links");
  } finally { if (activation) Object.defineProperty(navigator, "userActivation", activation); else delete (navigator as unknown as { userActivation?: unknown }).userActivation; }
  await click(tab("Sandbox"));
  await state("error");
  await waitFor(() => button("Reload preview"), "A failed retained preview needs a direct retry action");
  failNextPreview(); await click(button("Reload preview"));
  await waitFor(() => panel.textContent?.includes("Synthetic preview preparation failure"), "Preparation failures must stay local to the preview");
  await click(button("Reload preview")); await waitFor(previewReady, "Retry must recover a failed preview");
  check(iframe() !== previewFrame && preparedPreviews.length === 3, "Explicit reload must replace the preview exactly once per attempt");
  const activeToken = preparedPreviews.at(-1)!.token;
  await click(tab("Detail"));
  await click(button(otherTaskTitle)); await tick(100);
  check(!drawingCanvas.isConnected && !previewFrame.isConnected && releasedPreviews.includes(activeToken), "Changing tasks must discard the previous task's drawing and release its preview");
  const count = preparedPreviews.length;
  await click(tab("Sandbox")); await tick(150);
  check(!iframe() && preparedPreviews.length === count && surface().textContent?.includes("Ask the task agent"), "An empty task must not inherit or execute the previous sandbox");

  await click(button(taskTitle));
  await click(tab("Detail"));
  const releaseLate = deferPreview();
  await click(tab("Sandbox")); await waitFor(() => preparedPreviews.length === count + 1, "The cancellation case must start a real pending preparation");
  const lateToken = preparedPreviews.at(-1)!.token;
  await click(surface().matches('[aria-label="Task workspace"]') ? button("Workspace") : surface().querySelector<HTMLElement>('[aria-label="Close task modal"]')!);
  await act(async () => releaseLate());
  await waitFor(() => releasedPreviews.includes(lateToken), "A preparation resolving after close must release its token");
  check(!document.querySelector('[aria-label="Task drawing"] canvas') && !document.querySelector('iframe[title="Task sandbox preview"]'), "Closing the task must free both retained views");
}
