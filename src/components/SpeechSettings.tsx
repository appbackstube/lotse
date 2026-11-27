import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fileStore } from "../fileStore";
import { playSpeech, speechAutomaticKey, speechModelKey, speechVoiceKey, stopSpeech, stopSpeechPreview, useSpeechPlayback, type SpeechModel } from "../speech";
import { Switch } from "./ui/switch";

export function SpeechSettings() {
  const [models, setModels] = useState<SpeechModel[]>([]);
  const [model, setModel] = useState(() => fileStore.getItem(speechModelKey) ?? "");
  const [voice, setVoice] = useState(() => fileStore.getItem(speechVoiceKey) ?? "");
  const [automatic, setAutomatic] = useState(() => fileStore.getItem(speechAutomaticKey) === "true");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const playback = useSpeechPlayback();

  useEffect(() => {
    let active = true;
    void invoke<SpeechModel[]>("speech_models").then(result => { if (active) setModels(result); }).catch(reason => { if (active) setError(String(reason)); });
    const sync = (event: StorageEvent) => {
      if (event.key === speechModelKey) setModel(event.newValue ?? "");
      if (event.key === speechVoiceKey) setVoice(event.newValue ?? "");
      if (event.key === speechAutomaticKey) setAutomatic(event.newValue === "true");
    };
    window.addEventListener("storage", sync);
    return () => { active = false; window.removeEventListener("storage", sync); stopSpeechPreview(); };
  }, []);

  const save = async (changes: Record<string, string>) => {
    setSaving(true);
    const previous = Object.fromEntries(Object.keys(changes).map(key => [key, fileStore.getItem(key)]));
    for (const [key, value] of Object.entries(changes)) fileStore.setItem(key, value);
    try { await fileStore.flush(); setError(""); }
    catch (reason) {
      for (const [key, value] of Object.entries(previous)) { if (value === null) fileStore.removeItem(key); else fileStore.setItem(key, value); }
      if (speechModelKey in previous) setModel(previous[speechModelKey] ?? "");
      if (speechVoiceKey in previous) setVoice(previous[speechVoiceKey] ?? "");
      if (speechAutomaticKey in previous) setAutomatic(previous[speechAutomaticKey] === "true");
      setError(`Could not save voice settings: ${String(reason)}`);
    } finally { setSaving(false); }
  };
  const voices = models.find(item => item.id === model)?.voices ?? [];
  return <section className="mt-10">
    <h2 className="mb-4 text-[17px] font-semibold">Text to speech</h2>
    <div className="overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5">
      <label className="flex items-center justify-between gap-5 py-5"><span><span className="block font-semibold">Automatically read responses</span><span className="mt-1 block text-sm text-[#7C9B88]">Read new agent responses aloud when they are complete.</span></span><Switch checked={automatic} disabled={saving} onCheckedChange={value => { setAutomatic(value); void save({ [speechAutomaticKey]: String(value) }); }} /></label>
      <div className="flex flex-wrap items-center justify-between gap-5 border-t border-[#294536] py-5"><div><label htmlFor="speech-model" className="font-semibold">Speech model</label><p className="mt-1 text-sm text-[#7C9B88]">Choose an OpenRouter model compatible with MP3 playback.</p></div><select id="speech-model" className="h-9 w-56 rounded-lg border border-[#294536] bg-[#050807] px-3" value={model} disabled={saving} onChange={event => { const value = event.currentTarget.value; setModel(value); setVoice(""); void save({ [speechModelKey]: value, [speechVoiceKey]: "" }); }}><option value="">Choose a model</option>{model && !models.some(item => item.id === model) && <option value={model} disabled>{model} (unavailable)</option>}{models.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div className="flex flex-wrap items-center justify-between gap-5 border-t border-[#294536] py-5"><div><label htmlFor="speech-voice" className="font-semibold">Voice</label><p className="mt-1 text-sm text-[#7C9B88]">Choose a voice for the selected model.</p></div><div className="flex gap-2"><select id="speech-voice" className="h-9 w-56 rounded-lg border border-[#294536] bg-[#050807] px-3" value={voice} disabled={saving || !voices.length} onChange={event => { const value = event.currentTarget.value; setVoice(value); void save({ [speechVoiceKey]: value }); }}><option value="">Choose a voice</option>{voice && !voices.includes(voice) && <option value={voice} disabled>{voice} (unavailable)</option>}{voices.map(item => <option key={item} value={item}>{item}</option>)}</select><button type="button" className="quiet-button" disabled={saving || !model || !voice} onClick={() => playback.id === "preview" ? stopSpeech() : void playSpeech("preview", "Hello! This is a preview of your selected voice.")}>{playback.id === "preview" ? "Stop" : "Preview"}</button></div></div>
    </div>
    <p className="mt-2 text-xs text-[#7C9B88]">Text is sent to OpenRouter and the model provider. Charges may apply.</p>
    {(error || (playback.errorId === "preview" && playback.error)) && <p role="alert" className="mt-2 text-xs text-[#FB7185]">{error || playback.error}</p>}
  </section>;
}
