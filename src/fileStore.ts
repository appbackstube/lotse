import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { patchSavedSandbox } from "./taskSandbox.ts";

type StoredValue = string | (() => string);
const values = new Map<string, StoredValue>();
const pending = new Map<string, StoredValue | null>();
const written = new Map<string, string | null>();
const failed = new Map<string, unknown>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;
const flushWaiters: { resolve: () => void; reject: (error: unknown) => void }[] = [];

export const fileStore = {
  acceptTaskSandbox(key: string, taskId: string, html: string, updatedAt: number): void {
    // The native command already committed this field; preserve any pending metadata edits.
    for (const entries of [values, pending, written]) {
      const value = entries.get(key);
      if (value !== undefined && value !== null) entries.set(key, patchSavedSandbox(typeof value === "function" ? value() : value, taskId, html, updatedAt));
    }
  },
  flush(): Promise<void> {
    clearTimeout(saveTimer); saveTimer = undefined;
    if (pending.size && !flushing) void flush();
    if (flushing) return new Promise((resolve, reject) => flushWaiters.push({ resolve, reject }));
    return failed.size ? Promise.reject(failed.values().next().value) : Promise.resolve();
  },
  getItem(key: string): string | null {
    const value = values.get(key);
    return typeof value === "function" ? value() : value ?? null;
  },
  setItem(key: string, value: string): void {
    if (values.get(key) === value && !failed.has(key)) return;
    values.set(key, value);
    persist(key, value);
  },
  setJSON(key: string, value: unknown): void {
    let serialized: string | undefined;
    const serialize = () => serialized ??= JSON.stringify(value);
    values.set(key, serialize);
    pending.set(key, serialize);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = undefined; if (!flushing) void flush(); }, 300);
  },
  keys(): string[] { return [...values.keys()]; },
  removeItem(key: string): void {
    if (!values.has(key) && !failed.has(key)) return;
    values.delete(key);
    persist(key, null);
  },
};

function persist(key: string, value: string | null) {
  pending.set(key, value);
  if (!flushing) void flush();
}

async function flush() {
  flushing = true;
  let failure: unknown;
  while (pending.size) {
    const [key, value] = pending.entries().next().value as [string, StoredValue | null];
    pending.delete(key);
    try {
      const serialized = typeof value === "function" ? value() : value;
      if (written.get(key) !== serialized || failed.has(key)) await invoke<void>("set_frontend_storage", { key, value: serialized });
      if (serialized === null) written.delete(key); else written.set(key, serialized);
      if (values.get(key) === value && serialized !== null) values.set(key, serialized);
      failed.delete(key);
    } catch (error) {
      failed.set(key, error);
      failure = error;
      window.dispatchEvent(new CustomEvent("frontend-storage-error", { detail: String(error) }));
    }
  }
  flushing = false;
  for (const waiter of flushWaiters.splice(0)) {
    if (failure !== undefined || failed.size) waiter.reject(failure ?? failed.values().next().value);
    else waiter.resolve();
  }
}

export async function initializeFileStore(): Promise<void> {
  const legacy: Record<string, string> = {};
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith("chaoticreview.")) {
        const value = localStorage.getItem(key);
        if (value !== null) legacy[key] = value;
      }
    }
  } catch { /* Existing webview storage may be unavailable. */ }

  const saved = await invoke<Record<string, string>>("load_frontend_storage", { origin: location.origin, legacy });
  for (const [key, value] of Object.entries(saved)) { values.set(key, value); written.set(key, value); }
  await listen<{ key: string; value: string | null; source: string }>("frontend-storage-changed", (event) => {
    const { key, value, source } = event.payload;
    if (source === getCurrentWindow().label) return;
    pending.delete(key);
    if (value === null) written.delete(key); else written.set(key, value);
    failed.delete(key);
    if (value === null) values.delete(key);
    else values.set(key, value);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  });
}
