// Real Tauri/WebKit integration fixture; built only by native-browser-tests.mjs.
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { initializeFileStore, fileStore } from "../src/fileStore";
import { TaskBrowser, hideTaskBrowsers } from "../src/components/TaskBrowser";
import "../src/App.css";

// Keep layout/lifecycle checks independent of other desktop windows occluding the test app.
// Real document visibility handling is exercised separately by task-browser-ui.test.tsx.
Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 16);
window.cancelAnimationFrame = (id) => window.clearTimeout(id);

const taskId = "12345678-1234-1234-1234-123456789abc";
const secondTask = "22345678-1234-1234-1234-123456789abc";
const checks: string[] = [];
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); checks.push(message); };
const waitUntil = async (predicate: () => boolean | Promise<boolean>, message: string) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) { check(true, message); return; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check(false, message);
};
const root = createRoot(document.getElementById("root")!);
let repositoryRoot = "";
let phase = "initial";
const action = (value: object, task = taskId) => invoke<any>("task_browser_action", { repositoryRoot, taskId: task, action: value });
const waitPage = async (text: string, task = taskId) => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const snapshot = await action({ action: "snapshot" }, task);
    if (snapshot.text?.includes(text)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Page did not contain ${text}`);
};

const credentialTask = "32345678-1234-1234-1234-123456789abc";
const freshCredentialTask = "42345678-1234-1234-1234-123456789abc";
const secretUrlTask = "52345678-1234-1234-1234-123456789abc";
const credentialRestoreUrl = "https://login.example.invalid/dashboard?view=timer#active";
let requestId = 0;
const mcpCheck = async (options: object) => {
  const request = JSON.stringify({ taskId: credentialTask, id: ++requestId, ...options });
  await invoke("set_frontend_storage", { key: "chaoticreview.native-mcp-request", value: request });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const storage = await invoke<Record<string, string>>("load_frontend_storage", { origin: location.origin, legacy: {} });
    const result = storage["chaoticreview.native-mcp-result"] ? JSON.parse(storage["chaoticreview.native-mcp-result"]) : null;
    if (result?.request === request) { check(result.passed, result.error || "Native MCP credential checks passed"); return; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("MCP credential checks timed out");
};
const fixtureHtml = (attributes = 'method="post"', extra = "") => `<!doctype html><title>Dashboard</title><h1>Dashboard</h1><p id="timer">Timer running: 02:40:31</p><button type="button" onclick="document.querySelector('#timer').textContent='Timer stopped'">Stop timer</button><form ${attributes}><label>User<input name="username" autocomplete="username"></label><label>Email<input type="email" autocomplete="email"></label><label>Password<input type="password" autocomplete="current-password"></label><button>Login</button>${extra}</form><p id="echo"></p><script>document.querySelector('form').addEventListener('input',()=>{const inputs=[...document.querySelectorAll('input')];document.body.dataset.qaFilled=String(inputs[0].value==='native-qa-user'&&inputs[1].value==='native-qa@example.invalid'&&inputs[2].value==='updated-qa-password');document.title='Dashboard '+inputs.map(x=>x.value).join(' ');document.querySelector('#echo').textContent=inputs.map(x=>x.value+' '+btoa(x.value)).join(' ');});window.JSON.stringify=()=> 'page-world-tampering';window.__lotseBrowser={url:location.href,references:new Map()};</script>`;
const loadCredentialFixture = async (url: string, html = fixtureHtml()) => {
  await invoke("browser_qa_fixture", { taskId: credentialTask, url, html });
  await new Promise((resolve) => setTimeout(resolve, 600));
};
const credentialChecks = async () => {
  const origin = "https://login.example.invalid";
  const credential = { baseUrl: origin, username: "native-qa-user", email: "native-qa@example.invalid", password: "native-qa-password" };
  let entries = await invoke<any[]>("save_website_credential", { credential });
  check(entries.length === 1 && !JSON.stringify(entries).includes(credential.username) && entries[0].hasPassword, "Native create returns only metadata");
  entries = await invoke<any[]>("list_website_credentials");
  check(entries.length === 1 && !JSON.stringify(entries).includes(credential.email), "Native list never reads secret values back");
  await invoke("save_website_credential", { credential: { baseUrl: origin, previousBaseUrl: origin, password: "updated-qa-password" } });
  await loadCredentialFixture(`${origin}/login`);
  await mcpCheck({ expectedAvailable: true, autofill: true, security: true });
  check(await invoke("browser_qa_fixture", { taskId: credentialTask, url: origin }), "Native autofill reaches visible username, email and password controls and emits input events");
  const snapshot = await action({ action: "snapshot" }, credentialTask);
  check(snapshot.text.includes("Timer running: 02:40:31") && snapshot.title.includes("Dashboard") && snapshot.url.endsWith("/login"), "Agents can read website text, title and URL after secure login filling");
  check(snapshot.elements.length >= 5 && !JSON.stringify(snapshot).includes("native-qa"), "Login values remain redacted while website content is readable");
  const user = snapshot.elements.find((el: any) => el.name === "User");
  let partialEditDenied = false;
  try { await action({ action: "key", reference: user.reference, key: "Backspace" }, credentialTask); } catch { partialEditDenied = true; }
  check(partialEditDenied, "Agents cannot expose credential prefixes by shortening filled login fields");
  await action({ action: "click", reference: snapshot.elements.find((el: any) => el.name === "Stop timer").reference }, credentialTask);
  check((await action({ action: "snapshot" }, credentialTask)).text.includes("Timer stopped"), "Agents can use normal website controls after login");
  for (const url of ["https://other.example.invalid/login", "https://sub.login.example.invalid", "https://login.example.invalid:444/login", "http://login.example.invalid/login"]) {
    await loadCredentialFixture(url);
    await mcpCheck({ expectedAvailable: false, autofill: false });
    check(!(await invoke("browser_qa_fixture", { taskId: credentialTask, url })), "Unauthorized origins never receive values");
  }
  for (const html of [fixtureHtml('method="post" action="https://evil.invalid"'), fixtureHtml('method="get"'), fixtureHtml('method="post" action="https://evil.invalid"', '<input name="action"><input name="method"><input name="elements">'), fixtureHtml('method="post"', '<button formaction="https://evil.invalid">Other</button>'), fixtureHtml('method="post"', '<input type="password">'), fixtureHtml().replace('autocomplete="current-password"', 'autocomplete="section-login new-password"'), fixtureHtml('method="post" action="blob:https://login.example.invalid/id"'), `<iframe srcdoc='<form method="post"><input name="username"><input type="password"></form>'></iframe>`]) {
    await loadCredentialFixture(`${origin}/login`, html);
    await mcpCheck({ expectedAvailable: true, autofill: false });
    check(!(await invoke("browser_qa_fixture", { taskId: credentialTask, url: origin })), "Unsafe forms, ambiguous fields and frame-only logins are refused without filling");
  }
  await loadCredentialFixture(`${origin}/login`, `<p>${"x".repeat(39994)}updated-qa-password</p>` + fixtureHtml());
  const boundary = await action({ action: "snapshot" }, credentialTask);
  check(boundary.text.length <= 40000 && !boundary.text.includes("updated-qa"), "Truncation never exposes a prefix of a credential");
  await loadCredentialFixture(`${origin}/login`);
  await mcpCheck({ expectedAvailable: true, autofill: true });
  await invoke("delete_website_credential", { baseUrl: origin });
  check(!(await invoke<any[]>("list_website_credentials")).length, "Native delete removes the credential");
  await mcpCheck({ expectedAvailable: false, autofill: false, security: true });
  const afterDelete = await action({ action: "snapshot" }, credentialTask);
  check(afterDelete.text.includes("Timer running") && afterDelete.text.includes("[redacted]"), "Deleting credentials preserves readable content and redacts already-filled values");
  check(await invoke("browser_qa_fixture", { taskId: credentialTask, url: origin }), "Deleting credentials protects a live page that still contains filled values");
  await invoke("save_website_credential", { credential: { ...credential, password: "updated-qa-password" } });
  await loadCredentialFixture(credentialRestoreUrl);
  check((await action({ action: "snapshot" }, credentialTask)).url === credentialRestoreUrl, "A saved-login page retains its full safe URL before restart");
  await mcpCheck({ expectedAvailable: true, savedUrl: credentialRestoreUrl });
  const localOrigin = import.meta.env.VITE_BROWSER_QA_ORIGIN;
  await invoke("browser_qa_fixture", { taskId: secondTask, url: credentialRestoreUrl, html: fixtureHtml() });
  await waitPage("Timer running", secondTask);
  await action({ action: "navigate", url: `${localOrigin}/cookie?view=timer#active` }, secondTask);
  await waitPage("lotse_qa=shared", secondTask);
  await action({ action: "navigate", url: `${localOrigin}/cookie` }, secretUrlTask);
  await waitPage("lotse_qa=shared", secretUrlTask);
  await action({ action: "navigate", url: `${localOrigin}/cookie?login=updated-qa-password` }, secretUrlTask);
  await waitUntil(async () => (await action({ action: "snapshot" }, secretUrlTask)).url.includes("[redacted]"), "Credential-bearing URLs are redacted before restart");
};

