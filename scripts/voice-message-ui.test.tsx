import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { initializeFileStore } from "../src/fileStore";
import { normalizeTask, taskStorageKey } from "../src/tasks";
import App from "../src/App";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-voice", name: "Voice", currentBranch: "main", hasOrigin: true };
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const task = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Voice test task", manualStatus: "inbox", location: "workspace" })!;
const storage: Record<string, string> = { "chaoticreview.auth-onboarding-v1": "complete", [taskStorageKey(repo.rootPath)]: JSON.stringify([task]) };
let resolveTranscript: ((text: string) => void) | undefined;
let transcriptions = 0;
let sends = 0;
let stopped = 0;
let microphoneDenied = false;
let activeRecorder: FakeRecorder | undefined;
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "transcribe_composer_voice") { transcriptions++; if (transcriptions === 1) return "Synthetic transcript"; if (transcriptions === 2) throw new Error("Synthetic transcription error"); return new Promise(resolve => { resolveTranscript = resolve; }); }
  if (command === "ai_chat_send") { sends++; return { requestId: "synthetic", threadId: "synthetic", turnId: "synthetic" }; }
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: [], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "agent_models") return [{ model: "gpt-5.6-terra", displayName: "Default" }];
  if (["scheduler_list", "list_memory", "load_mcp_servers"].includes(command)) return [];
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return false;
  if (command === "save_review" || command === "set_mcp_context" || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  throw new Error(`Unexpected IPC: ${command}`);
}, { shouldMockEvents: true });

Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { if (microphoneDenied) throw new Error("Synthetic microphone denial"); return { getTracks: () => [{ stop: () => { stopped++; } }] }; } } });
class FakeRecorder {
  static isTypeSupported(type: string) { return type === "audio/mp4"; }
  state = "inactive";
  mimeType = "audio/mp4";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  start() { this.state = "recording"; activeRecorder = this; }
  stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 77, 52, 65, 32])]) }); this.onstop?.(); }); }
}
Object.assign(globalThis, { MediaRecorder: FakeRecorder });
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); }); };
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getBoundingClientRect().width > 0 && (item.textContent?.trim() === label || item.getAttribute("aria-label") === label));
const click = async (label: string) => { const item = button(label); check(item, `Missing button: ${label}`); await act(async () => item!.click()); await settle(); };
const root = createRoot(document.getElementById("root")!);
try {
  await initializeFileStore(); await act(async () => root.render(<App />)); await settle();
  await click("Workspace");
  const draft = document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')!;
  check(draft, "Missing workspace draft");
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(draft, "Existing draft"); draft.dispatchEvent(new Event("input", { bubbles: true })); });
  await click("Record voice message"); await click("Transcribe");
  check(draft.value.includes("Existing draft") && draft.value.includes("Synthetic transcript") && sends === 0, "Transcript must augment the draft without sending");
  if (new URLSearchParams(location.search).has("visual")) {
    document.getElementById("result")!.textContent = "READY: synthetic transcript in Workspace composer";
  } else {
    microphoneDenied = true;
    await click("Record voice message");
    check(document.querySelector('[role="alert"]')?.textContent?.includes("Synthetic microphone denial") && draft.value.includes("Synthetic transcript"), "Microphone error must preserve the draft");
    microphoneDenied = false;
    await click("Record voice message"); await click("Transcribe");
    check(document.querySelector('[role="alert"]')?.textContent?.includes("Synthetic transcription error") && draft.value.includes("Synthetic transcript") && sends === 0, "Transcription error must preserve the draft without sending");
    await click("Record voice message"); await click("Cancel");
    check(transcriptions === 2 && stopped >= 3, "Cancel must stop the microphone without transcription");
    await click("Record voice message"); await click("Transcribe");
    check(resolveTranscript, "Expected pending transcription");
    await click("Tasks");
    await act(async () => resolveTranscript!("Wrong-context transcript")); await settle();
    await click("Workspace");
    check(!document.body.textContent?.includes("Wrong-context transcript") && sends === 0, "Task switch must not send or redirect a pending transcript");
    await click("Tasks"); await click("Kanban");
    const taskCard = document.querySelector<HTMLElement>('[aria-label="Drag Voice test task"]');
    check(taskCard, "Missing test task");
    await act(async () => taskCard!.click()); await settle();
    await click("Record voice message");
    const stoppedBeforeClose = stopped;
    await click("Close task modal");
    check(stopped === stoppedBeforeClose + 1 && transcriptions === 3, "Closing the Kanban dialog must release the microphone without transcribing");
    await act(async () => taskCard!.click()); await settle();
    await click("Record voice message");
    const stoppedBeforeInterruption = stopped;
    await act(async () => activeRecorder!.stop()); await settle();
    check(button("Record voice message") && !button("Cancel") && document.querySelector('[role="alert"]')?.textContent?.includes("Recording was interrupted") && stopped === stoppedBeforeInterruption + 1 && transcriptions === 3, "Unexpected recorder stop must release the microphone and allow recording again");
    const taskDraft = [...document.querySelectorAll<HTMLTextAreaElement>('[aria-label="Review Agent message"]')].find(element => element.getBoundingClientRect().width > 0);
    check(taskDraft, "Missing task draft");
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(taskDraft, "Existing task draft"); taskDraft!.dispatchEvent(new Event("input", { bubbles: true })); });
    resolveTranscript = undefined;
    await click("Record voice message"); await click("Transcribe");
    check(resolveTranscript && button("Send Review Agent message")?.disabled && button("Cancel")?.disabled === false, "Pending transcription must disable sending but keep Cancel available");
    await act(async () => taskDraft!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    check(sends === 0, "Enter must not submit while transcription is pending");
    if (new URLSearchParams(location.search).has("visual-regression")) {
      document.getElementById("result")!.textContent = "READY: task draft with transcription pending";
    } else {
      await click("Cancel");
      await act(async () => resolveTranscript!("Canceled transcript")); await settle();
      check(taskDraft?.value === "Existing task draft" && button("Send Review Agent message")?.disabled === false, "Cancel must restore sending without appending the canceled transcript");
      resolveTranscript = undefined;
      await click("Record voice message"); await click("Transcribe");
      check(resolveTranscript, "Expected a new task transcription");
      await act(async () => resolveTranscript!("Task transcript")); await settle();
      check(taskDraft?.value === "Existing task draft\n\nTask transcript" && sends === 0 && button("Send Review Agent message")?.disabled === false, "Task transcript must augment the draft and restore sending");
      document.getElementById("result")!.textContent = "PASS: voice drafts, pending send and cancel, errors, task switch and close, and recorder interruption";
      await act(async () => root.unmount());
    }
  }
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${String(error)}`;
  await act(async () => root.unmount());
}
