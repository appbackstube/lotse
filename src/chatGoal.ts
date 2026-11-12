import type { ChatGoalSettings } from "./types";

export const defaultChatGoal: ChatGoalSettings = { enabled: false, tokenBudget: null };

export function normalizeChatGoal(value: unknown): ChatGoalSettings {
  const goal = value as Partial<ChatGoalSettings> | null;
  return {
    enabled: goal?.enabled === true,
    tokenBudget: typeof goal?.tokenBudget === "number" && Number.isSafeInteger(goal.tokenBudget) && goal.tokenBudget > 0 ? goal.tokenBudget : null,
  };
}
