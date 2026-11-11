import assert from "node:assert/strict";

const values = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => values.set(name, value) } });
const { fileStore } = await import("../src/fileStore.ts");
Object.assign(fileStore, { keys: () => [...values.keys()], setJSON: (key: string, value: unknown) => values.set(key, JSON.stringify(value)) });
Object.assign(fileStore, globalThis.localStorage);

const { filterVisibleTasks, hasTaskCustomFieldLineBreaks, loadCollapsedTaskIds, loadOpenNewTaskInDrawer, loadTaskCustomFields, loadTaskLocationDefault, loadTaskView, loadTasks, mergeMcpTaskUpdates, moveTask, moveTaskCustomField, moveTaskProjected, moveTaskToBoardIndex, moveTaskWithinStatus, normalizeTask, removeTaskCustomFieldValues, reparentTask, saveCollapsedTaskIds, saveOpenNewTaskInDrawer, saveTaskCustomFields, saveTaskLocationDefault, saveTaskView, saveTasks, timestampTaskUpdates, taskAssetAttachments, taskBoardStatus, taskDepth, taskLocationFields, taskStartEditable, taskStartSelected, taskSubtreeIds, taskCustomFieldUrl, toggleTaskCommentCheckbox } = await import("../src/tasks.ts");
const checklist = "- [ ] First\n  - [x] Nested\n- Plain";
assert.equal(toggleTaskCommentCheckbox(checklist, 0), "- [x] First\n  - [x] Nested\n- Plain");
assert.equal(toggleTaskCommentCheckbox(checklist, checklist.indexOf("- [x] Nested")), "- [ ] First\n  - [ ] Nested\n- Plain");
assert.equal(toggleTaskCommentCheckbox(checklist, checklist.indexOf("- Plain")), checklist);
assert.equal(loadTaskLocationDefault(), "worktree");
assert.equal(loadOpenNewTaskInDrawer(), true);
saveOpenNewTaskInDrawer(false);
assert.equal(loadOpenNewTaskInDrawer(), false);
saveOpenNewTaskInDrawer(true);
assert.equal(loadOpenNewTaskInDrawer(), true);
assert.equal(loadTaskView("/repo"), "list");
saveTaskView("/repo", "kanban");
assert.equal(loadTaskView("/repo"), "kanban");
saveTaskView("/repo", "gantt");
assert.equal(loadTaskView("/repo"), "gantt");
assert.equal(loadTaskView("/other"), "list");
saveTaskView("/repo", "list");
assert.equal(loadTaskView("/repo"), "list");
saveTaskLocationDefault("workspace");
assert.equal(loadTaskLocationDefault(), "workspace");
saveTaskLocationDefault("existing");
assert.equal(loadTaskLocationDefault(), "existing");
assert.deepEqual(taskLocationFields(loadTaskLocationDefault()), { location: "worktree", worktreeStart: { kind: "existing", branch: "" } });
saveTaskLocationDefault("worktree");
assert.equal(loadTaskLocationDefault(), "worktree");
assert.deepEqual(taskLocationFields("worktree"), { location: "worktree", worktreeStart: null });
assert.deepEqual(taskLocationFields("workspace"), { location: "workspace", worktreeStart: null });
values.set("chaoticreview.task-location-default", "invalid");
assert.equal(loadTaskLocationDefault(), "worktree");
const task = { id: "task-1", createdAt: null, updatedAt: null, title: "Plan task", description: "", customFields: {}, startDate: null, deadline: null, parentId: null, color: "clear" as const, manualStatus: null, completed: false, attachments: [], assets: [], comments: [], chatMessages: [], agentThreadId: null, chatAgent: null, planReady: false, unreadAgentResult: false, chatMode: "plan" as const, chatModel: "gpt-5.6-terra", chatEffort: "medium" as const, location: "workspace" as const, worktreeStart: null, worktree: null, started: false };
const sandboxTask = { ...task, sandboxHtml: "<!doctype html><h1>Prototype</h1>" };
saveTasks("/sandbox", [sandboxTask]);
assert.deepEqual(loadTasks("/sandbox"), [sandboxTask]);
assert.equal(normalizeTask(task)?.sandboxHtml, undefined);
assert.equal(normalizeTask({ ...task, sandboxHtml: 123 })?.sandboxHtml, undefined);
assert.equal(normalizeTask({ ...task, sandboxHtml: " " })?.sandboxHtml, undefined);
assert.equal(normalizeTask({ ...task, sandboxHtml: "é".repeat(524289) })?.sandboxHtml, undefined);
assert.equal(mergeMcpTaskUpdates([sandboxTask], [{ ...task, title: "Renamed" }])[0].sandboxHtml, sandboxTask.sandboxHtml);
const { branchPrefixStorageKey, loadBranchPrefix, saveBranchPrefix, taskNewBranchName } = await import("../src/tasks.ts");
assert.equal(loadBranchPrefix("/repo"), "feature/");
saveBranchPrefix("/repo", "fix/");
assert.equal(fileStore.getItem(branchPrefixStorageKey("/repo")), "fix/");
assert.equal(loadBranchPrefix("/repo"), "fix/");
assert.equal(loadBranchPrefix("/other"), "feature/");
assert.equal(taskNewBranchName(task, "fix/"), "fix/plan-task");
assert.equal(taskNewBranchName(task, "fix/", true), "fix/plan-task");
assert.equal(taskNewBranchName({ ...task, title: "  Fix Café: login / errors?! 🚀  " }, "feature/"), "feature/fix-cafe-login-errors");
assert.equal(taskNewBranchName({ ...task, title: "Renamed task" }, "fix/"), "fix/renamed-task");
assert.equal(taskNewBranchName({ ...task, title: "🚀!?" }, "fix/"), "fix/");
assert.equal(taskNewBranchName({ ...task, title: "🚀!?" }, "fix/", true), "fix/task-1");
assert.equal(taskNewBranchName({ ...task, newBranchName: "" }, "fix/"), "");
assert.equal(taskNewBranchName({ ...task, newBranchName: "fix/" }, "fix/"), "fix/");
const namedTask = { ...task, newBranchName: "feature/my-task" };
assert.equal(taskNewBranchName({ ...namedTask, title: "Renamed task" }, "fix/"), "feature/my-task");
assert.equal(taskNewBranchName(namedTask, "fix/", true), "feature/my-task");
assert.equal(taskNewBranchName({ ...task, newBranchName: "feature/" }, "fix/", true), "feature/task-1");
saveTasks("/named", [namedTask]);
assert.deepEqual(loadTasks("/named"), [namedTask]);
assert.equal(normalizeTask({ ...task, newBranchName: 123 } as any)?.newBranchName, undefined);
assert.equal(normalizeTask({ ...task, newBranchName: "" })?.newBranchName, "");
saveBranchPrefix("/repo", "");
assert.equal(loadBranchPrefix("/repo"), "");
assert.equal(taskNewBranchName(task, ""), "plan-task");
assert.equal(taskNewBranchName(task, "", true), "plan-task");
saveTasks("/repo", [task]);
assert.deepEqual(loadTasks("/repo"), [task]);
const existingDefaultTask = normalizeTask({ ...task, ...taskLocationFields("existing") })!;
assert.equal(existingDefaultTask.location, "worktree");
assert.deepEqual(existingDefaultTask.worktreeStart, { kind: "existing", branch: "" });
assert.equal(taskStartSelected(existingDefaultTask.worktreeStart), false);
saveTasks("/existing-default", [existingDefaultTask]);
assert.deepEqual(loadTasks("/existing-default"), [existingDefaultTask]);
assert.deepEqual(normalizeTask({ ...task, startDate: undefined, deadline: undefined }), task);
assert.deepEqual(normalizeTask({ ...task, startDate: "2026-02-30", deadline: 123 }), task);
const scheduledTask = { ...task, startDate: "2026-10-27", deadline: "2026-11-03" };
saveTasks("/schedule", [scheduledTask]);
assert.deepEqual(loadTasks("/schedule"), [scheduledTask]);
assert.deepEqual(mergeMcpTaskUpdates([scheduledTask], [{ id: task.id, title: "Renamed", parentId: null, color: task.color, manualStatus: null, completed: false, planReady: false }])[0], { ...scheduledTask, title: "Renamed" });
const developmentTask = {
  ...task,
  id: "development",
  manualStatus: "inProgress" as const,
  planReady: false,
  chatMessages: [
    { id: "development-plan", role: "assistant" as const, body: "Plan", createdAt: "2026-09-15T00:00:00.000Z", selection: null, snapshotId: null, suggestions: [], contexts: [], plan: true, canImplementPlan: false },
    { id: "development-notice", role: "assistant" as const, body: "Already in development", createdAt: "2026-09-15T00:00:00.000Z", selection: null, snapshotId: null, suggestions: [], contexts: [] },
  ],
};
saveTasks("/development", [developmentTask]);
assert.deepEqual(loadTasks("/development"), [{ ...developmentTask, started: true }]);
assert.deepEqual(normalizeTask({ ...task, location: undefined, worktreeStart: undefined, worktree: undefined, started: undefined }), task);
assert.deepEqual(normalizeTask({ ...task, description: undefined, assets: undefined }), task);
assert.deepEqual(normalizeTask({ ...task, comments: undefined }), task);
assert.deepEqual(normalizeTask({ ...task, unreadAgentResult: undefined }), task);
assert.deepEqual(normalizeTask({ ...task, customFields: undefined }), task);
const fields = [
  { id: "field-text", name: "Owner", type: "text" as const, options: [], showOnCards: false, multiline: true, hyperlink: false },
  { id: "field-select", name: "Priority", type: "select" as const, options: [{ id: "high", label: "High" }, { id: "low", label: "Low" }], showOnCards: true, multiline: false, hyperlink: false },
];
fileStore.setItem("chaoticreview.task-custom-fields", JSON.stringify(fields.map(({ multiline: _multiline, hyperlink: _hyperlink, ...field }) => field)));
assert.deepEqual(loadTaskCustomFields(), fields);
saveTaskCustomFields(fields);
assert.deepEqual(loadTaskCustomFields(), fields);
saveTaskCustomFields([{ ...fields[0], multiline: false }, fields[1]]);
assert.equal(loadTaskCustomFields()[0]?.multiline, false);
saveTaskCustomFields([{ ...fields[0], multiline: false, hyperlink: true }, fields[1]]);
assert.equal(loadTaskCustomFields()[0]?.hyperlink, true);
saveTaskCustomFields([{ ...fields[0], hyperlink: true }, { ...fields[1], hyperlink: true }]);
assert.deepEqual(loadTaskCustomFields().map((field) => field.hyperlink), [false, false]);
assert.equal(taskCustomFieldUrl(" https://example.com/path "), "https://example.com/path");
assert.equal(taskCustomFieldUrl("javascript:alert(1)"), null);
assert.equal(taskCustomFieldUrl("example.com"), null);
saveTaskCustomFields(fields);
const renamedFields = [{ ...fields[0], name: "Assignee" }, { ...fields[1], options: [{ id: "high", label: "Urgent" }, fields[1].options[1]] }];
saveTaskCustomFields(renamedFields);
assert.deepEqual(loadTaskCustomFields(), renamedFields);
const reorderedFields = moveTaskCustomField(renamedFields, "field-select", -1);
assert.deepEqual(reorderedFields.map((field) => field.id), ["field-select", "field-text"]);
assert.equal(moveTaskCustomField(reorderedFields, "field-select", -1), reorderedFields);
saveTaskCustomFields(reorderedFields);
assert.deepEqual(loadTaskCustomFields(), reorderedFields);
const valuedTask = { ...task, customFields: { "field-text": "Alex", "field-select": "high" } };
saveTasks("/fields-a", [valuedTask]);
saveTasks("/fields-b", [{ ...valuedTask, id: "other" }]);
assert.deepEqual(loadTasks("/fields-a")[0]?.customFields, valuedTask.customFields);
removeTaskCustomFieldValues("field-select", "high");
assert.deepEqual(loadTasks("/fields-a")[0]?.customFields, { "field-text": "Alex" });
assert.deepEqual(loadTasks("/fields-b")[0]?.customFields, { "field-text": "Alex" });
assert.equal(hasTaskCustomFieldLineBreaks("field-text"), false);
saveTasks("/fields-lines", [{ ...valuedTask, id: "line", customFields: { "field-text": "First\nSecond" } }]);
assert.equal(hasTaskCustomFieldLineBreaks("field-text"), true);
assert.equal(loadTasks("/fields-lines")[0]?.customFields["field-text"], "First\nSecond");
removeTaskCustomFieldValues("field-text");
assert.deepEqual(loadTasks("/fields-a")[0]?.customFields, {});
assert.deepEqual(loadTasks("/fields-b")[0]?.customFields, {});
assert.equal(hasTaskCustomFieldLineBreaks("field-text"), false);
const fieldUpdate = { id: task.id, title: task.title, parentId: task.parentId, color: task.color, manualStatus: task.manualStatus, completed: task.completed, planReady: task.planReady };
assert.deepEqual(mergeMcpTaskUpdates([valuedTask], [fieldUpdate], { taskId: task.id, values: { "field-select": "low" } })[0]?.customFields, { "field-text": "Alex", "field-select": "low" });
assert.deepEqual(mergeMcpTaskUpdates([valuedTask], [fieldUpdate], { taskId: task.id, values: { "field-select": null } })[0]?.customFields, { "field-text": "Alex" });
assert.equal(normalizeTask({ ...task, unreadAgentResult: true })?.unreadAgentResult, true);
assert.deepEqual(normalizeTask({ ...task, folderId: "legacy-folder" }), task);
fileStore.setItem("chaoticreview.repository-tasks:/legacy-folders", JSON.stringify([{ ...task, folderId: "legacy-folder" }, { ...task, id: "legacy-child", parentId: task.id }]));
assert.deepEqual(loadTasks("/legacy-folders"), [task, { ...task, id: "legacy-child", parentId: task.id }]);
saveTasks("/legacy-folders", loadTasks("/legacy-folders"));
assert.equal(fileStore.getItem("chaoticreview.repository-tasks:/legacy-folders")?.includes("folderId"), false);
const comment = { id: "comment-1", author: "user" as const, body: "Please check this", createdAt: 1_000 };
assert.deepEqual(normalizeTask({ ...task, comments: [comment, { ...comment, id: "invalid", body: "" }] })?.comments, [comment]);
const asset = { id: "agent-123-456-1.pdf", name: "Brief.pdf", image: false };
assert.deepEqual(normalizeTask({ ...task, description: "Build the feature", assets: [asset, { id: "../outside", name: "bad", image: false }] })?.assets, [asset]);
assert.equal(normalizeTask({ ...task, description: "Build the feature" })?.description, "Build the feature");
assert.deepEqual(taskAssetAttachments({ ...task, assets: [asset, { id: "agent-456-789-2.png", name: "Screen.png", image: true }] }, ["agent-456-789-2.png", "missing"]), [{ kind: "taskAsset", id: "agent-456-789-2.png", name: "Screen.png", image: true }]);
assert.equal(taskStartEditable(task, false), true);
assert.equal(taskStartEditable(task, true), false);
assert.equal(taskStartEditable({ ...task, started: true }, false), false);
const worktreeTask = { ...task, location: "worktree" as const, worktreeStart: { kind: "branch" as const, branch: "main" }, worktree: { branch: "lotse/task/123", baseOid: "a".repeat(40), baseBranch: "main" }, started: true };
saveTasks("/worktree", [worktreeTask]);
assert.deepEqual(loadTasks("/worktree"), [worktreeTask]);
assert.deepEqual(normalizeTask({ ...worktreeTask, worktreeStart: { kind: "workspace" } })?.worktreeStart, { kind: "workspace" });
assert.deepEqual(normalizeTask({ ...worktreeTask, worktreeStart: { kind: "remote", branch: "origin/main" } })?.worktreeStart, { kind: "remote", branch: "origin/main" });
saveTasks("/remote-worktree", [{ ...worktreeTask, worktreeStart: { kind: "remote", branch: "origin/main" } }]);
assert.deepEqual(loadTasks("/remote-worktree")[0]?.worktreeStart, { kind: "remote", branch: "origin/main" });
const existingTask = { ...worktreeTask, worktreeStart: { kind: "existing" as const, branch: "feature/continue" }, worktree: { ...worktreeTask.worktree, branch: "feature/continue" } };
saveTasks("/existing-worktree", [existingTask]);
assert.deepEqual(loadTasks("/existing-worktree"), [existingTask]);
assert.deepEqual(normalizeTask({ ...task, worktreeStart: { kind: "existing", branch: "" } })?.worktreeStart, { kind: "existing", branch: "" });
const existingOriginStart = { kind: "existing" as const, branch: "origin/feature/continue", remote: true };
saveTasks("/existing-origin", [{ ...task, location: "worktree", worktreeStart: existingOriginStart }]);
assert.deepEqual(loadTasks("/existing-origin")[0]?.worktreeStart, existingOriginStart);
assert.equal(taskStartSelected(null), false);
assert.equal(taskStartSelected({ kind: "existing", branch: "" }), false);
assert.equal(taskStartSelected({ kind: "existing", branch: "feature/continue" }), true);
assert.equal(taskStartSelected({ kind: "workspace" }), true);
assert.deepEqual(normalizeTask({ ...task, id: "legacy", chatMode: undefined, chatModel: undefined, chatEffort: undefined, manualStatus: "inProgress" }), { ...task, id: "legacy", manualStatus: "inProgress", chatMode: "default" });
for (const manualStatus of [null, "inbox", "inProgress", "inReview"] as const) {
  for (const chatMode of [undefined, "invalid", "default", "plan"]) {
    assert.equal(normalizeTask({ ...task, manualStatus, chatMode })?.chatMode, chatMode === "plan" ? "plan" : "default");
  }
}
values.set("chaoticreview.task-plan-mode-default", "true");
assert.equal(normalizeTask({ id: "new", title: "New task" })?.chatMode, "default");
assert.deepEqual(normalizeTask({ ...task, id: "invalid", chatModel: "invalid model", chatEffort: "unknown" }), { ...task, id: "invalid" });
const longTask = { ...task, id: "long", title: "x".repeat(25_000) };
saveTasks("/long", [longTask]);
assert.equal(loadTasks("/long")[0]?.title.length, 25_000);
assert.deepEqual(loadTasks("/other"), []);
const child = { ...task, id: "child", parentId: "task-1" };
const sibling = { ...task, id: "sibling" };
assert.equal(taskBoardStatus({ ...task, planReady: true }), "clear");
assert.equal(taskBoardStatus({ ...task, manualStatus: "inbox" }), "inbox");
assert.equal(taskBoardStatus({ ...task, planReady: true, manualStatus: "inbox" }), "inbox");
assert.equal(taskBoardStatus({ ...task, planReady: true, manualStatus: "inProgress" }), "inProgress");
assert.equal(taskBoardStatus({ ...task, manualStatus: "inProgress" }), "inProgress");
assert.equal(taskBoardStatus({ ...task, planReady: true, manualStatus: "inReview" }), "inReview");
assert.equal(taskBoardStatus({ ...task, planReady: true, completed: true }), "done");
assert.equal(taskBoardStatus({ ...task, completed: true, manualStatus: "inReview" }), "done");
assert.deepEqual(moveTaskWithinStatus([task, child, sibling], "task-1", "sibling", "after").map((item) => item.id), ["sibling", "task-1", "child"]);
assert.deepEqual(moveTaskWithinStatus([task, child, sibling], "child", "sibling", "after"), [task, child, sibling]);
const boardOrdered = moveTaskToBoardIndex([task, sibling, { ...task, id: "third" }], "task-1", { status: "clear" }, 1);
assert.deepEqual(boardOrdered.map((item) => item.id), ["sibling", "task-1", "third"]);
saveTasks("/kanban-order", boardOrdered);
assert.deepEqual(loadTasks("/kanban-order").map((item) => item.id), ["sibling", "task-1", "third"]);
assert.deepEqual(moveTaskToBoardIndex([task, child, sibling], "task-1", { status: "clear" }, 1).map((item) => item.id), ["sibling", "task-1", "child"]);
const nested = moveTask([task, child, sibling], "sibling", "task-1", "inside");
assert.deepEqual(nested.map((item) => item.id), ["task-1", "child", "sibling"]);
assert.equal(nested.find((item) => item.id === "sibling")?.parentId, "task-1");
assert.deepEqual(moveTask([task, child], "task-1", "child", "inside"), [task, child]);
assert.equal(taskDepth(child, [task, child]), 1);
assert.deepEqual(moveTask([task, child, sibling], "child", null, "after").map((item) => [item.id, item.parentId]), [["task-1", null], ["sibling", null], ["child", null]]);
assert.deepEqual(moveTaskProjected([task, sibling], "sibling", 1, 28).map((item) => [item.id, item.parentId]), [["task-1", null], ["sibling", "task-1"]]);
assert.deepEqual(moveTaskProjected([task, child, sibling], "child", 1, -28).map((item) => [item.id, item.parentId]), [["task-1", null], ["child", null], ["sibling", null]]);
assert.deepEqual(moveTaskProjected([task, child, sibling], "task-1", 2, 0).map((item) => [item.id, item.parentId]), [["sibling", null], ["task-1", null], ["child", "task-1"]]);
const grandchild = { ...task, id: "grandchild", parentId: "child" };
assert.deepEqual(taskSubtreeIds([task, child, grandchild, sibling], ["task-1", "child", "sibling"]), new Set(["task-1", "child", "grandchild", "sibling"]));
assert.deepEqual(filterVisibleTasks([task, child, grandchild, sibling], new Set(["task-1"])).map((item) => item.id), ["task-1", "sibling"]);
const childInReview = { ...child, manualStatus: "inReview" as const };
assert.deepEqual(moveTaskWithinStatus([task, childInReview, sibling], task.id, sibling.id, "after"), [sibling, task, childInReview]);
assert.deepEqual(moveTaskWithinStatus([task, childInReview, sibling], childInReview.id, sibling.id, "after"), [task, childInReview, sibling]);
assert.deepEqual(filterVisibleTasks([childInReview], new Set(["task-1"])), [childInReview]);
saveCollapsedTaskIds("/repo", new Set(["task-1"]));
assert.deepEqual([...loadCollapsedTaskIds("/repo")], ["task-1"]);
assert.deepEqual([...loadCollapsedTaskIds("/other")], []);
assert.deepEqual(filterVisibleTasks([task, child, sibling], loadCollapsedTaskIds("/repo")).map((item) => item.id), ["task-1", "sibling"]);

