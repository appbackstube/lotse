export type FileReference = { path: string; line: number };

export function parseFileReference(value: string): FileReference | null {
  let decoded: string;
  try { decoded = decodeURIComponent(value.trim()); } catch { return null; }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(decoded) && !decoded.startsWith("file://")) return null;
  const match = decoded.replace(/^file:\/\//, "").match(/^(?:\.\/)?(.+\.[A-Za-z0-9]+)(?::(\d+)|#L(\d+)(?:-L\d+)?)$/);
  const line = Number(match?.[2] ?? match?.[3]);
  return match && Number.isSafeInteger(line) && line > 0 ? { path: match[1], line } : null;
}
