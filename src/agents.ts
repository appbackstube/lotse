import { chatEfforts, validChatModel, type ChatEffort } from "./chatDefaults.ts";

export type AgentModelConfig = { model: string; effort: ChatEffort };
export type ApprovalReviewer = "user" | "auto_review" | "yolo";
export type ChatAgent = { id: string; title: string; prompt: string; modelConfig?: AgentModelConfig; approvalMode?: ApprovalReviewer };
export type ApprovalOverride = { agent: ChatAgent | null; mode: ApprovalReviewer };
export const approvalReviewerLabels = { user: "Ask for approval", auto_review: "Approve for me", yolo: "YOLO mode" };

export function approvalForAgent(agent: ChatAgent | null | undefined, override: ApprovalOverride | undefined, fallback: ApprovalReviewer, pipeline = false): ApprovalReviewer {
  if (pipeline && agent?.approvalMode) return agent.approvalMode;
  return (override && JSON.stringify(override.agent) === JSON.stringify(agent ?? null) ? override.mode : undefined) ?? agent?.approvalMode ?? fallback;
}
export const agentsStorageKey = "chaoticreview.agents";
export const defaultAgentStorageKey = "chaoticreview.default-agent";

export function normalizeAgent(value: unknown): ChatAgent | null {
  if (!value || typeof value !== "object") return null;
  const agent = value as Record<string, unknown>;
  if (typeof agent.id !== "string" || !agent.id || typeof agent.title !== "string" || !agent.title.trim() || agent.title.length > 200
    || typeof agent.prompt !== "string" || !agent.prompt.trim() || agent.prompt.length > 20_000) return null;
  const modelConfig = agent.modelConfig;
  if (agent.approvalMode != null && agent.approvalMode !== "user" && agent.approvalMode !== "auto_review" && agent.approvalMode !== "yolo") return null;
  const approval = agent.approvalMode == null ? {} : { approvalMode: agent.approvalMode as ApprovalReviewer };
  if (modelConfig !== undefined && modelConfig !== null) {
    if (typeof modelConfig !== "object" || Array.isArray(modelConfig)) return null;
    const config = modelConfig as Record<string, unknown>;
    if (!validChatModel(config.model) || !chatEfforts.some((effort) => effort === config.effort)) return null;
    return { id: agent.id, title: agent.title, prompt: agent.prompt, modelConfig: { model: config.model, effort: config.effort as ChatEffort }, ...approval };
  }
  return { id: agent.id, title: agent.title, prompt: agent.prompt, ...approval };
}

export function normalizeAgents(value: unknown): ChatAgent[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((value) => {
    const agent = normalizeAgent(value);
    if (!agent || ids.has(agent.id)) return [];
    ids.add(agent.id);
    return [agent];
  });
}

export function newAgent(): ChatAgent {
  return { id: crypto.randomUUID(), title: "Untitled agent", prompt: "" };
}

export function switchChatAgent<T extends { chatMessages: unknown[]; agentThreadId: string | null }>(chat: T, agent: ChatAgent | null) {
  return { ...chat, chatAgent: agent, chatMessages: [], agentThreadId: null, ...agentChatConfig(agent) };
}

export function agentChatConfig(agent: ChatAgent | null | undefined) {
  return agent?.modelConfig ? { chatModel: agent.modelConfig.model, chatEffort: agent.modelConfig.effort } : {};
}
