// The real App with synthetic IPC; no live agents or approvals.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "./mockTauri";
import { initializeFileStore } from "../src/fileStore";
import { normalizeTask, taskStorageKey } from "../src/tasks";
import App from "../src/App";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-repository", name: "Attention checks", currentBranch: "main", hasOrigin: true };
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const tasks = ["Release", "Login"].map((title, index) => normalizeTask({ id: `12345678-1234-1234-1234-123456789ab${index}`, title, location: "worktree", worktree: { branch: `task/${index}`, baseOid: comparison.baseOid, baseBranch: "main" } })!);
const storage: Record<string, string> = { "chaoticreview.auth-onboarding-v1": "complete", [taskStorageKey(repo.rootPath)]: JSON.stringify(tasks), "chaoticreview.task-view": JSON.stringify({ [repo.rootPath]: "kanban" }) };
const sends: any[] = [], responses: any[] = [], approvals: any[] = [], acknowledgements: any[] = [], failures: string[] = [];
let failAnswer = false;
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "Synthetic", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: [], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (["scheduler_list", "list_memory", "agent_models"].includes(command)) return [];
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return false;
  if (command === "load_task_changes") return { comparison, pendingSnapshotId: "snapshot", pendingFiles: false, committedChanges: false, headOid: comparison.baseOid, squashMessage: "" };
  if (command === "task_git_status") return { repository: repo, upstream: null, pullCount: 0, pushCount: 0, dirty: false };
  if (command === "ai_chat_send") { sends.push(args); return { requestId: `run-${sends.length}`, threadId: `thread-${sends.length}`, turnId: `turn-${sends.length}` }; }
  if (command === "agent_user_input_respond") { if (failAnswer) throw new Error("Synthetic answer failure"); responses.push(args); return; }
  if (command === "agent_approve") { approvals.push(args); return true; }
  if (command === "ai_chat_cancel") return;
  if (command === "task_control_active") return true;
  if (command === "task_control_ack") { acknowledgements.push(args); return; }
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:window|outer_size" || command === "plugin:window|inner_size") return { width: innerWidth, height: innerHeight };
  if (command.startsWith("plugin:notification|")) return false;
  if (["save_review", "set_mcp_context"].includes(command) || command.startsWith("plugin:window|")) return;
  failures.push(command); throw new Error(`Unexpected IPC: ${command}`);
}, { shouldMockEvents: true });
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
const visible = (element: Element) => !!element.getBoundingClientRect().width && !!element.getBoundingClientRect().height;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(el => visible(el) && (el.textContent?.trim() === label || el.getAttribute("aria-label") === label))!;
const click = async (el: HTMLElement) => { check(el, "Missing control"); await act(async () => { el.focus(); el.click(); }); await settle(); };
const turnEvent = async (index: number, type: string, payload: any) => { await act(async () => sends[index].events.onmessage({ type, payload })); await settle(); };
const question = (index: number, requestId: number, text: string) => turnEvent(index, "userInputRequested", { requestId, threadId: `thread-${index + 1}`, turnId: `turn-${index + 1}`, itemId: "question", isBlocking: true, questions: [{ id: "choice", header: "Decision", question: text, isOther: true, isSecret: false, options: [{ label: "Yes", description: "Continue" }, { label: "No", description: "Change the plan" }] }] });
const approval = (index: number, requestId: number, title: string, source = "mcp") => turnEvent(index, "approvalRequested", { requestId, title, description: "Review the concrete action before allowing it.", source, serverName: source === "mcp" ? "Synthetic service" : null });
const stack = () => document.querySelector<HTMLElement>('[aria-label="Agent requests"]')!;
const expand = async () => { if (button("Show agent requests")) await click(button("Show agent requests")); };
const card = async (title: string) => {
  await expand();
  for (let i = 0; i < 8 && stack()?.querySelector("h2")?.textContent !== title; i++) await click(button("Next request"));
  check(stack()?.querySelector("h2")?.textContent === title, `Missing card: ${title}`);
};
const count = (n: number) => check(stack()?.querySelector('[role="status"]')?.textContent === `${n} ${n === 1 ? "request" : "requests"}`, `Expected ${n} cards: ${stack()?.textContent}`);
const checkFloating = () => {
  const bounds = stack().getBoundingClientRect();
  check(stack().parentElement === document.body && !stack().closest('[role="dialog"]'), "Stack must belong to the window, not a task dialog");
  check(bounds.width <= 300 && bounds.height <= 230, "Cards must stay compact");
  check(Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2) < 1 && bounds.top === 60, "Stack must stay at the top center of the viewport");
  check(!stack().closest('[aria-hidden="true"], [inert]'), "Global cards must remain accessible while a modal is open");
  check(stack().contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + 20)), "Another layer covers the cards");
};
const edit = async (el: HTMLTextAreaElement, value: string) => { check(el, "Missing composer"); await act(async () => { el.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }); await settle(); };
const root = createRoot(document.getElementById("root")!);
try {
  await initializeFileStore(); await act(async () => root.render(<App />)); await settle();
  check(!stack(), "Idle agents must not create cards");
  await click(button("Workspace"));
  await edit(document.querySelector('[aria-label="Review Agent message"]')!, "Coordinate tasks");
  await click(button("Send Review Agent message"));
  await edit(document.querySelector('[aria-label="Review Agent message"]')!, "Keep my workspace draft");
  for (const task of tasks) {
    const operationId = `start-${task.id}`;
    await act(async () => emit("task-control-request", { repositoryRoot: repo.rootPath, operationId, callerTaskId: null, name: "start_task_run", arguments: { taskId: task.id, prompt: "Work on this task" } })); await settle();
    check(acknowledgements.some(ack => ack.operationId === operationId && !ack.error), "Background agent did not start");
  }
  check(sends.length === 3, "Expected workspace and two task agents");
  await question(1, 101, "Can I release?");
  await question(0, 102, "Which project next?");
  await approval(2, 103, "Connect login service");
  count(3);
  await question(1, 101, "Can I release?"); count(3);
  check(!document.querySelector('[role="alertdialog"]'), "Background approvals must use cards without a blocking modal");
  check(stack().querySelectorAll(".agent-attention-behind").length === 2, "Requests are not visibly stacked");
  const bounds = stack().getBoundingClientRect();
  check(bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight, "Stack exceeds viewport");
  checkFloating();
  const stackElement = stack();
  await click(button("Minimize agent requests"));
  await click(button("Tasks"));
  check(button("Show agent requests"), "Task switching reopened the minimized stack");
  await turnEvent(0, "userInputResolved", { requestId: 102 });
  check(button("Show agent requests"), "Resolving another card reopened the stack");
  await approval(0, 104, "Workspace permission", "agent"); count(3);
  await card("Can I release?"); await click(button("Answer"));
  check(document.querySelector('[role="dialog"]')?.textContent?.includes("Release"), "Answer opened the wrong task");
  check(stack() === stackElement, "Opening a task must not reparent or remount the floating stack");
  check(button("Show agent requests"), "Opening a request must minimize the stack");
  await expand(); checkFloating();
  check(button("Close task modal"), "Interacting with global cards dismissed the task dialog");
  const composer = document.querySelector('[role="dialog"] [aria-label="Review Agent message"]')!.getBoundingClientRect();
  const floating = stack().getBoundingClientRect();
  check(floating.bottom <= composer.top || floating.right <= composer.left || floating.left >= composer.right, "Cards overlap the task composer");
  const previousFocus = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="radio"]')!;
  await act(async () => { previousFocus.focus(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "F6", bubbles: true })); }); await settle();
  check(stack().contains(document.activeElement), "Keyboard users cannot reach cards above a modal");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "F6", bubbles: true }))); await settle();
  check(document.activeElement === previousFocus, "F6 must return focus to the task");
  await click(button("Minimize agent requests"));
  await click([...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(el => visible(el) && el.parentElement?.textContent?.startsWith("Yes"))!);
  failAnswer = true; await click(button("Continue")); await expand(); count(3);
  check(stack()?.querySelector("h2")?.textContent === "Can I release?", "Failed answer removed the request");
  await click(button("Minimize agent requests")); failAnswer = false; await click(button("Continue"));
  check(responses[0]?.requestId === 101 && responses[0]?.answers.choice[0] === "Yes", "Answer was routed to the wrong agent");
  await expand(); count(2);
  await approval(1, 105, "Connect release service"); count(3);
  await approval(1, 109, "Second release permission"); count(4);
  await card("Second release permission"); await click(button("Review approval")); await click(button("Allow"));
  check(approvals.at(-1)?.requestId === 109, "A card opened another pending permission in the same task");
  await turnEvent(1, "approvalResolved", { requestId: 109 });
  await card("Connect release service"); await click(button("Review approval"));
  await click(button("Allow"));
  check(approvals.at(-1)?.requestId === 105 && approvals.at(-1).approved, "An earlier approval in another task hid or replaced the selected approval");
  await turnEvent(1, "approvalResolved", { requestId: 105 });
  await card("Connect login service"); await click(button("Review approval")); await click(button("Deny"));
  check(approvals.at(-1)?.requestId === 103 && !approvals.at(-1).approved, "Deny was routed to the wrong agent");
  await turnEvent(2, "approvalResolved", { requestId: 103 });
  await card("Workspace permission"); await click(button("Review approval"));
  check(!button("Close task modal") && button("Workspace")?.getAttribute("aria-pressed") === "true", "Workspace request did not return to the workspace");
  check(document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')?.value === "Keep my workspace draft", "Request navigation discarded the workspace draft");
  await click(button("Allow")); await turnEvent(0, "approvalResolved", { requestId: 104 });
  check(!stack(), "Resolved requests left stale cards");
  await question(1, 106, "Question before cancellation");
  await turnEvent(1, "chat", { requestId: "run-2", threadId: "thread-2", turnId: "turn-2", kind: "cancelled" });
  check(!stack(), "Cancelled task left an orphan card");
  await question(0, 107, "Question before completion");
  await approval(0, 108, "Permission before completion", "agent");
  await turnEvent(0, "chat", { requestId: "run-1", threadId: "thread-1", turnId: "turn-1", kind: "completed" });
  check(!stack(), "Completed workspace left orphan questions or approvals");
  check(!failures.length, `Unexpected IPC: ${failures.join(", ")}`);
  document.getElementById("result")!.textContent = "PASS: compact cards fixed above task dialogs without composer overlap, stable window position and mounting, keyboard access and focus return, background requests, deduplication, minimize without reminders, exact answer/approval routing, failure/retry, drafts, resolution and cancellation cleanup. No live agents.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : error}\n${document.body.innerText.slice(-4000)}`;
} finally { await act(async () => root.unmount()); }
