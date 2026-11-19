import { useEffect, useState } from "react";
import { readUsage, summarizeUsage, usageStorageKey, type UsageCategory } from "../usage";

const categories: UsageCategory[] = ["Agents", "Playbooks", "Roles", "Models"];
const units: Record<UsageCategory, string> = { Agents: "agent runs", Playbooks: "playbook runs", Roles: "role selections", Models: "model runs" };

export function UsageSettings() {
  const [events, setEvents] = useState(readUsage);
  const [period, setPeriod] = useState("30");
  const [category, setCategory] = useState<UsageCategory>("Agents");
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === usageStorageKey) setEvents(readUsage()); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const since = period === "all" ? 0 : Date.now() - Number(period) * 24 * 60 * 60 * 1000;
  const summaries = Object.fromEntries(categories.map((name) => [name, summarizeUsage(events, name, since)])) as Record<UsageCategory, ReturnType<typeof summarizeUsage>>;
  return <section className="usage-settings" aria-label="Usage">
    <p className="usage-description">See how agents, playbooks, roles, and models are used.</p>
    <div className="usage-heading"><div><h3>Overview</h3><p>Activity in the selected period</p></div><label>Period <select value={period} onChange={(event) => setPeriod(event.currentTarget.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All time</option></select></label></div>
    <div className="usage-cards">{categories.map((name) => <div className="usage-card" key={name}><span>{name}</span><strong>{summaries[name].reduce((total, row) => total + row.count, 0)}</strong><small>{units[name]}</small></div>)}</div>
    <div className="usage-heading"><div><h3>Breakdown</h3><p>Explore activity by category</p></div></div>
    <div className="usage-tabs" aria-label="Usage category">{categories.map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
    <div className="usage-table" aria-live="polite">{summaries[category].length ? <table><thead><tr><th scope="col">{category === "Agents" ? "Agent" : category === "Playbooks" ? "Playbook" : category === "Roles" ? "Role" : "Model"}</th><th scope="col">Count</th><th scope="col">Last used</th></tr></thead><tbody>{summaries[category].map((row) => <tr key={row.id}><th scope="row">{row.title}</th><td>{row.count}</td><td>{new Date(row.lastUsed).toLocaleDateString()}</td></tr>)}</tbody></table> : <p className="usage-empty">No activity in this period.</p>}</div>
    <p className="usage-note">Tracking starts with this version; earlier activity is not included. Agent and model runs count accepted starts, not completed work. Roles count changes made in the chat agent picker. Categories overlap and should not be added together.</p>
  </section>;
}
