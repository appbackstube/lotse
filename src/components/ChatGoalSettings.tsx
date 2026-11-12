import { useState } from "react";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./ui/popover";
import type { ChatGoalSettings as GoalSettings } from "../types";

export function ChatGoalSettings({ value, disabled, onChange }: { value: GoalSettings; disabled: boolean; onChange: (value: GoalSettings) => void }) {
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState(String(value.tokenBudget ?? 50_000));
  const valid = Number.isSafeInteger(Number(budget)) && Number(budget) > 0;
  const saveBudget = () => {
    if (valid) onChange({ ...value, tokenBudget: Number(budget) });
    else setBudget(String(value.tokenBudget ?? 50_000));
  };
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setBudget(String(value.tokenBudget ?? 50_000)); }}>
    <PopoverTrigger className="ios-chat-plan-toggle" aria-label="Goal settings" aria-pressed="true" disabled={disabled}>Goal <span>On</span></PopoverTrigger>
    <PopoverContent side="top" align="start" className="ios-chat-config-popover ios-chat-goal-popover">
      <PopoverTitle className="ios-chat-goal-heading">Goal settings</PopoverTitle>
      <button type="button" role="switch" aria-checked={value.tokenBudget !== null} className="ios-chat-goal-option" onClick={() => { const tokenBudget = value.tokenBudget === null ? 50_000 : null; setBudget(String(tokenBudget ?? 50_000)); onChange({ ...value, tokenBudget }); }}>
        <span>Limit token usage</span><span>{value.tokenBudget === null ? "Off" : "On"}</span>
      </button>
      {value.tokenBudget !== null && <div className="ios-chat-goal-budget">
        <input type="number" min={1} step={1} aria-label="Token budget" aria-invalid={!valid} value={budget} onChange={(event) => setBudget(event.currentTarget.value)} onBlur={saveBudget} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (valid) saveBudget(); } }} />
        <span>tokens</span>
      </div>}
      <button type="button" className="ios-chat-goal-option" onClick={() => { onChange({ ...value, enabled: false }); setOpen(false); }}>Turn off Goal</button>
    </PopoverContent>
  </Popover>;
}
