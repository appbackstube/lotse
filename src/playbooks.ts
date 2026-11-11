export type PlaybookVariable = { id: string; name: string; label: string; type: "singleLine" | "multiLine" };

export type Playbook = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  variables: PlaybookVariable[];
};

export function normalizePlaybooks(value: unknown): Playbook[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Playbook[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.prompt !== "string") return [];
    const variables = Array.isArray(record.variables)
      ? record.variables.flatMap((variable): PlaybookVariable[] => {
          if (!variable || typeof variable !== "object") return [];
          const entry = variable as Record<string, unknown>;
          return typeof entry.id === "string" && typeof entry.name === "string" ? [{
            id: entry.id,
            name: entry.name,
            label: typeof entry.label === "string" ? entry.label : entry.name,
            type: entry.type === "singleLine" ? "singleLine" : "multiLine",
          }] : [];
        })
      : [];
    return [{
      id: record.id,
      title: record.title,
      description: typeof record.description === "string" ? record.description : "",
      prompt: record.prompt,
      variables,
    }];
  });
}

export function newPlaybook(): Playbook {
  return { id: crypto.randomUUID(), title: "Untitled playbook", description: "", prompt: "", variables: [] };
}

export function movePlaybook(playbooks: Playbook[], id: string, offset: -1 | 1): Playbook[] {
  const index = playbooks.findIndex((playbook) => playbook.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= playbooks.length) return playbooks;
  const next = [...playbooks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function playbookContent(playbook: Playbook) {
  return JSON.stringify(playbook);
}

export function renderPlaybookPrompt(playbook: Playbook, values: Record<string, string> = {}) {
  return playbook.prompt.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, (placeholder, name) => values[name] ?? placeholder);
}

export function preparePlaybookPrompt(playbook: Playbook, input: unknown = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Playbook values must be an object.");
  const values = input as Record<string, unknown>;
  const names = new Set(playbook.variables.map((variable) => variable.name));
  if (names.size !== playbook.variables.length || [...names].some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) throw new Error("Invalid playbook variable definitions. Edit the playbook first.");
  if (Object.keys(values).some((name) => !names.has(name))) throw new Error("Unknown playbook variable. Read the playbook again.");
  for (const variable of playbook.variables) {
    const value = Object.prototype.hasOwnProperty.call(values, variable.name) ? values[variable.name] : undefined;
    if (typeof value !== "string" || !value.trim()) throw new Error(`Missing playbook variable ${variable.name}: ${variable.label}. Ask the user for this value.`);
    if (value.length > 20_000 || (variable.type === "singleLine" && /[\r\n\u2028\u2029]/.test(value))) throw new Error(`Invalid value for playbook variable ${variable.name}.`);
  }
  for (const match of playbook.prompt.matchAll(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g)) {
    if (!names.has(match[1])) throw new Error(`Undefined playbook variable ${match[1]}. Edit the playbook first.`);
  }
  const prompt = renderPlaybookPrompt(playbook, values as Record<string, string>).trim();
  if (!prompt || prompt.length > 20_000) throw new Error("The rendered playbook prompt must be between 1 and 20,000 characters.");
  return { prompt, values: Object.fromEntries(playbook.variables.map(({ name }) => [name, values[name] as string])) };
}
