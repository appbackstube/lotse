import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fileStore } from "../fileStore";
import { Switch } from "./ui/switch";

export const voiceModelKey = "chaoticreview.voice-stt-model";
export const voiceLanguageKey = "chaoticreview.voice-stt-language";
export const voiceAutoSendKey = "chaoticreview.voice-stt-auto-send";

export function VoiceSettings() {
  const [key, setKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [models, setModels] = useState<[string, string][]>([]);
  const [model, setModel] = useState(() => fileStore.getItem(voiceModelKey) ?? "");
  const [language, setLanguage] = useState(() => fileStore.getItem(voiceLanguageKey) ?? "system");
  const [autoSend, setAutoSend] = useState(() => fileStore.getItem(voiceAutoSendKey) === "true");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadModels = async () => {
    const result = await invoke<[string, string][]>("voice_models");
    setModels(result);
  };

  useEffect(() => {
    const syncAutoSend = (event: StorageEvent) => {
      if (event.key === voiceAutoSendKey) setAutoSend(event.newValue === "true");
    };
    window.addEventListener("storage", syncAutoSend);
    return () => window.removeEventListener("storage", syncAutoSend);
  }, []);

  useEffect(() => {
    let active = true;
    void invoke<boolean>("voice_key_configured").then(async (result) => {
      if (!active) return;
      setConfigured(result);
      if (result) {
        const loaded = await invoke<[string, string][]>("voice_models");
        if (active) setModels(loaded);
      }
    }).catch((reason: unknown) => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, []);

  const saveKey = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      await invoke("save_voice_key", { key });
      setKey(""); setConfigured(true); setModels([]);
      setNotice("OpenRouter key saved. Loading transcription models…");
      await loadModels();
      setNotice("OpenRouter key saved and transcription models refreshed.");
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };

  const saveSetting = async (storageKey: string, value: string) => {
    setError("");
    setBusy(true);
    const previous = fileStore.getItem(storageKey);
    fileStore.setItem(storageKey, value);
    try { await fileStore.flush(); }
    catch (reason) {
      if (previous === null) fileStore.removeItem(storageKey); else fileStore.setItem(storageKey, previous);
      if (storageKey === voiceModelKey) setModel(previous ?? "");
      if (storageKey === voiceLanguageKey) setLanguage(previous ?? "system");
      if (storageKey === voiceAutoSendKey) setAutoSend(previous === "true");
      setError(`Could not save voice settings: ${String(reason)}`);
    } finally { setBusy(false); }
  };

  return <section className="mt-10">
    <h2 className="mb-4 text-[17px] font-semibold">Voice transcription</h2>
    <div className="overflow-hidden rounded-xl border border-[#294536] bg-[#111A15] px-5">
      <div className="flex flex-wrap items-center justify-between gap-5 py-5">
        <div><label className="font-semibold" htmlFor="voice-key">OpenRouter API key</label><p className="mt-1 text-sm text-[#7C9B88]">Used only for voice transcription. Stored in ~/.lotse/credentials.json.</p></div>
        <div className="flex gap-2"><input id="voice-key" className="h-9 rounded-lg border border-[#294536] bg-[#050807] px-3" type="password" autoComplete="off" value={key} placeholder={configured ? "Key configured" : "Enter API key"} onChange={event => setKey(event.currentTarget.value)} /><button className="quiet-button" disabled={busy || !key.trim()} onClick={() => void saveKey()}>Save</button></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-5 border-t border-[#294536] py-5">
        <div><label htmlFor="voice-model" className="font-semibold">Transcription model</label><p className="mt-1 text-sm text-[#7C9B88]">Only models compatible with Lotse recordings are listed.</p></div>
        <select id="voice-model" className="h-9 w-56 rounded-lg border border-[#294536] bg-[#050807] px-3" value={model} disabled={!configured || busy || !models.length} onChange={event => { const value = event.currentTarget.value; setModel(value); void saveSetting(voiceModelKey, value); }}><option value="">Choose a model</option>{model && !models.some(([id]) => id === model) && <option value={model} disabled>{model} (unavailable)</option>}{models.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-5 border-t border-[#294536] py-5">
        <div><label htmlFor="voice-language" className="font-semibold">Spoken language</label><p className="mt-1 text-sm text-[#7C9B88]">Choose the language you speak in voice messages.</p></div>
        <select id="voice-language" className="h-9 w-56 rounded-lg border border-[#294536] bg-[#050807] px-3" value={language} disabled={busy} onChange={event => { const value = event.currentTarget.value; setLanguage(value); void saveSetting(voiceLanguageKey, value); }}><option value="system">System language</option><option value="de">Deutsch</option><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="it">Italiano</option></select>
      </div>
      <label className="flex items-center justify-between gap-5 border-t border-[#294536] py-5"><span><span className="block font-semibold">Send automatically after transcription</span><span className="mt-1 block text-sm text-[#7C9B88]">Keep the transcript in the composer if it already has a draft or attachments, or if the queue is paused.</span></span><Switch checked={autoSend} disabled={busy} onCheckedChange={value => { setAutoSend(value); void saveSetting(voiceAutoSendKey, String(value)); }} /></label>
    </div>
    <p className="mt-2 text-xs text-[#7C9B88]">Audio is sent to OpenRouter and the model provider. Charges may apply.</p>
    {configured && <button className="quiet-button mt-2" disabled={busy} onClick={() => { setBusy(true); setError(""); void loadModels().catch(reason => setError(String(reason))).finally(() => setBusy(false)); }}>Refresh models</button>}
    {notice && <p role="status" className="mt-2 text-xs">{notice}</p>}{error && <p role="alert" className="mt-2 text-xs text-[#FB7185]">{error}</p>}
  </section>;
}
