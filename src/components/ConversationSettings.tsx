import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export type ConversationSettingsValue = { enabled: boolean };
export function ConversationSettings({ onChange }: { onChange: (settings: ConversationSettingsValue) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void invoke<ConversationSettingsValue>("conversation_settings").then(settings => {
      if (live) { setEnabled(settings.enabled); setLoaded(true); }
    }).catch(() => { if (live) setError("Cannot load Conversation settings. Reopen Settings to retry."); });
    return () => { live = false; };
  }, []);
  const save = async (apiKey: string | null) => {
    setBusy(true); setError("");
    try {
      const settings = await invoke<ConversationSettingsValue>("save_conversation_key", { apiKey });
      setEnabled(settings.enabled); setKey(""); onChange(settings);
    } catch { setError("Could not save the API key. Check the credentials file and try again."); }
    finally { setBusy(false); }
  };
  return <div className="conversation-settings">
    <p>Talk with your workspace agent. Your chat stays visible while OpenAI Realtime recognizes speech and reads replies aloud.</p>
    <form onSubmit={event => { event.preventDefault(); if (key.trim()) void save(key.trim()); }}>
      <label htmlFor="conversation-api-key">OpenAI API key</label>
      <Input id="conversation-api-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={event => setKey(event.currentTarget.value)} placeholder={enabled ? "Enter a replacement key" : "Enter your OpenAI API key"} disabled={busy || !loaded} />
      <p className="conversation-settings-help">Stored locally in ~/.lotse/credentials.json. OpenAI API billing applies separately to voice usage.</p>
      <div className="flex items-center gap-2"><Button type="submit" disabled={busy || !loaded || !key.trim()}>{busy ? "Saving…" : enabled ? "Replace key" : "Save and enable"}</Button>{enabled && <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(null)}>Remove key and disable</Button>}</div>
    </form>
    {loaded && <p role="status">{enabled ? "Conversation is enabled. Use Talk in the workspace composer." : "Add an API key to enable Conversation."}</p>}
    <p className="conversation-settings-help">Voice: OpenAI Realtime Mini · Marin. Your selected agent model handles the work. The voice is AI-generated.</p>
    {error && <p role="alert">{error}</p>}
  </div>;
}
