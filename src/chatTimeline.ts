import type { AiChatEvent, ChatMessage, ReviewSession } from "./types";

export function carryReviewChat(previous: ReviewSession | null, next: ReviewSession): ReviewSession {
  if (!previous || previous.repoPath !== next.repoPath || previous.mode !== "workingCopy" || next.mode !== "workingCopy" || previous.baseOid === next.baseOid) return next;
  return { ...next, chatMessages: previous.chatMessages, agentThreadId: previous.agentThreadId, chatAgent: previous.chatAgent, chatConfig: previous.chatConfig, chatGoal: previous.chatGoal };
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
  return timeline.filter((entry) => entry.body.trim() || entry.appliedDiffs?.length || entry.attachments?.length);
}

const proposedPlanPattern = /^<proposed_plan>\s*([\s\S]+?)\s*<\/proposed_plan>$/;

type SplitPlan = { body: string; hasLiveText: boolean };

export class AssistantSteerBoundary {
  private streamedText = "";
  private savedPrefix = "";
  splitPlan: SplitPlan | undefined;

  markSteered() {
    this.savedPrefix = this.streamedText;
    if (this.splitPlan) this.splitPlan = { body: "", hasLiveText: false };
  }

  update(event: AiChatEvent): AiChatEvent {
    if (event.kind === "assistantDelta" && event.delta) {
      this.streamedText += event.delta;
      if (event.delta.trim()) this.splitPlan = undefined;
    }
    if (event.kind === "assistantMessageStarted" || event.kind === "assistantMessageCompleted") {
      const prefix = this.savedPrefix;
      const streamedSuffix = this.streamedText.slice(prefix.length);
      this.streamedText = "";
      this.savedPrefix = "";
      if (event.kind === "assistantMessageCompleted" && event.finalText?.trim()) {
        this.splitPlan = undefined;
        if (prefix) {
          const fullText = event.finalText;
          const finalText = fullText.startsWith(prefix) ? fullText.slice(prefix.length) : undefined;
          if (proposedPlanPattern.test(fullText.trim())) {
            const body = finalText === undefined ? streamedSuffix.replace(/<\/proposed_plan>\s*$/, "")
              : fullText.slice(Math.max(prefix.length, fullText.indexOf(">") + 1), fullText.lastIndexOf("</proposed_plan>"));
            this.splitPlan = { body: body.trim(), hasLiveText: !!(finalText?.trim() || streamedSuffix.trim()) };
          }
          return { ...event, finalText };
        }
      }
    }
    return event;
  }
}

export function finalizePlanOutput(timeline: ChatMessage[], splitPlan?: SplitPlan): { timeline: ChatMessage[]; isPlan: boolean } {
  const next = [...timeline];
  let index = -1;
  if (!splitPlan || splitPlan.hasLiveText) {
    for (index = next.length - 1; index >= 0; index--) {
      if (next[index].role === "assistant" && next[index].body.trim()) break;
    }
  }
  const entry = next[index];
  const body = splitPlan?.body ?? entry?.body.trim().match(proposedPlanPattern)?.[1].trim();
  if (body === undefined) return { timeline: next, isPlan: false };
  const planEntry = { ...(entry ?? assistantEntry()), body: body || "See the plan above.", final: true, plan: true, canImplementPlan: true };
  if (index < 0) next.push(planEntry); else next[index] = planEntry;
  return { timeline: next, isPlan: true };
}
