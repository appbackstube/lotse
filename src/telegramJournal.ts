import { fileStore } from "./fileStore";
import type { QueuedChatMessage } from "./chatQueue";

export type TelegramPhase = "prepared" | "queued" | "starting" | "running" | "sending" | "done" | "uncertain";
export type TelegramEntry = { updateId: number; workspaceKey: string; item: QueuedChatMessage; phase: TelegramPhase };
export type TelegramJournal = { offset: number; entries: TelegramEntry[] };
const journalWrites = new Map<string, Promise<TelegramJournal>>();

export function telegramJournalKey(root: string, connectionId: string): string {
  return `chaoticreview.telegram-journal:${JSON.stringify([root, connectionId])}`;
}

export function readTelegramJournal(key: string): TelegramJournal {
  const raw = fileStore.getItem(key);
  if (raw === null) return { offset: 0, entries: [] };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Telegram history could not be read. Reconnect only after checking pending work."); }
  if (!value || typeof value !== "object" || !("offset" in value) || !("entries" in value)) throw new Error("Telegram history is invalid. Check pending work before reconnecting.");
  const journal = value as TelegramJournal;
  if (!Number.isSafeInteger(journal.offset) || journal.offset < 0 || !Array.isArray(journal.entries)
    || journal.entries.some((entry) => !entry || !Number.isSafeInteger(entry.updateId) || entry.updateId < 0 || typeof entry.workspaceKey !== "string"
      || !entry.item || typeof entry.item.id !== "string" || typeof entry.item.body !== "string" || !entry.item.context || entry.item.context.mode !== "auto"
      || !Array.isArray(entry.item.context.attachments) || (entry.item.mode !== "default" && entry.item.mode !== "plan")
      || typeof entry.item.model !== "string" || typeof entry.item.effort !== "string"
      || !["prepared", "queued", "starting", "running", "sending", "done", "uncertain"].includes(entry.phase))) {
    throw new Error("Telegram history is invalid. Check pending work before reconnecting.");
  }
  return journal;
}

export async function updateTelegramJournal(key: string, change: (current: TelegramJournal) => TelegramJournal): Promise<TelegramJournal> {
  const previous = journalWrites.get(key);
  const write = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(async () => {
    const next = change(readTelegramJournal(key));
    fileStore.setItem(key, JSON.stringify(next));
    await fileStore.flush();
    return next;
  });
  journalWrites.set(key, write);
  try { return await write; } finally { if (journalWrites.get(key) === write) journalWrites.delete(key); }
}

export function addTelegramEntry(journal: TelegramJournal, entry: TelegramEntry): TelegramJournal {
  if (journal.entries.some((existing) => existing.updateId === entry.updateId)) return journal;
  return { ...journal, entries: [...journal.entries, entry] };
}

export function changeTelegramPhase(journal: TelegramJournal, updateId: number, phase: TelegramPhase): TelegramJournal {
  if (!journal.entries.some((entry) => entry.updateId === updateId)) throw new Error("Telegram message history is missing. Check the Workspace and Telegram chats.");
  return { ...journal, entries: journal.entries.map((entry) => entry.updateId === updateId ? { ...entry, phase } : entry) };
}

export function advanceTelegramOffset(journal: TelegramJournal, nextOffset: number): TelegramJournal {
  if (!Number.isSafeInteger(nextOffset) || nextOffset < journal.offset) throw new Error("Invalid Telegram update offset.");
  const retained = journal.entries.filter((entry) => entry.phase !== "done");
  return { offset: nextOffset, entries: retained };
}
