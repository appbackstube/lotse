import type { AiChatEvent, AiChatMode, ChatMessage, ReviewSession } from "./types";

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

export type ChatTimelineEvent = AiChatEvent & { discardAssistantDraft?: true };

export function applyChatEvent(timeline: ChatMessage[], event: ChatTimelineEvent): ChatMessage[] {
  if (event.kind === "assistantMessageCompleted" && event.discardAssistantDraft) {
    return timeline.filter((entry) => entry.role !== "assistant" || entry.appliedDiffs?.length);
  }
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
  private completedText = "";
  private savedPrefix = "";
  private hasSteered = false;
  steeredPlan: SteeredPlan | undefined;

  getSteeredResponse(mode: AiChatMode): string | undefined {
    if (!this.hasSteered) return undefined;
    const text = this.streamedText.trim() || this.completedText;
    return mode === "plan" ? text.match(proposedPlanPattern)?.[1].trim() ?? text : text;
  }

  markSteered(timeline: ChatMessage[]) {
    this.hasSteered = true;
    this.savedPrefix = this.streamedText;
    const entry = timeline[lastAssistantTextIndex(timeline)];
    if (!entry) return;
    const body = this.steeredPlan?.hasLiveText ? this.steeredPlan.body : entry.body.trim().match(proposedPlanPattern)?.[1].trim();
    if (body !== undefined) this.steeredPlan = { body, hasLiveText: false, savedEntry: entry };
  }

  update(event: AiChatEvent): ChatTimelineEvent {
    if (event.kind === "assistantDelta" && event.delta) {
      this.streamedText += event.delta;
      if (event.delta.trim()) this.steeredPlan = undefined;
    }
    if (event.kind === "assistantMessageStarted" || event.kind === "assistantMessageCompleted") {
      const prefix = this.savedPrefix;
      this.completedText = event.kind === "assistantMessageStarted" ? "" : event.finalText?.trim() || this.streamedText.trim() || this.completedText;
      this.streamedText = "";
      this.savedPrefix = "";
      if (event.kind === "assistantMessageCompleted" && event.finalText?.trim()) {
        this.steeredPlan = undefined;
        if (prefix) {
          const fullText = event.finalText;
          const matchesPrefix = fullText.startsWith(prefix);
          const finalText = matchesPrefix ? fullText.slice(prefix.length) : fullText;
          const hasLiveText = !!finalText.trim();
          const planBody = fullText.trim().match(proposedPlanPattern)?.[1];
          if (planBody !== undefined) {
            const body = matchesPrefix ? fullText.slice(Math.max(prefix.length, fullText.indexOf(">") + 1), fullText.lastIndexOf("</proposed_plan>")) : planBody;
            this.steeredPlan = { body: body.trim(), hasLiveText };
          }
          return hasLiveText ? { ...event, finalText } : { ...event, finalText, discardAssistantDraft: true };
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
