import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { conversationVoice, conversationVoiceKey, conversationVoices } from "../conversationVoices";
import { fileStore } from "../fileStore";

export type ConversationSettingsValue = { enabled: boolean };
export function ConversationSettings({ onChange }: { onChange: (settings: ConversationSettingsValue) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState(() => conversationVoice(fileStore.getItem(conversationVoiceKey)));
  const [voiceBusy, setVoiceBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void invoke<ConversationSettingsValue>("conversation_settings").then(settings => {
      if (live) { setEnabled(settings.enabled); setLoaded(true); }
    }).catch(() => { if (live) setError("Cannot load Conversation settings. Reopen Settings to retry."); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === conversationVoiceKey) setVoice(conversationVoice(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const saveVoice = async (value: string) => {
    const next = conversationVoice(value);
    const previous = voice;
    setVoice(next); setVoiceBusy(true); setError("");
    fileStore.setItem(conversationVoiceKey, next);
    try { await fileStore.flush(); }
    catch {
      setVoice(previous);
      fileStore.setItem(conversationVoiceKey, previous);
      setError("Could not save the voice. Check storage and try again.");
    } finally { setVoiceBusy(false); }
  };
  const save = async (apiKey: string | null) => {
    setBusy(true); setError("");
    try {
      const settings = await invoke<ConversationSettingsValue>("save_conversation_key", { apiKey });
      setEnabled(settings.enabled); setKey(""); onChange(settings);
    } catch { setError("Could not save the API key. Check the credentials file and try again."); }
    finally { setBusy(false); }
  };
  return <div className="conversation-settings">
    <p>Talk with GPT-Live while your workspace agent works. The chat stays visible for results and approvals.</p>
    <form onSubmit={event => { event.preventDefault(); if (key.trim()) void save(key.trim()); }}>
      <label htmlFor="conversation-api-key">OpenAI API key</label>
      <Input id="conversation-api-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={event => setKey(event.currentTarget.value)} placeholder={enabled ? "Enter a replacement key" : "Enter your OpenAI API key"} disabled={busy || !loaded} />
      <p className="conversation-settings-help">Stored locally in ~/.lotse/credentials.json. Audio and recent saved workspace chat text are sent to OpenAI during Talk. GPT-Live is billed for connection time, including initialization; the Responses model and workspace agent are billed separately when used. Ending Talk does not stop agent work.</p>
      <p className="conversation-settings-help">If the connection fails or is ended while connecting, its final closure and charges may be unconfirmed. Check your OpenAI usage.</p>
      <div className="flex items-center gap-2"><Button type="submit" disabled={busy || !loaded || !key.trim()}>{busy ? "Saving…" : enabled ? "Replace key" : "Save and enable"}</Button>{enabled && <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(null)}>Remove key and disable</Button>}</div>
    </form>
    {loaded && <p role="status">{enabled ? "Conversation is enabled. Use Talk in the workspace composer." : "Add an API key to enable Conversation."}</p>}
    <div className="grid gap-2"><label htmlFor="conversation-voice">Voice</label><select className="ios-chat-config-select w-44" id="conversation-voice" value={voice} disabled={voiceBusy} onChange={event => void saveVoice(event.currentTarget.value)}>{conversationVoices.map(option => <option key={option} value={option}>{option === "marin" ? "Marin" : "Cedar"}</option>)}</select><p className="conversation-settings-help">Applies when you start a new conversation. The voice is AI-generated.</p></div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
