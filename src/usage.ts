import { invoke } from "@tauri-apps/api/core";
import { fileStore } from "./fileStore";

export const usageStorageKey = "chaoticreview.usage";
export type UsageItem = { id: string; title: string };
export type UsageEvent = { id: string; at: number; kind: "run" | "role"; agent: UsageItem; model?: string; playbook?: UsageItem };
export type UsageCategory = "Agents" | "Playbooks" | "Roles" | "Models";
export type UsageRow = { id: string; title: string; count: number; lastUsed: number };

export function recordUsage(event: UsageEvent): Promise<void> {
  return invoke("append_usage_event", { event });
}

export function readUsage(): UsageEvent[] {
  try {
    const value: unknown = JSON.parse(fileStore.getItem(usageStorageKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((event): event is UsageEvent => !!event && typeof event.id === "string" && Number.isFinite(event.at)
      && (event.kind === "run" || event.kind === "role") && event.agent && typeof event.agent.id === "string" && typeof event.agent.title === "string");
  } catch { return []; }
}

export function summarizeUsage(events: UsageEvent[], category: UsageCategory, since: number): UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const event of events) {
    if (event.at < since || event.at > Date.now()) continue;
    let item: UsageItem | undefined;
    if (category === "Agents" && event.kind === "run") item = event.agent;
    if (category === "Roles" && event.kind === "role") item = event.agent;
    if (category === "Playbooks" && event.kind === "run") item = event.playbook;
    if (category === "Models" && event.kind === "run" && event.model) item = { id: event.model, title: event.model };
    if (!item || typeof item.id !== "string" || typeof item.title !== "string") continue;
    const row = rows.get(item.id);
    if (!row) rows.set(item.id, { ...item, count: 1, lastUsed: event.at });
    else {
      row.count++;
      if (event.at > row.lastUsed) { row.lastUsed = event.at; row.title = item.title; }
    }
  }
  return [...rows.values()].sort((left, right) => right.count - left.count || left.title.localeCompare(right.title));
}