const reparented = reparentTask([task, child, grandchild, sibling], "child", sibling.id);
assert.deepEqual(reparented.map((item) => item.id), ["task-1", "sibling", "child", "grandchild"]);
assert.equal(reparented.find((item) => item.id === "child")?.parentId, sibling.id);
assert.equal(reparented.find((item) => item.id === "grandchild")?.parentId, "child");
const unparented = reparentTask(reparented, "child", null);
assert.equal(unparented.find((item) => item.id === "child")?.parentId, null);
assert.equal(unparented.find((item) => item.id === "grandchild")?.parentId, "child");
assert.equal(reparentTask(reparented, "child", "grandchild"), reparented);
assert.equal(reparentTask(reparented, "child", "missing"), reparented);
assert.equal(reparentTask(reparented, "child", sibling.id), reparented);
const runningChild = { ...child, started: true, agentThreadId: "running" };
assert.equal(reparentTask([task, runningChild], "child", null).at(-1)?.agentThreadId, "running");
const patch = { id: task.id, title: "Updated by agent", parentId: sibling.id, color: task.color, manualStatus: task.manualStatus, completed: task.completed, planReady: task.planReady };
assert.deepEqual(mergeMcpTaskUpdates([task], [patch]), [{ ...task, ...patch }]);

const discoveredModelTask = { ...task, chatModel: "new-codex-model" };
saveTasks("/discovered-model", [discoveredModelTask]);
assert.deepEqual(loadTasks("/discovered-model"), [discoveredModelTask]);

