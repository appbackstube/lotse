import { normalizeAgent } from "./agents.ts";
import type { ChatAttachment, RepositoryTask, TaskAsset, TaskColor, TaskComment, TaskCustomField } from "./types";
import { chatEfforts, validChatModel, defaultChatDefaults, type ChatDefaults } from "./chatDefaults.ts";
import { fileStore } from "./fileStore.ts";
import { normalizeTaskDate } from "./taskSchedule.ts";
import { normalizeChatGoal } from "./chatGoal.ts";
import { normalizeGitHubLink } from "./github.ts";
import { validSandboxHtml } from "./taskSandbox.ts";

export const taskStoragePrefix = "chaoticreview.repository-tasks:";
export const taskStorageKey = (rootPath: string) => `${taskStoragePrefix}${rootPath}`;
export const customFieldsStorageKey = "chaoticreview.task-custom-fields";
const collapsedStorageKey = "chaoticreview.collapsed-tasks";
const locationStorageKey = "chaoticreview.task-location-default";
const openNewTaskInDrawerStorageKey = "chaoticreview.open-new-task-in-drawer";
const closeKanbanModalOnOutsideClickStorageKey = "chaoticreview.close-kanban-modal-on-outside-click";
const taskViewStorageKey = "chaoticreview.task-view";
export type TaskView = "list" | "kanban" | "gantt";
export type TaskBoardStatus = "inbox" | "clear" | "inProgress" | "inReview" | "done";
export type TaskDropPosition = "before" | "inside" | "after";

