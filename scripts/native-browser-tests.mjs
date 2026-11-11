// Builds an isolated, packaged Tauri fixture. Never loads user repositories or accounts.
import { build } from "vite";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { randomBytes } from "node:crypto";

if (process.platform !== "darwin") throw new Error("Native browser checks require macOS.");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "lotse-native-browser-"));
const identifier = `com.lotse.browsercheck.p${process.pid}`;
const dataPath = join(homedir(), "Library/Application Support", identifier, "frontend-storage.json");
const git = (...args) => execFileSync("git", ["-C", directory, ...args], { stdio: "ignore" });
git("init"); git("-c", "user.name=Browser QA", "-c", "user.email=browser-qa@example.invalid", "commit", "--allow-empty", "-m", "Browser fixture");
const server = createServer((request, response) => {
  if (request.url === "/redirect") { response.writeHead(302, { Location: "/one" }); response.end(); return; }
  response.setHeader("Content-Type", "text/html");
  if (request.url === "/one") response.setHeader("Set-Cookie", "lotse_qa=shared; Path=/; Max-Age=3600; SameSite=Lax");
  response.end(`<!doctype html><html><head><title>Native fixture</title></head><body style="background:#dcefdc;color:#14271a"><h1>Native fixture ${request.url === "/two" ? "two" : "one"}</h1><form><label>Name<input id="name"></label><label>Choice<select id="choice"><option value="a">A</option><option value="b">B</option></select></label><button type="button" onclick="document.querySelector('#output').textContent=document.querySelector('#name').value+':'+document.querySelector('#choice').value">Act</button><p id="output">Ready</p></form><button type="button" onclick="history.pushState({},'', '/spa#section')">SPA route</button><a href="mailto:browser@example.invalid">Unsupported link</a><iframe src="about:blank"></iframe><iframe srcdoc="<p>Embedded frame</p>"></iframe><p id="ua"></p><p id="cookie"></p><script>document.querySelector('#ua').textContent=navigator.userAgent;document.querySelector('#cookie').textContent=document.cookie;</script><div style="height:1800px"></div></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.VITE_BROWSER_QA_REPOSITORY = directory;
process.env.VITE_BROWSER_QA_ORIGIN = `http://127.0.0.1:${server.address().port}`;
const qaToken = randomBytes(32).toString("hex");
const qaService = `${identifier}.website-credentials`;
const leaks = ["native-qa-user", "native-qa@example.invalid", "native-qa-password", "updated-qa-password"];
let app;
try {
  const assets = join(directory, "assets");
  await build({ build: { outDir: assets, emptyOutDir: true, rollupOptions: { input: fileURLToPath(new URL("./task-browser-native-ui.html", import.meta.url)) } }, logLevel: "warn" });
  const config = { identifier, productName: "Lotse Browser Check", build: { frontendDist: assets, beforeBuildCommand: "true" }, app: { windows: [{ label: "main", title: "Browser QA", url: "scripts/task-browser-native-ui.html", width: 1100, height: 850 }] }, bundle: { resources: [] } };
  const configPath = join(directory, "tauri-qa.json"); writeFileSync(configPath, JSON.stringify(config));
  await new Promise((resolve, reject) => {
    const child = spawn(join(root, "node_modules/.bin/tauri"), ["build", "--debug", "--features", "browser-qa", "--bundles", "app", "--config", configPath, "--ci"], { cwd: root, stdio: "inherit" });
    child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Native fixture build exited ${code}`)));
  });
  for (const phase of ["initial", "restart"]) {
    app = spawn(join(root, "src-tauri/target/debug/bundle/macos/Lotse Browser Check.app/Contents/MacOS/chaoticreview"), [], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LOTSE_BROWSER_QA_TOKEN: qaToken } });
    let log = ""; app.stdout.on("data", (data) => { log += data; }); app.stderr.on("data", (data) => { log += data; });
    let handledRequest = "";
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (existsSync(dataPath)) {
        const storage = JSON.parse(readFileSync(dataPath, "utf8"));
        const request = storage.values?.["chaoticreview.native-mcp-request"];
        if (request && request !== handledRequest) {
          handledRequest = request;
          const { taskId, expectedAvailable, autofill, security, savedUrl } = JSON.parse(request);
          const info = JSON.parse(readFileSync(join(homedir(), "Library/Application Support", identifier, "mcp.json"), "utf8"));
          const endpoint = `${info.url}/task/main/${taskId}/workspace`;
          const rpc = async (method, params, workspace = false) => {
            const response = await fetch(workspace ? `${info.url}/main` : endpoint, { method: "POST", headers: { Authorization: `Bearer ${qaToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
            const result = await response.json();
            if (leaks.some((secret) => JSON.stringify(result).includes(secret))) throw new Error("Credential value leaked through MCP");
            return result.result;
          };
          try {
            if (savedUrl && !execFileSync("defaults", ["export", identifier, "-"], { encoding: "utf8" }).includes(`<string>${savedUrl}</string>`)) throw new Error("Saved-login HTTPS URL was not persisted across application restart");
            const tools = await rpc("tools/list");
            if (!tools.tools.some((t) => t.name === "task_browser_credentials")) throw new Error("Credential tool was not listed");
            if (tools.tools.some((t) => /^(list|save|delete|read)_website_credential/.test(t.name))) throw new Error("Settings commands exposed to agent");
            const call = (name, args, workspace = false) => rpc("tools/call", { name, arguments: args }, workspace);
            const discovery = await call("task_browser_credentials", { action: "discover" });
            if (discovery.structuredContent?.available !== expectedAvailable) throw new Error(`Discovery availability mismatch: ${JSON.stringify(discovery)}`);
            const workspace = await call("task_browser_credentials", { action: "discover", taskId }, true);
            if (workspace.structuredContent?.available !== expectedAvailable) throw new Error("Workspace discovery mismatch");
            if (security) {
              await call("get_current_task", {});
              await call("get_selected_context", {});
              for (const name of ["list_website_credentials", "save_website_credential", "delete_website_credential"]) {
                if (!(await call(name, {})).isError) throw new Error("Agent accessed a Settings credential command");
              }
              for (const bad of [{ action: "autofill", url: "https://evil.invalid" }, { action: "autofill", reference: "x" }, { action: "autofill", password: "x" }, { action: "autofill", credentialId: "x" }, { action: "read" }, { action: "discover", taskId: "missing" }]) {
                if (!(await call("task_browser_credentials", bad)).isError) throw new Error("Unsafe credential arguments accepted");
              }
              if (!(await call("control_task_browser", { action: "autofillCredentials" })).isError) throw new Error("Dedicated tool bypass accepted");
              if (!(await call("task_browser_credentials", { action: "discover" }, true)).isError) throw new Error("Workspace call omitted task target");
              const screenshot = await call("control_task_browser", { action: "screenshot" });
              if (!screenshot.isError) throw new Error("Protected screenshot exposed");
              const snapshot = await call("get_task_browser", {});
              if (!snapshot.structuredContent?.text?.includes("Timer running") || !snapshot.structuredContent.title?.includes("Dashboard") || !snapshot.structuredContent.url) throw new Error("Saved login incorrectly hid website content");
              if (!snapshot.structuredContent.elements.some((el) => el.name === "Stop timer")) throw new Error("Website control labels were hidden");
            }
            if (autofill !== undefined) {
              const fill = await call("task_browser_credentials", { action: "autofill" });
              if (autofill ? fill.structuredContent?.filled !== true : !fill.isError) throw new Error(`Autofill outcome mismatch: ${JSON.stringify(fill)}`);
            }
            const current = JSON.parse(readFileSync(dataPath, "utf8"));
            current.values["chaoticreview.native-mcp-result"] = JSON.stringify({ request, passed: true });
            writeFileSync(dataPath, JSON.stringify(current));
          } catch (error) {
            const current = JSON.parse(readFileSync(dataPath, "utf8"));
            current.values["chaoticreview.native-mcp-result"] = JSON.stringify({ request, passed: false, error: String(error) });
            writeFileSync(dataPath, JSON.stringify(current));
          }
        }
        if (leaks.some((secret) => log.includes(secret) || readFileSync(dataPath, "utf8").includes(secret))) throw new Error("Credential value leaked to logs or frontend storage");
        const raw = storage.values?.["chaoticreview.native-browser-report"];
        if (raw && JSON.parse(raw).phase === phase) {
          const report = JSON.parse(raw); writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2));
          const preferences = execFileSync("defaults", ["export", identifier, "-"], { encoding: "utf8" });
          if (leaks.some((secret) => preferences.includes(secret))) throw new Error("Credential value leaked to saved browser preferences");
          console.log(`${report.passed ? "PASS" : "FAIL"}: native browser ${phase} (${report.checks.length} checks). Results: ${directory}`);
          if (!report.passed) { console.error(report.error, report.stack); process.exitCode = 1; }
          break;
        }
      }
      if (app.exitCode !== null || Date.now() + 200 > deadline) throw new Error(`Native fixture exited or timed out:\n${log}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const exited = once(app, "exit"); app.kill(); await exited; app = undefined;
    if (process.exitCode) break;
  }
} finally {
  app?.kill();
  try { execFileSync("security", ["delete-generic-password", "-s", qaService, "-a", "website-vault-v1"], { stdio: "ignore" }); } catch { /* No entry if the fixture failed before creating it. */ }
  server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
}
