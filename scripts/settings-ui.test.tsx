// Full settings navigation with synthetic IPC; no native credentials or repository writes.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { emit } from "@tauri-apps/api/event";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { agentsStorageKey, defaultAgentStorageKey } from "../src/agents";
import { normalizeTask, taskStorageKey } from "../src/tasks";
import App from "../src/App";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-settings", name: "Settings preview", currentBranch: "main", hasOrigin: true };
const agent = { id: "owner", title: "Product Owner", prompt: "Clarify goals." };
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  [agentsStorageKey]: JSON.stringify([agent]),
  [taskStorageKey(repo.rootPath)]: JSON.stringify([normalizeTask({ id: "existing", title: "Existing task" })]),
};
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return true;
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
  if (command === "load_review" || command === "github_connection") return null;
  if (["scheduler_list", "list_memory", "agent_models", "load_mcp_servers", "list_website_credentials"].includes(command)) return [];
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:window|inner_size" || command === "plugin:window|outer_size") return { width: innerWidth, height: innerHeight };
  if (["save_review", "set_mcp_context"].includes(command) || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  throw new Error(`Unexpected settings IPC: ${command}`);
}, { shouldMockEvents: true });
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); }); };
const click = async (element: HTMLElement | null | undefined) => { check(element, "Missing control"); await act(async () => element!.click()); await settle(); };
const nav = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.settings-nav button')].find((item) => item.textContent === name);
const control = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const change = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }); await settle();
};
const active = () => document.querySelector<HTMLElement>('[data-settings-page]:not([hidden])');
const root = createRoot(document.getElementById("root")!);
try {
  await initializeFileStore(); await act(async () => root.render(<App />)); await settle();
  await click(control("Settings"));
  check(active()?.dataset.settingsPage === "general", "Settings must start on General");
  check(active()?.textContent?.includes("System notifications") && !active()?.textContent?.includes("Provider ID"), "General must contain its own controls");
  check(nav("General")?.getAttribute("aria-current") === "page", "Selected page missing accessible state");
  check(document.querySelectorAll('.settings-nav-group').length === 4, "Settings must have meaningful navigation groups");
  await click(nav("Pomodoro"));
  const focus = document.querySelector<HTMLInputElement>('input[name="focus"]')!;
  await change(focus, "37");
  await click(nav("Model providers"));
  const provider = control("Provider display name") as HTMLInputElement;
  await change(provider, "Draft provider");
  await click(nav("Pomodoro"));
  check(document.querySelector('input[name="focus"]') === focus && focus.value === "37", "Page navigation must preserve unsaved form values");
  await click(nav("Model providers"));
  check(provider.value === "Draft provider", "Provider draft lost during navigation");
  check(document.activeElement === document.querySelector('.settings-page-title'), "Page navigation must focus its heading");
  const search = control("Search settings") as HTMLInputElement;
  await change(search, "  KEYCHAIN  ");
  check(document.querySelectorAll('.settings-nav button').length === 1 && nav("Website credentials"), "Search must match setting keywords, ignoring case and whitespace");
  await click(nav("Website credentials"));
  check(active()?.querySelector('form[aria-label="Website credential editor"]'), "Website credentials must be reachable");
  await change(search, "no-matching-setting");
  check(document.querySelector('.settings-search-empty')?.textContent === "No settings found.", "Empty search must explain missing results");
  await change(search, "");
  for (const [name, id] of [["Tasks", "tasks"], ["Agent preferences", "agent"], ["MCP servers", "mcp"], ["GitHub", "github"], ["Repository", "repository"], ["Diagnostics", "diagnostics"]]) {
    await click(nav(name));
    check(active()?.dataset.settingsPage === id, `${name} page is not reachable`);
  }
  await click(nav("General"));
  const diff = control("Default diff view");
  await click(diff);
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === "Unified"));
  check(diff?.textContent?.includes("Unified"), "Existing setting controls must still work");
  await click(control("Close settings"));
  check(!document.querySelector('.settings-layout'), "Close settings must return to workspace");
  await click(document.querySelector('[title="Pomodoro timer"]'));
  await click(control("Pomodoro settings"));
  check(active()?.dataset.settingsPage === "pomodoro", "Timer shortcut must open Pomodoro directly");
  await click(control("Close settings"));
  await click(control("GitHub Inbox (0)"));
  await click([...document.querySelectorAll<HTMLElement>('.github-inbox-popover button')].find((item) => item.textContent === "Connect GitHub"));
  check(active()?.dataset.settingsPage === "github", "Inbox shortcut must open GitHub directly");
  check(document.documentElement.scrollWidth <= innerWidth, "Settings must fit the viewport");
  await change(control("Search settings") as HTMLInputElement, "default agent");
  await click(nav("Agent preferences"));
  const defaultAgentLabel = () => control("Default agent")?.querySelector('[data-slot="select-value"]')?.textContent;
  check(defaultAgentLabel() === "None", "Default agent must start at None");
  const chooseAgent = async (name: string) => {
    await click(control("Default agent"));
    await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === name));
    await fileStore.flush();
  };
  await chooseAgent(agent.title);
  check(storage[defaultAgentStorageKey] === agent.id, "Default agent selection must persist");
  await click(control("Close settings"));
  check(control("Agent role")?.textContent === "None", "Changing defaults must preserve the current review role");
  await click([...document.querySelectorAll<HTMLElement>('button')].find((item) => item.textContent?.trim() === "Tasks"));
  await click(control("New task"));
  await change(document.querySelector<HTMLInputElement>('input[placeholder="Task title"]')!, "With default agent");
  await click(document.querySelector<HTMLElement>('[role="dialog"] button[type="submit"]'));
  await act(async () => { await emit("mcp-task-added", { repositoryRoot: repo.rootPath, task: { id: "mcp-new", title: "From MCP" } }); });
  await settle(); await fileStore.flush();
  const tasks = JSON.parse(storage[taskStorageKey(repo.rootPath)]);
  check(tasks.find((task: any) => task.id === "existing").chatAgent === null, "Existing tasks must keep their role");
  for (const title of ["With default agent", "From MCP"]) {
    check(tasks.find((task: any) => task.title === title)?.chatAgent?.prompt === agent.prompt, "New tasks must inherit the default agent prompt");
  }
  await act(async () => root.render(null));
  await act(async () => root.render(<App />)); await settle();
  check(control("Agent role")?.textContent === agent.title, "New reviews must inherit the saved default after remounting");
  await click(control("Settings")); await click(nav("Agent preferences"));
  check(defaultAgentLabel() === agent.title, "Settings must restore the saved default");
  await chooseAgent("None");
  check(storage[defaultAgentStorageKey] === "", "None must clear the default");
  await chooseAgent(agent.title);
  await act(async () => {
    fileStore.setItem(agentsStorageKey, "[]");
    window.dispatchEvent(new StorageEvent("storage", { key: agentsStorageKey, newValue: "[]" }));
  }); await settle();
  check(defaultAgentLabel() === "None", "Missing or deleted default agents must fall back to None");
  await click(control("Close settings"));
  check(control("Agent role")?.textContent === agent.title, "Deleting a saved agent must preserve existing review roles");
  await act(async () => root.render(null));
  await act(async () => root.render(<App />)); await settle();
  check(control("Agent role")?.textContent === "None", "New reviews must fall back to None when the default agent is missing");
  await click(control("Settings"));
  if (new URLSearchParams(location.search).has("preview")) await click(nav("General"));
  document.getElementById("result")!.textContent = "PASS: settings navigation, default agent persistence, new task/review defaults, existing roles and deleted-agent fallback.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`;
} finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => root.unmount());
}