export function loadTaskCustomFields(): TaskCustomField[] {
  try {
    const value: unknown = JSON.parse(fileStore.getItem(customFieldsStorageKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    const ids = new Set<string>();
    return value.flatMap((item): TaskCustomField[] => {
      if (!item || typeof item !== "object") return [];
      const field = item as Partial<TaskCustomField>;
      if (typeof field.id !== "string" || !field.id || ids.has(field.id) || typeof field.name !== "string" || !field.name.trim() || (field.type !== "text" && field.type !== "select")) return [];
      ids.add(field.id);
      const optionIds = new Set<string>();
      const options = Array.isArray(field.options) ? field.options.flatMap((option): TaskCustomField["options"] => {
        if (!option || typeof option.id !== "string" || !option.id || optionIds.has(option.id) || typeof option.label !== "string" || !option.label.trim()) return [];
        optionIds.add(option.id);
        return [{ id: option.id, label: option.label }];
      }) : [];
      const multiline = field.type === "text" && field.multiline !== false;
      return [{ id: field.id, name: field.name, type: field.type, options, showOnCards: field.showOnCards === true, multiline, hyperlink: field.type === "text" && !multiline && field.hyperlink === true }];
    });
  } catch { return []; }
}

export function saveTaskCustomFields(fields: TaskCustomField[]) {
  fileStore.setItem(customFieldsStorageKey, JSON.stringify(fields));
}

export function taskCustomFieldUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

export function moveTaskCustomField(fields: TaskCustomField[], id: string, offset: -1 | 1): TaskCustomField[] {
  const index = fields.findIndex((field) => field.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= fields.length) return fields;
  const reordered = [...fields];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}

export function hasTaskCustomFieldLineBreaks(fieldId: string): boolean {
  return fileStore.keys().filter((key) => key.startsWith(taskStoragePrefix)).some((key) => {
    const tasks: unknown = JSON.parse(fileStore.getItem(key) ?? "[]");
    if (!Array.isArray(tasks)) throw new Error("Task storage is invalid.");
    return tasks.some((task) => {
      const value = task && typeof task === "object" ? (task as Partial<RepositoryTask>).customFields?.[fieldId] : undefined;
      return typeof value === "string" && /[\r\n\u2028\u2029]/.test(value);
    });
  });
}

export function removeTaskCustomFieldValues(fieldId: string, optionId?: string): void {
    const entries = fileStore.keys().filter((key) => key.startsWith(taskStoragePrefix)).map((key) => {
      const value: unknown = JSON.parse(fileStore.getItem(key) ?? "[]");
      if (!Array.isArray(value)) throw new Error(`Task storage is invalid for ${key}.`);
      return [key, value] as const;
    });
    for (const [key, value] of entries) {
      const next = value.map((task) => {
        if (!task || typeof task !== "object") return task;
        const fields = (task as RepositoryTask).customFields;
        if (!fields || typeof fields !== "object" || !Object.prototype.hasOwnProperty.call(fields, fieldId) || (optionId !== undefined && fields[fieldId] !== optionId)) return task;
        const customFields = { ...fields };
        delete customFields[fieldId];
        return { ...task, customFields, updatedAt: Math.max(Date.now(), (task as RepositoryTask).updatedAt ?? 0) };
      });
      fileStore.setJSON(key, next);
    }
}
export const taskColors: { value: TaskColor; label: string; color: string }[] = [
  { value: "clear", label: "Clear", color: "transparent" },
  { value: "red", label: "Red", color: "#ff453a" },
  { value: "orange", label: "Orange", color: "#ff9f0a" },
  { value: "yellow", label: "Yellow", color: "#ffd60a" },
  { value: "green", label: "Green", color: "#30d158" },
  { value: "blue", label: "Blue", color: "#0a84ff" },
  { value: "purple", label: "Purple", color: "#bf5af2" },
];
const validTaskColors = new Set(taskColors.map((item) => item.value));

export function toggleTaskCommentCheckbox(body: string, offset: number): string {
  if (!Number.isInteger(offset) || offset < 0) return body;
  const marker = /^(?:[-+*]|\d+[.)])[ \t]+\[([ xX])\]/.exec(body.slice(offset));
  if (!marker) return body;
  const checkOffset = offset + marker[0].length - 2;
  return body.slice(0, checkOffset) + (marker[1] === " " ? "x" : " ") + body.slice(checkOffset + 1);
}

export type TaskLocation = RepositoryTask["location"] | "existing";

export const branchPrefixStorageKey = (root: string) => `chaoticreview.branch-prefix:${root}`;

export function loadBranchPrefix(root: string): string {
  return fileStore.getItem(branchPrefixStorageKey(root)) ?? "feature/";
}

export function saveBranchPrefix(root: string, prefix: string) {
  fileStore.setItem(branchPrefixStorageKey(root), prefix);
}

export function taskNewBranchName(task: RepositoryTask, prefix: string, automatic = false): string {
  const slug = task.title.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = task.newBranchName ?? `${prefix}${slug}`;
  return automatic && (!name || name === prefix || name.endsWith("/")) ? `${name || prefix}${task.id}` : name;
}

export function loadTaskLocationDefault(): TaskLocation {
  const location = fileStore.getItem(locationStorageKey);
  return location === "workspace" || location === "existing" ? location : "worktree";
}

export function saveTaskLocationDefault(location: TaskLocation) {
  fileStore.setItem(locationStorageKey, location);
}

export function taskLocationFields(location: TaskLocation): Pick<RepositoryTask, "location" | "worktreeStart"> {
  return {
    location: location === "existing" ? "worktree" : location,
    worktreeStart: location === "existing" ? { kind: "existing", branch: "" } : null,
  };
}

export function loadOpenNewTaskInDrawer(): boolean {
  return fileStore.getItem(openNewTaskInDrawerStorageKey) !== "false";
}

export function saveOpenNewTaskInDrawer(enabled: boolean) {
  fileStore.setItem(openNewTaskInDrawerStorageKey, String(enabled));
}

export function loadCloseKanbanModalOnOutsideClick(): boolean {
  return fileStore.getItem(closeKanbanModalOnOutsideClickStorageKey) !== "false";
}

export function saveCloseKanbanModalOnOutsideClick(enabled: boolean) {
  fileStore.setItem(closeKanbanModalOnOutsideClickStorageKey, String(enabled));
}

export function loadTaskView(rootPath: string): TaskView {
  try {
    const stored = JSON.parse(fileStore.getItem(taskViewStorageKey) ?? "{}");
    const view = stored?.[rootPath];
    return view === "kanban" || view === "gantt" ? view : "list";
  } catch { return "list"; }
}

export function saveTaskView(rootPath: string, view: TaskView) {
  try {
    const stored = JSON.parse(fileStore.getItem(taskViewStorageKey) ?? "{}");
    fileStore.setItem(taskViewStorageKey, JSON.stringify({ ...(stored && typeof stored === "object" ? stored : {}), [rootPath]: view }));
  } catch { fileStore.setItem(taskViewStorageKey, JSON.stringify({ [rootPath]: view })); }
}

export function taskBoardStatus(task: RepositoryTask): TaskBoardStatus {
  return task.completed ? "done" : task.manualStatus ?? "clear";
}

export function moveTaskWithinStatus(tasks: RepositoryTask[], taskId: string, targetId: string, position: "before" | "after"): RepositoryTask[] {
  const task = tasks.find((item) => item.id === taskId);
  const target = tasks.find((item) => item.id === targetId);
  if (!task || !target || taskId === targetId || task.parentId !== target.parentId) return tasks;
  const movingIds = descendants(tasks, taskId);
  if (movingIds.has(targetId)) return tasks;
  const moving = tasks.filter((item) => movingIds.has(item.id));
  const remaining = tasks.filter((item) => !movingIds.has(item.id));
  const targetTree = descendants(remaining, targetId);
  const insertion = position === "before" ? remaining.findIndex((item) => item.id === targetId) : remaining.reduce((last, item, index) => targetTree.has(item.id) ? index : last, -1) + 1;
  return [...remaining.slice(0, insertion), ...moving, ...remaining.slice(insertion)];
}

export function taskStartEditable(task: RepositoryTask | null, starting: boolean) {
  return !!task && !task.started && !starting;
}

export function taskStartSelected(start: RepositoryTask["worktreeStart"] | undefined) {
  return !!start && (start.kind === "workspace" || !!start.branch);
}

export function taskAssetAttachments(task: RepositoryTask, selectedIds: string[]): ChatAttachment[] {
  const selected = new Set(selectedIds);
  return task.assets.filter((asset) => selected.has(asset.id)).map((asset) => ({ kind: "taskAsset", id: asset.id, name: asset.name, image: asset.image }));
}

function taskAttachments(value: unknown): ChatAttachment[] {
  return Array.isArray(value) ? value.filter((item): item is Extract<ChatAttachment, { kind: "image" | "localFile" }> => !!item && typeof item === "object" && ((item as { kind?: unknown }).kind === "image" || (item as { kind?: unknown }).kind === "localFile") && typeof (item as { path?: unknown }).path === "string" && typeof (item as { name?: unknown }).name === "string") : [];
}

function taskAssets(value: unknown): TaskAsset[] {
  return Array.isArray(value) ? value.filter((item): item is TaskAsset => !!item && typeof item === "object" && typeof item.id === "string" && item.id.length <= 100 && /^agent-[a-zA-Z0-9.-]+$/.test(item.id) && typeof item.name === "string" && !!item.name && item.name.length <= 160 && typeof item.image === "boolean") : [];
}

function taskComments(value: unknown): TaskComment[] {
  return Array.isArray(value) ? value.filter((item): item is TaskComment => !!item && typeof item === "object" && typeof item.id === "string" && !!item.id && item.id.length <= 100 && (item.author === "user" || item.author === "agent") && typeof item.body === "string" && !!item.body.trim() && item.body.length <= 5_000 && typeof item.createdAt === "number" && Number.isFinite(item.createdAt) && item.createdAt >= 0) : [];
}

function descendants(tasks: RepositoryTask[], id: string) {
  return taskSubtreeIds(tasks, [id]);
}

export function taskSubtreeIds(tasks: RepositoryTask[], taskIds: Iterable<string>) {
  const children = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const siblings = children.get(task.parentId) ?? [];
    siblings.push(task.id); children.set(task.parentId, siblings);
  }
  const ids = new Set(taskIds);
  for (const id of ids) for (const child of children.get(id) ?? []) ids.add(child);
  return ids;
}

