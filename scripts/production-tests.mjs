import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build, preview } from "vite";
import { sandboxFixture } from "./sandboxFixture.mjs";

export async function startProductionPreview() {
  const directory = mkdtempSync(join(tmpdir(), "lotse-production-"));
  const policy = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url))).app.security.csp;
  for (const entry of ["production-ui", "drawing-export-ui"]) {
    const output = join(directory, entry);
    await build({ build: { outDir: output, emptyOutDir: true, rollupOptions: { input: fileURLToPath(new URL(`./${entry}.html`, import.meta.url)) } } });
    cpSync(output, directory, { recursive: true });
  }
  const server = await preview({ build: { outDir: directory }, preview: { host: "127.0.0.1", port: 1432, strictPort: true }, plugins: [{
    name: "production-qa-report",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (sandboxFixture(request, response)) return;
        response.setHeader("Content-Security-Policy", policy);
        if (request.url !== "/__lotse_qa_report") return next();
        let body = "";
        let tooLarge = false;
        request.on("data", (chunk) => {
          if (tooLarge) return;
          body += chunk;
          if (Buffer.byteLength(body) > 65_536) { tooLarge = true; body = ""; response.statusCode = 413; response.end(); }
        });
        request.on("end", () => {
          if (tooLarge) return;
          let report;
          try { report = JSON.parse(body); } catch { response.statusCode = 400; response.end(); return; }
          if (!report || !["production-ui", "drawing-export-ui"].includes(report.phase) || typeof report.result !== "string" || !Array.isArray(report.warnings)) { response.statusCode = 400; response.end(); return; }
          writeFileSync(join(directory, `${report.phase}.json`), body); response.end("ok");
        });
      });
    },
  }] });
  return { server, directory };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, directory } = await startProductionPreview();
  let session;
  const browser = async (...args) => (await promisify(execFile)("agent-browser", ["--session", session, ...args], { encoding: "utf8", timeout: 90_000, env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: "80000" } })).stdout;
  try {
    for (const [body, status] of [["invalid JSON", 400], ["x".repeat(65_537), 413]]) {
      const rejected = await fetch("http://127.0.0.1:1432/__lotse_qa_report", { method: "POST", body });
      if (rejected.status !== status) throw new Error("Production report validation failed");
    }
    for (const entry of ["production-ui", "drawing-export-ui"]) {
      session = `lotse-production-${process.pid}-${entry}`;
      try {
        await browser("set", "viewport", "1440", "1000");
        await browser("open", `http://127.0.0.1:1432/scripts/${entry}.html`);
        await browser("wait", "--fn", '!!window.lotseProductionResult');
        const report = JSON.parse(readFileSync(join(directory, `${entry}.json`), "utf8"));
        const consoleOutput = JSON.parse(await browser("console", "--json"));
        const errors = JSON.parse(await browser("errors", "--json"));
        writeFileSync(join(directory, `${entry}-console.json`), JSON.stringify(consoleOutput, null, 2));
        console.log(report.result);
        if (!report.result.startsWith("PASS") || consoleOutput.data.messages.some((message) => ["warning", "error"].includes(message.type)) || errors.data.errors.length) process.exitCode = 1;
      } finally { await browser("close"); }
    }
    console.log(`Production results: ${directory}`);
  } finally { await new Promise((resolve) => server.httpServer.close(resolve)); }
}
