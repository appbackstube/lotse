import { act } from "react";
import { createRoot } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { initializeFileStore } from "../src/fileStore";
import { TaskBrowser } from "../src/components/TaskBrowser";
import pageScript from "../src-tauri/src/browser/page.js?raw";
import "../src/App.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
mockWindows("main");
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const tick = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); }); };
const views: any[] = [];
const actions: any[] = [];
const initial = (taskId: string) => ({ repositoryRoot: "/repo", taskId, url: "", title: "", canGoBack: false, canGoForward: false, loading: false, error: null });
const sessions = new Map<string, ReturnType<typeof initial>>();
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return {};
  if (command === "task_browser_hide") { views.push({ visible: false, revision: args.revision }); return; }
  if (command === "task_browser_view") {
    views.push(args);
    if (args.visible && !sessions.has(args.taskId)) sessions.set(args.taskId, initial(args.taskId));
    return sessions.get(args.taskId) ?? null;
  }
  if (command === "task_browser_action") {
    actions.push(args);
    if (args.action.url?.startsWith("javascript:")) throw new Error("Only HTTP and HTTPS addresses are supported.");
    const state = sessions.get(args.taskId)!;
    if (args.action.action === "navigate") { state.url = `https://${args.action.url}/`; state.canGoBack = true; }
    if (args.action.action === "back") { state.url = "https://previous.example/"; state.canGoForward = true; }
    if (args.action.action === "forward") state.url = "https://next.example/";
    return { ...state };
  }
  if (command.startsWith("plugin:window|")) return;
  throw new Error(`Unexpected IPC command: ${command}`);
}, { shouldMockEvents: true });