export function reparentTask(tasks: RepositoryTask[], taskId: string, parentId: string | null): RepositoryTask[] {
  const task = tasks.find((item) => item.id === taskId);
  if (!task || task.parentId === parentId) return tasks;
  const parent = parentId ? tasks.find((item) => item.id === parentId) : null;
  if (parentId && (!parent || descendants(tasks, taskId).has(parentId))) return tasks;
  return moveTask(tasks, taskId, parentId, parent ? "inside" : "after");
}

export function moveTaskToBoardIndex(tasks: RepositoryTask[], taskId: string, column: { status: TaskBoardStatus }, index: number): RepositoryTask[] {
  const movingIds = descendants(tasks, taskId);
  const remaining = tasks.filter((task) => !movingIds.has(task.id) && taskBoardStatus(task) === column.status);
  const target = remaining[index] ?? remaining[remaining.length - 1];
  const position = index >= remaining.length ? "after" : "before";
  return target ? moveTaskWithinStatus(tasks, taskId, target.id, position) : tasks;
}

export function mergeMcpTaskUpdates(tasks: RepositoryTask[], updates: (Pick<RepositoryTask, "id" | "title" | "parentId" | "color" | "manualStatus" | "completed" | "planReady"> & Partial<Pick<RepositoryTask, "createdAt" | "updatedAt">>)[], fieldChanges?: { taskId: string; values: Record<string, string | null> }, descriptionChange?: { taskId: string; description: string }): RepositoryTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const updatedIds = new Set(updates.map((task) => task.id));
  return [
    ...updates.flatMap((update) => {
      const previous = byId.get(update.id);
      if (!previous) return [];
      const customFields = { ...previous.customFields };
      if (fieldChanges?.taskId === update.id) for (const [id, value] of Object.entries(fieldChanges.values)) {
        if (value === null) delete customFields[id];
        else customFields[id] = value;
      }
      return [{ ...previous, ...update, customFields, description: descriptionChange?.taskId === update.id ? descriptionChange.description : previous.description }];
    }),
    ...tasks.filter((task) => !updatedIds.has(task.id)),
  ];
}

