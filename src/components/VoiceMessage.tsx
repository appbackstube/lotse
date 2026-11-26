import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import { fileStore } from "../fileStore";
import { startVoiceWaveform } from "./voiceWaveform";

const modelKey = "lotse.voice-transcription-model";
const defaultModel = "google/gemini-2.5-flash";
const maximumBytes = 20 * 1024 * 1024;

type VoicePhase = "idle" | "starting" | "recording" | "stopping" | "recorded" | "transcribing";

export function useVoiceMessage({ context, disabled, onTranscript }: {
  context: string;
  disabled: boolean;
  onTranscript: (text: string) => void;
}) {
  const modelId = useId();
  const [model, setModel] = useState(() => fileStore.getItem(modelKey) || defaultModel);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const phaseRef = useRef<VoicePhase>("idle");
  const generation = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audio = useRef<Blob | null>(null);
  const stopWaveform = useRef<(() => void) | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const recordButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const transcribeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const transcriptCallback = useRef(onTranscript);
  useLayoutEffect(() => { transcriptCallback.current = onTranscript; }, [onTranscript]);

  const changePhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const releaseMicrophone = useCallback(() => {
    stopWaveform.current?.();
    stopWaveform.current = null;
    if (audioContext.current) void audioContext.current.close().catch(() => {});
    audioContext.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    const recording = recorder.current;
    recorder.current = null;
    if (recording && recording.state !== "inactive") recording.stop();
    releaseMicrophone();
    audio.current = null;
  }, [releaseMicrophone]);

  useLayoutEffect(() => {
    restoreFocus.current = false;
    changePhase("idle");
    setError("");
    return reset;
  }, [changePhase, context, reset]);

  useLayoutEffect(() => {
    if (phase === "starting" || phase === "recording") cancelButton.current?.focus();
    if (phase === "recorded") transcribeButton.current?.focus();
    if (phase === "transcribing") cancelButton.current?.focus();
    if (phase === "idle" && restoreFocus.current) {
      restoreFocus.current = false;
      recordButton.current?.focus();
    }
    if (phase === "recording" && canvas.current && stream.current && audioContext.current) {
      stopWaveform.current = startVoiceWaveform(canvas.current, stream.current, audioContext.current) ?? null;
    }
  }, [phase]);

  const cancel = () => {
    reset();
    restoreFocus.current = true;
    changePhase("idle");
  };

  const fail = (message: string) => {
    cancel();
    setError(message);
  };

  const start = async () => {
    if (!context || disabled || !model.trim() || phaseRef.current !== "idle") return;
    setError("");
    const attempt = ++generation.current;
    changePhase("starting");
    try {
      const mimeType = ["audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("This device cannot record a supported audio format.");
      try {
        audioContext.current = new AudioContext();
        void audioContext.current.resume().catch(() => {});
      } catch {
        audioContext.current = null;
      }
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
        if (size > maximumBytes) { fail("Recording exceeds 20 MB."); return; }
        chunks.push(event.data);
      };
      recording.onerror = () => { if (attempt === generation.current) fail("Recording failed. Please try again."); };
      recording.onstop = () => {
        if (attempt !== generation.current) return;
        recorder.current = null;
        releaseMicrophone();
        if (phaseRef.current !== "stopping" && phaseRef.current !== "transcribing") {
          fail("Recording was interrupted. Please try again.");
          return;
        }
        const blob = new Blob(chunks, { type: recording.mimeType });
        chunks.length = 0;
        if (!blob.size) { fail("Recording is empty."); return; }
        if (phaseRef.current === "transcribing") transcribe(blob, attempt);
        else {
          audio.current = blob;
          changePhase("recorded");
        }
      };
      recording.start(1000);
      changePhase("recording");
    } catch (reason) {
      if (attempt === generation.current) fail(reason instanceof Error ? reason.message : "Cannot access the microphone.");
    }
  };

  const transcribe = (blob: Blob, attempt: number) => {
    const reader = new FileReader();
    reader.onerror = () => { if (attempt === generation.current) fail("Cannot read the recording."); };
    reader.onload = () => {
      if (attempt !== generation.current) return;
      const encoded = String(reader.result).split(",")[1];
      void invoke<string>("transcribe_composer_voice", { audio: encoded, model: model.trim() }).then(text => {
        if (attempt !== generation.current) return;
        transcriptCallback.current(text);
        changePhase("idle");
      }).catch(reason => {
        if (attempt === generation.current) fail(String(reason));
      });
    };
    reader.readAsDataURL(blob);
  };

  const stop = (next: "stopping" | "transcribing") => {
    const recording = recorder.current;
    if (phaseRef.current !== "recording" || recording?.state !== "recording") return;
    changePhase(next);
    recording.stop();
    releaseMicrophone();
  };

  const submitRecording = () => {
    if (phaseRef.current === "recording") stop("transcribing");
    else if (phaseRef.current === "recorded" && audio.current) {
      const blob = audio.current;
      audio.current = null;
      changePhase("transcribing");
      transcribe(blob, generation.current);
    }
  };

  const busy = !!context && phase !== "idle";
  const status = phase === "starting" ? "Starting microphone…" : phase === "transcribing" ? "Transcribing…" : phase === "stopping" ? "Stopping recording…" : "";
  return {
    busy,
    isBusy: () => phaseRef.current !== "idle",
    recordButton: context && <button ref={recordButton} type="button" className="ios-chat-add-image" aria-label="Record voice message" title="Record voice message" disabled={disabled || !model.trim()} onClick={() => void start()}><Mic size={14} /></button>,
    settings: context && <div className="ios-chat-voice-settings">
      <label htmlFor={modelId}>OpenRouter audio model</label>
      <input id={modelId} value={model} spellCheck={false} onChange={event => setModel(event.currentTarget.value)} onBlur={() => fileStore.setItem(modelKey, model.trim())} />
      <p>Audio is sent to OpenRouter and the selected provider when you transcribe. Charges may apply even if canceled.</p>
    </div>,
    error: context && error && <p role="alert" className="ios-chat-voice-error">{error}</p>,
    bar: busy && <div className="ios-chat-voice-bar" onKeyDown={event => {
      if (event.key !== "Escape" || phaseRef.current !== "recording") return;
      event.preventDefault();
      event.stopPropagation();
      stop("stopping");
    }}>
      <button ref={cancelButton} type="button" className="ios-chat-add-image" aria-label="Discard recording" title="Discard recording" onClick={cancel}><X size={14} /></button>
      <div className="ios-chat-voice-wave">
        <canvas ref={canvas} aria-hidden="true" hidden={!!status} />
        <span role="status" className={status ? "" : "sr-only"}>{status || (phase === "recording" ? "Recording…" : "Recording stopped")}</span>
      </div>
      <button type="button" className="ios-chat-add-image" aria-label="Stop recording" title="Stop recording (Esc)" disabled={phase !== "recording"} onClick={() => stop("stopping")}><Square size={14} fill="currentColor" /></button>
      <button ref={transcribeButton} type="button" className="accent-button !size-[30px] shrink-0 !p-0" aria-label="Transcribe for review" title="Transcribe for review" disabled={disabled || (phase !== "recording" && phase !== "recorded")} onClick={submitRecording}><ArrowUp size={14} /></button>
    </div>,
  };
}
