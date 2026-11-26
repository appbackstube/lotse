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

type SteeredPlan = { body: string; hasLiveText: boolean; savedEntry?: ChatMessage };

function lastAssistantTextIndex(timeline: ChatMessage[]): number {
  for (let index = timeline.length - 1; index >= 0; index--) {
    if (timeline[index].role === "assistant" && timeline[index].body.trim()) return index;
  }
  return -1;
}

export class AssistantSteerBoundary {
  private streamedText = "";
  private savedPrefix = "";
  steeredPlan: SteeredPlan | undefined;

  markSteered(timeline: ChatMessage[]) {
    this.savedPrefix = this.streamedText;
    const entry = timeline[lastAssistantTextIndex(timeline)];
    if (!entry) return;
    const body = this.steeredPlan?.hasLiveText ? this.steeredPlan.body : entry.body.trim().match(proposedPlanPattern)?.[1].trim();
    if (body !== undefined) this.steeredPlan = { body, hasLiveText: false, savedEntry: entry };
  }

  update(event: AiChatEvent): AiChatEvent {
    if (event.kind === "assistantDelta" && event.delta) {
      this.streamedText += event.delta;
      if (event.delta.trim()) this.steeredPlan = undefined;
    }
    if (event.kind === "assistantMessageStarted" || event.kind === "assistantMessageCompleted") {
      const prefix = this.savedPrefix;
      const streamedSuffix = this.streamedText.slice(prefix.length);
      this.streamedText = "";
      this.savedPrefix = "";
      if (event.kind === "assistantMessageCompleted" && event.finalText?.trim()) {
        this.steeredPlan = undefined;
        if (prefix) {
          const fullText = event.finalText;
          const matchesPrefix = fullText.startsWith(prefix);
          const finalText = matchesPrefix ? fullText.slice(prefix.length) : fullText;
          const planBody = fullText.trim().match(proposedPlanPattern)?.[1];
          if (planBody !== undefined) {
            const body = matchesPrefix ? fullText.slice(Math.max(prefix.length, fullText.indexOf(">") + 1), fullText.lastIndexOf("</proposed_plan>")) : planBody;
            this.steeredPlan = { body: body.trim(), hasLiveText: !!(finalText.trim() || streamedSuffix.trim()) };
          }
          return { ...event, finalText };
        }
      }
    }
    return event;
  }
}

export function finalizePlanOutput(timeline: ChatMessage[], steeredPlan?: SteeredPlan): { timeline: ChatMessage[]; isPlan: boolean; savedPlan?: ChatMessage } {
  const next = [...timeline];
  const index = !steeredPlan || steeredPlan.hasLiveText ? lastAssistantTextIndex(next) : -1;
  const entry = next[index];
  const body = steeredPlan?.body ?? entry?.body.trim().match(proposedPlanPattern)?.[1].trim();
  if (body === undefined) return { timeline: next, isPlan: false };
  const planEntry = { ...(steeredPlan?.savedEntry ?? entry ?? assistantEntry()), body: body || "See the plan above.", final: true, plan: true, canImplementPlan: true };
  if (steeredPlan?.savedEntry) return { timeline: next, isPlan: true, savedPlan: planEntry };
  if (index < 0) next.push(planEntry); else next[index] = planEntry;
  return { timeline: next, isPlan: true };
}
