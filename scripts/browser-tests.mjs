import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { startSandboxFixture } from "./sandboxFixture.mjs";

let session;
const directory = mkdtempSync(join(tmpdir(), "lotse-ui-results-"));
const requested = process.argv.slice(2);
const suites = readdirSync(new URL("./", import.meta.url)).filter((name) => name.endsWith("-ui.html") && !["production-ui.html", "drawing-export-ui.html", "task-browser-native-ui.html"].includes(name) && (!requested.length || requested.includes(name.replace("-ui.html", ""))));
if (!suites.length) throw new Error("No matching browser suites");
const browser = async (...args) => (await promisify(execFile)("agent-browser", ["--session", session, ...args], {
  encoding: "utf8", timeout: 190_000,
  env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: "180000" },
})).stdout;
const sandbox = suites.some((suite) => ["task-tabs-ui.html", "task-list-ui.html"].includes(suite)) ? await startSandboxFixture() : undefined;
const results = [];
try {
  for (const suite of suites) {
    session = `lotse-ui-${process.pid}-${suite.replace(/\W/g, "-")}`;
    try {
      await browser("set", "viewport", "1440", "1000");
      await browser("open", `http://127.0.0.1:1430/scripts/${suite}${sandbox && ["task-tabs-ui.html", "task-list-ui.html"].includes(suite) ? `?sandboxUrl=${encodeURIComponent(sandbox.url)}` : ""}`);
      await browser("wait", "--fn", '/^(PASS|FAIL)|checks passed/i.test(document.querySelector("#result")?.textContent ?? "")');
      await browser("wait", "--fn", '!document.querySelector("#root")?.childElementCount');
      const result = (await browser("get", "text", "#result")).trim();
      const consoleOutput = JSON.parse(await browser("console", "--json"));
      const errors = JSON.parse(await browser("errors", "--json"));
      const warnings = consoleOutput.data.messages.filter((message) => ["warning", "error"].includes(message.type));
      const passed = !result.startsWith("FAIL") && !warnings.length && !errors.data.errors.length;
      results.push({ suite, passed, result, warnings, errors: errors.data.errors });
      console.log(`${passed ? "PASS" : "FAIL"}: ${suite}${warnings.length ? ` (${warnings.length} console warnings/errors)` : ""}`);
      if (!passed) console.log(result, ...warnings.map((message) => message.text), ...errors.data.errors);
    } catch (error) {
      results.push({ suite, passed: false, error: String(error) });
      console.log(`FAIL: ${suite}: ${error}`);
    } finally {
      await browser("close");
    }
  }
} finally {
  if (sandbox) { sandbox.server.closeAllConnections(); await new Promise((resolve) => sandbox.server.close(resolve)); }
  writeFileSync(join(directory, "results.json"), JSON.stringify(results, null, 2));
  console.log(`Browser results: ${directory}`);
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
