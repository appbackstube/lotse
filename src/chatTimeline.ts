import type { AiChatEvent, ChatMessage, ReviewSession } from "./types";

export function carryReviewChat(previous: ReviewSession | null, next: ReviewSession): ReviewSession {
  if (!previous || previous.repoPath !== next.repoPath || previous.mode !== "workingCopy" || next.mode !== "workingCopy" || previous.baseOid === next.baseOid) return next;
  return { ...next, chatMessages: previous.chatMessages, agentThreadId: previous.agentThreadId, chatAgent: previous.chatAgent, chatGoal: previous.chatGoal };
}

const assistantEntry = (body = ""): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  body,
  createdAt: new Date().toISOString(),
  selection: null,
  snapshotId: null,
  suggestions: [],
  contexts: [],
});

export function applyChatEvent(timeline: ChatMessage[], event: AiChatEvent): ChatMessage[] {
  const next = [...timeline];
  if (event.kind === "assistantMessageStarted") return [...next, assistantEntry()];
  if (event.kind === "assistantDelta") {
    const last = next[next.length - 1];
    if (last?.role === "assistant" && !last.appliedDiffs?.length) next[next.length - 1] = { ...last, body: `${last.body}${event.delta ?? ""}` };
    else next.push(assistantEntry(event.delta ?? ""));
  }
  if (event.kind === "assistantMessageCompleted") {
    const body = event.finalText?.trim();
    if (!body) return next;
    const last = next[next.length - 1];
    if (last?.role === "assistant" && !last.appliedDiffs?.length) next[next.length - 1] = { ...last, body };
    else next.push(assistantEntry(body));
  }
  if (event.kind === "fileChanged") {
    const changes = (event.changes ?? []).filter((change) => !next.some((entry) => entry.appliedDiffs?.some((known) => known.path === change.path && known.kind === change.kind && known.patch === change.patch)));
    if (changes.length) next.push({ ...assistantEntry(), appliedDiffs: changes });
  }
  return next;
}

export function persistedChatEntries(timeline: ChatMessage[]): ChatMessage[] {
  return timeline.filter((entry) => entry.body.trim() || entry.appliedDiffs?.length);
}

export function finalizePlanOutput(timeline: ChatMessage[]): { timeline: ChatMessage[]; isPlan: boolean } {
  const next = [...timeline];
  const index = [...next].map((entry, index) => [entry, index] as const).reverse().find(([entry]) => entry.role === "assistant" && entry.body.trim())?.[1];
  if (index === undefined) return { timeline: next, isPlan: false };
  const entry = next[index];
  const match = entry.body.trim().match(/^<proposed_plan>\s*([\s\S]+?)\s*<\/proposed_plan>$/);
  if (!match) return { timeline: next, isPlan: false };
  next[index] = { ...entry, body: match[1].trim(), final: true, plan: true, canImplementPlan: true };
  return { timeline: next, isPlan: true };
}
