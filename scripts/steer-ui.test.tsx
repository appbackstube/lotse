import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import App from "../src/App";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { loadPipelineRuns } from "../src/pipelineRuns";
import { pipelinesStorageKey } from "../src/pipelines";
import { normalizeTask, taskStorageKey } from "../src/tasks";
import type { AgentTurnEvent, AiChatAccepted, AiChatEvent, Comparison, ReviewSession } from "../src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-steer", name: "Steer regression", currentBranch: "main", hasOrigin: true };
const task = normalizeTask({ id: "pipeline-task", title: "Pipeline task", location: "workspace" })!;
const pipeline = { id: "verify", title: "Verify changes", description: "", steps: [{ id: "step", title: "Inspect", agentId: null, messages: ["Inspect the changes."] }] };
const path = "summary.md";
const comparison: Comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [{ path, oldPath: null, status: "modified", additions: 1, deletions: 1, snapshotId: "file-snapshot", binary: false }] };
const taskKey = taskStorageKey(repo.rootPath);
const storage: Record<string, string> = {
  "chaoticreview.auth-onboarding-v1": "complete",
  [pipelinesStorageKey]: JSON.stringify([pipeline]),
  [taskKey]: JSON.stringify([task, normalizeTask({ id: "other", title: "Another task", location: "workspace" })]),
};
const reviews: { saved: ReviewSession | null } = { saved: null };
const telegramNotices: string[] = [];
let acknowledgeSteer: (() => void) | undefined;
const runs: { accepted: AiChatAccepted; emit: (event: AgentTurnEvent) => void; mode: string }[] = [];
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "Synthetic", baseUrl: "http://127.0.0.1:1", envKey: "SYNTHETIC_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: ["origin/main"], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_working_file_diff") return { path, oldPath: null, hunks: [{ header: "@@ -1 +1 @@", rows: [{ kind: "changed", old: { lineNumber: 1, text: "Draft summary" }, new: { lineNumber: 1, text: "Updated summary" } }] }] };
  if (command === "load_review") return reviews.saved;
  if (command === "save_review") { reviews.saved = structuredClone(args.session); return; }
  if (command === "github_connection") return null;
  if (command === "telegram_connection") return { connected: true, enabled: true, remoteControlEnabled: true, userId: 10, chatId: 10, connectionId: "synthetic", journalId: "synthetic" };
  if (command === "telegram_poll") return new Promise(() => {});
  if (command === "telegram_send") { if (args.remoteControl) telegramNotices.push(args.text); return telegramNotices.length; }
  if (["scheduler_list", "list_memory", "load_mcp_servers"].includes(command)) return [];
  if (command === "agent_models") return [{ model: "gpt-5.6-terra", displayName: "Default" }];
  if (command === "task_git_status") return { repository: repo, upstream: null, pullCount: 0, pushCount: 0, dirty: false };
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:window|outer_size" || command === "plugin:window|inner_size") return { width: innerWidth, height: innerHeight };
  if (command === "set_mcp_context" || command.startsWith("plugin:window|") || command.startsWith("plugin:notification|")) return;
  if (command === "ai_chat_send") {
    const index = runs.length + 1;
    const accepted = { requestId: `run-${index}`, threadId: `thread-${index}`, turnId: `turn-${index}` };
    runs.push({ accepted, emit: args.events.onmessage, mode: args.collaborationMode });
    return accepted;
  }
  if (command === "ai_chat_steer") return new Promise<void>((resolve) => { acknowledgeSteer = resolve; });
  throw new Error(`Unexpected synthetic IPC: ${command}`);
}, { shouldMockEvents: true, telegram: true });

