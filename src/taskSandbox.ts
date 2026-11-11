export const sandboxMaxBytes = 1024 * 1024;

export function sandboxLinkUrl(value: unknown, previewUrl: string): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password && url.origin !== new URL(previewUrl).origin ? url.href : null;
  } catch { return null; }
}

export function validSandboxHtml(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && new TextEncoder().encode(value).byteLength <= sandboxMaxBytes;
}

export async function sandboxRevision(html: string | undefined): Promise<string | null> {
  if (html === undefined) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function patchSavedSandbox(raw: string, taskId: string, html: string, updatedAt: number): string {
  if (!validSandboxHtml(html)) throw new Error("Invalid saved sandbox HTML.");
  const tasks: unknown = JSON.parse(raw);
  if (!Array.isArray(tasks)) throw new Error("Task storage is invalid.");
  let changed = false;
  const next = tasks.map((task) => {
    if (!task || task.id !== taskId || task.sandboxHtml === html && (task.updatedAt ?? 0) >= updatedAt) return task;
    changed = true;
    return { ...task, sandboxHtml: html, updatedAt: Math.max(task.updatedAt ?? 0, updatedAt) };
  });
  return changed ? JSON.stringify(next) : raw;
}

export async function applyTaskSandboxUpdate(current: string | undefined, update: unknown): Promise<string> {
  if (!update || typeof update !== "object" || Array.isArray(update)) throw new Error("Invalid sandbox update.");
  const args = update as Record<string, unknown>;
  if (Object.keys(args).some((key) => key !== "html" && key !== "expectedRevision") || !validSandboxHtml(args.html)
    || !(args.expectedRevision === null || typeof args.expectedRevision === "string" && /^[a-f0-9]{64}$/.test(args.expectedRevision))) {
    throw new Error("Provide nonempty HTML up to 1 MiB and the expectedRevision from get_task_sandbox.");
  }
  if (await sandboxRevision(current) !== args.expectedRevision) throw new Error("Sandbox changed. Read get_task_sandbox before updating again.");
  return args.html;
}