const descriptionUpdate = { id: task.id, title: task.title, parentId: null, color: task.color, manualStatus: task.manualStatus, completed: false, planReady: false };
assert.equal(mergeMcpTaskUpdates([{ ...task, description: "Previous" }], [descriptionUpdate], undefined, { taskId: task.id, description: "Revised" })[0].description, "Revised");
assert.equal(mergeMcpTaskUpdates([{ ...task, description: "Previous" }], [descriptionUpdate], undefined, { taskId: task.id, description: "" })[0].description, "");
assert.equal(mergeMcpTaskUpdates([{ ...task, description: "Previous" }], [descriptionUpdate], undefined, { taskId: "other", description: "Revised" })[0].description, "Previous");

const { readTaskDrawing } = await import("../src/taskDrawing.ts");
const drawing = JSON.stringify({ type: "excalidraw", version: 2, elements: [{ id: "box", type: "rectangle", x: 10, y: 20, width: 100, height: 50 }], appState: { viewBackgroundColor: "#fff" }, files: {} });
const drawnTask = normalizeTask({ id: "drawn", title: "Diagram", drawing })!;
saveTasks("/drawing-repo", [drawnTask]);
assert.equal(loadTasks("/drawing-repo")[0].drawing, drawing);
assert.equal(readTaskDrawing(loadTasks("/drawing-repo")[0].drawing)?.elements?.[0].id, "box");
assert.equal(normalizeTask({ id: "old", title: "Old task" })!.drawing, undefined);
assert.equal(normalizeTask({ id: "bad", title: "Bad drawing", drawing: {} })!.drawing, undefined);
for (const invalid of [undefined, "", "{", "null", "{}", JSON.stringify({ type: "excalidraw", elements: [null], appState: {}, files: {} })]) assert.equal(readTaskDrawing(invalid), null);

