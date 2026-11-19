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
let releaseVoice: (value: string) => void = () => {};
let releaseReply: () => void = () => {};
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "telegram_connection") return new Promise((resolve) => { ready = resolve; });
  if (command === "telegram_poll") {
    if (polled) return new Promise(() => {});
    polled = true;
    return { nextOffset: 4, messages: [{ updateId: 1, message: { text: "First message" } }, { updateId: 2, message: { caption: "Keep the full transcript", voice: { file_id: "voice" } } }, { updateId: 3, message: { text: "Following message" } }] };
  }
  if (command === "telegram_transcribe_voice") return new Promise<string>((resolve) => { releaseVoice = resolve; });
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
  if (command === "ai_chat_send") { if (new TextEncoder().encode(args.prompt).length > 20_000 && !args.allowLongPrompt) throw new Error("Invalid AI chat request"); sends.push(args); return { requestId: `run-${sends.length}`, threadId: "thread-1", turnId: `turn-${sends.length}` }; }
  if (command === "set_mcp_context" || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  failures.push(command); throw new Error(`Unexpected IPC: ${command}`);
}, { shouldMockEvents: true, telegram: true });
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const settle = async () => { for (let index = 0; index < 10; index++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
const event = async (index: number, kind: string, extra: object = {}) => { await act(async () => sends[index].events.onmessage({ type: "chat", payload: { requestId: `run-${index + 1}`, threadId: "thread-1", turnId: `turn-${index + 1}`, kind, ...extra } })); await settle(); };
const root = createRoot(document.getElementById("root")!);
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
  const pending = JSON.parse(fileStore.getItem(telegramJournalKey(repo.rootPath, "bot"))!).entries.find((entry: any) => entry.updateId === 2);
  check(pending?.phase === "transcribing" && pending.workspaceKey.includes(comparison.baseOid), "In-flight transcription did not follow the carried chat");
  const transcript = "ä".repeat(10_000);
  await act(async () => releaseVoice(transcript)); await settle();
  check(sends.length === 1, "Transcript started before the previous reply was delivered");
  await act(async () => releaseReply()); await settle();
  const journal = JSON.parse(fileStore.getItem(telegramJournalKey(repo.rootPath, "bot"))!);
  const voice = journal.entries.find((entry: any) => entry.updateId === 2);
  check(sends.length === 2, "Transcript did not dispatch exactly once after commit");
  check(sends[1].prompt === `Voice transcript:\n${transcript}\n\nCaption:\nKeep the full transcript`, "Transcript or caption was truncated");
  check(sends[1].agentThreadId === "thread-1", "Transcript lost the carried conversation thread");
  check(voice?.phase === "running" && voice.workspaceKey.includes(comparison.baseOid), "Transcript journal binding is stale");
  const queues = JSON.parse(fileStore.getItem("chaoticreview.chat-queues")!);
  check(!Object.keys(queues).some((key) => key.includes(oldBase)), "Queue remained under the obsolete commit");
  await event(1, "assistantMessageCompleted", { finalText: "Voice answer" }); await event(1, "completed");
  check(sends.length === 3 && sends[2].prompt === "Following message", "Long transcription blocked subsequent Telegram messages");
  await event(2, "assistantMessageCompleted", { finalText: "Following answer" }); await event(2, "completed");
  check(replies.includes("Voice answer") && replies.includes("Following answer"), "Agent replies were not delivered");
  check(sends.length === 3 && failures.length === 0, "Duplicate run or unexpected IPC");
  document.getElementById("result")!.textContent = "PASS: in-flight voice follows commit, preserves full UTF-8 transcript and caption, waits for reply delivery and lets following messages continue";
} catch (error) { document.getElementById("result")!.textContent = `FAIL: ${String(error)}`; }
finally { await act(async () => root.unmount()); }
