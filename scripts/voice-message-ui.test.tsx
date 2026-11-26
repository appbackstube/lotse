import { act } from "react";
import { createRoot } from "react-dom/client";
import { emit, TauriEvent } from "@tauri-apps/api/event";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { fileStore, initializeFileStore } from "../src/fileStore";
import { chatQueueStorageKey } from "../src/chatQueue";
import { voiceAutoSendKey, voiceLanguageKey, voiceModelKey } from "../src/components/VoiceSettings";
import { normalizeTask, taskStorageKey } from "../src/tasks";
import type { ChatAttachment } from "../src/types";
import App from "../src/App";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-voice", name: "Voice", currentBranch: "main", hasOrigin: true };
const comparison = { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
const task = normalizeTask({ id: "12345678-1234-1234-1234-123456789abc", title: "Voice test task", manualStatus: "inbox", location: "workspace" })!;
const taskQueueKey = JSON.stringify([repo.rootPath, "task", task.id]);
const queuedPrompt = { id: "older-prompt", body: "Older paused prompt", context: { mode: "auto", attachments: [] }, selection: null, mode: "default", model: "synthetic", effort: "medium" };
const pausedQueue = { [taskQueueKey]: [queuedPrompt] };
const storage: Record<string, string> = { "chaoticreview.auth-onboarding-v1": "complete", [voiceModelKey]: "synthetic/audio-model", [taskStorageKey(repo.rootPath)]: JSON.stringify([task]), [chatQueueStorageKey]: JSON.stringify(pausedQueue) };
const existingDraft = "    indented code\n\nText with trailing spaces  ";
let resolveTranscript: ((text: string) => void) | undefined;
let resolveImport: ((attachments: ChatAttachment[]) => void) | undefined;
let transcriptions = 0;
let sends = 0;
let stopped = 0;
let microphoneDenied = false;
let activeRecorder: FakeRecorder | undefined;
let modelUsed = "";
let failedAudio: string | undefined;
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") {
    if (!args.key.startsWith("chaoticreview.")) throw new Error("Invalid frontend storage key");
    storage[args.key] = args.value;
    return;
  }
  if (command === "transcribe_voice_stt") {
    modelUsed = args.model;
    transcriptions++;
    if (transcriptions === 1) {
      check(args.language === null, "A three-letter system language must use automatic detection");
      return "Synthetic transcript";
    }
    if (transcriptions === 2 || transcriptions === 4 || transcriptions === 8) {
      failedAudio = args.audio;
      throw new Error("Synthetic transcription error");
    }
    if (transcriptions === 3) {
      check(args.audio && args.audio === failedAudio, "Retry must submit the same clip");
      return "Retried transcript";
    }
    if (transcriptions === 9) {
      check(args.audio && args.audio === failedAudio && args.model === "synthetic/replacement-model", "Retry after Settings must use the same clip and the newly saved model");
      return "Transcript for paused queue";
    }
    return new Promise(resolve => { resolveTranscript = resolve; });
  }
  if (command === "ai_chat_send") { sends++; return { requestId: "synthetic", threadId: "synthetic", turnId: "synthetic" }; }
  if (command === "import_chat_files") return new Promise(resolve => { resolveImport = resolve; });
  if (command === "voice_key_configured") return true;
  if (command === "voice_models") return [["synthetic/audio-model", "Original model"], ["synthetic/replacement-model", "Replacement model"]];
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: [], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return comparison;
  if (command === "task_git_status") return { repository: repo, upstream: null, pullCount: 0, pushCount: 0, dirty: false };
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "agent_models") return [{ model: "gpt-5.6-terra", displayName: "Default" }];
  if (["scheduler_list", "list_memory", "load_mcp_servers"].includes(command)) return [];
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return false;
  if (command === "save_review" || command === "set_mcp_context" || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  throw new Error(`Unexpected IPC: ${command}`);
}, { shouldMockEvents: true });