export function filterVisibleTasks(tasks: RepositoryTask[], collapsedIds: ReadonlySet<string>) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) => {
    const seen = new Set<string>();
    let parentId = task.parentId;
    while (parentId && !seen.has(parentId)) {
      if (byId.has(parentId) && collapsedIds.has(parentId)) return false;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}

export function moveTask(tasks: RepositoryTask[], taskId: string, targetId: string | null, position: TaskDropPosition): RepositoryTask[] {
  if (taskId === targetId || !tasks.some((task) => task.id === taskId) || (targetId !== null && !tasks.some((task) => task.id === targetId))) return tasks;
  const movingIds = descendants(tasks, taskId);
  const moving = tasks.filter((task) => movingIds.has(task.id));
  const remaining = tasks.filter((task) => !movingIds.has(task.id));
  if (targetId === null) return [...remaining, ...moving.map((task) => task.id === taskId ? { ...task, parentId: null } : task)];
  if (movingIds.has(targetId)) return tasks;
  const targetIndex = remaining.findIndex((task) => task.id === targetId);
  const target = remaining[targetIndex];
  const targetTree = descendants(remaining, targetId);
  const index = position === "before" ? targetIndex : position === "inside" ? targetIndex + targetTree.size : targetIndex + targetTree.size;
  const parentId = position === "inside" ? target.id : target.parentId;
  const moved = moving.map((task) => task.id === taskId ? { ...task, parentId } : task);
  return [...remaining.slice(0, index), ...moved, ...remaining.slice(index)];
}

export function moveTaskProjected(tasks: RepositoryTask[], taskId: string, overIndex: number, horizontalOffset: number, indentationWidth = 28): RepositoryTask[] {
  const overId = tasks[overIndex]?.id;
  if (!overId) return tasks;
  const movingIds = descendants(tasks, taskId);
  if (overId !== taskId && movingIds.has(overId)) return tasks;
  const moving = tasks.filter((task) => movingIds.has(task.id));
  const visible = tasks.filter((task) => task.id === taskId || !movingIds.has(task.id));
  const activeIndex = visible.findIndex((task) => task.id === taskId);
  const visibleOverIndex = visible.findIndex((task) => task.id === overId);
  if (activeIndex < 0 || visibleOverIndex < 0) return tasks;
  const reordered = [...visible];
  const [active] = reordered.splice(activeIndex, 1);
  reordered.splice(visibleOverIndex, 0, active);
  const previous = reordered[visibleOverIndex - 1];
  const next = reordered[visibleOverIndex + 1];
  const depthOf = (task: RepositoryTask | undefined) => task ? taskDepth(task, tasks) : 0;
  const depth = Math.max(depthOf(next), Math.min(depthOf(previous) + (previous ? 1 : 0), taskDepth(active, tasks) + Math.round(horizontalOffset / indentationWidth)));
  const parentId = depth === 0 ? null : depth > depthOf(previous) ? previous.id : depth === depthOf(previous) ? previous.parentId : reordered.slice(0, visibleOverIndex).reverse().find((task) => depthOf(task) === depth)?.parentId ?? null;
  const moved = moving.map((task) => task.id === taskId ? { ...task, parentId } : task);
  return reordered.flatMap((task) => task.id === taskId ? moved : [task]);
}

export function taskDepth(task: RepositoryTask, tasks: RepositoryTask[]) {
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const seen = new Set<string>();
  let depth = 0;
  let parentId = task.parentId;
  while (parentId && !seen.has(parentId)) { seen.add(parentId); depth++; parentId = byId.get(parentId)?.parentId ?? null; }
  return depth;
}

export function taskListMetadata(tasks: RepositoryTask[], groups: { tasks: RepositoryTask[] }[], collapsedIds: ReadonlySet<string>) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const parents = new Set(tasks.flatMap((task) => task.parentId ? [task.parentId] : []));
  const ancestors = new Map<string, string[]>();
  for (const task of tasks) {
    const seen = new Set<string>();
    let parentId = task.parentId;
    while (parentId && !seen.has(parentId)) { seen.add(parentId); parentId = byId.get(parentId)?.parentId ?? null; }
    ancestors.set(task.id, [...seen]);
  }
  const depths = new Map(tasks.map((task) => [task.id, ancestors.get(task.id)!.length]));
  const closingParents = new Map<string, RepositoryTask[]>();
  for (const group of groups) {
    const lastDescendant = new Map<string, string>();
    for (const task of group.tasks) for (const id of [task.id, ...ancestors.get(task.id)!]) lastDescendant.set(id, task.id);
    for (const parent of group.tasks) {
      if (!parents.has(parent.id) || collapsedIds.has(parent.id)) continue;
      const id = lastDescendant.get(parent.id)!;
      const closing = closingParents.get(id) ?? [];
      closing.push(parent);
      closingParents.set(id, closing);
    }
  }
  for (const closing of closingParents.values()) closing.sort((a, b) => depths.get(b.id)! - depths.get(a.id)!);
  return { parents, depths, closingParents };
}

