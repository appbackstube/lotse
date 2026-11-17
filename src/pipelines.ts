import { normalizeAgent, type ChatAgent } from "./agents.ts";
import { fileStore } from "./fileStore.ts";
import type { QueuedChatMessage } from "./chatQueue.ts";
import type { ChatMessage, RepositoryTask } from "./types.ts";

export type PipelineStep = { id: string; title: string; agentId: string | null; messages: string[] };
export type Pipeline = { id: string; title: string; description: string; steps: PipelineStep[] };
export type PipelineMessage = {
  runId: string; title: string; stepTitle: string; stepIndex: number; stepCount: number;
  position: number; total: number; agent: ChatAgent | null;
};
export const pipelinesStorageKey = "chaoticreview.pipelines";

export function normalizePipelines(value: unknown): Pipeline[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item): Pipeline[] => {
    if (!item || typeof item !== "object") return [];
    const p = item as Pipeline;
    if (typeof p.id !== "string" || !p.id || ids.has(p.id) || typeof p.title !== "string" || p.title.length > 200
      || typeof p.description !== "string" || p.description.length > 240 || !Array.isArray(p.steps) || !p.steps.length || p.steps.length > 50) return [];
    const stepIds = new Set<string>();
    for (const step of p.steps) {
      if (!step || typeof step.id !== "string" || !step.id || stepIds.has(step.id) || typeof step.title !== "string" || step.title.length > 200
        || (step.agentId !== null && (typeof step.agentId !== "string" || !step.agentId)) || !Array.isArray(step.messages) || !step.messages.length || step.messages.length > 50
        || step.messages.some((text) => typeof text !== "string" || text.length > 20_000)) return [];
      stepIds.add(step.id);
    }
    ids.add(p.id);
    return [{ id: p.id, title: p.title, description: p.description, steps: p.steps.map((s) => ({ id: s.id, title: s.title, agentId: s.agentId, messages: [...s.messages] })) }];
  });
}

export function loadPipelines(): Pipeline[] {
  try { return normalizePipelines(JSON.parse(fileStore.getItem(pipelinesStorageKey) ?? "[]")); }
  catch { return []; }
}

export function newPipelineStep(): PipelineStep {
  return { id: crypto.randomUUID(), title: "New step", agentId: null, messages: [""] };
}
export function newPipeline(): Pipeline {
  return { id: crypto.randomUUID(), title: "Untitled pipeline", description: "", steps: [newPipelineStep()] };
}

export function validPipelineMessage(value: unknown): value is PipelineMessage {
  if (!value || typeof value !== "object") return false;
  const p = value as PipelineMessage;
  return typeof p.runId === "string" && !!p.runId && typeof p.title === "string" && !!p.title.trim()
    && typeof p.stepTitle === "string" && !!p.stepTitle.trim() && Number.isInteger(p.stepCount) && p.stepCount > 0 && p.stepCount <= 50
    && Number.isInteger(p.stepIndex) && p.stepIndex >= 0 && p.stepIndex < p.stepCount
    && Number.isInteger(p.total) && p.total > 0 && p.total <= 2500 && Number.isInteger(p.position) && p.position >= 0 && p.position < p.total
    && (p.agent === null || normalizeAgent(p.agent) !== null);
}

export function pipelineError(pipeline: Pipeline, agents: ChatAgent[]): string | null {
  if (!normalizePipelines([pipeline]).length || !pipeline.title.trim() || pipeline.steps.some((s) => !s.title.trim() || s.messages.some((m) => !m.trim()))) return "Add a title and at least one message to every step.";
  if (pipeline.steps.some((s) => s.agentId !== null && !agents.some((a) => a.id === s.agentId))) return "A selected role no longer exists. Choose another role.";
  return null;
}

export function pipelineQueue(pipeline: Pipeline, agents: ChatAgent[], task: RepositoryTask): QueuedChatMessage[] {
  const error = pipelineError(pipeline, agents);
  if (error) throw new Error(error);
  const runId = crypto.randomUUID();
  const total = pipeline.steps.reduce((count, step) => count + step.messages.length, 0);
  let position = 0;
  let currentAgent = task.chatAgent ?? null;
  let configuration = { model: task.chatModel, effort: task.chatEffort };
  return pipeline.steps.flatMap((step, stepIndex) => {
    const agent = step.agentId === null ? null : agents.find((agent) => agent.id === step.agentId);
    if (agent === undefined) throw new Error(`The role for “${step.title}” no longer exists. Edit the pipeline first.`);
    if (JSON.stringify(agent) !== JSON.stringify(currentAgent) && agent?.modelConfig) configuration = { ...agent.modelConfig };
    currentAgent = agent;
    return step.messages.map((body) => ({
      id: crypto.randomUUID(), body: body.trim(), context: { mode: "auto" as const, attachments: [] }, selection: null,
      mode: "default" as const, ...configuration,
      pipeline: { runId, title: pipeline.title, stepTitle: step.title, stepIndex, stepCount: pipeline.steps.length, position: position++, total, agent: agent ? { ...agent } : null },
    }));
  });
}

// Only a role change needs a new thread. Keep the visible conversation intact.
export function pipelineTurn(task: RepositoryTask, item: QueuedChatMessage): { agent: ChatAgent | null; threadId: string | null; prompt: string } {
  const agent = item.pipeline ? item.pipeline.agent : task.chatAgent ?? null;
  const changed = !!item.pipeline && JSON.stringify(agent) !== JSON.stringify(task.chatAgent ?? null);
  const history = changed ? pipelineHandoff(task.chatMessages) : "";
  return { agent, threadId: changed ? null : task.agentThreadId, prompt: history ? `${item.body}\n\nPrevious task conversation (handoff context):\n${history}` : item.body };
}

function pipelineHandoff(messages: ChatMessage[]): string {
  return messages.filter((m) => (m.role === "assistant" || m.role === "user") && m.body.trim()).slice(-16)
    .map((m) => `${m.role}: ${m.body}`).join("\n\n").slice(-32_000);
}