Object.defineProperty(navigator, "language", { configurable: true, value: "fil-PH" });
Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { if (microphoneDenied) throw new Error("Synthetic microphone denial"); return { getTracks: () => [{ stop: () => { stopped++; } }] }; } } });
class FakeRecorder {
  static isTypeSupported(type: string) { return type === "audio/mp4"; }
  state = "inactive";
  mimeType = "audio/mp4";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onstart?: () => void;
  start() { this.state = "recording"; activeRecorder = this; queueMicrotask(() => this.onstart?.()); }
  stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 77, 52, 65, 32])]) }); this.onstop?.(); }); }
}
class FakeAudioContext {
  async resume() {}
  async close() {}
  createAnalyser() { return { fftSize: 512, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(.065), disconnect() {} }; }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
}
Object.assign(globalThis, { MediaRecorder: FakeRecorder, AudioContext: FakeAudioContext });
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); }); };
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getBoundingClientRect().width > 0 && (item.textContent?.trim() === label || item.getAttribute("aria-label") === label));
const click = async (label: string) => { const item = button(label); check(item, `Missing button: ${label}`); await act(async () => item!.click()); await settle(); };
const updateOtherWindowSetting = async (key: string, value: string | null) => {
  await act(async () => emit("frontend-storage-changed", { key, value, source: "another-window" }));
};
const evidence = new URLSearchParams(location.search).has("evidence");
const holdForEvidence = async () => { if (evidence) await new Promise(resolve => setTimeout(resolve, 1000)); };
const root = createRoot(document.getElementById("root")!);
try {
  await initializeFileStore(); await act(async () => root.render(<App />)); await settle();
  await click("Workspace");
  const draft = document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')!;
  check(draft, "Missing workspace draft");
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(draft, existingDraft); draft.dispatchEvent(new Event("input", { bubbles: true })); });
  check(storage[voiceModelKey] === "synthetic/audio-model", "Model must persist with the native storage namespace");
  await click("Record voice message");
  const canvas = document.querySelector<HTMLCanvasElement>(".ios-chat-voice-wave canvas");
  check(!draft.getBoundingClientRect().width && canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data.some((channel, index) => index % 4 === 3 && channel > 0), "Recording must replace the text composer and draw the audio waveform");
  await holdForEvidence();
  await click("Stop recording");
  check(stopped === 1 && transcriptions === 0 && button("Stop recording")?.disabled && !button("Transcribe for review")?.disabled, "Stopping must release the microphone without uploading");
  await click("Transcribe for review");
  check(draft.value === `${existingDraft}\n\nSynthetic transcript` && sends === 0 && modelUsed === "synthetic/audio-model", "Transcript must use the configured model and preserve all draft whitespace without sending");
  await holdForEvidence();
  if (new URLSearchParams(location.search).has("visual")) {
    document.getElementById("result")!.textContent = "READY: synthetic transcript in Workspace composer";
  } else {
    microphoneDenied = true;
    await click("Record voice message");
    check(document.querySelector('[role="alert"]')?.textContent?.includes("Synthetic microphone denial") && draft.value.includes("Synthetic transcript"), "Microphone error must preserve the draft");
    microphoneDenied = false;
    await click("Record voice message"); await click("Transcribe for review");
    const retry = button("Retry transcription");
    check(document.querySelector('[role="alert"]')?.textContent?.includes("Synthetic transcription error") && draft.value.includes("Synthetic transcript") && sends === 0, "Transcription error must preserve the draft without sending");
    check(retry && !retry.disabled && document.activeElement === retry && button("Discard recording") && !button("Record voice message"), "Failure must keep the clip and offer focused retry or discard");
    const stoppedBeforeRetry = stopped;
    await holdForEvidence();
    await click("Retry transcription");
    check(transcriptions === 3 && stopped === stoppedBeforeRetry && modelUsed === "synthetic/audio-model" && draft.value === `${existingDraft}\n\nSynthetic transcript\n\nRetried transcript` && !document.querySelector('[role="alert"]') && sends === 0, "Retry must reuse the clip without reopening the microphone, altering the draft, or sending");
    await holdForEvidence();
    await click("Record voice message"); await click("Stop recording"); await click("Transcribe for review");
    check(transcriptions === 4 && button("Retry transcription"), "Failure after stopping first must also allow retry");
    await click("Discard recording");
    check(transcriptions === 4 && !button("Retry transcription") && button("Record voice message") && !document.querySelector('[role="alert"]') && draft.value.endsWith("Retried transcript"), "Discard must clear the failed clip and error without uploading or changing the draft");
    await click("Record voice message"); await click("Transcribe for review");
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
    check(stopped === stoppedBeforeClose + 1 && transcriptions === 5, "Closing the Kanban dialog must release the microphone without transcribing");
    await act(async () => taskCard!.click()); await settle();
    await click("Record voice message");
    const stoppedBeforeInterruption = stopped;
    await act(async () => activeRecorder!.stop()); await settle();
    check(stopped === stoppedBeforeInterruption + 1 && transcriptions === 5, "Unexpected recorder stop must release the microphone without transcribing");
    const recordAgain = button("Record voice message");
    check(recordAgain && !recordAgain.disabled, "Unexpected recorder stop must allow recording again");
    check(recordAgain?.closest(".ios-chat-composer")?.querySelector('[role="alert"]')?.textContent?.includes("Recording was interrupted"), "Interrupted recording must show an error in the voice controls");
    const taskDraft = [...document.querySelectorAll<HTMLTextAreaElement>('[aria-label="Review Agent message"]')].find(element => element.getBoundingClientRect().width > 0);
    check(taskDraft, "Missing task draft");
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(taskDraft, "Existing task draft"); taskDraft!.dispatchEvent(new Event("input", { bubbles: true })); });
    resolveTranscript = undefined;
    await click("Record voice message"); await click("Transcribe for review");
    check(resolveTranscript && !button("Send Review Agent message") && button("Transcribe for review")?.disabled && button("Discard recording")?.disabled === false, "Pending transcription must disable sending but keep discard available");
    await act(async () => taskDraft!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    check(sends === 0, "Enter must not submit while transcription is pending");
    if (new URLSearchParams(location.search).has("visual-regression")) {
      document.getElementById("result")!.textContent = "READY: task draft with transcription pending";
    } else {
      await click("Discard recording");
      await act(async () => resolveTranscript!("Canceled transcript")); await settle();
      check(taskDraft?.value === "Existing task draft" && button("Send Review Agent message")?.disabled === false, "Cancel must restore sending without appending the canceled transcript");
      resolveTranscript = undefined;
      await click("Record voice message"); await click("Transcribe for review");
      check(resolveTranscript, "Expected a new task transcription");
      await act(async () => resolveTranscript!("Task transcript")); await settle();
      check(taskDraft?.value === "Existing task draft\n\nTask transcript" && sends === 0 && button("Send Review Agent message")?.disabled === false, "Task transcript must augment the draft and restore sending");
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(taskDraft, "");
        taskDraft!.dispatchEvent(new Event("input", { bubbles: true }));
        fileStore.setItem(voiceAutoSendKey, "true");
      });
      await click("Record voice message"); await click("Transcribe and send if possible");
      await click("Open voice settings");
      const model = document.querySelector<HTMLSelectElement>("#voice-model");
      const language = document.querySelector<HTMLSelectElement>("#voice-language");
      check(model?.getBoundingClientRect().width && !model.disabled, "The task's failed clip must lead to voice settings");
      const autoSend = model!.closest("section")?.querySelector('[role="switch"]');
      check(autoSend?.getAttribute("aria-checked") === "true", "Voice settings must show auto-send as enabled");
      await updateOtherWindowSetting(voiceAutoSendKey, "false");
      check(autoSend?.getAttribute("aria-checked") === "false", "The auto-send switch must reflect a change from another window");
      await updateOtherWindowSetting(voiceAutoSendKey, "true");
      await updateOtherWindowSetting(voiceModelKey, "synthetic/replacement-model");
      await updateOtherWindowSetting(voiceLanguageKey, "de");
      check(model?.value === "synthetic/replacement-model" && language?.value === "de", "The model and language must reflect changes from another window");
      await updateOtherWindowSetting(voiceModelKey, "synthetic/audio-model");
      await updateOtherWindowSetting(voiceLanguageKey, null);
      check(model?.value === "synthetic/audio-model" && language?.value === "system", "The settings must show the previous model and the default language after resetting them");
      await act(async () => {
        model!.value = "synthetic/replacement-model";
        model!.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await settle();
      check(storage[voiceModelKey] === "synthetic/replacement-model", "Updated settings must be persisted before retry");
      await click("Settings");
      await click("Retry and send if possible");
      check(taskDraft?.value === "Transcript for paused queue" && button("Resume") && sends === 0 && JSON.stringify(JSON.parse(storage[chatQueueStorageKey])) === JSON.stringify(pausedQueue), "A paused queue must stay paused and unchanged while the transcript remains in the composer");
      await holdForEvidence();
      await click("Close task modal"); await click("Workspace");
      const workspaceDraft = document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')!;
      const clearWorkspaceDraft = async () => {
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(workspaceDraft, "");
          workspaceDraft.dispatchEvent(new Event("input", { bubbles: true }));
        });
      };
      await clearWorkspaceDraft();
      await updateOtherWindowSetting(voiceAutoSendKey, "false");
      resolveTranscript = undefined;
      await click("Record voice message"); await click("Transcribe for review");
      check(resolveTranscript, "Expected a pending review-only transcription");
      await updateOtherWindowSetting(voiceAutoSendKey, "true");
      await act(async () => resolveTranscript!("Review-only transcript")); await settle();
      check(workspaceDraft.value === "Review-only transcript" && sends === 0, "Enabling auto-send after submission must not send a review-only transcript");
      await clearWorkspaceDraft();
      resolveTranscript = undefined;
      await click("Record voice message"); await click("Transcribe and send if possible");
      check(resolveTranscript, "Expected pending auto-send transcription");
      await act(async () => emit(TauriEvent.DRAG_DROP, { paths: ["/synthetic/report.txt"], position: { x: 1, y: 1 } }));
      check(resolveImport, "Expected a pending file import");
      await act(async () => resolveTranscript!("Transcript during file import")); await settle();
      await act(async () => resolveImport!([{ kind: "localFile", path: "/managed/report.txt", name: "report.txt" }])); await settle();
      check(workspaceDraft.value === "Transcript during file import" && document.body.textContent?.includes("report.txt") && sends === 0, "A pending import must keep the transcript and attachment in the composer");
      document.getElementById("result")!.textContent = "PASS: voice drafts, same-clip retry, settings sync, auto-send guards, discard, errors, task switch and close, and recorder interruption";
      await act(async () => root.unmount());
    }
  }
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${String(error)}`;
  await act(async () => root.unmount());
}
