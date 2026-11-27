import assert from "node:assert/strict";
import { test } from "node:test";
import { mockIPC } from "@tauri-apps/api/mocks";
import { fileStore } from "../src/fileStore.ts";
import { playSpeech, readCompletedResponse, speechAutomaticKey, speechModelKey, speechVoiceKey, stopChatSpeech, stopSpeech } from "../src/speech.ts";
import type { ChatMessage } from "../src/types.ts";

Object.assign(globalThis, { window: new EventTarget() });
const requests: unknown[] = [];
mockIPC((command, payload) => {
  if (command === "set_frontend_storage") return;
  assert.equal(command, "synthesize_speech");
  requests.push(payload);
  return new Promise(() => {});
});
fileStore.setItem(speechAutomaticKey, "true");
fileStore.setItem(speechModelKey, "example/tts");
fileStore.setItem(speechVoiceKey, "example-voice");
await fileStore.flush();

const reply: ChatMessage = { id: "reply", role: "assistant", body: "Final reply", createdAt: "", selection: null, snapshotId: null, suggestions: [], contexts: [] };
const entries = [{ ...reply, id: "earlier", body: "Earlier reply" }, reply, { ...reply, id: "empty", body: " " }];

test("reads only the last non-empty reply in the visible chat", () => {
  readCompletedResponse(null, "workspace", entries);
  readCompletedResponse("other-chat", "workspace", entries);
  assert.equal(requests.length, 0);

  readCompletedResponse("workspace", "workspace", entries);
  assert.deepEqual(requests, [{ input: reply.body, model: "example/tts", voice: "example-voice" }]);
  stopChatSpeech();
});

test("chat cleanup and automatic reading do not interrupt a pending preview", () => {
  requests.length = 0;
  void playSpeech("preview", "Voice preview");
  stopChatSpeech();
  readCompletedResponse("workspace", "workspace", entries);
  assert.deepEqual(requests, [{ input: "Voice preview", model: "example/tts", voice: "example-voice" }]);
  stopSpeech();
});
