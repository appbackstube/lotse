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
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "telegram_connection") return new Promise((resolve) => { ready = resolve; });
  if (command === "telegram_poll") {
    if (polled) return new Promise(() => {});
    polled = true;
    return { nextOffset: 10, messages: [
      { updateId: 1, message: { document: { file_id: "oversized", file_size: 25000000, mime_type: "image/png" } } },
      { updateId: 2, message: { document: { file_id: "oversized-unknown-size", mime_type: "image/png" } } },
      { updateId: 3, message: { video: { file_id: "oversized-video", file_size: 25000000 } } },
      { updateId: 4, message: { video: { file_id: "oversized-video-unknown-size" } } },
      { updateId: 5, message: { caption: "Describe this video", video: { file_id: "video" } } },
      { updateId: 6, message: { document: { file_id: "document-video", mime_type: "video/quicktime" } } },
      { updateId: 7, message: { video_note: { file_id: "video-note" } } },
      { updateId: 8, message: { animation: { file_id: "animation" } } },
      { updateId: 9, message: { caption: "Describe this", photo: [{ file_id: "photo" }] } },
    ] };
  }
  if (command === "telegram_download_image" && args.fileId === "oversized") throw new Error("Oversized image must be rejected before download");
  if (command === "telegram_download_image" && args.fileId === "oversized-unknown-size") throw new Error("Telegram image exceeds 20 MB.");
  if (command === "telegram_download_image") return { kind: "image", path: "/synthetic/image.png", name: "image.png" };
  if (command === "telegram_download_video" && args.fileId === "oversized-video") throw new Error("Oversized video must be rejected before download");
  if (command === "telegram_download_video" && args.fileId === "oversized-video-unknown-size") throw new Error("Telegram video exceeds 20 MB.");
  if (command === "telegram_download_video") return { kind: "localFile", path: `/synthetic/${args.fileId}.mp4`, name: `${args.fileId}.mp4` };
  if (command === "telegram_send") { replies.push(args.text); return; }
  if (["retain_task_images", "release_chat_image_reference"].includes(command)) return;
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "Synthetic", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review") return reviews.at(-1) ?? null;
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
const root = createRoot(document.getElementById("root")!);
try {
  await initializeFileStore(); await act(async () => root.render(<App />)); await settle();
  await act(async () => ready({ connected: true, enabled: true, userId: 10, chatId: 10, connectionId: "connection", journalId: "bot" })); await settle();

  check(sends.length === 1 && sends[0].prompt === "Describe this video", "Oversized media blocked the following message");
  check(sends[0].chatContext.attachments[0].kind === "localFile" && sends[0].chatContext.attachments[0].path === "/synthetic/video.mp4", "Video did not reach the workspace agent");
  check(replies.filter((text) => text.includes("under 20 MB")).length === 4, "Oversized media did not receive rejection notices");
  const journal = JSON.parse(fileStore.getItem(telegramJournalKey(repo.rootPath, "bot"))!);
  check(journal.offset === 10, "Rejected media prevented the offset from advancing");
  check(!journal.entries.some((entry: any) => entry.updateId < 5), "Rejected media was queued");
  for (const [updateId, fileId] of [[6, "document-video"], [7, "video-note"], [8, "animation"]] as const) {
    const item = journal.entries.find((entry: any) => entry.updateId === updateId)?.item;
    check(item?.body === "" && item.context.attachments[0].path === `/synthetic/${fileId}.mp4`, `${fileId} was not queued without a caption`);
  }
  check(journal.entries.some((entry: any) => entry.updateId === 9 && entry.item.context.attachments[0].kind === "image"), "Following image was not queued");
  check(failures.length === 0, "Unexpected IPC");
  document.getElementById("result")!.textContent = "PASS: Telegram videos are queued and oversized media does not block later messages";
} catch (error) { document.getElementById("result")!.textContent = `FAIL: ${String(error)}`; }
finally { await act(async () => root.unmount()); }
