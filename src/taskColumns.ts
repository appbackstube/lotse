export type TaskColumnRatios = { tasks: number; changes: number };
export type TaskDivider = keyof TaskColumnRatios;

export const defaultTaskColumnRatios: TaskColumnRatios = { tasks: 1 / 4, changes: 1 / 3 };

export function taskColumnPixels(width: number, ratios: TaskColumnRatios) {
  const scale = Math.min(1, width / 840);
  const minimum = { tasks: 260 * scale, details: 260 * scale, agent: 320 * scale };
  const tasks = Math.min(Math.max(width * ratios.tasks, minimum.tasks), width - minimum.details - minimum.agent);
  const changes = Math.min(Math.max(width * ratios.changes, minimum.agent), width - tasks - minimum.details);
  return { tasks, changes };
}

export function resizeTaskColumn(width: number, ratios: TaskColumnRatios, divider: TaskDivider, pixels: number): TaskColumnRatios {
  const current = taskColumnPixels(width, ratios);
  const scale = Math.min(1, width / 840);
  if (divider === "tasks") {
    const tasks = Math.min(Math.max(pixels, 260 * scale), width - current.changes - 260 * scale);
    return { tasks: tasks / width, changes: current.changes / width };
  }
  const changes = Math.min(Math.max(pixels, 320 * scale), width - current.tasks - 260 * scale);
  return { tasks: current.tasks / width, changes: changes / width };
}
