import assert from "node:assert/strict";
import { test } from "node:test";
import { RealtimeConversation, idleVoice, type VoiceSnapshot } from "../src/conversation.ts";

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function harness(options: { microphone?: () => Promise<MediaStream>; transcript?: (text: string) => Promise<boolean> } = {}) {
  let snapshot: VoiceSnapshot = idleVoice;
  let connects = 0;
  const sent: any[] = [];
  const transcripts: string[] = [];
  const track = { enabled: true, stopped: false, onended: null, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const channel = { readyState: "open", onopen: null as any, onmessage: null as any, onclose: null as any,
    send: (text: string) => sent.push(JSON.parse(text)), close() { this.readyState = "closed"; this.onclose?.(); } };
  const peer = { closed: false, connectionState: "connected", addTrack() {}, createDataChannel: () => channel,
    createOffer: async () => ({ type: "offer", sdp: "v=0\r\nsynthetic" }), setLocalDescription: async () => {}, setRemoteDescription: async () => {}, close() { this.closed = true; } };
  const audio = { muted: false, paused: false, srcObject: null, pause() { this.paused = true; }, play: async () => {} };
  const voice = new RealtimeConversation({
    microphone: options.microphone ?? (async () => stream), peer: () => peer as unknown as RTCPeerConnection,
    audio: () => audio as unknown as HTMLAudioElement, connect: async () => { ++connects; return "v=0\r\nanswer"; },
    transcript: async text => { transcripts.push(text); return options.transcript ? options.transcript(text) : true; },
    changed: value => { snapshot = value; },
  });
  const event = (value: object) => channel.onmessage({ data: JSON.stringify(value) });
  const open = () => { channel.readyState = "open"; channel.onopen(); };
  const start = async () => { await voice.start(); open(); };
  return { voice, start, open, event, sent, transcripts, stream, track, peer, audio, get state() { return snapshot; }, get connects() { return connects; } };
}

test("replies arriving during connection setup are spoken in order after the channel opens", async () => {
  let resolve!: (stream: MediaStream) => void;
  const h = harness({ microphone: () => new Promise(done => { resolve = done; }) });
  h.voice.speak("Idle reply");
  const pending = h.voice.start();
  try {
    h.voice.speak("First reply");
    resolve(h.stream); await pending;
    h.voice.speak("Second reply");
    assert.equal(h.sent.length, 0);
    h.open();
    assert.equal(h.sent.length, 1);
    assert.ok(h.sent[0].response.instructions.includes("First reply"));
    h.event({ type: "response.created", response: { id: "first" } });
    h.event({ type: "response.done", response: { id: "first", status: "completed" } });
    h.event({ type: "output_audio_buffer.stopped", response_id: "first" });
    assert.equal(h.sent.length, 2);
    assert.ok(h.sent[1].response.instructions.includes("Second reply"));
  } finally { h.voice.stop(); }
});

for (const ending of ["stop", "failure"] as const) {
  test(`${ending} during connection discards buffered replies before restarting`, async () => {
    const h = harness();
    await h.voice.start();
    h.voice.speak("Discard this pending reply");
    if (ending === "stop") h.voice.stop();
    else h.event({ type: "error" });
    h.voice.speak("Discard this idle reply");
    try {
      await h.start();
      assert.equal(h.sent.length, 0);
      h.voice.speak("New reply");
      assert.equal(h.sent.length, 1);
      assert.ok(h.sent[0].response.instructions.includes("New reply"));
    } finally { h.voice.stop(); }
  });
}

test("ending during microphone permission releases a late stream without connecting", async () => {
  let resolve!: (stream: MediaStream) => void;
  const h = harness({ microphone: () => new Promise(done => { resolve = done; }) });
  const pending = h.voice.start();
  h.voice.stop(); resolve(h.stream); await pending;
  assert.equal(h.track.stopped, true); assert.equal(h.connects, 0); assert.equal(h.state.phase, "idle");
});

test("only final transcripts are delivered, once and in spoken order", async () => {
  const h = harness(); await h.start();
  try {
    h.event({ type: "input_audio_buffer.committed", item_id: "first" });
    h.event({ type: "input_audio_buffer.committed", item_id: "second" });
    h.event({ type: "conversation.item.input_audio_transcription.delta", item_id: "first", delta: "partial" });
    assert.deepEqual(h.transcripts, []);
    h.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "second", transcript: "Second." });
    await tick(); assert.deepEqual(h.transcripts, []);
    h.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "first", transcript: "First." });
    await tick(); assert.deepEqual(h.transcripts, ["First.", "Second."]);
    h.event({ type: "input_audio_buffer.committed", item_id: "first" });
    h.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "first", transcript: "First." });
    await tick(); assert.deepEqual(h.transcripts, ["First.", "Second."]);
  } finally { h.voice.stop(); }
});