// The list must place subtask forms exactly as before without scanning all tasks per row.
const { taskListMetadata } = await import("../src/tasks.ts");
const hierarchy = [
  { ...task, id: "root" },
  { ...task, id: "child", parentId: "root" },
  { ...task, id: "grandchild", parentId: "child" },
  { ...task, id: "sibling", parentId: "root" },
  { ...task, id: "other" },
  { ...task, id: "orphan", parentId: "missing" },
  { ...task, id: "cycle-a", parentId: "cycle-b" },
  { ...task, id: "cycle-b", parentId: "cycle-a" },
];
for (const collapsed of [new Set<string>(), new Set(["root"]), new Set(["child"])]) {
  for (const groups of [{ tasks: hierarchy } , { tasks: hierarchy.filter((item) => item.id !== "child") }].map((group) => [group])) {
    const metadata = taskListMetadata(hierarchy, groups, collapsed);
    const descendant = (candidate: typeof task, parentId: string) => {
      const seen = new Set<string>();
      let current = candidate.parentId;
      while (current && !seen.has(current)) {
        if (current === parentId) return true;
        seen.add(current); current = hierarchy.find((item) => item.id === current)?.parentId ?? null;
      }
      return false;
    };
    for (const row of groups[0].tasks) {
      const expected = groups[0].tasks.filter((parent) => !collapsed.has(parent.id) && hierarchy.some((child) => child.parentId === parent.id)
        && [...groups[0].tasks].reverse().find((candidate) => candidate.id === parent.id || descendant(candidate, parent.id))?.id === row.id)
        .sort((a, b) => taskDepth(b, hierarchy) - taskDepth(a, hierarchy));
      assert.deepEqual(metadata.closingParents.get(row.id) ?? [], expected);
      assert.equal(metadata.depths.get(row.id), taskDepth(row, hierarchy));
    }
  }
}
let parentReads = 0;
const flatTasks = Array.from({ length: 500 }, (_, index) => ({ ...task, id: `flat-${index}`, get parentId() { parentReads++; return null; } }));
const flatMetadata = taskListMetadata(flatTasks, [{ tasks: flatTasks }], new Set());
assert.equal(flatMetadata.closingParents.size, 0);
assert.ok(parentReads <= flatTasks.length * 3, `Flat task layout must be linear; read parents ${parentReads} times`);

