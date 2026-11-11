import { fileStore } from "./fileStore.ts";
import type { AiChatMode, ChatRequestContext, CodeSelection } from "./types.ts";
import type { ChatEffort } from "./chatDefaults.ts";

export type QueuedChatMessage = {
  id: string;
  body: string;
  coordinationPath?: string[];
  context: ChatRequestContext;
  selection: CodeSelection | null;
  mode: AiChatMode;
  model: string;
  effort: ChatEffort;
};

export type ChatQueues = Record<string, QueuedChatMessage[]>;
export const chatQueueStorageKey = "chaoticreview.chat-queues";

export function loadChatQueues(): ChatQueues {
  try {
    const value: unknown = JSON.parse(fileStore.getItem(chatQueueStorageKey) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([key, items]) => [key, Array.isArray(items) ? items.filter((item): item is QueuedChatMessage =>
      !!item && typeof item.id === "string" && typeof item.body === "string" && item.context?.mode === "auto" && Array.isArray(item.context.attachments)
      && (item.coordinationPath === undefined || Array.isArray(item.coordinationPath) && item.coordinationPath.every((id: unknown) => typeof id === "string"))
      && (item.mode === "default" || item.mode === "plan") && typeof item.model === "string" && typeof item.effort === "string") : []]));
  } catch { return {}; }
}

export function saveChatQueues(queues: ChatQueues): void {
  fileStore.setItem(chatQueueStorageKey, JSON.stringify(queues));
}

export function moveQueuedMessage(items: QueuedChatMessage[], id: string, offset: -1 | 1): QueuedChatMessage[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0 || index + offset < 0 || index + offset >= items.length) return items;
  const next = [...items];
  [next[index], next[index + offset]] = [next[index + offset], next[index]];
  return next;
}
