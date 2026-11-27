export function insertComposerTranscript(draft: string, transcript: string, start: number, end: number) {
  const from = Math.max(0, Math.min(start, draft.length));
  const to = Math.max(from, Math.min(end, draft.length));
  const before = draft.slice(0, from);
  const after = draft.slice(to);
  const startsWithWord = /^[\p{L}\p{M}\p{N}]/u;
  const endsWithWord = /[\p{L}\p{M}\p{N}]$/u;
  const leadingSpace = endsWithWord.test(before) && startsWithWord.test(transcript) ? " " : "";
  const trailingSpace = endsWithWord.test(transcript) && startsWithWord.test(after) ? " " : "";
  return {
    text: before + leadingSpace + transcript + trailingSpace + after,
    cursor: from + leadingSpace.length + transcript.length,
  };
}
