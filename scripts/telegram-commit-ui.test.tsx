import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { telegramJournalKey } from "../src/telegramJournal";
import App from "../src/App";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-repository", name: "Telegram", currentBranch: "main", hasOrigin: true };
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const storage: Record<string, string> = { "chaoticreview.auth-onboarding-v1": "complete" };
const sends: any[] = [], replies: string[] = [], reviews: any[] = [], failures: string[] = [];
let ready: (status: unknown) => void = () => {};
let polled = false;
let releaseReply: () => void = () => {};
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "telegram_connection") return new Promise((resolve) => { ready = resolve; });
  if (command === "telegram_poll") {
    if (polled) return new Promise(() => {});
    polled = true;
    return { nextOffset: 3, messages: [{ updateId: 1, message: { text: "First message" } }, { updateId: 2, message: { caption: "Describe this", photo: [{ file_id: "photo" }] } }] };
  }
  if (command === "telegram_download_image") return { kind: "image", path: "/synthetic/image.png", name: "image.png" };
  if (command === "telegram_send") {
    replies.push(args.text);
    if (args.text === "Committed the change") await new Promise<void>((resolve) => { releaseReply = resolve; });
    return;
  }
  if (["retain_task_images", "release_chat_image_reference"].includes(command)) return;
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "Synthetic", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review") return [...reviews].reverse().find((review) => review.baseOid === args.baseOid) ?? null;
  if (command === "github_connection") return null;
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: [], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "agent_models") return [{ model: "gpt-5.6-terra", displayName: "Default" }];
  if (["scheduler_list", "list_memory", "load_mcp_servers"].includes(command)) return [];
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return false;
  if (command === "conversation_settings") return { enabled: false };
  if (command === "save_review") { reviews.push(args.session); return; }
  if (command === "ai_chat_send") { sends.push(args); return { requestId: `run-${sends.length}`, threadId: "thread-1", turnId: `turn-${sends.length}` }; }
  if (command === "set_mcp_context" || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  failures.push(command); throw new Error(`Unexpected IPC: ${command}`);
}, { shouldMockEvents: true, telegram: true });
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const settle = async () => { for (let index = 0; index < 10; index++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
const event = async (index: number, kind: string, extra: object = {}) => { await act(async () => sends[index].events.onmessage({ type: "chat", payload: { requestId: `run-${index + 1}`, threadId: "thread-1", turnId: `turn-${index + 1}`, kind, ...extra } })); await settle(); };
let root = createRoot(document.getElementById("root")!);
try {
  await initializeFileStore(); await act(async () => root.render(<App />)); await settle();
  await act(async () => ready({ connected: true, enabled: true, userId: 10, chatId: 10, connectionId: "connection", journalId: "bot" })); await settle();

  const oldBase = comparison.baseOid;
  comparison.baseOid = "b".repeat(40);
  comparison.baseCommitOid = comparison.baseOid;
  comparison.compareCommitOid = comparison.baseOid;
  await event(0, "assistantMessageCompleted", { finalText: "Committed the change" });
  await event(0, "completed");
  check(sends.length === 1, "Carried queue started before the previous reply was delivered");
  await act(async () => releaseReply()); await settle();
  check(sends.length === 2 && sends[1].prompt === "Describe this", "Queued Telegram message did not continue after commit");
  check(sends[1].agentThreadId === "thread-1", "Commit lost the shared conversation thread");
  check(replies.includes("Committed the change"), "First reply was not delivered before continuing");
  const queues = JSON.parse(fileStore.getItem("chaoticreview.chat-queues")!);
  check(!Object.keys(queues).some((key) => key.includes(oldBase)), "Queue remained under obsolete commit");
  const journal = JSON.parse(fileStore.getItem(telegramJournalKey(repo.rootPath, "bot"))!);
  check(journal.entries.find((entry: any) => entry.updateId === 2)?.workspaceKey.includes(comparison.baseOid), "Telegram journal still points to the old chat");
  await event(1, "assistantMessageCompleted", { finalText: "Image answer after commit" }); await event(1, "completed");
  check(replies.includes("Image answer after commit"), "Carried message did not send its reply");
  check(sends.length === 2 && failures.length === 0, "Duplicate run or unexpected IPC");
  await act(async () => root.unmount());
  const workspaceKey = JSON.stringify([repo.rootPath, "workingCopy", null, null, comparison.baseOid]);
  const item = { id: "telegram-connection-3", telegram: { repositoryRoot: repo.rootPath, connectionId: "connection", journalId: "bot", updateId: 3 }, body: "After carried chat restart", context: { mode: "auto", attachments: [] }, selection: null, mode: "default", model: "gpt-5.6-terra", effort: "medium" };
  fileStore.setItem("chaoticreview.chat-queues", JSON.stringify({ [workspaceKey]: [item] }));
  fileStore.setItem(telegramJournalKey(repo.rootPath, "bot"), JSON.stringify({ offset: 4, entries: [{ updateId: 3, workspaceKey, item, phase: "queued" }] }));
  await fileStore.flush();
  root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<App />)); await settle();
  await act(async () => ready({ connected: true, enabled: true, userId: 10, chatId: 10, connectionId: "connection", journalId: "bot" })); await settle();
  check(sends.length === 3 && sends[2].prompt === item.body && sends[2].agentThreadId === "thread-1", "Carried workspace queue did not resume its thread exactly once after restart");
  check(failures.length === 0, "Unexpected IPC after restart");
  document.getElementById("result")!.textContent = "PASS: Telegram queue follows carried conversation after commit, waits for reply delivery and resumes after restart";
} catch (error) { document.getElementById("result")!.textContent = `FAIL: ${String(error)}`; }
finally { await act(async () => root.unmount()); }