const { taskMcpContext } = await import("../src/tasks.ts");
const contextTask = { ...task, description: "Only include once", drawing: '{"scene":"drawing"}', assets: [asset], comments: [comment],
  chatMessages: [{ id: "large-history", body: "x".repeat(100_000) }], attachments: [{ kind: "image", path: "/private/image.png", name: "image.png" }] } as typeof task;
const mcpTask = taskMcpContext(contextTask);
assert.deepEqual(Object.keys(mcpTask).sort(), ["id", "createdAt", "updatedAt", "title", "parentId", "color", "manualStatus", "completed", "planReady", "customFields", "details"].sort());
assert.equal(mcpTask.details.description, contextTask.description);
assert.equal(mcpTask.details.drawing, contextTask.drawing);
assert.deepEqual(mcpTask.details.assets, contextTask.assets);
assert.deepEqual(mcpTask.details.comments, contextTask.comments);
assert.ok(JSON.stringify(mcpTask).length < 2000, "Agent context must not include chat history or prompt attachments");

const tree = [
  { ...task, id: "grandchild", parentId: "child" },
  { ...task, id: "child", parentId: "root" },
  { ...task, id: "root" },
  { ...task, id: "other" },
  { ...task, id: "cycle-a", parentId: "cycle-b" },
  { ...task, id: "cycle-b", parentId: "cycle-a" },
];
assert.deepEqual([...taskSubtreeIds(tree, ["root", "child"])].sort(), ["child", "grandchild", "root"]);
assert.deepEqual([...taskSubtreeIds(tree, ["cycle-a"])].sort(), ["cycle-a", "cycle-b"]);
assert.deepEqual([...taskSubtreeIds(tree, ["missing"])], ["missing"]);
let subtreeParentReads = 0;
const manyRoots = Array.from({ length: 2000 }, (_, index) => ({ ...task, id: `root-${index}`, get parentId() { subtreeParentReads++; return null; } }));
assert.equal(taskSubtreeIds(manyRoots, manyRoots.map((task) => task.id)).size, manyRoots.length);
assert.ok(subtreeParentReads <= manyRoots.length * 2, "Column subtrees must read parents once per task, regardless of the number of roots");

