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
let holdSync = false;
let failSteer = false;
let completeDuringSteer = false;
const steers: any[] = [];
let releaseSync: (() => void) | undefined;
const connectionVoices: string[] = [];
const saves: (string | null)[] = [];
const sends: any[] = [];
const cancellations: any[] = [];
const approvals: any[] = [];
const failures: string[] = [];
mockWindows("main"); mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command === "conversation_settings") return { enabled };
  if (command === "save_conversation_key") { if (failSave) throw new Error("Synthetic save failure"); saves.push(args.apiKey); enabled = !!args.apiKey; return { enabled }; }
  if (command === "start_conversation") { ++connects; connectionVoices.push(args.voice); return "v=0\r\nsynthetic answer"; }
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
  if (command === "save_review" && holdSync) { await new Promise<void>(resolve => { releaseSync = resolve; }); return; }
  if (["save_review", "set_mcp_context"].includes(command) || command.startsWith("plugin:window|")) return;
  if (command.startsWith("plugin:notification|")) return false;
  if (command === "ai_chat_send") { sends.push(args); return { requestId: sends.length <= 2 ? "run" : `run-${sends.length}`, threadId: "thread", turnId: "turn" }; }
  if (command === "ai_chat_steer") { if (failSteer) throw new Error("Synthetic steering failure"); steers.push(args);
    if (completeDuringSteer) {
      const event = (kind: string, finalText?: string) => sends.at(-1).events.onmessage({ type: "chat", payload: { requestId: args.requestId, threadId: "thread", turnId: "turn", kind, finalText } });
      event("assistantMessageCompleted", "Result during steering"); event("completed");
    }
    return; }
  if (command === "ai_chat_cancel") { cancellations.push(args.requestId); return; }
  if (command === "agent_approve") { approvals.push(args); return true; }
  failures.push(command); throw new Error(`Unexpected conversation IPC: ${command}`);
}, { shouldMockEvents: true });

