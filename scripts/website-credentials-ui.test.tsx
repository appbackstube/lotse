import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "./mockTauri";
import { PomodoroSettings } from "../src/components/PomodoroTimer";
import { defaultPomodoroSettings } from "../src/pomodoro";
import { WebsiteCredentialsSettings } from "../src/components/WebsiteCredentialsSettings";
import autofillScript from "../src-tauri/src/browser/autofill.js?raw";
import pageScript from "../src-tauri/src/browser/page.js?raw";
import "../src/App.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let checks = 0;
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); checks++; };
const calls: { command: string; args: any }[] = [];
const preview = new URL(location.href).searchParams.has("preview");
let stored: any[] = preview ? [{ baseUrl: "https://accounts.example.invalid", hasUsername: true, hasEmail: true, hasPassword: true }] : [];
let fail = false;
mockIPC((command, args: any) => {
  calls.push({ command, args });
  if (fail) throw new Error("Synthetic secret must not appear in errors");
  if (command === "list_website_credentials") return stored;
  if (command === "save_website_credential") { stored = [{ baseUrl: args.credential.baseUrl, hasUsername: true, hasEmail: true, hasPassword: true }]; return stored; }
  if (command === "delete_website_credential") { stored = []; return stored; }
  throw new Error("Unexpected command");
});
const root = createRoot(document.getElementById("root")!);
const tick = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const field = (name: string) => document.querySelector<HTMLInputElement>(`[aria-label="Website ${name}"]`)!;
const type = async (name: string, value: string) => act(async () => {
  const input = field(name);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === label)!;
const click = async (b: HTMLElement) => { await act(async () => b.click()); await tick(); };
const submit = async () => { await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await tick(); };
let frame: HTMLIFrameElement | undefined;
try {
  await act(async () => root.render(<main className="min-h-screen bg-[#0B110E]"><div className="mx-auto w-full max-w-4xl px-6 py-7 sm:px-8 sm:py-8"><h1 className="text-2xl font-bold tracking-tight text-[#E8FFF0]">Settings</h1><WebsiteCredentialsSettings /><PomodoroSettings settings={defaultPomodoroSettings} onSave={() => {}} /></div></main>)); await tick();
  if (preview) {
    document.getElementById("result")!.textContent = "Synthetic Settings preview — no live credentials or Keychain access.";
  } else {
  await type("base URL", "https://example.com");
  for (const [name, value] of [["username", "qa-user"], ["email", "qa@example.invalid"], ["password", "qa-password"]]) await type(name, value);
  check(["username", "email", "password"].every((name) => field(name).type === "password"), "All credential value inputs must be masked");
  await submit();
  check(stored.length === 1 && !field("password").value, "Save must create metadata and clear secret drafts");
  check(!document.body.textContent?.includes("qa-password") && !JSON.stringify(localStorage).includes("qa-password"), "Values must not enter page text or local storage");
  await click(button("Edit"));
  check(!field("username").value && !field("email").value && !field("password").value, "Edit must not read saved values back");
  await type("username", "new-user"); await type("username", ""); await submit();
  const update = calls.filter((c) => c.command === "save_website_credential").at(-1)!.args.credential;
  check(update.username === "" && !("password" in update) && update.previousBaseUrl === "https://example.com", "Explicit clearing must differ from untouched secrets");
  await click(button("Edit")); await type("password", "cancelled-secret"); await click(button("Cancel"));
  check(!field("password").value, "Cancel must discard secrets");
  await click(button("Delete")); check(!stored.length, "Delete must remove saved metadata");
  fail = true; await type("base URL", "https://example.com"); await submit();
  check(document.querySelector('[role="alert"]') && !document.body.textContent?.includes("Synthetic secret"), "Backend errors must not be reflected into the UI");
  await act(async () => root.unmount());

  frame = document.createElement("iframe"); frame.style.cssText = "width:900px;height:500px";
  const loaded = new Promise<void>((resolve) => { frame!.onload = () => resolve(); });
  frame.srcdoc = `<form method="post"><input name="username" autocomplete="username"><input type="email"><input type="password" autocomplete="current-password"><button>Login</button></form><p id="echo"></p>`;
  document.body.append(frame); await loaded;
  const win = frame.contentWindow as Window & typeof globalThis;
  const runAutofill = win.Function(`return (${autofillScript})`)();
  check(JSON.parse(runAutofill({ origin: location.origin, username: "u", email: "e", password: "p" })).error, "Frame autofill must fail before assigning values");
  check(!frame.contentDocument!.querySelector("input")!.value, "Rejected autofill must leave inputs untouched");
  const runPage = win.Function(`return (${pageScript})`)();
  const doc = frame.contentDocument!;
  doc.querySelector("input")!.value = "raw-user-secret";
  doc.querySelector("#echo")!.textContent = "raw-user-secret encoded-c2VjcmV0";
  doc.title = "raw-user-secret";
  const input = doc.querySelector("input")!;
  (win as any).__lotseCredentialFields = new win.WeakSet([input]);
  doc.querySelector("#echo")!.textContent = "Timer running: 02:40:31";
  doc.title = "Dashboard";
  const snapshot = JSON.parse(runPage({ action: "snapshot" }));
  check(snapshot.text.includes("Timer running: 02:40:31") && snapshot.title === "Dashboard", "Saved login fields must not hide website text or titles");
  check(snapshot.elements.length === 4 && snapshot.elements[0].value === undefined, "Credential field values stay omitted without hiding controls");
  check(JSON.parse(runPage({ action: "key", reference: snapshot.elements[0].reference, key: "Backspace" })).error, "Partial credential edits must be refused");
  document.getElementById("result")!.textContent = `PASS: ${checks} credential Settings, draft lifecycle, error, frame, and snapshot checks`;
  }
} catch (error) { document.getElementById("result")!.textContent = `FAIL: ${String(error)}\n${(error as Error).stack}`; }
finally { if (!preview) await act(async () => root.unmount()); frame?.remove(); }