// Unknown legacy timestamps stay unknown until a real edit.
const legacyTask = normalizeTask({ id: "legacy", title: "Legacy" })!;
assert.equal(legacyTask.createdAt, null);
assert.equal(legacyTask.updatedAt, null);
for (const invalid of ["2026-11-06", -1, Infinity, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(normalizeTask({ ...task, createdAt: invalid, updatedAt: invalid })!.createdAt, null);
  assert.equal(normalizeTask({ ...task, createdAt: invalid, updatedAt: invalid })!.updatedAt, null);
}
const [created] = timestampTaskUpdates([], [task], 1000);
assert.equal(created.createdAt, 1000);
assert.equal(created.updatedAt, 1000);
assert.equal(task.createdAt, null);
const [edited] = timestampTaskUpdates([created], [{ ...created, title: "Edited", createdAt: 9999 }], 2000);
assert.equal(edited.createdAt, 1000);
assert.equal(edited.updatedAt, 2000);
assert.equal(created.updatedAt, 1000);
const [unchanged] = timestampTaskUpdates([edited], [{ ...edited, customFields: {}, comments: [] }], 3000);
assert.equal(unchanged.updatedAt, 2000);
assert.strictEqual(timestampTaskUpdates([edited], [edited], 3000)[0], edited);
const [legacyEdit] = timestampTaskUpdates([legacyTask], [{ ...legacyTask, description: "Edited" }], 4000);
assert.equal(legacyEdit.createdAt, null);
assert.equal(legacyEdit.updatedAt, 4000);
assert.equal(timestampTaskUpdates([edited], [{ ...edited, title: "Clock moved back" }], 1000)[0].updatedAt, 2000);
saveTasks("/timestamps", [edited, legacyEdit]);
assert.deepEqual(loadTasks("/timestamps"), [edited, legacyEdit]);
assert.equal(taskMcpContext(edited).createdAt, 1000);
assert.equal(taskMcpContext(edited).updatedAt, 2000);
assert.equal(taskMcpContext(legacyTask).createdAt, null);
const timestampedUpdate = mergeMcpTaskUpdates([created], [{ ...taskMcpContext(edited) }])[0];
assert.equal(timestampedUpdate.createdAt, 1000);
assert.equal(timestampedUpdate.updatedAt, 2000);
saveTasks("/timestamp-fields", [{ ...edited, customFields: { owner: "Alex" } }]);
removeTaskCustomFieldValues("owner");
assert.equal(loadTasks("/timestamp-fields")[0].createdAt, 1000);
assert.ok(loadTasks("/timestamp-fields")[0].updatedAt! > 2000);

const otherTimestampedTask = { ...created, id: "other" };
const reorderedTasks = timestampTaskUpdates([created, otherTimestampedTask], [otherTimestampedTask, created], 5000);
assert.deepEqual(reorderedTasks.map((task) => task.updatedAt), [5000, 5000]);
assert.deepEqual(reorderedTasks.map((task) => task.createdAt), [1000, 1000]);
assert.equal(timestampTaskUpdates([created], [otherTimestampedTask, created], 5000)[1].updatedAt, 1000);
