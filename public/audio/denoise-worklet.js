class DenoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const instance = new WebAssembly.Instance(options.processorOptions.module);
    this.wasm = instance.exports;
    this.denoiser = this.wasm.denoiser_create();
    this.inputPointer = this.wasm.denoiser_input(this.denoiser);
    this.outputPointer = this.wasm.denoiser_output(this.denoiser);
    this.wasm.denoiser_process(this.denoiser);
    this.refreshMemory();
    this.queue = new Float32Array(960);
    this.read = 0;
    this.write = 480;
    this.inputPosition = 0;
    this.port.postMessage("ready");
  }

  refreshMemory() {
    this.input = new Float32Array(this.wasm.memory.buffer, this.inputPointer, 480);
    this.output = new Float32Array(this.wasm.memory.buffer, this.outputPointer, 480);
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;
    for (let index = 0; index < output.length; index++) {
      output[index] = this.queue[this.read];
      this.read = (this.read + 1) % this.queue.length;
      this.input[this.inputPosition++] = (input?.[index] ?? 0) * 32768;
      if (this.inputPosition === this.input.length) {
        this.wasm.denoiser_process(this.denoiser);
        if (this.input.buffer !== this.wasm.memory.buffer) this.refreshMemory();
        for (let sample = 0; sample < this.output.length; sample++) {
          this.queue[this.write] = Math.max(-1, Math.min(1, this.output[sample] / 32768));
          this.write = (this.write + 1) % this.queue.length;
        }
        this.inputPosition = 0;
      }
    }
    return true;
  }
}

registerProcessor("lotse-denoise", DenoiseProcessor);
