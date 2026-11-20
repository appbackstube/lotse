import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { TelegramSettings, type TelegramStatus } from "../src/components/TelegramSettings";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let saved: TelegramStatus = { connected: true, enabled: true, remoteControlEnabled: false, userId: 10, chatId: 10, connectionId: "connection", journalId: "bot", transcriptionModel: "google/gemini-2.5-flash", transcriptionLanguage: "" };
mockIPC((command, args: any) => {
  if (command === "telegram_set_remote_control") { saved = { ...saved, remoteControlEnabled: args.enabled }; return saved; }
  if (command !== "telegram_set_transcription_settings") throw new Error(`Unexpected IPC: ${command}`);
  saved = { ...saved, transcriptionModel: args.model.trim(), transcriptionLanguage: args.language.trim() };
  return saved;
});
function Settings() {
  const [status, setStatus] = useState(saved);
  return <TelegramSettings repositoryRoot="/repo" status={status} onChange={(value) => { if (value) setStatus(value); }} />;
}
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const change = async (id: string, value: string) => {
  const input = document.getElementById(id) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
let root = createRoot(document.getElementById("root")!);
try {
  await act(async () => root.render(<Settings />));
  const remote = document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Remote questions and approvals"]')!;
  check(remote?.getAttribute("aria-checked") === "false", "Remote approvals must be disabled by default");
  await act(async () => { remote.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  check(saved.remoteControlEnabled === true, "Remote control opt-in was not saved");
  await change("telegram-transcription-model", "provider/audio-model");
  await change("telegram-transcription-language", "German");
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent === "Save voice settings")!;
  await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  check(saved.transcriptionModel === "provider/audio-model" && saved.transcriptionLanguage === "German", "Model and language were not saved");
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<Settings />));
  check(document.querySelector('[role="switch"][aria-label="Remote questions and approvals"]')?.getAttribute("aria-checked") === "true", "Remote control opt-in did not reload");
  check((document.getElementById("telegram-transcription-model") as HTMLInputElement).value === "provider/audio-model", "Model did not reload");
  check((document.getElementById("telegram-transcription-language") as HTMLInputElement).value === "German", "Language did not reload");
  document.getElementById("result")!.textContent = "PASS: Telegram transcription settings save and reload";
} catch (error) { document.getElementById("result")!.textContent = `FAIL: ${String(error)}`; }
finally { await act(async () => root.unmount()); }
