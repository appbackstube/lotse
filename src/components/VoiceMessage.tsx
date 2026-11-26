import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import { fileStore } from "../fileStore";
import { startVoiceWaveform } from "./voiceWaveform";
import { voiceAutoSendKey, voiceLanguageKey, voiceModelKey } from "./VoiceSettings";

const maximumBytes = 20 * 1024 * 1024;

function subscribeToAutoSend(notify: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === voiceAutoSendKey) notify(); };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

const readAutoSend = () => fileStore.getItem(voiceAutoSendKey) === "true";

type VoicePhase = "idle" | "starting" | "recording" | "stopping" | "recorded" | "transcribing" | "retry";

export function useVoiceMessage({ context, suspended, disabled, onOpenSettings, onTranscript }: {
  context: string;
  suspended: boolean;
  disabled: boolean;
  onOpenSettings: () => void;
  onTranscript: (text: string, autoSendRequested: boolean) => void;
}) {
  const autoSend = useSyncExternalStore(subscribeToAutoSend, readAutoSend);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const phaseRef = useRef<VoicePhase>("idle");
  const generation = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audio = useRef<Blob | null>(null);
  const autoSendRequested = useRef(false);
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
    if (suspended && phaseRef.current !== "idle" && phaseRef.current !== "retry") {
      reset();
      changePhase("idle");
      setError("");
    }
  }, [suspended, changePhase, reset]);

  useLayoutEffect(() => {
    restoreFocus.current = false;
    changePhase("idle");
    setError("");
    return reset;
  }, [changePhase, context, reset]);

  useLayoutEffect(() => {
    if (suspended) return;
    if (phase === "starting" || phase === "recording") cancelButton.current?.focus();
    if (phase === "recorded" || phase === "retry") transcribeButton.current?.focus();
    if (phase === "transcribing") cancelButton.current?.focus();
    if (phase === "idle" && restoreFocus.current) {
      restoreFocus.current = false;
      recordButton.current?.focus();
    }
    if (phase === "recording" && canvas.current && stream.current && audioContext.current) {
      stopWaveform.current = startVoiceWaveform(canvas.current, stream.current, audioContext.current) ?? null;
    }
  }, [phase, suspended]);

  const cancel = () => {
    reset();
    restoreFocus.current = true;
    changePhase("idle");
    setError("");
  };

  const fail = (message: string) => {
    cancel();
    setError(message);
  };

  const start = async () => {
    if (!context || suspended || disabled || phaseRef.current !== "idle") return;
    if (!fileStore.getItem(voiceModelKey)) { setError("Select a transcription model in Settings → General."); return; }
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
        audio.current = blob;
        if (phaseRef.current === "transcribing") transcribe(blob, attempt);
        else changePhase("recorded");
      };
      recording.onstart = () => {
        window.setTimeout(() => {
          if (attempt === generation.current && recorder.current === recording && recording.state === "recording") changePhase("recording");
        }, 500);
      };
      recording.start(1000);
    } catch (reason) {
      if (attempt === generation.current) fail(reason instanceof Error ? reason.message : "Cannot access the microphone.");
    }
  };

  const transcribe = (blob: Blob, attempt: number) => {
    const sendAfterTranscription = autoSendRequested.current;
    const failTranscription = (message: string) => {
      if (attempt !== generation.current) return;
      setError(message);
      changePhase("retry");
    };
    const reader = new FileReader();
    reader.onerror = () => failTranscription("Cannot read the recording.");
    reader.onload = () => {
      if (attempt !== generation.current) return;
      const encoded = String(reader.result).split(",")[1];
      const model = fileStore.getItem(voiceModelKey) ?? "";
      const selectedLanguage = fileStore.getItem(voiceLanguageKey) ?? "system";
      const languageCode = (selectedLanguage === "system" ? navigator.language : selectedLanguage).split(/[-_]/)[0].toLowerCase();
      const language = /^[a-z]{2}$/.test(languageCode) ? languageCode : null;
      void invoke<string>("transcribe_voice_stt", { audio: encoded, model, language }).then(text => {
        if (attempt !== generation.current) return;
        transcriptCallback.current(text, sendAfterTranscription);
        audio.current = null;
        changePhase("idle");
      }).catch(reason => failTranscription(String(reason)));
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
    if (disabled || suspended) return;
    autoSendRequested.current = autoSend;
    if (phaseRef.current === "recording") stop("transcribing");
    else if ((phaseRef.current === "recorded" || phaseRef.current === "retry") && audio.current) {
      setError("");
      changePhase("transcribing");
      transcribe(audio.current, generation.current);
    }
  };

  const busy = !!context && phase !== "idle";
  const retrying = phase === "retry";
  const status = phase === "starting" ? "Waiting for microphone…" : phase === "transcribing" ? "Transcribing…" : phase === "stopping" ? "Stopping recording…" : retrying ? "Recording kept" : "";
  const transcribeLabel = autoSend
    ? (retrying ? "Retry and send if possible" : "Transcribe and send if possible")
    : (retrying ? "Retry transcription" : "Transcribe for review");
  return {
    busy,
    isBusy: () => phaseRef.current !== "idle",
    recordButton: context && <button ref={recordButton} type="button" className="ios-chat-add-image" aria-label="Record voice message" title="Record voice message" disabled={disabled || suspended} onClick={() => void start()}><Mic size={14} /></button>,
    error: context && error && <p className="ios-chat-voice-error"><span role="alert">{error}</span>{retrying && <> <button type="button" className="underline" onClick={onOpenSettings}>Open voice settings</button></>}</p>,
    bar: busy && <><div className="ios-chat-voice-bar" onKeyDown={event => {
      if (event.key !== "Escape" || phaseRef.current !== "recording") return;
      event.preventDefault();
      event.stopPropagation();
      stop("stopping");
    }}>
      <button ref={cancelButton} type="button" className="ios-chat-add-image" aria-label="Discard recording" title="Discard recording" onClick={cancel}><X size={14} /></button>
      <div className="ios-chat-voice-wave">
        <canvas ref={canvas} aria-hidden="true" className={phase === "recording" ? "is-visible" : ""} />
        <span aria-hidden="true" className={`ios-chat-voice-spinner ${phase === "starting" ? "is-visible" : ""}`} />
        <span role="status" className={status && phase !== "starting" ? "ios-chat-voice-status" : "sr-only"}>{status || (phase === "recording" ? "Recording…" : "Recording stopped")}</span>
      </div>
      {!retrying && <button type="button" className="ios-chat-add-image" aria-label="Stop recording" title="Stop recording (Esc)" disabled={phase !== "recording"} onClick={() => stop("stopping")}><Square size={14} fill="currentColor" /></button>}
      <button ref={transcribeButton} type="button" className={`accent-button shrink-0 ${retrying ? "" : "!size-[30px] !p-0"}`} aria-label={transcribeLabel} title={transcribeLabel} disabled={disabled || (phase !== "recording" && phase !== "recorded" && !retrying)} onClick={submitRecording}>{retrying ? "Retry" : <ArrowUp size={14} />}</button>
    </div></>,
  };
}