const options = new URLSearchParams(location.search);
const capture = options.has("evidence");
const retracted = options.has("retracted");
const split = !options.has("revised");
const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
const settle = async () => { for (let tick = 0; tick < 4; tick++) await act(async () => { await wait(30); }); };
const check = (condition: unknown, detail: string) => { if (!condition) throw new Error(detail); };
const visible = (element: HTMLElement) => !!element.getBoundingClientRect().width && !!element.getBoundingClientRect().height;
const findButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => visible(element) && (element.getAttribute("aria-label") === label || element.textContent?.trim() === label));
const click = async (label: string, element = findButton(label)) => {
  if (!element || element.disabled) throw new Error(`Unavailable control: ${label}`);
  await act(async () => { element.focus(); element.click(); }); await settle();
};
const send = async (body: string, label: string) => {
  const field = [...document.querySelectorAll<HTMLTextAreaElement>(".ios-chat-composer textarea:not(.ios-commit-message)")].find(visible);
  if (!field) throw new Error("Chat composer missing");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, body);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(label);
};
const event = async (index: number, payload: Pick<AiChatEvent, "kind" | "delta" | "finalText">) => {
  const run = runs[index];
  if (!run) throw new Error(`Missing synthetic turn ${index + 1}`);
  await act(async () => run.emit({ type: "chat", payload: { ...run.accepted, ...payload } })); await settle();
};
const steer = async () => { await click("Steer"); check(acknowledgeSteer, "Steer must await acknowledgement"); };
const acknowledge = async () => { await act(async () => acknowledgeSteer!()); acknowledgeSteer = undefined; await settle(); };
const checkpoint = async () => { if (capture) await act(async () => { await wait(1450); }); };
const root = createRoot(document.getElementById("root")!);
const result = document.getElementById("result")!;

try {
  await initializeFileStore();
  await act(async () => root.render(<App />)); await settle();
  await click("Tasks"); await click(task.title);
  await click("Add to chat"); await click("Pipeline"); await click(`Start pipeline ${pipeline.title}`);
  const prefix = "I checked the summary.";
  const revised = "I verified both the summary and the heading.";
  const suffix = "The heading is correct.";
  const finalResponse = retracted ? prefix : split ? `${prefix} ${suffix}` : revised;
  const displayedMessages = () => [...document.querySelectorAll<HTMLElement>("[data-search-message] .chat-markdown, .ios-chat-streaming-text")].filter(visible).map((element) => element.textContent?.trim());
  await event(0, { kind: "assistantDelta", delta: prefix });
  await send("Also verify the heading.", "Queue Review Agent message"); await checkpoint();
  await steer();
  if (retracted) {
    await acknowledge();
    const draft = "The heading needs another pass.";
    await event(0, { kind: "assistantDelta", delta: ` ${draft}` });
    check(displayedMessages().includes(draft), "The streamed draft must be visible before completion");
    await checkpoint();
    await event(0, { kind: "assistantMessageCompleted", finalText: finalResponse });
    check(!displayedMessages().includes(draft), "Completion without a suffix must remove the live draft");
  } else {
    await event(0, { kind: "assistantMessageCompleted", finalText: finalResponse });
  }
  await event(0, { kind: "completed" }); await checkpoint();
  if (!retracted) await acknowledge();
  await click("Another task"); await click(task.title);
  await act(async () => { await fileStore.flush(); });
  const saved: typeof task = JSON.parse(storage[taskKey]).find((entry: typeof task) => entry.id === task.id);
  const expected = ["Inspect the changes.", prefix, "Also verify the heading.", ...(retracted ? [] : [split ? suffix : revised])];
  check(JSON.stringify(saved.chatMessages.map((entry: { body: string }) => entry.body)) === JSON.stringify(expected), "The pipeline's saved chat must preserve the exact steer order");
  check(saved.chatMessages[0].runStatus === "completed" && runs.length === 1, "The pipeline must complete without resending the steer");
  const results = loadPipelineRuns(JSON.stringify([repo.rootPath, "task", task.id]))[0]?.messages[0]?.resultIds;
  check(JSON.stringify(results) === JSON.stringify(saved.chatMessages.filter((entry) => entry.role === "assistant").map((entry) => entry.id)), "Pipeline result IDs must reference exactly the saved assistant entries in order");
  check(JSON.stringify(displayedMessages()) === JSON.stringify(expected), "The reopened pipeline chat must show the saved order");
  const completionNotice = telegramNotices.find((notice) => notice.startsWith(`${task.title}: Agent completed.`));
  check(completionNotice === `${task.title}: Agent completed.\n\n${finalResponse}`, `Telegram must receive the entire final response; received ${JSON.stringify(completionNotice)}`);
  await checkpoint();

  if (retracted || options.has("split")) {
    result.textContent = `PASS: ${retracted ? "retracted draft is absent" : "only the suffix follows Steer"} in the reopened chat; Telegram receives the full response.`;
    if (capture) {
      result.textContent += `\n\nCaptured Telegram mock payload:\n${completionNotice}`;
      Object.assign(result.style, { position: "fixed", top: "64px", left: "50%", transform: "translateX(-50%)", zIndex: "100", padding: "12px", background: "white", color: "black", border: "1px solid black" });
    }
  } else {
    await checkWorkspacePlans();
  }
} catch (error) {
  result.textContent = `FAIL: ${String(error)}`;
} finally {
  if (!capture) await act(async () => root.unmount());
}

