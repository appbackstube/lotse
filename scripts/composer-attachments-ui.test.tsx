// Open /scripts/composer-attachments-ui.html through Vite. The real App uses synthetic IPC; no live agents run.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { emit } from "@tauri-apps/api/event";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { taskStorageKey, normalizeTask } from "../src/tasks";
import App from "../src/App";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-repository", name: "Monthly Report", currentBranch: "main", hasOrigin: true };
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const savedAgent = { id: "owner", title: "Product owner", prompt: "Clarify goals" };
const first = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Polish keyboard navigation", manualStatus: "inbox", chatMode: "default", location: "workspace", chatAgent: savedAgent, attachments: [] })!;
const sends: any[] = [];
const failures: string[] = [];
let selectedRepository: string | string[] = ["/synthetic/notes.txt", "/synthetic/screenshot.png"];
const dialogOptions: any[] = [];
const imports: string[][] = [];
const removed: string[] = [];
const retained: string[][] = [];
let failSend = false;
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  "chaoticreview.agents": JSON.stringify([savedAgent]),
  "chaoticreview.default-agent": savedAgent.id,
  [taskStorageKey(repo.rootPath)]: JSON.stringify([first]),
  "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: "kanban" }),
  "chaoticreview.task-board-tabs": JSON.stringify({ [repo.rootPath]: {} }),
};
mockWindows("main");
mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "task_sandbox_supported") return true;
  if (command === "task_browser_supported") return false;
  if (command === "plugin:dialog|open") { dialogOptions.push(args); return selectedRepository; }
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") {
    storage[args.key] = args.value; return;
  }
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main", "feature/monthly-report"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "agent_models") return [];
  if (command === "load_task_changes") return { comparison, pendingSnapshotId: "snapshot", pendingFiles: false, committedChanges: false, headOid: comparison.baseOid, squashMessage: "" };
  if (command === "task_git_status") return { repository: { ...repo, currentBranch: "feature/monthly-report" }, upstream: "origin/feature/monthly-report", pullCount: 0, pushCount: 0, dirty: false };
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:notification|register_listener" || command === "plugin:notification|remove_listener") return;
  if (command === "plugin:window|outer_size" || command === "plugin:window|inner_size") return { width: innerWidth, height: innerHeight };
  if (command === "save_review" || command === "set_mcp_context" || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  if (command === "list_memory") return [];
  if (command === "scheduler_list") return [];
  if (command === "cleanup_unstarted_task_worktree") return;
  if (command === "ai_chat_send") { if (failSend) throw new Error("Synthetic send failure"); sends.push(args); return { requestId: `run-${sends.length}`, threadId: `thread-${sends.length}`, turnId: `turn-${sends.length}` }; }
  if (command === "import_chat_files") {
    imports.push(args.paths);
    return args.paths.map((path: string) => ({ kind: path.endsWith(".png") ? "image" : "localFile", path: path.endsWith(".png") ? pixel : `/managed/${path.split("/").at(-1)}`, name: path.split("/").at(-1) }));
  }
  if (command === "retain_task_images") { retained.push(args.paths); return; }
  if (command === "remove_chat_image") { removed.push(args.path); return; }
  if (command === "release_chat_image_reference") return;
  failures.push(command); throw new Error(`Unexpected IPC command: ${command}`);
}, { shouldMockEvents: true });

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); };
const visible = (element: Element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const button = (label: string) => [...document.querySelectorAll<HTMLElement>("button")].find((item) => visible(item) && (item.textContent?.trim() === label || item.getAttribute("aria-label") === label))!;
const click = async (element: HTMLElement) => { check(element, "Missing control"); await act(async () => { element.focus(); element.click(); }); await settle(); };
const storedTasks = () => JSON.parse(storage[taskStorageKey(repo.rootPath)]);
const event = async (index: number, payload: Record<string, unknown>) => { await act(async () => sends[index].events.onmessage({ type: "chat", payload: { requestId: `run-${index + 1}`, threadId: `thread-${index + 1}`, turnId: `turn-${index + 1}`, ...payload } })); await settle(); };
const root = (fixtureRoot = createRoot(document.getElementById("root")!));
try {
  await initializeFileStore();
  await act(async () => root.render(<App />)); await settle();
  await click(button("Workspace"));
  const surface = () => [...document.querySelectorAll<HTMLElement>(".ios-chat-composer")].find(visible)!;
  const choose = async (paths: string[]) => {
    selectedRepository = paths;
    await click(button("Add to chat"));
    await click(button("File"));
  };
  await choose(["/synthetic/notes.txt", "/synthetic/screenshot.png"]);
  check(!dialogOptions.at(-1).options?.filters && !dialogOptions.at(-1).filters, "File picker must allow the same file types as task assets");
  check(surface().textContent?.includes("notes.txt") && surface().querySelector('img[alt="screenshot.png"]'), "File and image previews missing");
  await click(button("Remove notes.txt"));
  check(!surface().textContent?.includes("notes.txt") && removed.includes("/managed/notes.txt"), "Remove must delete the pending local file");
  await act(async () => emit("tauri://drag-drop", { paths: ["/synthetic/notes.txt"], position: { x: innerWidth - 30, y: innerHeight - 30 } })); await settle();
  check(imports.at(-1)?.[0] === "/synthetic/notes.txt" && surface().textContent?.includes("notes.txt"), "Drag-and-drop must import non-image files through the same path");
  failSend = true;
  await click(button("Send Review Agent message"));
  check(surface().textContent?.includes("notes.txt") && surface().querySelector('img[alt="screenshot.png"]'), "Failed sends must restore both attachment kinds");
  failSend = false;
  await click(button("Send Review Agent message"));
  check(sends.length === 1 && sends[0].prompt === "" && sends[0].chatContext.attachments.some((a: any) => a.kind === "localFile") && sends[0].chatContext.attachments.some((a: any) => a.kind === "image"), "Attachment-only workspace message must pass files and images to the agent");
  check(!surface().querySelector(".chat-image"), "Successful send must clear pending attachments");
  await event(0, { kind: "completed" });
  await click(button("Tasks"));
  await click([...document.querySelectorAll<HTMLElement>(".task-card-title")].find((item) => item.textContent === first.title) ?? button(first.title));
  await choose(["/synthetic/report.pdf", "/synthetic/screenshot.png"]);
  check(retained.at(-1)?.includes("/managed/report.pdf"), "Task files must survive storage cleanup");
  await fileStore.flush();
  const persisted = normalizeTask(storedTasks().find((task: any) => task.id === first.id))!;
  check(persisted.attachments.some((a) => a.kind === "localFile"), "Pending file attachments must survive task reload");
  await click(button("Send Review Agent message"));
  check(sends.length === 2 && sends[1].taskId === first.id && sends[1].chatContext.attachments.some((a: any) => a.kind === "localFile" && a.name === "report.pdf"), "Task send must forward non-image files");
  await choose(["/synthetic/queued.txt"]);
  await click(button("Queue Review Agent message"));
  await fileStore.flush();
  check(Object.values(JSON.parse(storage["chaoticreview.chat-queues"])).some((items: any) => items.some((item: any) => item.context.attachments.some((a: any) => a.kind === "localFile"))), "Queued messages must retain non-image files");
  await event(1, { kind: "completed" });
  check(sends.length === 3 && sends[2].chatContext.attachments.some((a: any) => a.kind === "localFile" && a.name === "queued.txt"), "Queued attachment-only message must reach the agent");
  await event(2, { kind: "completed" });
  check(!failures.length, `Unexpected IPC commands: ${failures.join(", ")}`);
  document.getElementById("result")!.textContent = "PASS: unrestricted picker, mixed file/image previews, removal, native file drop, send failure recovery, attachment-only workspace/task sends, task persistence and queued file delivery (synthetic IPC).";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`;
} finally {
  await act(async () => fixtureRoot?.unmount());
}
