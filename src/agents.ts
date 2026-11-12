export type ChatAgent = { id: string; title: string; prompt: string };
export const agentsStorageKey = "chaoticreview.agents";
export const defaultAgentStorageKey = "chaoticreview.default-agent";

export function normalizeAgent(value: unknown): ChatAgent | null {
  if (!value || typeof value !== "object") return null;
  const agent = value as Record<string, unknown>;
  if (typeof agent.id !== "string" || !agent.id || typeof agent.title !== "string" || !agent.title.trim() || agent.title.length > 200
    || typeof agent.prompt !== "string" || !agent.prompt.trim() || agent.prompt.length > 20_000) return null;
  return { id: agent.id, title: agent.title, prompt: agent.prompt };
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
  return { ...chat, chatAgent: agent, chatMessages: [], agentThreadId: null };
}