test("speech waits until pending input was sent and replies wait until playback ends", async () => {
  const h = harness(); await h.start();
  try {
    h.event({ type: "input_audio_buffer.committed", item_id: "input" });
    h.voice.speak("First reply"); assert.equal(h.sent.length, 0);
    h.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "input", transcript: "Question" });
    await tick();
    h.voice.speak("Second reply");
    assert.equal(h.sent.filter(e => e.type === "response.create").length, 1);
    assert.deepEqual(h.sent[0].response.input, []);
    assert.equal(h.sent[0].response.conversation, "none");
    h.event({ type: "response.created", response: { id: "r1" } });
    h.event({ type: "output_audio_buffer.started" });
    h.event({ type: "response.done", response: { id: "r1", status: "completed" } });
    assert.equal(h.sent.filter(e => e.type === "response.create").length, 1);
    h.event({ type: "output_audio_buffer.stopped" });
    assert.equal(h.sent.filter(e => e.type === "response.create").length, 2);
  } finally { h.voice.stop(); }
});

test("speaking over the agent immediately mutes audio, cancels output and drops queued speech", async () => {
  const h = harness(); await h.start();
  try {
    h.voice.speak("Reply"); h.voice.speak("Old queued reply");
    h.event({ type: "response.created", response: { id: "old" } });
    h.event({ type: "input_audio_buffer.speech_started" });
    assert.equal(h.audio.muted, true);
    assert.ok(h.sent.some(e => e.type === "response.cancel" && e.response_id === "old"));
    assert.ok(h.sent.some(e => e.type === "output_audio_buffer.clear"));
    h.event({ type: "response.done", response: { id: "old", status: "cancelled" } });
    h.event({ type: "output_audio_buffer.cleared" });
    h.event({ type: "input_audio_buffer.speech_stopped" });
    assert.equal(h.sent.filter(e => e.type === "response.create").length, 1);
  } finally { h.voice.stop(); }
});

test("interruption before response.created still cancels the late response", async () => {
  const h = harness(); await h.start();
  try {
    h.voice.speak("Reply"); h.voice.interrupt();
    h.event({ type: "response.created", response: { id: "late" } });
    assert.ok(h.sent.some(e => e.type === "response.cancel" && e.response_id === "late"));
  } finally { h.voice.stop(); }
});

test("late playback events from an interrupted reply cannot advance a newer reply", async () => {
  const h = harness(); await h.start();
  try {
    h.voice.speak("Old reply");
    h.event({ type: "response.created", response: { id: "old" } });
    h.voice.interrupt(); h.voice.speak("New reply");
    h.event({ type: "response.done", response: { id: "old", status: "cancelled" } });
    h.event({ type: "response.created", response: { id: "new" } });
    h.voice.speak("Following reply");
    h.event({ type: "response.done", response: { id: "new", status: "completed" } });
    h.event({ type: "output_audio_buffer.cleared", response_id: "old" });
    assert.equal(h.sent.filter(e => e.type === "response.create").length, 2);
    h.event({ type: "output_audio_buffer.stopped", response_id: "new" });
    assert.equal(h.sent.filter(e => e.type === "response.create").length, 3);
  } finally { h.voice.stop(); }
});

test("pending chat questions block voice submission and keep the recognized text", async () => {
  const h = harness(); await h.start();
  h.event({ type: "input_audio_buffer.committed", item_id: "input" });
  h.voice.setWorking(true, true); assert.equal(h.track.enabled, false);
  h.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "input", transcript: "Yes" });
  await tick();
  assert.deepEqual(h.transcripts, []); assert.equal(h.state.transcript, "Yes");
  assert.equal(h.state.phase, "idle"); assert.ok(h.state.error); assert.equal(h.track.stopped, true);
});

test("failed delivery preserves transcript and closes every resource", async () => {
  const h = harness({ transcript: async () => false }); await h.start();
  h.voice.setMuted(true); assert.equal(h.track.enabled, false);
  h.voice.setMuted(false); assert.equal(h.track.enabled, true);
  h.event({ type: "input_audio_buffer.committed", item_id: "input" });
  h.event({ type: "conversation.item.input_audio_transcription.completed", item_id: "input", transcript: "Keep me" });
  await tick();
  assert.equal(h.state.transcript, "Keep me"); assert.ok(h.state.error);
  assert.equal(h.track.stopped, true); assert.equal(h.peer.closed, true); assert.equal(h.audio.paused, true);
  assert.equal(h.audio.srcObject, null); assert.equal(h.state.phase, "idle");
});
