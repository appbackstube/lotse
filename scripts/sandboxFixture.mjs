import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const rust = readFileSync(new URL("../src-tauri/src/sandbox.rs", import.meta.url), "utf8");
const policy = rust.match(/const CSP: &str = "([^"]+)";/)?.[1];
if (!policy) throw new Error("Recheck the native sandbox CSP fixture after a server change.");
const bootstrap = readFileSync(new URL("../src-tauri/src/sandboxPreview.js", import.meta.url), "utf8");
const html = `<!doctype html><script>${bootstrap}</script><style>body{margin:24px;font:16px system-ui}main{height:1600px}button,input{font:inherit}</style>
<main><h1>Sandbox state fixture</h1><input id="draft" aria-label="Preview draft"><button id="increment" type="button">Increment</button><p id="count">0</p></main>
<script>
const boot = Math.random().toString(36);
let count = 0;
const report = () => parent.postMessage({ type: "qa-sandbox-state", boot, count, draft: document.querySelector("#draft").value, scrollY }, "*");
document.querySelector("#increment").onclick = () => { document.querySelector("#count").textContent = ++count; report(); };
addEventListener("message", (event) => {
  if (event.source !== parent || event.data?.type !== "qa-sandbox-command") return;
  const { command } = event.data;
  if (command === "edit") { document.querySelector("#draft").value = "Retained preview draft"; document.querySelector("#increment").click(); scrollTo(0, 400); }
  if (command === "link") parent.postMessage({ type: "task-sandbox-open-link", url: "https://example.invalid/preview" }, "*");
  if (command === "error") parent.postMessage({ type: "task-sandbox-error", message: "Synthetic preview error" }, "*");
  report();
});
report();
</script>`;

export function sandboxFixture(request, response) {
  if (!request.url?.startsWith("/__lotse_sandbox_fixture/")) return false;
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8", "content-security-policy": policy,
    "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
  });
  response.end(html); return true;
}

export async function startSandboxFixture() {
  const server = createServer((request, response) => {
    if (!sandboxFixture(request, response)) { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/__lotse_sandbox_fixture/` };
}
