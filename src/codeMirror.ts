export const LARGE_FILE_MAX_LINES = 20_000;
export const LARGE_FILE_MAX_CHARACTERS = 2_000_000;

export function isLargeCodeDocument(value: string) {
  if (value.length >= LARGE_FILE_MAX_CHARACTERS) return true;
  let lines = 1;
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10 && ++lines >= LARGE_FILE_MAX_LINES) return true;
  }
  return false;
}
