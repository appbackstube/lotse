export type ProcessedMicrophone = {
  stream: MediaStream;
  onFailure: (handler: () => void) => void;
  stop: () => void;
};

const FILTER_STARTUP_TIMEOUT_MS = 5_000;

export async function processMicrophone(stream: MediaStream, signal: AbortSignal): Promise<ProcessedMicrophone> {
  signal.throwIfAborted();
  const context = new AudioContext({ sampleRate: 48000 });
  const controller = new AbortController();
  let output: MediaStream | undefined;
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (node) {
      node.port.onmessage = null;
      node.onprocessorerror = null;
      node.disconnect();
    }
    source?.disconnect();
    output?.getTracks().forEach(track => track.stop());
    void context.close().catch(() => {});
  };
  const abortStartup = () => controller.abort(signal.reason);
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(controller.signal.reason);
      stop();
    }, { once: true });
  });
  signal.addEventListener("abort", abortStartup, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Noise filter timed out")), FILTER_STARTUP_TIMEOUT_MS);
  const duringStartup = <Result>(operation: Promise<Result>) => Promise.race([operation, deadline]);
  try {
    if (context.sampleRate !== 48000) throw new Error("Unsupported sample rate");
    const base = import.meta.env?.BASE_URL ?? "/";
    const response = await duringStartup(fetch(`${base}audio/lotse_audio_denoise.wasm`, { signal: controller.signal }));
    if (!response.ok) throw new Error("Noise filter unavailable");
    const bytes = await duringStartup(response.arrayBuffer());
    const module = await duringStartup(WebAssembly.compile(bytes));
    controller.signal.throwIfAborted();
    await duringStartup(context.audioWorklet.addModule(`${base}audio/denoise-worklet.js`));
    controller.signal.throwIfAborted();
    node = new AudioWorkletNode(context, "lotse-denoise", {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      channelCount: 1, channelCountMode: "explicit", processorOptions: { module },
    });
    const processor = node;
    await duringStartup(new Promise<void>((resolve, reject) => {
      processor.port.onmessage = event => {
        if (event.data === "ready") resolve();
      };
      processor.onprocessorerror = () => reject(new Error("Noise filter failed"));
    }));
    controller.signal.throwIfAborted();
    processor.port.onmessage = null;
    let failed = false;
    let failureHandler: (() => void) | undefined;
    processor.onprocessorerror = () => { failed = true; failureHandler?.(); };
    source = context.createMediaStreamSource(stream);
    const destination = context.createMediaStreamDestination();
    output = destination.stream;
    source.connect(node).connect(destination);
    await duringStartup(context.resume());
    controller.signal.throwIfAborted();
    if (failed) throw new Error("Noise filter failed");
    return {
      stream: output,
      onFailure: handler => { failureHandler = handler; if (failed) queueMicrotask(handler); },
      stop,
    };
  } catch (error) {
    stop();
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abortStartup);
  }
}
