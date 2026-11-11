// Open /scripts/gantt-ui.html through Vite. Uses synthetic tasks only.
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { TaskGantt } from "../src/components/TaskGantt";
import { normalizeTask, taskColors } from "../src/tasks";
import type { TaskColor } from "../src/types";
import "../src/App.css";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
if (new URL(location.href).searchParams.get("theme") === "dark") {
  const style = document.createElement("style");
  style.textContent = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
    .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText.includes("prefers-color-scheme: dark"))
    .flatMap((rule) => [...rule.cssRules].map((child) => child.cssText)).join("\n");
  document.head.append(style);
}
const initialTasks = taskColors.map(({ value, label }) => normalizeTask({ id: value, title: `${label} task`, color: value, startDate: "2026-10-28", deadline: "2026-11-03" })!);
initialTasks.push(normalizeTask({ id: "unscheduled", title: "Unscheduled purple task", color: "purple" })!);
type AgentState = "working" | "waiting" | "unread" | null;
const labels = { working: "Agent working", waiting: "Agent awaiting input", unread: "New agent result" };
let changeColor: (color: TaskColor) => void;
let changeAgent: (state: AgentState) => void;
let changeCompleted: (completed: boolean) => void;
function Fixture() {
  const [tasks, setTasks] = useState(initialTasks);
  const [agents, setAgents] = useState<Record<string, AgentState>>({ red: "working", orange: "waiting", yellow: "unread", unscheduled: "waiting" });
  changeColor = (color) => setTasks((tasks) => tasks.map((task, index) => index === 1 ? { ...task, color } : task));
  changeAgent = (state) => setAgents((current) => ({ ...current, red: state }));
  changeCompleted = (completed) => setTasks((tasks) => tasks.map((task, index) => index === 1 ? { ...task, completed } : task));
  return <main className="ios-app" style={{ padding: 24, background: "var(--ios-background)", color: "var(--ios-label)" }}><div style={{ display: "flex", height: 520 }}><TaskGantt tasks={tasks} groups={[{ key: "inbox", label: "Inbox", status: "inbox", tasks }]} onOpenTask={() => {}} renderAgentStatus={(task) => {
    const state = agents[task.id];
    if (!state) return null;
    return <span role="img" aria-label={labels[state]} title={labels[state]} className={state === "working" ? undefined : `task-attention${state === "waiting" ? " task-attention-waiting" : ""}`}>{state === "working" ? <LoaderCircle size={13} className="animate-spin" /> : <CircleAlert size={13} />}</span>;
  }} renderTaskOptions={() => null} renderStatusOptions={() => null} /></div></main>;
}
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const bar = (label: string) => document.querySelector<HTMLButtonElement>(`.task-gantt-bar[aria-label^="${label} task:"]`)!;
const rgb = (hex: string) => `rgb(${hex.slice(1).match(/../g)!.map((part) => parseInt(part, 16)).join(", ")})`;
const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
try {
  await act(async () => (fixtureRoot = createRoot(document.getElementById("root")!)).render(<Fixture />));
  const agentInRow = (label: string) => document.querySelector(`[title="${label} task"] .task-gantt-agent-status`)!;
  for (const [label, state] of [["Red", "working"], ["Orange", "waiting"], ["Yellow", "unread"]] as const) {
    const rowIcon = agentInRow(label);
    const barIcon = bar(label).querySelector('.task-gantt-agent-status')!;
    check(rowIcon.querySelector(`[aria-label="${labels[state]}"]`) && barIcon.querySelector(`[aria-label="${labels[state]}"]`), `${label} agent state must appear in both the row and calendar bar`);
    const rowRect = rowIcon.getBoundingClientRect(), buttonRect = rowIcon.parentElement!.getBoundingClientRect();
    const barRect = barIcon.getBoundingClientRect(), barButtonRect = bar(label).getBoundingClientRect();
    check(Math.abs(rowRect.top + rowRect.height / 2 - buttonRect.top - buttonRect.height / 2) < 1, "Row indicators must be vertically centered");
    check(Math.abs(barRect.top + barRect.height / 2 - barButtonRect.top - barButtonRect.height / 2) < 1, "Calendar indicators must be vertically centered");
    check(rowRect.right <= rowIcon.nextElementSibling!.getBoundingClientRect().left && barRect.right <= barIcon.nextElementSibling!.getBoundingClientRect().left, "Agent indicators must precede the title");
    check(bar(label).getAttribute('aria-describedby') === barIcon.id, "Calendar bars must expose the agent indicator as an accessible description");
    check(getComputedStyle(barIcon.querySelector('svg')!).color === getComputedStyle(bar(label)).color, "Agent icons must use the readable bar foreground color");
    if (state !== "working") check(getComputedStyle(barIcon.firstElementChild!).backgroundColor === "rgba(0, 0, 0, 0)", "Calendar alerts must not carry a conflicting badge background");
  }
  check(document.querySelector('[title="Unscheduled purple task"] [aria-label="Agent awaiting input"]'), "Unscheduled tasks must show agent activity too");
  check(!document.querySelector('.task-gantt-task-status, .task-gantt-bar-status'), "Workflow status labels must not replace agent activity");
  for (const state of ["waiting", "unread", null, "working"] as const) {
    await act(async () => changeAgent(state));
    const rowIcon = agentInRow("Red"), barIcon = bar("Red").querySelector('.task-gantt-agent-status')!;
    check(state ? rowIcon.querySelector(`[aria-label="${labels[state]}"]`) && barIcon.querySelector(`[aria-label="${labels[state]}"]`) : !rowIcon.children.length && !barIcon.children.length, "Both agent indicators must update when activity changes");
    if (!state) {
      check(getComputedStyle(rowIcon).display === "none" && getComputedStyle(barIcon).display === "none", "Empty agent indicators must not reserve any space");
      const style = getComputedStyle(bar("Red"));
      const titleLeft = barIcon.nextElementSibling!.getBoundingClientRect().left;
      check(Math.abs(titleLeft - bar("Red").getBoundingClientRect().left - parseFloat(style.paddingLeft) - parseFloat(style.borderLeftWidth)) < 1, "A bar without an indicator must start its title at the normal inner padding");
    }
  }
  for (const { value, label, color } of taskColors) {
    if (value === "clear") continue;
    const style = getComputedStyle(bar(label));
    check(style.borderLeftColor === rgb(color) && style.borderLeftWidth === "3px", `${label} bar must show its task color only on the left border`);
    check(style.backgroundColor === getComputedStyle(bar("Clear")).backgroundColor && style.color === getComputedStyle(bar("Clear")).color, `${label} bar must keep the neutral theme fill and text color`);
    check(getComputedStyle(document.querySelector(`[title="${label} task"]`)!.parentElement!).borderLeftColor === rgb(color), `${label} label marker is missing`);
    const background = luminance(style.backgroundColor), foreground = luminance(style.color);
    check((Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05) >= 4.5, `${label} bar text lacks contrast`);
  }
  check(!bar("Clear").style.backgroundColor, "Clear tasks must use the theme default");
  check(getComputedStyle(document.querySelector('[title="Unscheduled purple task"]')!.parentElement!).borderLeftColor === rgb("#bf5af2"), "Unscheduled tasks must show their color");
  await act(async () => changeColor("blue"));
  check(getComputedStyle(bar("Red")).borderLeftColor === rgb("#0a84ff"), "Changing task color did not update its bar border");
  await act(async () => changeColor("clear"));
  check(getComputedStyle(bar("Red")).backgroundColor === getComputedStyle(bar("Clear")).backgroundColor, "Clearing task color did not restore the theme default");
  check(!bar("Red").style.borderLeft, "Clearing task color must remove the colored bar border");
  await act(async () => changeColor("red"));
  const activeColor = getComputedStyle(bar("Red")).backgroundColor;
  await act(async () => changeCompleted(true));
  const completedColor = getComputedStyle(bar("Red")).backgroundColor;
  check(completedColor !== activeColor && getComputedStyle(bar("Red")).opacity === "1", "Done bars must recede to gray while retaining readable content");
  check(getComputedStyle(bar("Red")).borderLeftColor === rgb(taskColors.find(({ value }) => value === "red")!.color), "Done tasks must retain their color only as a left border");
  check(bar("Red").querySelector('[aria-label="Agent working"]'), "Graying out a task must preserve its agent indicator");
  await act(async () => changeColor("clear"));
  check(getComputedStyle(bar("Red")).backgroundColor === completedColor, "Done styling must also gray out tasks without a custom color");
  await act(async () => changeCompleted(false));
  check(getComputedStyle(bar("Red")).backgroundColor === getComputedStyle(bar("Clear")).backgroundColor, "Reopening a task must restore its normal styling");
  await act(async () => { changeColor("red"); changeCompleted(true); changeAgent("unread"); });
  check(getComputedStyle(bar("Red").querySelector('svg')!).color === getComputedStyle(bar("Red")).color, "Completed bar alerts must use their readable foreground color too");
  document.getElementById("result")!.textContent = "PASS: task colors only on left borders, neutral bar fills, gray completed bars, color updates and clearing, readable agent indicators, live updates and text contrast.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`;
  console.error(error);
} finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
