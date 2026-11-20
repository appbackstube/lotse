import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

export type TelegramStatus = { connected: boolean; enabled: boolean; remoteControlEnabled?: boolean; userId: number | null; chatId: number | null; connectionId: string | null; journalId: string | null; transcriptionModel?: string; transcriptionLanguage?: string };
type Candidate = { id: number; name: string };

export function TelegramSettings({ repositoryRoot, status, onChange }: { repositoryRoot: string | null; status: TelegramStatus | null; onChange: (status: TelegramStatus | null) => void }) {
  const [token, setToken] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [model, setModel] = useState("google/gemini-2.5-flash");
  const [language, setLanguage] = useState("");

  useEffect(() => {
    setModel(status?.transcriptionModel ?? "google/gemini-2.5-flash");
    setLanguage(status?.transcriptionLanguage ?? "");
  }, [status?.connectionId, status?.transcriptionModel, status?.transcriptionLanguage]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };

  return <section className="mt-10 space-y-5">
    <p className="text-sm text-[#7C9B88]">Connect one private Telegram chat to this repository. Lotse must be open to respond. Telegram retains undelivered messages for at most 24 hours.</p>
    <ol className="list-decimal space-y-2 pl-5 text-sm text-[#E8FFF0]">
      <li>In Telegram, open BotFather and create a bot. Copy its bot token.</li>
      <li>Open your new bot in Telegram and send <code>/start</code>.</li>
      <li>Paste the token below and select <strong>Find my chat</strong>. Choose your own account and connect it.</li>
      <li>Enable Telegram and send a test message. Use a separate bot for each repository.</li>
    </ol>
    <p className="text-sm text-[#7C9B88]">Text, supported images, videos, and voice messages go to the current Workspace chat. Messages received while Lotse is closed are processed when it reopens, if Telegram still retains them.</p>
    {!repositoryRoot ? <p className="text-sm text-[#7C9B88]">Open a repository to connect Telegram.</p> : <>
      {status?.connected ? <div className="rounded-xl border border-[#294536] bg-[#111A15] p-5">
        <label className="flex items-center justify-between gap-5"><span><strong>Telegram enabled</strong><span className="mt-1 block text-sm text-[#7C9B88]">Private chat {status.chatId}. This setting stays enabled after restarting Lotse.</span></span><Switch checked={status.enabled} disabled={busy} aria-label="Telegram enabled" onCheckedChange={(enabled) => void run(async () => { const result = await invoke<TelegramStatus>("telegram_set_enabled", { enabled }); onChange(result); })} /></label>
        <label className="mt-5 flex items-center justify-between gap-5"><span><strong>Remote questions and approvals</strong><span className="mt-1 block text-sm text-[#7C9B88]">Send agent questions, approval details and task results to Telegram. Anyone with access to the connected account can answer or approve actions. Sensitive questions stay in Lotse; other messages may contain private information. Reply directly to the request or use the displayed commands.</span></span><Switch checked={status.remoteControlEnabled === true} disabled={busy || !status.enabled} aria-label="Remote questions and approvals" onCheckedChange={(enabled) => void run(async () => { const result = await invoke<TelegramStatus>("telegram_set_remote_control", { enabled }); onChange(result); })} /></label>
        <div className="mt-5 space-y-3 border-t border-[#294536] pt-5">
          <label className="block text-sm font-semibold" htmlFor="telegram-transcription-model">OpenRouter audio model ID</label>
          <Input id="telegram-transcription-model" value={model} onChange={(event) => setModel(event.currentTarget.value)} disabled={busy} />
          <label className="block text-sm font-semibold" htmlFor="telegram-transcription-language">Spoken language</label>
          <Input id="telegram-transcription-language" value={language} onChange={(event) => setLanguage(event.currentTarget.value)} placeholder="Automatic detection" disabled={busy} />
          <p className="text-sm text-[#7C9B88]">Voice audio is sent to OpenRouter and its model provider using the configured OpenRouter key. Usage may incur charges. Choose a model that supports the voice audio format; leave language blank for automatic detection.</p>
          <button type="button" className="quiet-button" disabled={busy || !model.trim()} onClick={() => void run(async () => { const result = await invoke<TelegramStatus>("telegram_set_transcription_settings", { model, language }); onChange(result); setNotice("Voice settings saved."); })}>Save voice settings</button>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button type="button" className="quiet-button" disabled={busy || !status.enabled} onClick={() => void run(async () => { await invoke("telegram_send", { text: "Lotse is connected to this repository.", connectionId: status.connectionId }); setNotice("Test message sent."); })}>Send test message</button><button type="button" className="quiet-button text-[#fb7185]" disabled={busy} onClick={() => void run(async () => { await invoke("telegram_disconnect"); const result = { connected: false, enabled: false, userId: null, chatId: null, connectionId: null, journalId: null }; onChange(result); })}>Disconnect</button></div>
      </div> : <div className="rounded-xl border border-[#294536] bg-[#111A15] p-5 space-y-3">
        <label className="block text-sm font-semibold" htmlFor="telegram-token">Bot token</label><Input id="telegram-token" type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.currentTarget.value); setCandidates([]); setSelectedId(null); }} />
        <button type="button" className="quiet-button" disabled={busy || !token.trim()} onClick={() => void run(async () => { const result = await invoke<Candidate[]>("telegram_discover", { token }); setCandidates(result); if (!result.length) setNotice("No private chat found. Send your bot a message and try again."); })}>Find my chat</button>
        {candidates.length > 0 && <fieldset className="space-y-2"><legend className="text-sm">Choose the account allowed to send messages</legend>{candidates.map((candidate) => <label key={candidate.id} className="flex items-center gap-2 text-sm"><input type="radio" name="telegram-chat" checked={selectedId === candidate.id} onChange={() => setSelectedId(candidate.id)} />{candidate.name} · {candidate.id}</label>)}</fieldset>}
        <div className="flex justify-end"><button type="button" className="accent-button" disabled={busy || selectedId === null} onClick={() => void run(async () => { const result = await invoke<TelegramStatus>("telegram_save_connection", { token, userId: selectedId, chatId: selectedId }); setToken(""); setCandidates([]); onChange(result); })}>Connect</button></div>
      </div>}
    </>}
    {notice && <p role="status" className="text-sm text-[#7C9B88]">{notice}</p>}{error && <p role="alert" className="text-sm text-[#FB7185]">{error}</p>}
  </section>;
}
