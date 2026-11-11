import assert from "node:assert/strict";
import type { GitHubItem, GitHubNotification } from "../src/github.ts";

const values = new Map<string, string>();
const { fileStore } = await import("../src/fileStore.ts");
Object.assign(fileStore, { keys: () => [...values.keys()], setJSON: (key: string, value: unknown) => values.set(key, JSON.stringify(value)) });
Object.assign(fileStore, { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
const { normalizeTask, loadTasks, saveTasks, mergeMcpTaskUpdates, taskBoardStatus } = await import("../src/tasks.ts");
const { dismissGitHubItem, githubImportedTask, githubInboxKey, githubIntervalKey, githubItemKey, githubNotificationsContext, loadGitHubInbox, loadGitHubInterval, mergeGitHubNotifications, normalizeGitHubLink, saveGitHubInbox } = await import("../src/github.ts");
const account = { id: 1, login: "alice" };
const repository = { id: 2, fullName: "owner/repo" };
const remote: GitHubItem = { number: 3, kind: "issue", title: "Original title", description: "Original description", state: "open", url: "https://github.com/owner/repo/issues/3" };
const notification: GitHubNotification = { number: 3, kind: "issue", reason: "mention", updatedAt: "2026-10-27T12:00:00Z" };
const base = normalizeTask({ id: "task-1", title: "", location: "worktree", chatMode: "plan" })!;
const task = githubImportedTask(remote, account, repository, base);
const key = githubInboxKey(1, 2);

assert.equal(loadGitHubInterval(), 5);
for (const interval of [1, 5, 15]) { fileStore.setItem(githubIntervalKey, String(interval)); assert.equal(loadGitHubInterval(), interval); }
fileStore.setItem(githubIntervalKey, "2"); assert.equal(loadGitHubInterval(), 5);

// Discovery is unread-only at the API boundary; cached discoveries survive disappearing from that response.
let inbox = mergeGitHubNotifications(loadGitHubInbox(key), [notification, notification]);
assert.equal(inbox.pending.length, 1);
assert.equal(mergeGitHubNotifications(inbox, []).pending.length, 1);
inbox.pending[0].item = remote;
const beforeRead = JSON.stringify(inbox);
const context = githubNotificationsContext(account, repository, { ...inbox, lastSync: 123 }, "", false);
assert.equal(context.available, true);
assert.deepEqual(context.notifications, [{ ...notification, item: remote }]);
assert.equal(context.lastSync, 123);
assert.equal(context.error, null);
assert.equal(JSON.stringify(inbox), beforeRead);
for (const [connected, repo, cached] of [[null, repository, inbox], [account, null, inbox], [account, repository, null]] as const) {
  const unavailable = githubNotificationsContext(connected, repo, cached, "", false);
  assert.equal(unavailable.available, false);
  assert.deepEqual(unavailable.notifications, []);
  assert.equal(unavailable.lastSync, null);
  assert.ok(unavailable.error);
}
assert.equal(githubNotificationsContext(account, repository, inbox, "Rate limited", true).error, "Rate limited");
assert.equal(githubNotificationsContext(account, repository, inbox, "", true).refreshing, true);
assert.equal(githubNotificationsContext(account, repository, { ...inbox, pending: [] }, "", false).available, true);
saveGitHubInbox(key, inbox);
assert.deepEqual(loadGitHubInbox(key), inbox);
assert.equal(loadGitHubInbox(githubInboxKey(99, 2)).pending.length, 0);
assert.equal(loadGitHubInbox(githubInboxKey(1, 99)).pending.length, 0);

for (const action of ["ignored", "imported"] as const) {
  const dismissed = dismissGitHubItem(inbox, notification, action);
  assert.equal(dismissed.pending.length, 0);
  assert.deepEqual(githubNotificationsContext(account, repository, dismissed, "", false).notifications, []);
  assert.equal(dismissGitHubItem(dismissed, notification, action)[action].length, 1);
  saveGitHubInbox(key, dismissed);
  const rediscovered = mergeGitHubNotifications(loadGitHubInbox(key), [{ ...notification, reason: "review_requested", updatedAt: "2026-10-28T00:00:00Z" }]);
  assert.equal(rediscovered.pending.length, 0);
  assert.deepEqual(rediscovered[action], [githubItemKey(notification)]);
}
// Import tombstones are independent of the task list, so deleting a task cannot resurrect it.
saveTasks("/repo", []);
assert.equal(mergeGitHubNotifications(loadGitHubInbox(key), [notification]).pending.length, 0);

assert.equal(task.parentId, null);
assert.equal(taskBoardStatus(task), "inbox");
assert.equal(task.description, remote.description);
assert.equal(task.location, "worktree");
assert.equal(taskBoardStatus(githubImportedTask({ ...remote, kind: "pullRequest" }, account, repository, base)), "inReview");
for (const state of ["closed", "merged"] as const) assert.equal(taskBoardStatus(githubImportedTask({ ...remote, state }, account, repository, base)), "done");
assert.equal(githubImportedTask({ ...remote, url: "javascript:bad" }, account, repository, base).github!.url, remote.url);

assert.equal(normalizeTask({ id: "legacy", title: "Old task" })!.github, undefined);
saveTasks("/repo", [task]);
assert.deepEqual(loadTasks("/repo")[0].github, task.github);
const mcp = mergeMcpTaskUpdates([task], [{ id: task.id, title: "Agent title", parentId: null, color: "clear", manualStatus: "inProgress", completed: false, planReady: false }]);
assert.deepEqual(mcp[0].github, task.github);
assert.equal(normalizeGitHubLink({ ...task.github, repository: "../repo" }), undefined);
assert.equal(normalizeGitHubLink({ ...task.github, accountId: 0 }), undefined);
assert.equal(normalizeGitHubLink({ ...task.github, kind: "unknown" }), undefined);
assert.equal(normalizeGitHubLink({ ...task.github, url: "javascript:bad" })!.url, remote.url);
fileStore.setItem(key, "broken"); assert.deepEqual(loadGitHubInbox(key).pending, []);

console.log("GitHub inbox tests passed");
