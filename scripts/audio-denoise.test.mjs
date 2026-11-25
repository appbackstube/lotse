import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

let Processor;
const messages = [];
class AudioWorkletProcessor {
  port = { postMessage: message => messages.push(message) };
}
vm.runInNewContext(readFileSync("public/audio/denoise-worklet.js", "utf8"), {
  AudioWorkletProcessor, WebAssembly, Float32Array, Math,
  registerProcessor: (_name, processor) => { Processor = processor; },
});
const module = await WebAssembly.compile(readFileSync("public/audio/lotse_audio_denoise.wasm"));
const processor = new Processor({ processorOptions: { module } });
assert.deepEqual(messages, ["ready"]);
const result = [];
for (let block = 0; block < 80; block++) {
  const input = Float32Array.from({ length: 128 }, (_, index) => 0.25 * Math.sin((block * 128 + index) * 0.1));
  const output = new Float32Array(128);
  assert.equal(processor.process([[input]], [[output]]), true);
  result.push(...output);
}
assert.ok(result.slice(0, 480).every(value => value === 0));
assert.ok(result.every(value => Number.isFinite(value) && Math.abs(value) <= 1));
assert.ok(result.slice(1440).some(value => Math.abs(value) > 0.00001));
console.log("PASS: WASM filter processes consecutive audio blocks");