try {
  await initializeFileStore();
  phase = fileStore.getItem("chaoticreview.browser-restart-prepared") ? "restart" : "initial";
  await getCurrentWindow().show();
  await getCurrentWindow().setFocus();
  const opened = await invoke<any>("open_repository", { path: import.meta.env.VITE_BROWSER_QA_REPOSITORY, initialize: false });
  repositoryRoot = opened.repository.rootPath;
  await invoke("set_mcp_context", { input: { repositoryRoot, context: { scope: "diff", items: [] }, comments: [], customFields: [], tasks: [taskId, secondTask, credentialTask, freshCredentialTask, secretUrlTask].map((id) => ({ id, title: "Browser QA", color: "green", completed: false, planReady: false })) } });
  if (phase === "restart") {
    flushSync(() => root.render(<TaskBrowser repositoryRoot={repositoryRoot} taskId={secondTask} active />));
    const restored = await waitPage("lotse_qa=shared", secondTask);
    check(restored.url.endsWith("/cookie?view=timer#active"), "An app restart restores a saved-login session's last page including path, query and fragment");
    await new Promise((resolve) => setTimeout(resolve, 600));
    check(document.querySelector<HTMLInputElement>('[aria-label="Browser address"]')!.value === restored.url, "Restored page appears in the address bar");
    check(!(await action({ action: "snapshot" })).url, "Deleted browser URLs are not restored after restart");
    await mcpCheck({ taskId: secondTask, expectedAvailable: false, savedUrl: credentialRestoreUrl });
    check(!(await action({ action: "snapshot" }, secretUrlTask)).url, "A credential-bearing URL is not restored, and its previous safe URL was cleared");
    await loadCredentialFixture(credentialRestoreUrl);
    await mcpCheck({ expectedAvailable: true });
    await invoke("delete_website_credential", { baseUrl: "https://login.example.invalid" });
    await loadCredentialFixture("https://login.example.invalid/login");
    await mcpCheck({ expectedAvailable: false, autofill: false, security: true });
    check((await action({ action: "snapshot" }, credentialTask)).text.includes("Timer running"), "Websites remain readable after application restart and credential deletion");
    await invoke("browser_qa_fixture", { taskId: freshCredentialTask, url: "https://login.example.invalid/login", html: fixtureHtml() });
    await new Promise((resolve) => setTimeout(resolve, 600));
    await mcpCheck({ taskId: freshCredentialTask, expectedAvailable: false, autofill: false, security: true });
    check((await action({ action: "snapshot" }, freshCredentialTask)).text.includes("Timer running"), "Fresh tasks can read websites with a previously saved login");
    root.unmount(); await hideTaskBrowsers();
  } else {
    fileStore.setItem(`chaoticreview.repository-tasks:${repositoryRoot}`, JSON.stringify([{ id: taskId, title: "Browser QA" }, { id: secondTask, title: "Second browser QA" }, { id: credentialTask, title: "Credential QA" }, { id: freshCredentialTask, title: "Fresh credential QA" }, { id: secretUrlTask, title: "Secret URL QA" }]));
    await fileStore.flush();
    check(await invoke("task_browser_supported"), "Native browser is supported");
    flushSync(() => root.render(<TaskBrowser repositoryRoot={repositoryRoot} taskId={taskId} active />));
    await new Promise((resolve) => setTimeout(resolve, 600));
    const origin = import.meta.env.VITE_BROWSER_QA_ORIGIN;
    await action({ action: "navigate", url: `${origin}/redirect` });
    let snapshot = await waitPage("Native fixture one");
    check(snapshot.url.endsWith("/one"), "Redirects update the canonical URL");
    await new Promise((resolve) => setTimeout(resolve, 600));
    check(document.querySelector<HTMLInputElement>('[aria-label="Browser address"]')!.value === snapshot.url, "Redirects update the visible address bar");
    check(/Version\/[\d.]+ Safari\/605\.1\.15/.test(snapshot.text), "The user agent includes the installed Safari version");
    check(!snapshot.browser.error && snapshot.text.includes("Embedded frame"), "Blank and srcdoc frames load without navigation warnings");
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    Object.assign(overlay.style, { position: "fixed", inset: "0px", background: "white", zIndex: "999" });
    document.body.append(overlay);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await waitUntil(async () => !(await action({ action: "snapshot" })).browser.visible, "Overlapping app dialogs hide the real native view");
    overlay.remove();
    await new Promise((resolve) => setTimeout(resolve, 600));
    snapshot = await action({ action: "snapshot" });
    await waitUntil(async () => !!(await action({ action: "snapshot" })).browser.visible, "Closing app dialogs restores the real native view");
    snapshot = await action({ action: "snapshot" });
    const ref = (name: string) => { const element = snapshot.elements.find((element: any) => element.name === name); if (!element) throw new Error(`Missing ${name}: ${JSON.stringify(snapshot)}`); return element.reference; };
    await action({ action: "fill", reference: ref("Name"), text: "Native agent" });
    await action({ action: "select", reference: ref("Choice"), value: "b" });
    await action({ action: "click", reference: ref("Act") });
    snapshot = await waitPage("Native agent:b");
    check(true, "Agent forms and clicks reach the live website");
    await action({ action: "click", reference: ref("SPA route") });
    await new Promise((resolve) => setTimeout(resolve, 600));
    await waitUntil(() => document.querySelector<HTMLInputElement>('[aria-label="Browser address"]')!.value.endsWith("/spa#section"), "Same-document navigation updates the visible address");
    await action({ action: "back" });
    await new Promise((resolve) => setTimeout(resolve, 600));
    snapshot = await action({ action: "snapshot" });
    await action({ action: "click", reference: ref("Unsupported link") });
    snapshot = await action({ action: "snapshot" });
    check(snapshot.browser.error?.includes("This link cannot open here"), "Unsupported main-page links explain the failed action");
    const old = ref("Name");
    await action({ action: "navigate", url: `${origin}/two` }); await waitPage("Native fixture two");
    let stale = false;
    try { await action({ action: "click", reference: old }); } catch { stale = true; }
    check(stale, "Navigation invalidates element references");
    await action({ action: "back" }); await waitPage("Native fixture one");
    await action({ action: "forward" }); await waitPage("Native fixture two");
    check(true, "Native back and forward traverse browser history");
    await action({ action: "reload" }); await waitPage("Native fixture two");
    check(true, "Native reload restores the current page");
    check(!!(await invoke<any>("refresh_repository")).rootPath, "Existing WebviewWindow commands still work");
    await action({ action: "navigate", url: `${origin}/cookie` }, secondTask);
    await waitPage("lotse_qa=shared", secondTask);
    check(true, "Website cookies are shared between task browsers");
    flushSync(() => root.render(<TaskBrowser repositoryRoot={repositoryRoot} taskId={taskId} active={false} />));
    await new Promise((resolve) => setTimeout(resolve, 600));
    await action({ action: "navigate", url: `${origin}/one` });
    snapshot = await waitPage("Native fixture one");
    await action({ action: "fill", reference: ref("Name"), text: "Background agent" });
    await action({ action: "click", reference: ref("Act") });
    await waitPage("Background agent:a");
    check(true, "Hidden browsers remain available to the agent");
    const screenshot = await action({ action: "screenshot" });
    check(atob(screenshot.png).startsWith("\x89PNG"), "Native screenshot returns PNG bytes");
    const image = new Image(); image.src = `data:image/png;base64,${screenshot.png}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    check(pixels.some((value, index) => index % 4 === 3 && value > 0) && pixels.some((value, index) => index % 4 < 3 && value > 0 && value < 220), "Background screenshot contains rendered page pixels");
    flushSync(() => root.render(null));
    await hideTaskBrowsers();
    check(!(await action({ action: "snapshot" })).browser.visible, "Fast hide is acknowledged before task removal completes");
    await invoke("task_browser_view", { repositoryRoot, taskId, bounds: { x: 0, y: 0, width: 900, height: 500 }, visible: true, revision: 1 });
    check(!(await action({ action: "snapshot" })).browser.visible, "Delayed presentation requests cannot resurrect a closed browser");
    flushSync(() => root.render(<TaskBrowser repositoryRoot={repositoryRoot} taskId={taskId} active />));
    check(document.querySelector<HTMLInputElement>('[aria-label="Browser address"]')!.value.endsWith("/one"), "Reopening restores the toolbar without waiting for WebKit");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await waitUntil(async () => !!(await action({ action: "snapshot" })).browser.visible, "Reopening restores the retained native view");
    root.unmount(); await hideTaskBrowsers();
    check((await action({ action: "snapshot" })).text.includes("Background agent:a"), "Closing task detail retains the page");
    let ownership = false;
    try { await invoke("task_browser_action", { repositoryRoot: "/wrong-repository", taskId, action: { action: "snapshot" } }); } catch { ownership = true; }
    check(ownership, "Wrong repository cannot access the task browser");
    await credentialChecks();
    await invoke("delete_task_assets", { taskId });
    let closed = false;
    try { await action({ action: "snapshot" }); } catch { closed = true; }
    check(closed, "Deleted task sessions cannot be recreated by queued actions");
    await invoke("set_frontend_storage", { key: "chaoticreview.browser-restart-prepared", value: "true" });
  }
  await invoke("set_frontend_storage", { key: "chaoticreview.native-browser-report", value: JSON.stringify({ passed: true, phase, checks }) });
  document.getElementById("result")!.textContent = `PASS: ${checks.join("; ")}`;
} catch (error) {
  const report = { passed: false, phase, checks, error: String(error), stack: (error as Error).stack };
  document.getElementById("result")!.textContent = `FAIL: ${String(error)}`;
  await invoke("set_frontend_storage", { key: "chaoticreview.native-browser-report", value: JSON.stringify(report) });
}
