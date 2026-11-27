export function insertComposerTranscript(draft: string, transcript: string, start: number, end: number) {
  const from = Math.max(0, Math.min(start, draft.length));
  const to = Math.max(from, Math.min(end, draft.length));
  return { text: draft.slice(0, from) + transcript + draft.slice(to), cursor: from + transcript.length };
}
