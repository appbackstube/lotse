// Real App with synthetic native commands, microphone and WebRTC. No API or microphone access.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc, mockWindows } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { fileStore, initializeFileStore } from "../src/fileStore";
import App from "../src/App";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const repo = { rootPath: "/synthetic-conversation", name: "Conversation", currentBranch: "main", hasOrigin: true };
const storage: Record<string, string> = { "chaoticreview.auth-onboarding-v1": "complete" };
let enabled = false;
let failSave = false;
let connects = 0;
const saves: (string | null)[] = [];
const sends: any[] = [];
const failures: string[] = [];
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "conversation_settings") return { enabled };
  if (command === "save_conversation_key") { if (failSave) throw new Error("Synthetic save failure"); saves.push(args.apiKey); enabled = !!args.apiKey; return { enabled }; }
  if (command === "start_conversation") { ++connects; return "v=0\r\nsynthetic answer"; }
  if (command === "load_frontend_storage") return storage;
  if (command === "set_frontend_storage") { storage[args.key] = args.value; return; }
  if (command === "load_ai_settings") return { activeProvider: "openrouter", providers: [{ id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" }], repositoryProviders: {}, ripgrepAvailable: true, mcpUrl: "" };
  if (command === "current_repository" || command === "refresh_repository") return repo;
  if (command === "list_branch_refs") return { refs: ["main"], remoteRefs: [], defaultBase: "main", pullCount: 0, pushCount: 0 };
  if (command === "compare_working_copy") return { mode: "workingCopy", baseRef: null, compareRef: null, baseOid: "a".repeat(40), baseCommitOid: "a".repeat(40), compareCommitOid: "a".repeat(40), snapshotId: "snapshot", files: [] };
  if (command === "load_review" || command === "github_connection") return null;
  if (command === "agent_models") return [{ model: "gpt-5.6-terra", displayName: "Default" }];
  if (["scheduler_list", "list_memory", "load_mcp_servers", "list_website_credentials"].includes(command)) return [];
  if (command === "task_sandbox_supported" || command === "task_browser_supported") return true;
  if (command === "plugin:window|scale_factor") return 1;
  if (command === "plugin:window|theme") return "light";
  if (command === "plugin:window|is_maximized") return false;
  if (command === "plugin:window|inner_size" || command === "plugin:window|outer_size") return { width: innerWidth, height: innerHeight };
  if (["save_review", "set_mcp_context"].includes(command) || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  if (command === "ai_chat_send") { sends.push(args); return { requestId: "run", threadId: "thread", turnId: "turn" }; }
  failures.push(command); throw new Error(`Unexpected conversation IPC: ${command}`);
}, { shouldMockEvents: true });

let channel: any;
let track: any;
let peer: any;
let deferOpen = false;
const audioEvents: any[] = [];
Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
  track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  return { getTracks: () => [track], getAudioTracks: () => [track] };
} });
Object.assign(globalThis, { RTCPeerConnection: class {
  closed = false;
  constructor() { peer = this; }
  addTrack() {}
  createDataChannel() { channel = { readyState: "open", close() {}, send: (text: string) => audioEvents.push(JSON.parse(text)) }; return channel; }
  async createOffer() { return { type: "offer", sdp: "v=0\r\nsynthetic offer" }; }
  async setLocalDescription() {}
  async setRemoteDescription() { if (!deferOpen) channel.onopen(); }
  close() { this.closed = true; }
} });

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); }); };
const visible = (element: Element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const button = (label: string) => [...document.querySelectorAll<HTMLElement>("button")].find(item => visible(item) && (item.textContent?.trim() === label || item.getAttribute("aria-label") === label))!;
const click = async (element: HTMLElement) => { check(element, "Missing control"); await act(async () => element.click()); await settle(); };
const change = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }); await settle();
};
const voiceEvent = async (event: object) => { await act(async () => channel.onmessage({ data: JSON.stringify(event) })); await settle(); };
const root = createRoot(document.getElementById("root")!);
try {
  await initializeFileStore(); await act(async () => root.render(<App />)); await settle();
  await click(button("Workspace"));
  check(!button("Start conversation"), "Talk must require a saved key");
  await click(button("Settings")); await click(button("Conversation"));
  const key = document.querySelector<HTMLInputElement>("#conversation-api-key")!;
  check(key.type === "password" && key.value === "", "Settings must never load the stored secret");
  await change(key, "synthetic-voice-key"); failSave = true;
  await click(button("Save and enable"));
  check(key.value === "synthetic-voice-key" && !enabled, "Failed save must preserve the draft without enabling Talk");
  failSave = false; await click(button("Save and enable"));
  check(enabled && key.value === "" && saves[0] === "synthetic-voice-key", "Save must enable Talk and clear the input");
  await fileStore.flush();
  check(!JSON.stringify(storage).includes("synthetic-voice-key"), "API key must not enter frontend storage");
  await click(button("Close settings"));
  const draft = document.querySelector<HTMLTextAreaElement>('[aria-label="Review Agent message"]')!;
  await change(draft, "Unfinished text draft");
  check(!(button("Start conversation") as HTMLButtonElement).disabled, `Talk unexpectedly disabled: ${document.body.textContent}`);
  await click(button("Start conversation"));
  const composer = document.querySelector<HTMLElement>('[aria-label="Voice composer"]')!;
  check(connects === 1 && composer && visible(composer) && composer.getBoundingClientRect().height < 200, `Talk must stay within composer size (connections=${connects}, height=${composer?.getBoundingClientRect().height}, alerts=${[...document.querySelectorAll('[role="alert"]')].map(e => e.textContent).join("; ")})`);
  check(!visible(draft) && composer.textContent?.includes("Listening"), "Connected Talk must replace the text composer");
  await voiceEvent({ type: "input_audio_buffer.committed", item_id: "speech" });
  await voiceEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "speech", transcript: "Explain this workspace" });
  check(sends.length === 1 && sends[0].prompt === "Explain this workspace", "Finalized speech must reach the workspace agent");
  check(sends[0].chatContext.attachments.length === 0 && draft.value === "Unfinished text draft", "Voice must preserve unfinished typed content");
  await act(async () => sends[0].events.onmessage({ type: "chat", payload: { requestId: "run", threadId: "thread", turnId: "turn", kind: "assistantMessageCompleted", finalText: "This is the workspace reply." } })); await settle();
  check(audioEvents.some(e => e.type === "response.create" && e.response.instructions.includes("This is the workspace reply.")), "Completed agent replies must be sent to voice output");
  check(document.body.textContent?.includes("This is the workspace reply."), "Agent chat must remain visible during Talk");
  await voiceEvent({ type: "response.created", response: { id: "spoken-reply" } });
  await voiceEvent({ type: "response.done", response: { id: "spoken-reply", status: "completed" } });
  await voiceEvent({ type: "output_audio_buffer.stopped", response_id: "spoken-reply" });
  await act(async () => sends[0].events.onmessage({ type: "chat", payload: { requestId: "run", threadId: "thread", turnId: "turn", kind: "completed" } })); await settle();
  await voiceEvent({ type: "input_audio_buffer.committed", item_id: "followup" });
  await voiceEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "followup", transcript: "Now explain the next step" });
  check(sends.length === 2 && sends[1].prompt === "Now explain the next step", "Talk must accept another turn after the agent finishes");
  await click(button("Mute microphone")); check(!track.enabled, "Mute must disable the microphone");
  await click(button("Switch to typing"));
  check(track.stopped && peer.closed && visible(draft) && draft.value === "Unfinished text draft", "Typing must release the connection and restore the draft");
  deferOpen = true;
  await click(button("Start conversation"));
  check(!track.stopped, "Talk must reconnect after switching to typing");
  const spokenBeforeOpen = audioEvents.filter(e => e.type === "response.create").length;
  await act(async () => sends[1].events.onmessage({ type: "chat", payload: { requestId: "run", threadId: "thread", turnId: "turn", kind: "assistantMessageCompleted", finalText: "Reply while Talk connects." } })); await settle();
  check(audioEvents.filter(e => e.type === "response.create").length === spokenBeforeOpen, "Connecting Talk must wait before speaking");
  await act(async () => channel.onopen()); await settle();
  check(audioEvents.filter(e => e.type === "response.create").length === spokenBeforeOpen + 1 && audioEvents.at(-1).response.instructions.includes("Reply while Talk connects."), "Talk must speak the reply received during connection setup");
  await click(button("Settings"));
  check(track.stopped && peer.closed, "Opening Settings must release microphone and connection");
  await click(button("Conversation"));
  check(document.querySelector<HTMLInputElement>("#conversation-api-key")!.value === "", "Reopening Settings must keep the saved key hidden");
  await click(button("Remove key and disable")); check(saves.at(-1) === null && !enabled, "Remove must disable Conversation");
  await click(button("Close settings")); check(!button("Start conversation"), "Talk must disappear when the key is removed");
  check(failures.length === 0, `Unexpected commands: ${failures.join(", ")}`);
  document.getElementById("result")!.textContent = "PASS: key save/failure/remove, no frontend secret storage, compact Talk, transcript → workspace agent → voice, replies during connection setup, visible chat, draft preservation, mute and cleanup (simulated audio).";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`;
} finally { await act(async () => root.unmount()); }