export function taskMcpContext(task: RepositoryTask) {
  return {
    id: task.id, createdAt: task.createdAt, updatedAt: task.updatedAt, title: task.title, parentId: task.parentId, color: task.color, manualStatus: task.manualStatus,
    completed: task.completed, planReady: task.planReady, customFields: task.customFields,
    details: { description: task.description, drawing: task.drawing, sandboxHtml: task.sandboxHtml, location: task.location, newBranchName: task.newBranchName,
      worktreeStart: task.worktreeStart, worktree: task.worktree, assets: task.assets, comments: task.comments },
  };
}

export function normalizeTask(value: unknown, defaults: ChatDefaults = defaultChatDefaults): RepositoryTask | null {
  if (!value || typeof value !== "object") return null;
  const task = value as Partial<RepositoryTask>;
  if (typeof task.id !== "string" || typeof task.title !== "string") return null;
  const manualStatus = task.manualStatus === "inbox" || task.manualStatus === "inProgress" || task.manualStatus === "inReview" ? task.manualStatus : null;
  const chatMode = task.chatMode === "plan" ? "plan" : "default";
  const chatModel = validChatModel(task.chatModel) ? task.chatModel : defaults[chatMode].model;
  const chatEffort = typeof task.chatEffort === "string" && chatEfforts.some((value) => value === task.chatEffort) ? task.chatEffort as RepositoryTask["chatEffort"] : defaults[chatMode].effort;
  const github = normalizeGitHubLink(task.github);
  return {
    id: task.id,
    // Legacy tasks have no reliable creation or modification time.
    createdAt: typeof task.createdAt === "number" && Number.isSafeInteger(task.createdAt) && task.createdAt >= 0 ? task.createdAt : null,
    updatedAt: typeof task.updatedAt === "number" && Number.isSafeInteger(task.updatedAt) && task.updatedAt >= 0 ? task.updatedAt : null,
    ...(github ? { github } : {}),
    title: task.title,
    description: typeof task.description === "string" ? task.description : "",
    ...(typeof task.drawing === "string" ? { drawing: task.drawing } : {}),
    ...(validSandboxHtml(task.sandboxHtml) ? { sandboxHtml: task.sandboxHtml } : {}),
    startDate: normalizeTaskDate(task.startDate),
    deadline: normalizeTaskDate(task.deadline),
    customFields: task.customFields && typeof task.customFields === "object" && !Array.isArray(task.customFields)
      ? Object.fromEntries(Object.entries(task.customFields).filter(([id, value]) => !!id && typeof value === "string" && !!value)) : {},
    parentId: typeof task.parentId === "string" ? task.parentId : null,
    color: validTaskColors.has(task.color as TaskColor) ? task.color as TaskColor : "clear",
    manualStatus,
    completed: task.completed === true,
    attachments: taskAttachments(task.attachments),
    assets: taskAssets(task.assets),
    comments: taskComments(task.comments),
    chatMessages: Array.isArray(task.chatMessages) ? task.chatMessages : [],
    chatAgent: normalizeAgent(task.chatAgent),
    agentThreadId: typeof task.agentThreadId === "string" ? task.agentThreadId : null,
    planReady: task.planReady === true,
    unreadAgentResult: task.unreadAgentResult === true,
    chatMode,
    ...(task.chatGoal ? { chatGoal: normalizeChatGoal(task.chatGoal) } : {}),
    chatModel,
    chatEffort,
    location: task.location === "worktree" ? "worktree" : "workspace",
    ...(typeof task.newBranchName === "string" ? { newBranchName: task.newBranchName } : {}),
    worktreeStart: task.worktreeStart?.kind === "workspace" ? { kind: "workspace" }
      : task.worktreeStart?.kind === "existing" && typeof task.worktreeStart.branch === "string" ? { kind: "existing", branch: task.worktreeStart.branch, ...(task.worktreeStart.remote === true ? { remote: true } : {}) }
      : (task.worktreeStart?.kind === "branch" || task.worktreeStart?.kind === "remote") && typeof task.worktreeStart.branch === "string" && task.worktreeStart.branch
        ? { kind: task.worktreeStart.kind, branch: task.worktreeStart.branch } : null,
    worktree: task.worktree && typeof task.worktree.branch === "string" && typeof task.worktree.baseOid === "string"
      ? { branch: task.worktree.branch, baseOid: task.worktree.baseOid, baseBranch: typeof task.worktree.baseBranch === "string" ? task.worktree.baseBranch : null }
      : null,
    started: task.started === true || !!task.agentThreadId || !!task.chatMessages?.length,
  };
}

