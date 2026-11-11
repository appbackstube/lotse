import type { AiChatMode } from "./types";

export type ChatModel = { model: string; displayName: string; supportedReasoningEfforts?: { reasoningEffort: string }[] };
export const chatEffortsLabel = (model: ChatModel) => (model.supportedReasoningEfforts?.length ? ` · ${model.supportedReasoningEfforts.map((effort) => effort.reasoningEffort).join("/")}` : "");

export const validChatModel = (model: unknown): model is string => typeof model === "string" && /^[a-zA-Z0-9._~:/-]{1,100}$/.test(model);

export const chatEfforts = ["low", "medium", "high", "xhigh"] as const;
export type ChatEffort = typeof chatEfforts[number];
export type ChatDefaults = Record<AiChatMode, { model: string; effort: ChatEffort }>;

export const defaultChatDefaults: ChatDefaults = {
  default: { model: "gpt-5.6-terra", effort: "medium" },
  plan: { model: "gpt-5.6-terra", effort: "medium" },
};

export const chatModelLabel = (model: string, models: ChatModel[]) => models.find((entry) => entry.model === model)?.displayName ?? model;

export function normalizeChatModelFavorites(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(validChatModel))] : [];
}

export function normalizeChatDefaults(value: unknown): ChatDefaults {
  const record = value && typeof value === "object" ? value as Partial<Record<AiChatMode, Record<string, unknown>>> : {};
  return Object.fromEntries((["default", "plan"] as const).map((mode) => {
    const entry = record[mode];
    const model = validChatModel(entry?.model) ? entry.model : defaultChatDefaults[mode].model;
    const effort = typeof entry?.effort === "string" && chatEfforts.some((value) => value === entry.effort) ? entry.effort as ChatEffort : defaultChatDefaults[mode].effort;
    return [mode, { model, effort }];
  })) as ChatDefaults;
}
