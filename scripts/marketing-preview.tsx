// Actual Lotse UI with in-memory sample data; never connects to agents, accounts, or native storage.
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { mockIPC } from "./mockTauri";
import { initializeFileStore } from "../src/fileStore";
import { normalizeTask, taskStorageKey } from "../src/tasks";
import App from "../src/App";

const repo = { rootPath: "/sample/orbit", name: "Orbit", currentBranch: "main", hasOrigin: true };
const oid = "a".repeat(40);
const messages = [
  { id: "brief", role: "user", body: "Build the settings page. Reuse our components, make it accessible, and check the changes.", createdAt: "2026-11-10T09:00:00Z", selection: null, snapshotId: null, suggestions: [], contexts: [] },
  { id: "result", role: "assistant", body: "## Ready for your review\n\nThe settings page is ready. I reused the existing layout and form components.\n\n- Added profile and notification preferences\n- Checked keyboard navigation and focus states\n- Added component checks\n\nYou can review the changes alongside this conversation. Let me know what you’d like to adjust before merging.", createdAt: "2026-11-10T09:04:00Z", final: true, selection: null, snapshotId: null, suggestions: [], contexts: [] },
];
const drawing = JSON.stringify({ type: "excalidraw", version: 2, source: "lotse-sample", elements: convertToExcalidrawElements([
  { type: "text", x: 40, y: 35, text: "Plan. Build. Review.", fontSize: 25, fontFamily: 2, strokeColor: "#1e1e1e" },
  ...["Plan", "Build", "Review"].flatMap((text, i) => [
    { type: "rectangle" as const, x: 40 + i * 200, y: 140, width: 165, height: 100, strokeColor: i === 1 ? "#ff6b6b" : "#868e96", backgroundColor: "transparent", roundness: { type: 3 as const } },
    { type: "text" as const, x: 55 + i * 200, y: 177, text, fontSize: 18, fontFamily: 2, strokeColor: "#1e1e1e" },
  ]),
  { type: "arrow", x: 210, y: 190, width: 27, height: 0, strokeColor: "#868e96" },
  { type: "arrow", x: 410, y: 190, width: 27, height: 0, strokeColor: "#868e96" },
  { type: "text", x: 55, y: 295, text: "One task. All the context.", fontSize: 20, fontFamily: 2, strokeColor: "#868e96" },
]), appState: { viewBackgroundColor: "#ffffff" }, files: {} });
const prototype = `<!doctype html><html lang="en"><head><style>*{box-sizing:border-box}body{margin:0;padding:45px;background:#f4f2ec;color:#272c27;font:15px system-ui}small{font-size:10px;letter-spacing:2px;color:#7d846e}h1{font-size:38px;font-weight:500;letter-spacing:-2px;margin:18px 0 10px}p{color:#818576;font-size:13px;line-height:1.8}.card{padding:22px;border:1px solid #d9dccf;border-radius:12px;background:#fafaf6;margin-top:30px}label{display:flex;justify-content:space-between;font-size:12px;padding:13px 0;border-bottom:1px solid #e7e8df}button{background:#353e2d;color:white;border:0;border-radius:6px;padding:12px 18px;margin-top:20px}</style></head><body><small>ORBIT / PREFERENCES</small><h1>Make it yours.</h1><p>A thoughtful space for your everyday preferences.</p><div class="card"><strong>Your workspace</strong><label>Desktop notifications <input type="checkbox" checked></label><label>Weekly summary <input type="checkbox"></label><label>Keep focus mode on <input type="checkbox" checked></label><button>Save preferences</button></div><script>parent.postMessage({type:'task-sandbox-ready'},'*')</script></body></html>`;
const tasks = [
  ["Map the onboarding flow", "inbox", "purple"], ["Add keyboard shortcuts", "inbox", "blue"],
  ["Build the settings page", "inProgress", "orange"], ["Polish the empty states", "inProgress", "purple"],
  ["Review navigation accessibility", "inReview", "blue"], ["Check responsive layouts", "inReview", "orange"],
  ["Set up the project", "done", "green"], ["Define the color palette", "done", "purple"],
  ["Design the command menu", "clear", "purple"], ["Outline the release checklist", "clear", "blue"],
  ["Explore the dashboard layout", "clear", "orange"], ["Plan the notification flow", "clear", "green"],
  ["Improve the search experience", "inbox", "green"], ["Draft the welcome screen", "inbox", "orange"],
  ["Connect the preferences form", "inProgress", "blue"], ["Add focus mode controls", "inProgress", "green"],
  ["Review the settings flow", "inReview", "purple"], ["Check empty-state copy", "inReview", "green"],
  ["Create the base components", "done", "blue"], ["Set up routing", "done", "orange"],
].map(([title, status, color], i) => normalizeTask({
  id: `sample-task-${i}`, title, manualStatus: status === "done" ? null : status, completed: status === "done", color,
  location: "worktree", worktree: { branch: i === 2 ? "feature/settings" : `feature/task-${i}`, baseOid: oid, baseBranch: "main" }, started: true,
  description: i === 2 ? "## A settings page that feels at home\n\nBuild a focused place for profile, notification, and workspace preferences.\n\n### Acceptance criteria\n\n- [x] Reuse the existing UI components\n- [x] Support keyboard navigation\n- [x] Add component checks\n- [ ] Review the final changes\n\nKeep it simple. Every preference should be easy to find and easy to understand." : "Keep the experience clear, accessible, and consistent with the rest of the project.",
  startDate: "2026-11-10", deadline: "2026-11-13", chatMessages: i === 2 ? messages : [],
  drawing: i === 2 ? drawing : undefined, sandboxHtml: i === 2 ? prototype : undefined,
  comments: i === 2 ? [{ id: "comment", author: "user", body: "Keep the conversation and the code changes easy to review together.", createdAt: 1794300000000 }] : [],
}));
if (tasks.some((task) => !task) || tasks.length !== 20) throw new Error("Invalid screenshot sample tasks");
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  "chaoticreview.system-notifications": "false",
  [taskStorageKey(repo.rootPath)]: JSON.stringify(tasks),
  "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: "kanban" }),
};
const files = ["src/Settings.tsx", "src/Settings.test.tsx", "src/styles/settings.css"].map((path, i) => ({ path, oldPath: null, status: i === 0 ? "modified" : "added", snapshotId: `sample-${i}`, additions: [32, 18, 24][i], deletions: i === 0 ? 8 : 0, binary: false }));
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: oid, baseCommitOid: oid, compareCommitOid: oid, snapshotId: "sample", files };
const diff = (path: string) => ({ path, oldPath: null, hunks: [{ header: "@@ -1,7 +1,12 @@", rows: [
  { kind: "context", old: { lineNumber: 1, text: 'import { SettingsLayout } from "./ui";' }, new: { lineNumber: 1, text: 'import { SettingsLayout } from "./ui";' } },
  { kind: "context", old: { lineNumber: 2, text: "" }, new: { lineNumber: 2, text: "" } },
  { kind: "context", old: { lineNumber: 3, text: "export function Settings() {" }, new: { lineNumber: 3, text: "export function Settings() {" } },
  { kind: "changed", old: { lineNumber: 4, text: "  return <div>Settings</div>;" }, new: { lineNumber: 4, text: "  return (" } },
  ...["    <SettingsLayout>", '      <h1>Make it yours.</h1>', "      <ProfilePreferences />", "      <NotificationPreferences />", "    </SettingsLayout>", "  );"].map((text, i) => ({ kind: "added", old: null, new: { lineNumber: i + 5, text } })),
  { kind: "context", old: { lineNumber: 5, text: "}" }, new: { lineNumber: 11, text: "}" } },
] }] });
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review") return { repoPath: repo.rootPath, ...comparison, approvedFiles: [], approvedFileSnapshots: {}, approvedSnapshotId: "sample", chatMessages: messages, agentThreadId: null, comments: [] };
  if (command === "list_branch_refs") return { refs: ["main", "feature/settings"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "load_task_changes") return { comparison: { ...comparison, baseRef: "main" }, pendingSnapshotId: "sample", pendingFiles: true, committedChanges: true, headOid: oid, squashMessage: "Add settings page" };
  if (command === "load_task_file_diff" || command === "load_working_file_diff") return diff(args.path);
  if (command === "task_git_status") return { repository: { ...repo, currentBranch: "feature/settings" }, upstream: null, pullCount: 0, pushCount: 0, dirty: true };
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return true;
  if (command === "prepare_task_sandbox") return { token: "sample-preview", url: `data:text/html;charset=utf-8,${encodeURIComponent(prototype)}` };
  if (command === "release_task_sandbox" || command === "task_browser_hide") return;
  if (command === "task_browser_view") return { repositoryRoot: repo.rootPath, taskId: "sample-task-2", url: "", title: "", canGoBack: false, canGoForward: false, loading: false, error: null };
  if (command === "load_mcp_servers") return ["Figma", "Project documentation", "Local tools"].map((name, i) => ({ name, kind: i === 2 ? "stdio" : "http", url: i === 0 ? "https://mcp.figma.com/mcp" : "https://docs.example.com/mcp", command: i === 2 ? "project-tools" : "", args: [], env: {}, bearerTokenEnvVar: "", oauthClientId: "", oauthCallbackUrl: "", oauthScopes: [], oauthSecretStored: false, enabled: true }));
  if (command === "mcp_auth_statuses") return {};
  if (["scheduler_list", "list_memory", "agent_models", "list_website_credentials"].includes(command)) return [];
  if (command === "github_connection") return null;
  if (command === "save_review" || command === "set_mcp_context") return;
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "dark";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:window|inner_size" || command === "plugin:window|outer_size") return { width: innerWidth, height: innerHeight };
  if (command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  throw new Error(`Screenshot fixture does not allow native command: ${command}`);
}, { shouldMockEvents: true });
await initializeFileStore();
createRoot(document.getElementById("root")!).render(<App />);