export function loadTasks(rootPath: string, defaults: ChatDefaults = defaultChatDefaults): RepositoryTask[] {
  try {
    const value: unknown = JSON.parse(fileStore.getItem(taskStorageKey(rootPath)) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): RepositoryTask[] => {
      const task = normalizeTask(item, defaults);
      return task ? [task] : [];
    });
  } catch { return []; }
}

export function saveTasks(rootPath: string, tasks: RepositoryTask[]) {
  fileStore.setJSON(taskStorageKey(rootPath), tasks);
}

export function timestampTaskUpdates(previous: RepositoryTask[], next: RepositoryTask[], now = Date.now()): RepositoryTask[] {
  if (previous === next) return next;
  const byId = new Map(previous.map((task) => [task.id, task]));
  const sameTasks = previous.length === next.length && next.every((task) => byId.has(task.id));
  return next.map((task, index) => {
    const before = byId.get(task.id);
    if (!before) return { ...task, createdAt: task.createdAt ?? now, updatedAt: task.updatedAt ?? now };
    const moved = sameTasks && previous[index].id !== task.id;
    if (before === task && !moved) return task;
    const keys = new Set([...Object.keys(before), ...Object.keys(task)] as (keyof RepositoryTask)[]);
    const changed = moved || [...keys].some((key) => key !== "createdAt" && key !== "updatedAt"
      && before[key] !== task[key] && JSON.stringify(before[key]) !== JSON.stringify(task[key]));
    const updatedAt = changed ? Math.max(now, before.updatedAt ?? 0, task.updatedAt ?? 0)
      : task.updatedAt !== null && (before.updatedAt === null || task.updatedAt > before.updatedAt) ? task.updatedAt : before.updatedAt;
    return task.createdAt === before.createdAt && task.updatedAt === updatedAt ? task : { ...task, createdAt: before.createdAt, updatedAt };
  });
}

export function loadCollapsedTaskIds(rootPath: string): Set<string> {
  try {
    const stored: unknown = JSON.parse(fileStore.getItem(collapsedStorageKey) ?? "{}");
    const value = stored && typeof stored === "object" ? (stored as Record<string, unknown>)[rootPath] : null;
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch { return new Set(); }
}

export function saveCollapsedTaskIds(rootPath: string, ids: ReadonlySet<string>) {
  try {
    const stored: unknown = JSON.parse(fileStore.getItem(collapsedStorageKey) ?? "{}");
    const next = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
    next[rootPath] = [...ids];
    fileStore.setItem(collapsedStorageKey, JSON.stringify(next));
  } catch { /* Local task storage is best-effort. */ }
}
