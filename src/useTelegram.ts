import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TelegramStatus } from "./components/TelegramSettings";
import { advanceTelegramOffset, readTelegramJournal, telegramJournalKey, updateTelegramJournal } from "./telegramJournal";

export type TelegramUpdate = { updateId: number; message: Record<string, unknown> };
type Batch = { nextOffset: number; messages: TelegramUpdate[] };

export function useTelegram(repositoryRoot: string | null, receive: (root: string, connectionId: string, update: TelegramUpdate) => Promise<void>, recover: (root: string, connectionId: string) => Promise<void>) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [error, setError] = useState("");
  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  const recoverRef = useRef(recover);
  recoverRef.current = recover;
  const updateStatus = useCallback((value: TelegramStatus | null) => { setStatus(value); setError(""); }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus(null); setError("");
    if (repositoryRoot) void invoke<TelegramStatus>("telegram_connection").then((value) => { if (!cancelled) setStatus(value); })
      .catch((reason: unknown) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [repositoryRoot]);

  useEffect(() => {
    if (!repositoryRoot || !status?.enabled || !status.connectionId || !status.journalId) return;
    const root = repositoryRoot;
    const connectionId = status.connectionId;
    const key = telegramJournalKey(root, status.journalId);
    let cancelled = false;
    let recovered = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        if (!recovered) {
          await recoverRef.current(root, connectionId);
          if (cancelled) return;
          recovered = true;
        }
        const journal = readTelegramJournal(key);
        const batch = await invoke<Batch>("telegram_poll", { offset: journal.offset, connectionId });
        if (cancelled) return;
        for (const update of batch.messages) {
          if (cancelled) return;
          await receiveRef.current(root, connectionId, update);
        }
        if (cancelled) return;
        await updateTelegramJournal(key, (current) => advanceTelegramOffset(current, batch.nextOffset));
        if (!cancelled) { setError(""); timer = setTimeout(() => void poll(), 100); }
      } catch (reason) {
        if (!cancelled) { const detail = String(reason); setError(detail); timer = setTimeout(() => void poll(), detail.includes("Waiting for the repository's Workspace chat") ? 500 : 10_000); }
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [repositoryRoot, status?.enabled, status?.connectionId, status?.journalId]);

  return { status, updateStatus, error };
}
