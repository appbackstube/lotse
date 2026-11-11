import assert from "node:assert/strict";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { mockIPC } from "./mockTauri.ts";

Object.assign(globalThis, { window: globalThis });
mockIPC((_command, payload) => payload, { shouldMockEvents: true });
assert.deepEqual(await invoke("ai_chat_steer", { input: { requestId: "turn" } }), { requestId: "turn" });
await assert.rejects(invoke("ai_chat_steer", { requestId: "turn" }), /requires an input object/);
let calls = 0;
const stop = await listen("test", () => calls++);
await emit("test");
stop();
await emit("test");
assert.equal(calls, 1, "Unlistened callbacks must be removed from the mock event registry");
console.log("Tauri mock request contracts and listener disposal passed.");