const root = createRoot(document.getElementById("root")!);
const button = (name: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
const address = () => document.querySelector<HTMLInputElement>('[aria-label="Browser address"]')!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); await tick(); };
const type = async (value: string) => { await act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(address(), value);
  address().dispatchEvent(new Event("input", { bubbles: true }));
}); };
const submit = async () => { await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await tick(); };
let frame: HTMLIFrameElement | undefined;
try {
  await initializeFileStore();
  await act(async () => root.render(<TaskBrowser repositoryRoot="/repo" taskId="one" active={false} />)); await tick();
  check(!sessions.size, "Hidden panels must not create a browser");
  await act(async () => root.render(<TaskBrowser repositoryRoot="/repo" taskId="one" active />)); await tick();
  check(sessions.has("one") && views.at(-1).visible && views.at(-1).bounds.width > 0, "Opening Browser must attach a correctly sized viewport");
  check(button("Browser back").disabled && button("Browser forward").disabled && button("Reload browser").disabled, "Empty history controls must be disabled");
  check(![...document.querySelectorAll("button")].some((button) => button.textContent === "Go"), "Navigation must not show a Go button");
  await act(async () => address().focus());
  await type("example.com"); await submit();
  check(actions.at(-1).taskId === "one" && address().value === "https://example.com/", "Address submission must target the current task");
  const publishUrl = async (url: string) => {
    Object.assign(sessions.get("one")!, { url });
    await act(async () => { await emit("task-browser-state", { ...sessions.get("one")! }); });
  };
  await publishUrl("https://redirect.example/");
  check(address().value === "https://redirect.example/", "Redirects must update an address that still has focus after Enter");
  await type("unfinished.example");
  await publishUrl("https://spa.example/route#section");
  check(address().value === "unfinished.example", "Page events must preserve an address being edited");
  await act(async () => address().blur());
  check(address().value === "https://spa.example/route#section", "Leaving the address must show the latest page URL");
  await click(button("Browser back"));
  check(address().value === "https://previous.example/" && !button("Browser forward").disabled, "History state must update the toolbar");
  await click(button("Browser forward")); await click(button("Reload browser"));
  check(actions.at(-1).action.action === "reload", "Reload must use the native action");
  await type("javascript:alert(1)"); await submit();
  check(document.querySelector('[role="alert"]')?.textContent?.includes("Only HTTP"), "Navigation errors must be local and retryable");
  await type("recovered.example"); await submit();
  check(!document.querySelector('[role="alert"]'), "Successful retry must clear the navigation error");
  const overlay = document.createElement("div"); overlay.setAttribute("role", "dialog");
  Object.assign(overlay.style, { position: "fixed", inset: "0px" });
  await act(async () => document.body.append(overlay)); await tick();
  check(!views.at(-1).visible, "Overlapping dialogs must hide native content");
  await act(async () => overlay.remove()); await tick();
  check(views.at(-1).visible, "Closing overlays must restore native content");
  overlay.removeAttribute("role"); overlay.className = "agent-attention-stack";
  await act(async () => document.body.append(overlay)); await tick();
  check(!views.at(-1).visible, "Agent request cards must stay above native browser content");
  await act(async () => overlay.remove()); await tick();
  check(views.at(-1).visible, "Removing agent request cards must restore native content");
  const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  await act(async () => document.dispatchEvent(new Event("visibilitychange"))); await tick();
  check(!views.at(-1).visible, "Document occlusion must hide the native browser");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  await act(async () => document.dispatchEvent(new Event("visibilitychange"))); await tick();
  check(views.at(-1).visible, "Returning to a visible document must restore the browser");
  if (visibility) Object.defineProperty(document, "visibilityState", visibility);
  else delete (document as unknown as { visibilityState?: string }).visibilityState;
  await act(async () => root.render(<TaskBrowser repositoryRoot="/repo" taskId="one" active={false} />)); await tick();
  check(!views.at(-1).visible && sessions.get("one")?.url.includes("recovered"), "Leaving Browser must hide and retain its page");
  await act(async () => { root.render(<TaskBrowser key="two" repositoryRoot="/repo" taskId="two" active />); }); await tick();
  await act(async () => { await emit("task-browser-state", { ...initial("one"), url: "https://wrong-task/" }); });
  check(!address().value, "Other tasks must not overwrite the current address");
  await act(async () => root.render(<TaskBrowser key="one" repositoryRoot="/repo" taskId="one" active />));
  check(address().value.includes("recovered"), "Reopening must restore the toolbar before a native response or animation frame");
  await tick();
  check(address().value.includes("recovered"), "Reopening task detail must restore its live page");
  await act(async () => root.unmount());
  check(!views.at(-1).visible, "Closing must request native hiding during the layout cleanup, before another animation frame");
  await tick();
  check(!views.at(-1).visible && sessions.has("one"), "Closing details must detach without destroying the session");

  frame = document.createElement("iframe");
  frame.style.cssText = "width:900px;height:500px";
  const loaded = new Promise<void>((resolve) => { frame!.onload = () => resolve(); });
  frame.srcdoc = `<form><label>Name<input id="name"></label><textarea aria-label="Notes"></textarea><select aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><button type="button" onclick="document.querySelector('#output').textContent='Clicked'">Act</button><input type="password" value="secret"><input type="file" aria-label="File"><p id="output">Ready</p></form><div style="height:2000px"></div>`;
  document.body.append(frame); await loaded;
  const win = frame.contentWindow as Window & typeof globalThis;
  const run = win.Function(`return (${pageScript})`)() as (action: object) => string;
  const page = (action: object) => JSON.parse(run(action));
  let snapshot = page({ action: "snapshot" });
  const ref = (name: string) => snapshot.elements.find((el: any) => el.name === name)?.reference;
  check(ref("Name") && !JSON.stringify(snapshot).includes("secret"), "Snapshots must expose usable references and redact password values");
  check(page({ action: "fill", reference: ref("Name"), text: "Task agent" }).ok, "Agent must fill text fields");
  check(frame.contentDocument!.querySelector<HTMLInputElement>("input")!.value === "Task agent", "Agent changes must reach the visible document");
  page({ action: "select", reference: ref("Choice"), value: "b" });
  check(frame.contentDocument!.querySelector("select")!.value === "b", "Agent must select options");
  page({ action: "click", reference: ref("Act") });
  check(frame.contentDocument!.querySelector("#output")!.textContent === "Clicked", "Agent clicks must run website handlers");
  check(page({ action: "fill", reference: ref("File"), text: "/tmp/no" }).error, "File transfers must fail explicitly");
  const stale = ref("Name"); snapshot = page({ action: "snapshot" });
  check(page({ action: "click", reference: stale }).error.includes("Stale"), "Old snapshot references must be rejected");
  const name = frame.contentDocument!.querySelector<HTMLInputElement>("input")!;
  name.setSelectionRange(name.value.length, name.value.length);
  page({ action: "key", reference: ref("Name"), key: "Backspace" });
  check(name.value === "Task agen", "Key actions must edit selected text");
  const scroll = page({ action: "scroll", x: 0, y: 200 });
  check(scroll.ok && scroll.y > 0, "Agent must scroll the live viewport");
  document.getElementById("result")!.textContent = "PASS: Browser toolbar, navigation/errors, task isolation, retention, overlay hiding, page snapshots, stale references, clicks, forms, key events, scrolling and password redaction.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${String(error)}\n${(error as Error).stack}`;
} finally {
  await act(async () => root.unmount()); frame?.remove();
}
