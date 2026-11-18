export function watchConversationPlayback(stream: MediaStream, onLevel: (active: boolean, time: number) => void): () => void {
  if (typeof AudioContext === "undefined") return () => {};
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    const silentOutput = context.createGain();
    silentOutput.gain.value = 0;
    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(silentOutput);
    silentOutput.connect(context.destination);
    const samples = new Float32Array(analyser.fftSize);
    const audioContext = context;
    void audioContext.resume().catch(() => {});
    const timer = setInterval(() => {
      if (audioContext.state !== "running") return;
      analyser.getFloatTimeDomainData(samples);
      const energy = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
      onLevel(energy > 0.00001, performance.now());
    }, 50);
    return () => {
      clearInterval(timer);
      source.disconnect(); analyser.disconnect(); silentOutput.disconnect();
      void audioContext.close().catch(() => {});
    };
  } catch {
    if (context) void context.close().catch(() => {});
    return () => {};
  }
}