let channel: any;
let track: any;
let sentTrack: MediaStreamTrack;
let peer: any;
const audioEvents: any[] = [];
Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
  const context = new AudioContext({ sampleRate: 48000 });
  const oscillator = context.createOscillator();
  const destination = context.createMediaStreamDestination();
  oscillator.connect(destination); oscillator.start();
  await context.resume();
  track = destination.stream.getAudioTracks()[0];
  track.stopped = false;
  const stop = track.stop.bind(track);
  track.stop = () => { track.stopped = true; stop(); oscillator.stop(); void context.close(); };
  return destination.stream;
} });
Object.assign(globalThis, { RTCPeerConnection: class {
  closed = false;
  iceGatheringState = "complete";
  localDescription = { sdp: "v=0\r\nsynthetic offer" };
  constructor() { peer = this; }
  addTrack(outgoing: MediaStreamTrack) { sentTrack = outgoing; }
  createDataChannel() { channel = { readyState: "open", close() { this.readyState = "closed"; this.onclose?.(); }, send: (text: string) => audioEvents.push(JSON.parse(text)) }; return channel; }
  async createOffer() { return { type: "offer", sdp: "v=0\r\nsynthetic offer" }; }
  async setLocalDescription() {}
  async setRemoteDescription() { channel.onmessage({ data: JSON.stringify({ type: "session.started" }) }); }
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
const voiceCall = async (id: string, task: string, needsClarification = false) => {
  await voiceEvent({ type: "session.delegation.created", delegation: { id: `delegation-${id}`, target: "responses", response_id: `response-${id}` } });
  await voiceEvent({ type: "response.event", delegation_id: `delegation-${id}`, event: { type: "response.created", response: { id: `response-${id}` } } });
  await voiceEvent({ type: "response.event", delegation_id: `delegation-${id}`, event: { type: "response.output_item.done", item: { type: "function_call", call_id: `call-${id}`, name: "workspace_agent", arguments: JSON.stringify({ task, needs_clarification: needsClarification }) } } });
  await voiceEvent({ type: "response.event", delegation_id: `delegation-${id}`, event: { type: "response.completed", response: { id: `response-${id}`, output: [] } } });
};
const root = createRoot(document.getElementById("root")!);
try {
  await initializeFileStore(); await act(async () => root.render(<App />)); await settle();
  await click(button("Workspace"));
  check(!button("Start conversation"), "Talk must require a saved key");
  await click(button("Settings")); await click(button("Conversation"));
  const voiceSelect = document.querySelector<HTMLSelectElement>("#conversation-voice")!;
  check(voiceSelect.value === "marin", "Voice must default to Marin");
  await act(async () => { voiceSelect.value = "cedar"; voiceSelect.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
  await fileStore.flush();
  check(storage["chaoticreview.conversation-voice"] === "cedar", "Voice selection must persist");
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
  check(sentTrack && sentTrack !== track, `Talk must send the processed microphone track (sent=${!!sentTrack}, microphone=${!!track}, alerts=${[...document.querySelectorAll('[role="alert"]')].map(element => element.textContent).join("; ")})`);
  check(connectionVoices[0] === "cedar", "The saved voice must be used for a new session");
  const composer = document.querySelector<HTMLElement>('[aria-label="Voice composer"]')!;
  check(connects === 1 && composer && visible(composer) && composer.getBoundingClientRect().height < 200, `Talk must stay within composer size (connections=${connects}, height=${composer?.getBoundingClientRect().height}, alerts=${[...document.querySelectorAll('[role="alert"]')].map(e => e.textContent).join("; ")})`);
  check(!visible(draft) && composer.textContent?.includes("Listening"), "Connected Talk must replace the text composer");
  const startupContext = audioEvents.at(-1);
  await voiceEvent({ type: "error", error: { type: "invalid_request_error", code: "unknown_parameter", client_event_id: startupContext.event_id, message: "synthetic-sensitive-provider-message" } });
  check(visible(composer) && !track.stopped && composer.textContent?.includes("Listening"), "A rejected startup context command must keep Talk connected");
  check(document.querySelector('[role="alert"]')?.textContent?.includes("unknown_parameter") && !document.body.textContent?.includes("synthetic-sensitive-provider-message"), "The error must show safe protocol details without raw provider text");
  await voiceEvent({ type: "session.input_transcript.delta", start_ms: 10, end_ms: 90, delta: "Explain this workspace" });
  check(composer.textContent?.includes("Hearing you"), "Input must have visible feedback");
  check(sends.length === 0, "Conversation alone must not start an agent");
  await voiceCall("1", "Explain this workspace");
  check(sends.length === 1 && sends[0].prompt.includes("Explain this workspace"), "Delegation must reach the workspace agent");
  check(composer.textContent?.includes("working"), "Agent processing must have visible feedback");
  await voiceCall("followup", "Use Cedar instead of Marin");
  check(sends.length === 1 && steers.length === 1 && steers[0].requestId === "run" && steers[0].prompt.includes("Use Cedar instead of Marin"), "Spoken corrections must steer the active voice run");
  check(sends[0].chatContext.attachments.length === 0 && draft.value === "Unfinished text draft", "Voice must preserve unfinished typed content");
  await act(async () => sends[0].events.onmessage({ type: "approvalRequested", payload: { requestId: 42, title: "Allow action?", description: "Review this action", source: "agent", serverName: null } })); await settle();
  check(button("Deny") && button("Allow") && approvals.length === 0 && track.enabled, "Approvals remain in the chat and voice cannot answer them");
  await voiceCall("blocked-followup", "Update the settings label");
  check(steers.length === 1 && sends.length === 1, "Spoken follow-ups must not bypass a pending approval");
  await click(button("Deny"));
  check(approvals.length === 1 && approvals[0].requestId === 42 && approvals[0].approved === false, "Only the user's approval response is sent");
  await act(async () => sends[0].events.onmessage({ type: "approvalResolved", payload: { requestId: 42 } })); await settle();
  await act(async () => sends[0].events.onmessage({ type: "chat", payload: { requestId: "run", threadId: "thread", turnId: "turn", kind: "assistantMessageCompleted", finalText: "This is the workspace reply." } })); await settle();
  await act(async () => sends[0].events.onmessage({ type: "chat", payload: { requestId: "different-run", threadId: "thread", turnId: "turn", kind: "completed" } })); await settle();
  check(!audioEvents.some(e => e.type === "response.item.create" && e.item.output.includes("This is the workspace reply.")), "Partial agent output must not be reported as a result");
  check(document.body.textContent?.includes("This is the workspace reply."), "Agent chat must remain visible during Talk");
  await voiceEvent({ type: "session.output_transcript.delta", start_ms: 110, end_ms: 120, delta: "We can keep talking." });
  check(button("Interrupt voice"), "Voice interruption must remain available during agent work");
  await click(button("Interrupt voice")); check(button("Resume audio"), "Interrupted audio can be resumed");
  await click(button("Stop workspace agent work")); await click(button("Keep working"));
  check(cancellations.length === 0, "Interrupting voice or declining stop must not cancel work");
  await act(async () => sends[0].events.onmessage({ type: "chat", payload: { requestId: "run", threadId: "thread", turnId: "turn", kind: "completed" } })); await settle();
  check(audioEvents.some(e => e.type === "response.item.create" && e.item.call_id === "call-1" && e.item.output.includes("This is the workspace reply.")), "Only completed agent results reach the matching call");
  check(audioEvents.some(e => e.type === "session.instructions.append" && e.content.includes("This is the workspace reply.")), "Completed workspace messages must update the Talk history");
  check(audioEvents.some(e => e.type === "response.item.create" && e.item.call_id === "call-followup" && e.item.output.includes("This is the workspace reply.")), "A steered follow-up must receive the matching run result too");
  await voiceCall("2", "Fix it", true);
  check(sends.length === 1 && audioEvents.some(e => e.type === "response.item.create" && e.item.call_id === "call-2" && e.item.output.includes("clarify")), "An unclear request must ask for clarification without starting work");
  holdSync = true;
  await voiceCall("3", "Check the next step");
  await click(button("Switch to typing")); await voiceEvent({ type: "session.closed" });
  check(releaseSync, "Synthetic start must wait for message persistence");
  holdSync = false; releaseSync!(); await settle();
  check(sends.length === 1, "Ending Talk while a handoff starts must prevent a late agent start");
  await click(button("Start conversation"));
  check(audioEvents.at(-1)?.type === "session.instructions.append" && audioEvents.at(-1).content.includes("This is the workspace reply."), "A new Talk session must receive the existing workspace history");
  await voiceCall("4", "Check the next step");
  check(sends.length === 2, "A clear follow-up must start without an extra confirmation");
  await click(button("Stop workspace agent work")); await click(button("Stop work"));
  check(cancellations.length === 1 && cancellations[0] === "run", "Stopping work must target the active run");
  await click(button("Mute microphone")); check(!track.enabled && !sentTrack.enabled, "Mute must disable both microphone tracks");
  await click(button("Switch to typing"));
  await voiceEvent({ type: "session.closed" });
  check(cancellations.length === 1, "Ending Talk must not issue another agent cancellation");
  await act(async () => sends[1].events.onmessage({ type: "chat", payload: { requestId: "run", threadId: "thread", turnId: "turn", kind: "cancelled" } })); await settle();
  check(track.stopped && peer.closed && visible(draft) && draft.value === "Unfinished text draft", "Typing must release the connection and restore the draft");
  // Talk can join a typed run, steer it, and retain further requests when steering fails.
  await change(draft, "Inspect the settings"); await click(button("Send Review Agent message"));
  check(sends.length === 3, "Typed work must start before Talk");
  await change(draft, "Keep this typed draft");
  await click(button("Start conversation"));
  await voiceCall("typed-followup", "Use Cedar for the settings preview");
  check(steers.at(-1).requestId === "run-3" && sends.length === 3, "Talk must steer an existing typed run");
  failSteer = true;
  await voiceCall("queued-followup", "Check the voice selector after the preview");
  check(button("Delete queued message") && sends.length === 3, "A failed steer must retain the spoken request in the queue");
  await voiceCall("deleted-followup", "Check the microphone label");
  await click([...document.querySelectorAll<HTMLElement>('button[aria-label="Delete queued message"]')].at(-1)!);
  check(audioEvents.some(e => e.type === "response.item.create" && e.item.call_id === "call-deleted-followup" && e.item.output.includes("removed")), "Deleting a queued follow-up must finish its own voice call");
  failSteer = false;
  const chatEvent = async (index: number, kind: string, finalText?: string) => {
    await act(async () => sends[index].events.onmessage({ type: "chat", payload: { requestId: `run-${index + 1}`, threadId: "thread", turnId: "turn", kind, finalText } })); await settle();
  };
  await chatEvent(2, "assistantMessageCompleted", "Typed run result");
  await chatEvent(2, "completed"); await settle();
  check(sends.length === 4 && sends[3].prompt.includes("Check the voice selector after the preview"), "Queued voice work must start after the typed run completes");
  check(audioEvents.some(e => e.type === "response.item.create" && e.item.call_id === "call-typed-followup" && e.item.output.includes("Typed run result")), "Typed-run follow-up must receive that run's result");
  check(!audioEvents.some(e => e.type === "response.item.create" && e.item.call_id === "call-queued-followup"), "Queued follow-up must not receive the previous run's result");
  await chatEvent(3, "assistantMessageCompleted", "Queued run result"); await chatEvent(3, "completed");
  check(audioEvents.some(e => e.type === "response.item.create" && e.item.call_id === "call-queued-followup" && e.item.output.includes("Queued run result")), "Queue dispatch must retain the voice delegation IDs");
  await voiceCall("race-start", "Check the conversation labels");
  completeDuringSteer = true;
  await voiceCall("race-followup", "Also check the mute label");
  completeDuringSteer = false;
  check(audioEvents.some(e => e.type === "response.item.create" && e.item.call_id === "call-race-followup" && e.item.output.includes("Result during steering")), "A run finishing before steer acknowledgement must still answer the follow-up");
  check(sends.length === 5 && !button("Delete queued message"), "An acknowledged steer must not run again from the queue");
  await voiceEvent({ type: "session.input_transcript.delta", start_ms: 200, end_ms: 210, delta: "Change the button" });
  await voiceEvent({ type: "session.output_transcript.delta", start_ms: 210, end_ms: 220, delta: "Sure" });
  await voiceEvent({ type: "session.input_transcript.delta", start_ms: 220, end_ms: 230, delta: " color to blue" });
  await voiceEvent({ type: "error" }); await voiceEvent({ type: "session.closed" });
  await click(button("Copy transcript to composer"));
  check(draft.value.includes("Keep this typed draft") && draft.value.includes("User: Change the button color to blue") && draft.value.includes("Assistant: Sure"), "Copy after an error must retain overlapping transcripts and the typed draft");
  await click(button("Start conversation"));
  await click(button("Settings"));
  await voiceEvent({ type: "session.closed" });
  check(track.stopped && peer.closed, "Opening Settings must release microphone and connection");
  await click(button("Conversation"));
  check(document.querySelector<HTMLSelectElement>("#conversation-voice")!.value === "cedar", "Voice must remain selected when settings reopen");
  check(document.querySelector<HTMLInputElement>("#conversation-api-key")!.value === "", "Reopening Settings must keep the saved key hidden");
  await click(button("Remove key and disable")); check(saves.at(-1) === null && !enabled, "Remove must disable Conversation");
  await click(button("Close settings")); check(!button("Start conversation"), "Talk must disappear when the key is removed");
  check(audioEvents.filter(e => /session\.(instructions|thinking|commentary)\.append/.test(e.type)).every(e => new TextEncoder().encode(e.content).length <= 480), "Every startup and updated context fragment must fit the conservative Live append budget");
  check(failures.length === 0, `Unexpected commands: ${failures.join(", ")}`);
  document.getElementById("result")!.textContent = "PASS: key and voice settings, simulated GPT-Live delegation, typed/voice steering, queued result attribution, transcript recovery, draft preservation, interruption, mute and cleanup.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? `${error.message}\n${error.stack}` : error}`;
} finally { await act(async () => root.unmount()); }
