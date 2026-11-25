import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { RealtimeConversation, idleVoice, voiceHistory, type VoiceSnapshot, type VoiceDelegation } from "../src/conversation.ts";
import type { ChatMessage } from "../src/types.ts";
import { conversationVoice } from "../src/conversationVoices.ts";
import { watchConversationPlayback } from "../src/conversationPlayback.ts";
import { processMicrophone } from "../src/conversationNoise.ts";

function harness(processMicrophone?: ConstructorParameters<typeof RealtimeConversation>[0]["processMicrophone"]) {
  let snapshot: VoiceSnapshot = idleVoice;
  const sent: Record<string, any>[] = [];
  const requests: Omit<VoiceDelegation, "workspaceKey">[] = [];
  let onPlayback: ((active: boolean, time: number) => void) | undefined;
  let playbackWatchStopped = false;
  const track = { enabled: true, stopped: false, onended: null, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const channel = { readyState: "open", onmessage: null as any, onclose: null as any,
    send: (text: string) => sent.push(JSON.parse(text)), close() { this.readyState = "closed"; this.onclose?.(); } };
  const sender = { track: null as MediaStreamTrack | null, async replaceTrack(next: MediaStreamTrack) { this.track = next; } };
  const peer = { closed: false, ontrack: null as any, connectionState: "connected", iceGatheringState: "complete", localDescription: { sdp: "v=0\r\noffer" }, addTrack(next: MediaStreamTrack) { sender.track = next; }, getSenders: () => [sender], createDataChannel: () => channel,
    createOffer: async () => ({ type: "offer", sdp: "v=0\r\noffer" }), setLocalDescription: async () => {}, setRemoteDescription: async () => {}, close() { this.closed = true; } };
  const audio = { muted: false, paused: false, srcObject: null, pause() { this.paused = true; }, play: async () => {} };
  const voice = new RealtimeConversation({ microphone: async () => stream, peer: () => peer as unknown as RTCPeerConnection,
    processMicrophone,
    audio: () => audio as unknown as HTMLAudioElement, connect: async () => "v=0\r\nanswer",
    watchPlayback: (_stream, report) => { onPlayback = report; return () => { playbackWatchStopped = true; }; },
    delegate: async request => { requests.push(request); return true; }, changed: value => { snapshot = value; } });
  const event = (value: object) => channel.onmessage({ data: JSON.stringify(value) });
  const backend = (delegation: string, value: object) => event({ type: "response.event", delegation_id: delegation, event: value });
  const call = (delegation: string, response: string, id: string, args: string, name = "workspace_agent") => {
    event({ type: "session.delegation.created", delegation: { id: delegation, target: "responses", response_id: response } });
    backend(delegation, { type: "response.created", response: { id: response } });
    backend(delegation, { type: "response.output_item.done", item: { type: "function_call", call_id: id, name, arguments: args } });
    backend(delegation, { type: "response.completed", response: { id: response } });
  };
  const start = async () => { await voice.start(); event({ type: "session.started" }); };
  const stop = () => { voice.stop(); if (channel.readyState === "open") event({ type: "session.closed" }); };
  return { voice, event, backend, call, start, stop, sent, requests, track, stream, peer, sender, audio, channel,
    level: (active: boolean, time: number) => onPlayback?.(active, time), get playbackWatchStopped() { return playbackWatchStopped; }, get state() { return snapshot; } };
}

test("processed microphone is muted and stopped with the original", async () => {
  let stopped = false;
  const processedTrack = { enabled: true, stop() {} };
  const processedStream = { getTracks: () => [processedTrack], getAudioTracks: () => [processedTrack] } as unknown as MediaStream;
  const h = harness(async () => ({ stream: processedStream, onFailure() {}, stop() { stopped = true; } }));
  await h.start();
  h.voice.setMuted(true);
  assert.equal(h.track.enabled, false);
  assert.equal(processedTrack.enabled, false);
  h.stop();
  assert.equal(stopped, true);
  assert.equal(h.track.stopped, true);
});

test("a filter initialization error falls back to the microphone", async () => {
  const h = harness(async () => { throw new Error("unavailable"); });
  await h.start();
  assert.match(h.state.error, /standard processing/);
  assert.equal(h.state.phase, "listening");
  h.stop();
});

function mockPendingWorklet(context: TestContext, fetchWasm: typeof fetch = async () => new Response()) {
  const workletStarted = Promise.withResolvers<void>();
  const workletLoaded = Promise.withResolvers<void>();
  const closeAudioContext = context.mock.fn(async () => {});
  const createWorklet = context.mock.fn();
  const module = new WebAssembly.Module(Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0));
  context.mock.method(globalThis, "fetch", fetchWasm);
  context.mock.method(WebAssembly, "compile", async () => module);
  for (const [key, value] of Object.entries({
    AudioContext: class {
      sampleRate = 48000;
      audioWorklet = { addModule: () => { workletStarted.resolve(); return workletLoaded.promise; } };
      close = closeAudioContext;
    },
    AudioWorkletNode: class { constructor() { createWorklet(); } },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    context.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { workletStarted, workletLoaded, closeAudioContext, createWorklet };
}

test("a stalled worklet load closes the audio context and falls back to the raw microphone", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { workletStarted, workletLoaded, closeAudioContext, createWorklet } = mockPendingWorklet(context);
  const talk = harness(processMicrophone);
  context.after(talk.stop);
  const started = talk.start();
  await workletStarted.promise;
  context.mock.timers.tick(5_000);
  await started;
  assert.equal(closeAudioContext.mock.callCount(), 1);
  assert.equal(talk.sender.track, talk.track);
  assert.equal(talk.track.stopped, false);
  assert.equal(talk.state.phase, "listening");
  assert.match(talk.state.error, /standard processing/);

  workletLoaded.resolve();
  await new Promise<void>(resolve => queueMicrotask(resolve));
  assert.equal(createWorklet.mock.callCount(), 0);
});

test("ending Talk during worklet loading releases the context without connecting", async context => {
  const { workletStarted, workletLoaded, closeAudioContext, createWorklet } = mockPendingWorklet(context);
  const talk = harness(processMicrophone);
  context.after(() => talk.voice.stop());
  const started = talk.voice.start();
  await workletStarted.promise;

  talk.voice.stop();
  assert.equal(closeAudioContext.mock.callCount(), 1);
  assert.equal(talk.track.stopped, true);
  await started;
  workletLoaded.resolve();
  await Promise.resolve();
  assert.equal(closeAudioContext.mock.callCount(), 1);
  assert.equal(createWorklet.mock.callCount(), 0);
  assert.equal(talk.sender.track, null);
  assert.deepEqual(talk.state, idleVoice);
});

test("ending Talk aborts an in-flight WASM fetch", async context => {
  const fetchStarted = Promise.withResolvers<AbortSignal>();
  const { closeAudioContext, createWorklet } = mockPendingWorklet(context, (_input, options) => {
    assert.ok(options?.signal);
    fetchStarted.resolve(options.signal);
    return new Promise<Response>(() => {});
  });
  const talk = harness(processMicrophone);
  context.after(() => talk.voice.stop());
  const started = talk.voice.start();
  const signal = await fetchStarted.promise;

  talk.voice.stop();
  assert.equal(signal.aborted, true);
  await started;
  assert.equal(closeAudioContext.mock.callCount(), 1);
  assert.equal(createWorklet.mock.callCount(), 0);
  assert.equal(talk.sender.track, null);
});

test("a failing filter switches the sender back to the original microphone", async () => {
  let fail!: () => void;
  let stopped = false;
  const processedTrack = { enabled: true, stop() {} };
  const processedStream = { getTracks: () => [processedTrack], getAudioTracks: () => [processedTrack] } as unknown as MediaStream;
  const h = harness(async () => ({ stream: processedStream, onFailure(handler) { fail = handler; }, stop() { stopped = true; } }));
  await h.start();
  fail();
  await Promise.resolve();
  assert.equal(h.sender.track, h.track);
  assert.equal(stopped, true);
  assert.match(h.state.error, /standard processing/);
  h.stop();
});

test("a filter completing after stop is released", async () => {
  let finish!: (value: import("../src/conversationNoise.ts").ProcessedMicrophone) => void;
  let stopped = false;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const start = h.voice.start();
  await Promise.resolve();
  h.voice.stop();
  finish({ stream: h.stream, onFailure() {}, stop() { stopped = true; } });
  await start;
  assert.equal(stopped, true);
  assert.equal(h.track.stopped, true);
});

test("voice selection has a supported default", () => {
  assert.equal(conversationVoice(null), "marin");
  assert.equal(conversationVoice("invalid"), "marin");
  assert.equal(conversationVoice("cedar"), "cedar");
});

test("workspace history keeps recent text in order and excludes non-text data", () => {
  const message = (id: string, role: ChatMessage["role"], body: string): ChatMessage => ({ id, role, body, createdAt: "", selection: null, snapshotId: null, suggestions: [], contexts: [] });
  const messages = [message("old", "user", "old"), ...Array.from({ length: 8 }, (_, index) => message(String(index), index % 2 ? "assistant" : "user", `message ${index} ${"x".repeat(3000)}`)), message("empty", "assistant", " ")];
  const history = voiceHistory(messages);
  const parsed = JSON.parse(history);
  assert.ok(history.length <= 12000);
  assert.ok(parsed.length < messages.length);
  assert.equal(parsed.at(-1).role, "assistant");
  assert.equal(parsed.at(-1).text.length, 2000);
  assert.deepEqual(Object.keys(parsed.at(-1)), ["role", "text"]);
  assert.deepEqual(JSON.parse(voiceHistory([message("1", "user", "hello"), message("2", "assistant", "world")])), [{ role: "user", text: "hello" }, { role: "assistant", text: "world" }]);
});

test("voice receives current history at connection and when saved chat changes", async () => {
  const message = (body: string): ChatMessage => ({ id: "1", role: "user", body, createdAt: "", selection: null, snapshotId: null, suggestions: [], contexts: [] });
  const h = harness();
  h.voice.setHistory([message("before connection")]);
  await h.voice.start();
  h.voice.setHistory([message("while connecting")]);
  assert.equal(h.sent.length, 0);
  h.event({ type: "session.started" });
  try {
    const snapshots = () => h.sent.filter(event => event.type === "session.instructions.append" && event.content.includes("workspace chat history"));
    assert.equal(snapshots().length, 1);
    assert.match(snapshots()[0].content, /while connecting/);
    assert.doesNotMatch(snapshots()[0].content, /before connection/);
    h.voice.setHistory([message("new message")]);
    h.voice.setHistory([message("new message")]);
    assert.equal(snapshots().length, 2);
    assert.match(snapshots()[1].content, /new message/);
    h.voice.setHistory([]);
    assert.match(snapshots()[2].content, /\[\]$/);
  } finally { h.stop(); }
});

test("large workspace history and Unicode progress stay within the Live append budget without losing text", async () => {
  const h = harness();
  const messages: ChatMessage[] = Array.from({ length: 8 }, (_, index) => ({ id: String(index), role: index % 2 ? "assistant" : "user", body: `Message ${index}: ${'ä漢😀\n"\\'.repeat(500)}`, createdAt: "", selection: null, snapshotId: null, suggestions: [], contexts: [] }));
  h.voice.setHistory(messages);
  await h.start();
  try {
    const appends = () => h.sent.filter(event => /session\.(instructions|thinking|commentary)\.append/.test(event.type));
    const parts = appends();
    assert.ok(parts.length > 1, "A main-sized history must not be sent as one oversized append");
    assert.ok(parts.every(event => new TextEncoder().encode(event.content).length <= 480));
    assert.ok(parts.every(event => event.delegation_id === null));
    assert.equal(new Set(parts.map(event => event.event_id)).size, parts.length);
    const rejoin = (events: Record<string, any>[]) => events.map(event => event.content.replace(/^Context fragment \d+\/\d+ \(read in order\):\n/, "")).join("");
    const history = rejoin(parts);
    assert.ok(history.endsWith(voiceHistory(messages)), "All bounded history, roles and escaped text must survive fragmentation");
    assert.match(history, /untrusted data/);
    const before = h.sent.length;
    h.voice.setHistory(messages);
    assert.equal(h.sent.length, before, "An unchanged history must not be resent");
    h.call("d", "r", "c", JSON.stringify({ task: "Inspect the workspace", needs_clarification: false }));
    const request = h.requests[0];
    const text = "😀漢ä".repeat(400);
    const previous = appends().length;
    h.voice.deliver({ id: "progress", context: "workspace", sessionId: request.sessionId, delegationId: "d", responseId: "r", callId: "c", kind: "progress", text });
    const progress = appends().slice(previous);
    assert.ok(progress.length > 1);
    assert.ok(progress.every(event => new TextEncoder().encode(event.content).length <= 480));
    assert.equal(rejoin(progress), text);
  } finally { h.stop(); }
});

test("a rejected client command reports safe protocol details without ending Talk or invalidating work", async () => {
  const h = harness(); await h.start();
  try {
    h.call("d", "r", "c", JSON.stringify({ task: "Inspect the workspace", needs_clarification: false }));
    const request = h.requests[0];
    h.voice.interrupt();
    const command = h.sent.at(-1)!;
    h.event({ type: "error", error: { type: "invalid_request_error", code: "unknown_parameter", client_event_id: command.event_id, message: "synthetic-sensitive-provider-message", param: "synthetic-sensitive-parameter" } });
    assert.equal(h.state.phase, "listening");
    assert.equal(h.track.stopped, false);
    assert.equal(h.peer.closed, false);
    assert.equal(request.isCurrent(), true);
    assert.match(h.state.error, /unknown_parameter; invalid_request_error; session.instructions.append/);
    assert.doesNotMatch(h.state.error, /synthetic-sensitive|billing|access/i);
    assert.ok(!h.sent.some(event => event.type === "session.close"));
    h.voice.deliver({ id: "result", context: "workspace", sessionId: request.sessionId, delegationId: "d", responseId: "r", callId: "c", kind: "result", text: "Verified result" });
    assert.ok(h.sent.some(event => event.type === "response.item.create" && event.item.output === "Verified result"));
  } finally { h.stop(); }
});

test("backend validation and uncorrelated errors stop safely without inventing access or billing causes", async () => {
  for (const error of [
    { code: "responses_validation_failed", type: "invalid_request_error", client_event_id: "startup" },
    { code: null },
    { code: "synthetic-sensitive-code", type: "synthetic-sensitive-type", message: "synthetic-sensitive-message" },
  ]) {
    const h = harness(); await h.start();
    h.event({ type: "error", error });
    assert.equal(h.state.phase, "idle");
    assert.equal(h.track.stopped, true);
    assert.doesNotMatch(h.state.error, /synthetic-sensitive|billing|access/i);
    if (error.code === "responses_validation_failed") assert.match(h.state.error, /backend configuration.*responses_validation_failed/);
    h.stop();
  }
});

test("overlapping speakers retain both transcripts through errors and reset on restart", async () => {
  const h = harness(); await h.start();
  const delta = (speaker: "input" | "output", text: string) => h.event({ type: `session.${speaker}_transcript.delta`, start_ms: 10, end_ms: 20, delta: text });
  delta("input", "Change the button");
  delta("output", "Sure");
  delta("input", " color to blue");
  delta("output", ", I can help.");
  assert.equal(h.state.transcript, "User: Change the button color to blue\nAssistant: Sure, I can help.");
  h.event({ type: "error" });
  assert.equal(h.state.phase, "idle");
  assert.match(h.state.transcript, /User: Change the button color to blue/);
  assert.match(h.state.transcript, /Assistant: Sure, I can help\./);
  await h.start();
  try {
    delta("output", "New session");
    assert.equal(h.state.transcript, "Assistant: New session");
    delta("input", "x".repeat(2100));
    assert.equal(h.state.transcript, `User: ${"x".repeat(2000)}\nAssistant: New session`);
  } finally { h.stop(); }
});

test("completed function calls start once and only matching results continue", async () => {
  const h = harness(); await h.start();
  try {
    h.event({ type: "session.delegation.created", delegation: { id: "d1", target: "responses" } });
    h.backend("d1", { type: "response.created", response: { id: "r1" } });
    const item = { type: "function_call", call_id: "c1", name: "workspace_agent", arguments: JSON.stringify({ task: "Check the workspace", needs_clarification: false }) };
    h.backend("d1", { type: "response.function_call_arguments.done", arguments: item.arguments });
    h.backend("d1", { type: "response.output_item.done", item });
    h.backend("d1", { type: "response.output_item.done", item });
    assert.equal(h.requests.length, 0);
    h.backend("d1", { type: "response.completed", response: { id: "r1", output: [] } });
    h.backend("d1", { type: "response.completed", response: { id: "r1" } });
    assert.equal(h.requests.length, 1);
    const request = h.requests[0];
    assert.equal(request.context, "Check the workspace");
    const reply = { id: "reply", context: "workspace", sessionId: request.sessionId, delegationId: request.delegationId, responseId: request.responseId, callId: request.callId, text: "Verified result", kind: "result" as const };
    h.voice.deliver({ ...reply, sessionId: "other" });
    h.voice.deliver({ ...reply, delegationId: "other" });
    h.voice.deliver({ ...reply, responseId: "other" });
    h.voice.deliver({ ...reply, callId: "other" });
    assert.equal(h.sent.filter(event => event.type === "response.item.create").length, 0);
    h.voice.deliver({ ...reply, kind: "progress" });
    assert.ok(h.sent.some(event => event.type === "session.thinking.append" && event.delegation_id === null));
    h.voice.deliver(reply); h.voice.deliver(reply);
    assert.deepEqual(h.sent.find(event => event.type === "response.item.create")?.item, { type: "function_call_output", call_id: "c1", output: "Verified result" });
    assert.equal(h.sent.filter(event => event.type === "response.item.create").length, 1);
    assert.equal(h.sent.filter(event => event.type === "response.create").length, 1);
    assert.equal(request.isCurrent(), false);
  } finally { h.stop(); }
});

test("malformed, ambiguous, blocked and unknown calls never start work", async () => {
  const h = harness(); await h.start();
  try {
    h.call("d1", "r1", "c1", "not json");
    h.call("d2", "r2", "c2", JSON.stringify({ task: "Fix it", needs_clarification: true }));
    h.call("d3", "r3", "c3", JSON.stringify({ task: "", needs_clarification: false }));
    h.call("d4", "r4", "c4", JSON.stringify({ task: "Check it", needs_clarification: false }), "other_tool");
    h.call("d6", "r6", "c6", JSON.stringify({ task: "Fix it.", needs_clarification: false }));
    h.voice.setWorking(true, true);
    h.call("d5", "r5", "c5", JSON.stringify({ task: "Check it", needs_clarification: false }));
    assert.equal(h.requests.length, 0);
    assert.equal(h.sent.filter(event => event.type === "response.item.create").length, 6);
    assert.ok(h.sent.filter(event => event.type === "response.item.create").every(event => event.item.output.includes("not started")));
    assert.equal(h.sent.filter(event => event.type === "response.create").length, 6);
  } finally { h.stop(); }
});

test("duplicate call IDs never start twice and continuation waits for every result", async () => {
  const h = harness(); await h.start();
  try {
    h.event({ type: "session.delegation.created", delegation: { id: "d", target: "responses" } });
    h.backend("d", { type: "response.created", response: { id: "r" } });
    const item = { type: "function_call", call_id: "c", name: "workspace_agent", arguments: JSON.stringify({ task: "Inspect the workspace", needs_clarification: false }) };
    h.backend("d", { type: "response.output_item.done", item });
    h.backend("d", { type: "response.output_item.done", item: { ...item, call_id: "unclear", arguments: "{}" } });
    h.backend("d", { type: "response.completed", response: { id: "r" } });
    assert.equal(h.requests.length, 1);
    assert.equal(h.sent.filter(event => event.type === "response.create").length, 0);
    const request = h.requests[0];
    h.voice.deliver({ id: "result", context: "workspace", sessionId: request.sessionId, delegationId: "d", responseId: "r", callId: "c", text: "Done", kind: "result" });
    assert.equal(h.sent.filter(event => event.type === "response.item.create").length, 2);
    assert.equal(h.sent.filter(event => event.type === "response.create").length, 1);
    h.call("other", "other-response", "c", item.arguments);
    assert.equal(h.requests.length, 1);
  } finally { h.stop(); }
});

test("overlapping responses cannot be attributed to the wrong call", async () => {
  const h = harness(); await h.start();
  h.event({ type: "session.delegation.created", delegation: { id: "d", target: "responses" } });
  h.backend("d", { type: "response.created", response: { id: "first" } });
  h.backend("d", { type: "response.created", response: { id: "second" } });
  assert.equal(h.state.phase, "idle");
  assert.match(h.state.error, /response conflict/);
  assert.equal(h.requests.length, 0);
  assert.equal(h.track.stopped, true);
  h.stop();
});

test("closing voice invalidates pending calls without cancelling agent work", async () => {
  const h = harness(); await h.start();
  h.call("d", "r", "c", JSON.stringify({ task: "Inspect the workspace", needs_clarification: false }));
  const request = h.requests[0];
  assert.equal(request.isCurrent(), true);
  h.stop();
  assert.equal(request.isCurrent(), false);
  h.voice.deliver({ id: "late", context: "workspace", sessionId: request.sessionId, delegationId: "d", responseId: "r", callId: "c", text: "Late result", kind: "result" });
  assert.equal(h.sent.filter(event => event.type === "response.item.create").length, 0);
});

test("mute, speech interruption and ending are independent from agent work", async () => {
  const h = harness(); await h.start();
  h.voice.setMuted(true); assert.equal(h.track.enabled, false);
  h.voice.setMuted(false); assert.equal(h.track.enabled, true);
  h.voice.interrupt(); assert.equal(h.audio.muted, true); assert.equal(h.state.outputPaused, true);
  h.voice.resumeAudio(); assert.equal(h.audio.muted, false);
  h.voice.setWorking(true, true);
  assert.equal(h.track.enabled, true);
  assert.ok(h.sent.some(event => event.type === "session.thinking.append" && String(event.content).includes("respond in the chat")));
  h.stop(); assert.ok(h.sent.some(event => event.type === "session.close"));
});

test("interrupt stays muted through current audio and resumes after an output pause and new activity", async () => {
  const h = harness(); await h.start();
  h.peer.ontrack({ streams: [h.stream] });
  h.voice.interrupt();
  h.event({ type: "session.output_transcript.delta", start_ms: 1, end_ms: 2, delta: "Late old output" });
  assert.equal(h.audio.muted, true);
  h.level(true, 0); h.level(false, 100); h.level(false, 1099); h.level(true, 1100);
  assert.equal(h.audio.muted, true);
  h.level(false, 1200); h.level(false, 2200);
  assert.equal(h.audio.muted, true);
  h.level(true, 2250);
  assert.equal(h.audio.muted, false);
  assert.equal(h.state.outputPaused, false);
  h.voice.interrupt(); h.level(true, 2300);
  assert.equal(h.audio.muted, true);
  h.stop();
  assert.equal(h.playbackWatchStopped, true);
  h.level(true, 5000);
  assert.equal(h.state.phase, "idle");
});

test("playback monitor measures the output and releases its audio graph", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  let level = 0;
  let closed = false;
  let disconnected = 0;
  const node = () => ({ connect() {}, disconnect() { ++disconnected; } });
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: class {
    state = "running";
    destination = {};
    createMediaStreamSource() { return node(); }
    createAnalyser() { return { ...node(), fftSize: 512, getFloatTimeDomainData(samples: Float32Array) { samples.fill(level); } }; }
    createGain() { return { ...node(), gain: { value: 1 } }; }
    async resume() {}
    async close() { closed = true; }
  } });
  const observed: boolean[] = [];
  try {
    const stop = watchConversationPlayback({} as MediaStream, active => observed.push(active));
    await new Promise(resolve => setTimeout(resolve, 70));
    level = 0.1;
    await new Promise(resolve => setTimeout(resolve, 70));
    stop();
    assert.deepEqual(observed.slice(0, 2), [false, true]);
    assert.equal(closed, true);
    assert.equal(disconnected, 3);
  } finally {
    if (original) Object.defineProperty(globalThis, "AudioContext", original);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});

test("ending while microphone permission is pending releases the late stream", async () => {
  let resolve!: (stream: MediaStream) => void;
  const track = { stopCalled: false, stop() { this.stopCalled = true; } };
  const voice = new RealtimeConversation({ microphone: () => new Promise(done => { resolve = done; }), peer: () => { throw Error("unexpected"); }, audio: () => { throw Error("unexpected"); }, connect: async () => "", delegate: async () => false, changed: () => {} });
  const pending = voice.start(); voice.stop();
  resolve({ getTracks: () => [track] } as unknown as MediaStream); await pending;
  assert.equal(track.stopCalled, true);
});

test("a failed close command still releases microphone and connection", async () => {
  const h = harness(); await h.start();
  h.channel.send = () => { throw new Error("connection lost"); };
  h.voice.stop();
  assert.equal(h.track.stopped, true);
  assert.equal(h.peer.closed, true);
});
