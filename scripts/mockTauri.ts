import { mockIPC as tauriMockIPC } from "@tauri-apps/api/mocks";
import type { EventTarget } from "@tauri-apps/api/event";
import type { invoke, InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";

const requestCommands = new Set(["ai_chat_send", "ai_chat_steer", "set_mcp_context", "load_task_file_diff", "merge_task_worktree", "github_update_item"]);

export function mockIPC(callback: Parameters<typeof tauriMockIPC>[0], options?: Parameters<typeof tauriMockIPC>[1]) {
  tauriMockIPC((command, payload) => {
    if (!requestCommands.has(command)) return callback(command, payload);
    if (!payload || !("input" in payload) || !payload.input || typeof payload.input !== "object") {
      throw new Error(`${command} requires an input object`);
    }
    return callback(command, { ...payload.input, ...(command === "ai_chat_send" ? { events: payload.events } : {}) });
  }, options);
  if (options?.shouldMockEvents) {
    const internals = (window as unknown as { __TAURI_INTERNALS__: {
      invoke: typeof invoke;
      runCallback: (id: number, data: unknown) => void;
    } }).__TAURI_INTERNALS__;
    const invokeIPC = internals.invoke;
    const listeners = new Map<number, { event: string; target: EventTarget }>();
    // Tauri's event API sends eventId, but its mock removes listeners by id.
    // It also lacks emitTo support; preserve Tauri's global and window target semantics.
    internals.invoke = async <T>(command: string, args?: InvokeArgs, invokeOptions?: InvokeOptions): Promise<T> => {
      if (command === "plugin:event|listen") {
        const { event, target } = args as { event: string; target: EventTarget };
        const id = await invokeIPC<number>(command, args, invokeOptions);
        listeners.set(id, { event, target });
        return id as T;
      }
      if (command === "plugin:event|emit_to") {
        const { event, target, payload } = args as { event: string; target: EventTarget; payload: unknown };
        for (const [id, listener] of [...listeners]) {
          const matches = target.kind === "Any" || listener.target.kind === "Any"
            || ("label" in target && "label" in listener.target && target.label === listener.target.label
              && (target.kind === "AnyLabel" || listener.target.kind === "AnyLabel" || target.kind === listener.target.kind))
            || target.kind === "App" && listener.target.kind === "App";
          if (listener.event === event && matches) internals.runCallback(id, { event, id, payload });
        }
        return undefined as T;
      }
      if (command === "plugin:event|unlisten") {
        const { eventId } = args as { eventId: number };
        listeners.delete(eventId);
        return invokeIPC<T>(command, { ...args as object, id: eventId }, invokeOptions);
      }
      return invokeIPC<T>(command, args, invokeOptions);
    };
  }
}
