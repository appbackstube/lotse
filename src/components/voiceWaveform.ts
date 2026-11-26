const sampleIntervalMs = 65;
const barSpacing = 5;
const maximumBars = 250;

export function startVoiceWaveform(canvas: HTMLCanvasElement, stream: MediaStream, audio: AudioContext) {
  const graphics = canvas.getContext("2d");
  if (!graphics) return;
  let analyser: AnalyserNode;
  let source: MediaStreamAudioSourceNode;
  try {
    analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    source = audio.createMediaStreamSource(stream);
    source.connect(analyser);
  } catch {
    return;
  }
  const samples = new Float32Array(analyser.fftSize);
  const levels: number[] = [];
  const paint = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
    if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
    graphics.setTransform(ratio, 0, 0, ratio, 0, 0);
    graphics.clearRect(0, 0, width, height);
    graphics.fillStyle = getComputedStyle(canvas).color;
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    levels.push(Math.min(1, rms * 8));
    if (levels.length > maximumBars) levels.shift();
    const bars = Math.floor(width / barSpacing);
    for (let index = 0; index < bars; index++) {
      const level = levels[levels.length - bars + index] || 0;
      if (!level) continue;
      const amplitude = 2 + level * (height - 2);
      graphics.globalAlpha = .24 + level * .55;
      graphics.fillRect(index * barSpacing, (height - amplitude) / 2, 2, amplitude);
    }
  };
  paint();
  const timer = window.setInterval(paint, sampleIntervalMs);
  return () => { window.clearInterval(timer); source.disconnect(); analyser.disconnect(); };
}
