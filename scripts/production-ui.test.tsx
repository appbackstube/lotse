import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { initializeFileStore } from "../src/fileStore";
import { normalizeTask, taskStorageKey } from "../src/tasks";
import App from "../src/App";

async function runProductionChecks() {
  const warnings: string[] = [];
  for (const level of ["warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args) => { warnings.push(args.map(String).join(" ")); original(...args); };
  }
  window.addEventListener("error", (event) => warnings.push(event.message));
  window.addEventListener("unhandledrejection", (event) => warnings.push(String(event.reason)));
  const repo = { rootPath: "/synthetic-production-repository", name: "Production checks", currentBranch: "main", hasOrigin: true };
  const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
  const task = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Offline production check", manualStatus: "inbox", description: "## Offline Markdown\n\nA **saved** task description.", sandboxHtml: "<!doctype html><h1>Sandbox state fixture</h1>", location: "workspace" })!;
  const storage: Record<string, string> = { "chaoticreview.auth-onboarding-v1": "complete", [taskStorageKey(repo.rootPath)]: JSON.stringify([task]), "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: "kanban" }) };
  let prepared = 0;
  const released: string[] = [];
  mockWindows("main");
  mockConvertFileSrc("macos");
  mockIPC(async (command, args: any) => {
    if (command === "task_sandbox_supported") return true;
    if (command === "prepare_task_sandbox") {
      if (args.repositoryRoot !== repo.rootPath || args.taskId !== task.id) throw new Error("Incorrect preview scope");
      const token = `production-preview-${++prepared}`;
      return { token, url: `${location.origin}/__lotse_sandbox_fixture/${token}` };
    }
    if (command === "release_task_sandbox") { released.push(args.token); return; }
    if (command === "load_frontend_storage") return storage;
    if (command === "set_frontend_storage") { if (args.value === null) delete storage[args.key]; else storage[args.key] = args.value; return; }
    if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "Synthetic", baseUrl: "http://127.0.0.1:1", envKey: "SYNTHETIC_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
    if (command === "current_repository" || command === "refresh_repository") return repo;
    if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
    if (command === "compare_working_copy") return comparison;
    if (command === "load_review" || command === "github_connection") return null;
    if (["scheduler_list", "list_memory", "agent_models"].includes(command)) return [];
    if (command === "task_git_status") return { repository: repo, upstream: "origin/main", pullCount: 0, pushCount: 0, dirty: false };
    if (command === "plugin:window|scale_factor") return 1;
    if (command === "plugin:window|theme") return "light";
    if (command === "plugin:window|is_maximized") return false;
    if (command === "plugin:window|inner_size" || command === "plugin:window|outer_size") return { width: innerWidth, height: innerHeight };
    if (["save_review", "set_mcp_context"].includes(command) || command.startsWith("plugin:window|") || command.startsWith("plugin:notification|")) return;
    throw new Error(`Unexpected synthetic IPC: ${command}`);
  }, { shouldMockEvents: true });

  const waitFor = async (condition: () => unknown) => {
    const end = performance.now() + 20_000;
    while (!condition() && performance.now() < end) await new Promise(requestAnimationFrame);
    if (!condition()) throw new Error("Production UI did not settle");
  };
  const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === name && element.getBoundingClientRect().width)!;
  const root = createRoot(document.getElementById("root")!);
  let result = "";
  try {
    await initializeFileStore();
    root.render(<App />);
    await waitFor(() => button("Tasks")); button("Tasks").click();
    await waitFor(() => document.querySelector('[aria-label="Drag Offline production check"]'));
    document.querySelector<HTMLElement>('[aria-label="Drag Offline production check"]')!.click();
    await waitFor(() => document.querySelector('.task-description-editor [contenteditable="true"]'));
    const editor = document.querySelector<HTMLElement>('.task-description-editor [contenteditable="true"]')!;
    if (!editor.textContent?.includes("saved")) throw new Error("Production Markdown was not preserved");
    await waitFor(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("TaskDrawing-")));
    if (document.querySelector(".excalidraw")) throw new Error("Preparing the drawing module must not mount an inactive editor");
    const tab = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] [role="tab"]')].find((element) => element.textContent === name)!;
    const drawTab = tab("Draw");
    drawTab.focus(); drawTab.click();
    await waitFor(() => document.querySelector(".excalidraw"));
    const canvas = document.querySelector(".excalidraw canvas.static");
    tab("Detail").click(); await waitFor(() => tab("Detail").getAttribute("aria-selected") === "true");
    drawTab.click(); await waitFor(() => drawTab.getAttribute("aria-selected") === "true");
    if (document.querySelector(".excalidraw canvas.static") !== canvas) throw new Error("Production tab switches replaced the drawing canvas");
    tab("Sandbox").click();
    await waitFor(() => document.querySelector('[aria-label="Task sandbox"]')?.getAttribute("aria-busy") === "false");
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Task sandbox preview"]')!;
    const state = (command: string) => new Promise<string>((resolve, reject) => {
      const receive = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow || event.origin !== "null" || event.data?.type !== "qa-sandbox-state") return;
        if (event.data.draft !== "Retained preview draft" || event.data.scrollY !== 400) return;
        clearTimeout(timer); window.removeEventListener("message", receive); resolve(JSON.stringify(event.data));
      };
      const timer = setTimeout(() => { window.removeEventListener("message", receive); reject(new Error("Production preview did not retain state")); }, 5000);
      window.addEventListener("message", receive);
      frame.contentWindow!.postMessage({ type: "qa-sandbox-command", command }, "*");
    });
    const previewState = await state("edit");
    drawTab.click(); await waitFor(() => drawTab.getAttribute("aria-selected") === "true");
    tab("Sandbox").click(); await waitFor(() => tab("Sandbox").getAttribute("aria-selected") === "true");
    if (document.querySelector('iframe[title="Task sandbox preview"]') !== frame || prepared !== 1 || await state("state") !== previewState) throw new Error("Production Sandbox tab restarted its preview");
    const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
    for (const definition of ["flowchart LR\n A-->B", "sequenceDiagram\n Alice->>Bob: Hello", "classDiagram\n class Example"]) {
      const diagram = await parseMermaidToExcalidraw(definition);
      if (!diagram.elements.length) throw new Error("Production diagram conversion failed");
    }
    result = "PASS: production App, Markdown, early drawing preparation, retained drawing/sandbox state and diagrams under the native content policies.";
  } catch (error) { result = `FAIL: ${error instanceof Error ? error.stack : error}\nVisible UI: ${document.body.innerText.slice(-3500)}\nTabs: ${JSON.stringify([...document.querySelectorAll('[role="dialog"] [role="tab"]')].map((tab) => [tab.textContent, tab.getAttribute("aria-selected")]))}`; }
  finally { root.unmount(); }
  if (prepared && released.length !== prepared) result = "FAIL: production preview resources were not released on close.";
  if (warnings.length) result = `FAIL: ${warnings.join("\n")}\n${result}`;
  document.getElementById("result")!.textContent = result;
  await fetch("/__lotse_qa_report", { method: "POST", body: JSON.stringify({ phase: "production-ui", result, warnings }) });
  Object.assign(window, { lotseProductionResult: { result, warnings } });

}

void runProductionChecks();
