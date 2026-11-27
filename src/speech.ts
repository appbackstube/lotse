import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { renderMarkdown } from "telegram-md-entities";
import { fileStore } from "./fileStore";
import type { ChatMessage } from "./types";

export const speechModelKey = "chaoticreview.speech-model";
export const speechVoiceKey = "chaoticreview.speech-voice";
export const speechLanguageKey = "chaoticreview.speech-language";
export const speechAutomaticKey = "chaoticreview.speech-automatic";
export type SpeechModel = { id: string; name: string; voices: string[] };

type Playback = { id: string; errorId: string; error: string };
let playback: Playback = { id: "", errorId: "", error: "" };
let generation = 0;
let audio: HTMLAudioElement | null = null;
let audioUrl = "";
let automaticPlayback = false;
let automaticQueue: { id: string; input: string }[] = [];
const automaticSeen = new Set<string>();
const listeners = new Set<() => void>();
const update = (next: Playback) => { playback = next; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useSpeechPlayback = () => useSyncExternalStore(subscribe, () => playback);

export function stopSpeech() {
  automaticQueue = [];
  automaticSeen.clear();
  stopCurrentSpeech();
}

function stopCurrentSpeech() {
  generation++;
  automaticPlayback = false;
  if (audio) { audio.pause(); audio.src = ""; audio = null; }
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = ""; }
  update({ id: "", errorId: "", error: "" });
}

export function stopSpeechPreview() {
  if (playback.id === "preview") stopSpeech();
}

export function stopChatSpeech() {
  if (playback.id !== "preview" && playback.errorId !== "preview") stopSpeech();
}

export function stopAutomaticSpeech() {
  automaticQueue = [];
  automaticSeen.clear();
  if (automaticPlayback) stopCurrentSpeech();
}

function windowHasFocus() {
  return document.visibilityState === "visible" && document.hasFocus();
}

export function readCompletedResponse(visibleChat: string | null, completedChat: string | null, entries: ChatMessage[]) {
  if (!windowHasFocus() || !visibleChat || visibleChat !== completedChat || playback.id === "preview" || fileStore.getItem(speechAutomaticKey) !== "true") return;
  const response = entries.filter(entry => entry.role === "assistant" && entry.body.trim()).at(-1);
  if (!response || automaticSeen.has(response.id)) return;
  automaticSeen.add(response.id);
  if (automaticSeen.size > 1000) automaticSeen.delete(automaticSeen.values().next().value!);
  automaticQueue.push({ id: response.id, input: response.body });
  if (!playback.id) playNextAutomatic();
}

function playNextAutomatic() {
  if (!windowHasFocus() || fileStore.getItem(speechAutomaticKey) !== "true") { automaticQueue = []; return; }
  const next = automaticQueue.shift();
  if (next) void startSpeech(next.id, next.input, true);
}

export async function playSpeech(id: string, input: string) {
  stopSpeech();
  await startSpeech(id, input, false);
}

async function startSpeech(id: string, input: string, automatic: boolean) {
  const model = fileStore.getItem(speechModelKey) ?? "";
  const voice = fileStore.getItem(speechVoiceKey) ?? "";
  const language = fileStore.getItem(speechLanguageKey) ?? "";
  if (!model || !voice) { update({ id: "", errorId: id, error: "Choose a speech model and voice in Settings → Voice." }); return; }
  const request = generation;
  automaticPlayback = automatic;
  update({ id, errorId: "", error: "" });
  try {
    const spokenInput = renderMarkdown(input, { underline: false, spoiler: false }).text;
    const encoded = await invoke<string>("synthesize_speech", { input: spokenInput, model, voice, language });
    if (request !== generation) return;
    if (automatic && !windowHasFocus()) { stopAutomaticSpeech(); return; }
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    audioUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    audio = new Audio(audioUrl);
    audio.onended = () => { if (request === generation) { stopCurrentSpeech(); if (automatic || id !== "preview") playNextAutomatic(); } };
    audio.onerror = () => { if (request === generation) { stopCurrentSpeech(); update({ id: "", errorId: id, error: "Could not play speech output." }); if (automatic || id !== "preview") playNextAutomatic(); } };
    await audio.play();
  } catch (reason) {
    if (request === generation) { stopCurrentSpeech(); update({ id: "", errorId: id, error: String(reason) }); if (automatic || id !== "preview") playNextAutomatic(); }
  }
}
