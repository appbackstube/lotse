export type ProcessedMicrophone = {
  stream: MediaStream;
  onFailure: (handler: () => void) => void;
  stop: () => void;
};

export async function processMicrophone(stream: MediaStream): Promise<ProcessedMicrophone> {
  const context = new AudioContext({ sampleRate: 48000 });
  let output: MediaStream | undefined;
  let node: AudioWorkletNode | undefined;
  try {
    if (context.sampleRate !== 48000) throw new Error("Unsupported sample rate");
    const base = import.meta.env.BASE_URL;
    const response = await fetch(`${base}audio/lotse_audio_denoise.wasm`);
    if (!response.ok) throw new Error("Noise filter unavailable");
    const module = await WebAssembly.compile(await response.arrayBuffer());
    await context.audioWorklet.addModule(`${base}audio/denoise-worklet.js`);
    node = new AudioWorkletNode(context, "lotse-denoise", {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      channelCount: 1, channelCountMode: "explicit", processorOptions: { module },
    });
    const processor = node;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Noise filter timed out")), 5000);
      processor.port.onmessage = event => {
        if (event.data === "ready") { clearTimeout(timeout); resolve(); }
      };
      processor.onprocessorerror = () => { clearTimeout(timeout); reject(new Error("Noise filter failed")); };
    });
    let failed = false;
    let failureHandler: (() => void) | undefined;
    processor.onprocessorerror = () => { failed = true; failureHandler?.(); };
    const source = context.createMediaStreamSource(stream);
    const destination = context.createMediaStreamDestination();
    source.connect(node).connect(destination);
    output = destination.stream;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        context.resume(),
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Audio context timed out")), 5000); }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    if (failed) throw new Error("Noise filter failed");
    return {
      stream: output,
      onFailure: handler => { failureHandler = handler; if (failed) queueMicrotask(handler); },
      stop: () => {
        processor.onprocessorerror = null;
        processor.disconnect(); source.disconnect();
        destination.stream.getTracks().forEach(track => track.stop());
        void context.close();
      },
    };
  } catch (error) {
    node?.disconnect();
    output?.getTracks().forEach(track => track.stop());
    void context.close();
    throw error;
  }
}
