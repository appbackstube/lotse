import type { ChatAgent } from "./agents.ts";
import { argumentsFor, requiredText } from "./taskControl.ts";
import { newPipeline, pipelineError, type Pipeline } from "./pipelines.ts";

export const pipelineToolKeys: Record<string, string[]> = {
  get_pipelines: ["query"], get_pipeline: ["pipelineId"],
  create_pipeline: ["title", "description", "steps"], update_pipeline: ["pipelineId", "title", "description", "steps"], delete_pipeline: ["pipelineId"],
  start_task_pipeline: ["taskId", "pipelineId"], get_task_pipeline_run: ["taskId", "runId"], stop_task_pipeline: ["taskId", "runId"],
};
export function getPipeline(pipelines: Pipeline[], id: unknown): Pipeline {
  const pipelineId = requiredText(id, "Pipeline ID");
  const pipeline = pipelines.find((entry) => entry.id === pipelineId);
  if (!pipeline) throw new Error("Pipeline not found. Read pipelines again.");
  return pipeline;
}
export function pipelineMetadata(original: Pipeline | null, value: unknown, agents: ChatAgent[]): Pipeline {
  const args = argumentsFor(value, original ? pipelineToolKeys.update_pipeline : pipelineToolKeys.create_pipeline);
  if (original && Object.keys(args).every((key) => key === "pipelineId")) throw new Error("Provide at least one pipeline change.");
  if (!original && !("steps" in args)) throw new Error("Steps are required.");
  const saved = { ...(original ?? newPipeline()), title: requiredText("title" in args ? args.title : original?.title, "Title", 200) };
  if ("description" in args) {
    if (typeof args.description !== "string" || args.description.length > 240) throw new Error("Description must be at most 240 characters.");
    saved.description = args.description;
  }
  if ("steps" in args) {
    if (!Array.isArray(args.steps) || !args.steps.length || args.steps.length > 50) throw new Error("Provide 1–50 steps.");
    saved.steps = args.steps.map((value) => {
      const step = argumentsFor(value, original ? ["id", "title", "agentId", "messages"] : ["title", "agentId", "messages"]);
      const id = "id" in step ? requiredText(step.id, "Step ID") : crypto.randomUUID();
      if ("id" in step && !original?.steps.some((entry) => entry.id === id)) throw new Error("Unknown step ID. Omit the ID for a new step.");
      if (step.agentId !== null && (typeof step.agentId !== "string" || !step.agentId.trim())) throw new Error("Step agentId must be a role ID or null.");
      if (!Array.isArray(step.messages) || !step.messages.length || step.messages.length > 50) throw new Error("Provide 1–50 messages per step.");
      return { id, title: requiredText(step.title, "Step title", 200), agentId: step.agentId as string | null,
        messages: step.messages.map((text) => requiredText(text, "Message", 20_000)) };
    });
    if (new Set(saved.steps.map((step) => step.id)).size !== saved.steps.length) throw new Error("Step IDs must be unique.");
  }
  const error = pipelineError(saved, agents);
  if (error) throw new Error(error);
  return saved;
}
