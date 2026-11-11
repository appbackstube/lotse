import { mockIPC as tauriMockIPC } from "@tauri-apps/api/mocks";

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
    const invoke = window.__TAURI_INTERNALS__.invoke;
    // Tauri's event API sends eventId, but its mock removes listeners by id.
    window.__TAURI_INTERNALS__.invoke = (command, args, invokeOptions) => invoke(command,
      command === "plugin:event|unlisten" ? { ...args as object, id: (args as { eventId: number }).eventId } : args,
      invokeOptions);
  }
}
