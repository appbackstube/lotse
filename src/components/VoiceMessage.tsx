import { useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Mic, Square, X } from "lucide-react";
import { fileStore } from "../fileStore";

const modelKey = "lotse.voice-transcription-model";
const defaultModel = "google/gemini-2.5-flash";
const maximumBytes = 20 * 1024 * 1024;

export function VoiceMessage({ onTranscript, disabled }: { onTranscript: (text: string) => void; disabled: boolean }) {
  const [model, setModel] = useState(() => fileStore.getItem(modelKey) || defaultModel);
  const [phase, setPhase] = useState<"idle" | "starting" | "recording" | "transcribing">("idle");
  const [error, setError] = useState("");
  const generation = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const transcriptCallback = useRef(onTranscript);
  transcriptCallback.current = onTranscript;

  const cancel = () => {
    generation.current += 1;
    if (recorder.current?.state !== "inactive") recorder.current?.stop();
    recorder.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    setPhase("idle");
  };

  useLayoutEffect(() => () => {
    generation.current += 1;
    if (recorder.current?.state !== "inactive") recorder.current?.stop();
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);

  const start = async () => {
    setError("");
    const attempt = ++generation.current;
    setPhase("starting");
    try {
      const mimeType = ["audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("This device cannot record a supported audio format.");
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attempt !== generation.current) { input.getTracks().forEach(track => track.stop()); return; }
      stream.current = input;
      const recording = new MediaRecorder(input, { mimeType });
      recorder.current = recording;
      const chunks: Blob[] = [];
      let size = 0;
      recording.ondataavailable = event => {
        if (attempt !== generation.current || !event.data.size) return;
        size += event.data.size;
        if (size > maximumBytes) { cancel(); setError("Recording exceeds 20 MB."); return; }
        chunks.push(event.data);
      };
      recording.onerror = () => { if (attempt === generation.current) { cancel(); setError("Recording failed. Please try again."); } };
      recording.onstop = () => { chunks.length = 0; };
      recording.start(1000);
      setPhase("recording");
      finishRecording.current = () => {
        const selectedModel = model.trim();
        setPhase("transcribing");
        recording.onstop = () => {
          input.getTracks().forEach(track => track.stop());
          if (attempt !== generation.current) return;
          stream.current = null;
          recorder.current = null;
          const blob = new Blob(chunks, { type: recording.mimeType });
          if (!blob.size || blob.size > maximumBytes) { setError("Recording is empty or exceeds 20 MB."); setPhase("idle"); return; }
          const reader = new FileReader();
          reader.onerror = () => { if (attempt === generation.current) { setError("Cannot read the recording."); setPhase("idle"); } };
          reader.onload = () => {
            if (attempt !== generation.current) return;
            const audio = String(reader.result).split(",")[1];
            void invoke<string>("transcribe_composer_voice", { audio, model: selectedModel }).then(text => {
              if (attempt === generation.current) { transcriptCallback.current(text); setPhase("idle"); }
            }).catch(reason => {
              if (attempt === generation.current) { setError(String(reason)); setPhase("idle"); }
            });
          };
          reader.readAsDataURL(blob);
        };
        recording.stop();
      };
    } catch (reason) {
      if (attempt !== generation.current) return;
      cancel();
      setError(reason instanceof Error ? reason.message : "Cannot access the microphone.");
    }
  };

  const finishRecording = useRef<() => void>(() => {});

  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <label htmlFor="voice-model">OpenRouter audio model</label>
    <input id="voice-model" className="w-64 max-w-full rounded border border-[#294536] bg-[#050807] px-2 py-1 text-[#E8FFF0] focus-visible:outline focus-visible:outline-2" value={model} disabled={phase !== "idle"} onChange={event => setModel(event.currentTarget.value)} onBlur={() => { fileStore.setItem(modelKey, model.trim()); }} />
    {phase === "idle" ? <button type="button" className="quiet-button" disabled={disabled || !model.trim()} onClick={() => void start()} aria-label="Record voice message"><Mic size={16} /> Record</button> : <>
      <span role="status">{phase === "starting" ? "Starting microphone…" : phase === "recording" ? "Recording…" : "Transcribing…"}</span>
      {phase === "recording" && <button type="button" className="quiet-button" onClick={() => finishRecording.current()}><Square size={14} /> Transcribe</button>}
      <button type="button" className="quiet-button" onClick={cancel}><X size={14} /> Cancel</button>
    </>}
    <span>Audio is sent to OpenRouter and the selected provider; charges may apply even if canceled. Review the transcript before sending.</span>
    {error && <span role="alert">{error}</span>}
  </div>;
}
