import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fileStore } from "./fileStore";
import type { ChatMessage } from "./types";

export const speechModelKey = "chaoticreview.speech-model";
export const speechVoiceKey = "chaoticreview.speech-voice";
export const speechAutomaticKey = "chaoticreview.speech-automatic";
export type SpeechModel = { id: string; name: string; voices: string[] };

type Playback = { id: string; errorId: string; error: string };
let playback: Playback = { id: "", errorId: "", error: "" };
let generation = 0;
let audio: HTMLAudioElement | null = null;
let audioUrl = "";
const listeners = new Set<() => void>();
const update = (next: Playback) => { playback = next; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useSpeechPlayback = () => useSyncExternalStore(subscribe, () => playback);

export function stopSpeech() {
  generation++;
  if (audio) { audio.pause(); audio.src = ""; audio = null; }
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = ""; }
  update({ id: "", errorId: "", error: "" });
}

export function stopSpeechPreview() {
  if (playback.id === "preview") stopSpeech();
}

export function stopChatSpeech() {
  if ((playback.id || playback.errorId) && playback.id !== "preview" && playback.errorId !== "preview") stopSpeech();
}

export function readCompletedResponse(visibleChat: string | null, completedChat: string | null, entries: ChatMessage[]) {
  if (!visibleChat || visibleChat !== completedChat || playback.id === "preview" || fileStore.getItem(speechAutomaticKey) !== "true") return;
  const response = entries.filter(entry => entry.role === "assistant" && entry.body.trim()).at(-1);
  if (response) void playSpeech(response.id, response.body);
}

export async function playSpeech(id: string, input: string) {
  stopSpeech();
  const model = fileStore.getItem(speechModelKey) ?? "";
  const voice = fileStore.getItem(speechVoiceKey) ?? "";
  if (!model || !voice) { update({ id: "", errorId: id, error: "Choose a speech model and voice in Settings → Voice." }); return; }
  const request = generation;
  update({ id, errorId: "", error: "" });
  try {
    const encoded = await invoke<string>("synthesize_speech", { input, model, voice });
    if (request !== generation) return;
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    audioUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    audio = new Audio(audioUrl);
    audio.onended = () => { if (request === generation) stopSpeech(); };
    audio.onerror = () => { if (request === generation) { stopSpeech(); update({ id: "", errorId: id, error: "Could not play speech output." }); } };
    await audio.play();
  } catch (reason) {
    if (request === generation) { stopSpeech(); update({ id: "", errorId: id, error: String(reason) }); }
  }
}