async function checkWorkspacePlans() {
  await click("Workspace"); await click("Add to chat");
  await click("Plan Off", [...document.querySelectorAll<HTMLButtonElement>('button[role="switch"][aria-checked="false"]')].find((button) => visible(button) && button.textContent?.startsWith("Plan")));
  await send("Propose a plan for the summary.", "Send Review Agent message");
  check(runs[1]?.mode === "plan", "The workspace turn must run in Plan mode");
  await click(path, document.querySelector<HTMLButtonElement>(`.ios-tree-file[title="${path}"]`) ?? undefined); await click("Approve");
  const prefix = "<proposed_plan>\nUpdate the summary.";
  await event(1, { kind: "assistantDelta", delta: prefix });
  await send("Include a verification step.", "Queue Review Agent message"); await checkpoint();
  await steer(); await acknowledge();
  await event(1, { kind: "assistantMessageCompleted", finalText: `${prefix}\nVerify the heading.\n</proposed_plan>` });
  await event(1, { kind: "completed" });
  check(reviews.saved?.approvedFileSnapshots[path] === "file-snapshot" && findButton("Approved")?.getAttribute("aria-pressed") === "true", "The file approval must stay saved and visible after steering");
  check(findButton("Implement now") && !findButton("Implement now")?.disabled, "A split final plan must remain actionable");
  check(reviews.saved?.chatMessages.filter((entry) => entry.body.includes("Update the summary.")).length === 1 && reviews.saved?.chatMessages.at(-1)?.body === "Verify the heading.", "Saved plan text must not repeat the prefix");

  await send("Propose a separate plan for the introduction.", "Send Review Agent message");
  const completedPlanBody = "Rewrite the introduction.";
  await event(2, { kind: "assistantMessageCompleted", finalText: `<proposed_plan>\n${completedPlanBody}\n</proposed_plan>` });
  await send("Keep the title.", "Queue Review Agent message");
  await steer(); await acknowledge();
  const findSavedPlan = () => reviews.saved?.chatMessages.find((entry) => entry.body.includes(completedPlanBody));
  const completedPlanId = findSavedPlan()?.id;
  check(completedPlanId && !findSavedPlan()?.canImplementPlan, "The saved plan must wait for turn completion");
  await event(2, { kind: "completed" });
  check(findSavedPlan()?.id === completedPlanId && findSavedPlan()?.body === completedPlanBody && findSavedPlan()?.canImplementPlan, "Turn completion must make the saved plan actionable in place without further text");
  check(reviews.saved?.chatMessages.at(-1)?.body === "Keep the title.", "The saved plan must remain before the steer");
  const planArticle = [...document.querySelectorAll<HTMLElement>("[data-search-message]")].find((element) => element.dataset.searchMessage === completedPlanId);
  check(planArticle?.querySelector<HTMLButtonElement>(".ios-chat-plan-header button")?.disabled === false, "The saved plan must show an enabled Implement now button");
  await checkpoint();
  result.textContent = "PASS: ordered pipeline result IDs; Workspace approval, split plan and completed-before-steer plan preserved.";
}
