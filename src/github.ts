import type { RepositoryTask } from "./types.ts";
import { fileStore } from "./fileStore.ts";
import { invoke } from "@tauri-apps/api/core";

export type GitHubAccount = { id: number; login: string };
export type GitHubRepository = { id: number; fullName: string };
export type GitHubKind = "issue" | "pullRequest";
export type GitHubItem = { number: number; kind: GitHubKind; title: string; description: string; state: "open" | "closed" | "merged"; url: string };
export type GitHubValues = { title: string; description: string; completed: boolean };
export type GitHubLink = {
  accountId: number; accountLogin: string; repositoryId: number; repository: string;
  number: number; kind: GitHubKind; url: string; state: GitHubItem["state"]; synced: GitHubValues; error?: string;
};
export type GitHubNotification = { number: number; kind: GitHubKind; reason: string; updatedAt: string };
export type GitHubPendingItem = GitHubNotification & { item?: GitHubItem; error?: string };
export type GitHubInboxState = { pending: GitHubPendingItem[]; ignored: string[]; imported: string[]; lastSync: number | null };
export const githubIntervalKey = "chaoticreview.github-sync-interval";
export const githubInboxPrefix = "chaoticreview.github-inbox.";
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const validKind = (value: unknown): value is GitHubKind => value === "issue" || value === "pullRequest";
const validRepository = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(value) && !value.split("/").some((part) => part === "." || part === "..");
export const githubItemKey = (item: Pick<GitHubItem, "kind" | "number">) => `${item.kind}:${item.number}`;
export const githubInboxKey = (accountId: number, repositoryId: number) => `${githubInboxPrefix}${accountId}.${repositoryId}`;
export const githubValues = (item: GitHubItem): GitHubValues => ({ title: item.title, description: item.description, completed: item.state !== "open" });

export function githubNotificationsContext(account: GitHubAccount | null, repository: GitHubRepository | null, inbox: GitHubInboxState | null, error: string, refreshing: boolean) {
  const available = !!account && !!repository && !!inbox;
  return { available, account, repository, notifications: available ? inbox.pending : [], lastSync: available ? inbox.lastSync : null, refreshing,
    error: error || (available ? null : !account ? "GitHub is not connected in Lotse." : "GitHub Inbox is not available for the current repository yet.") };
}

export async function previewGitHubImage(source: string, link: GitHubLink): Promise<string> {
  let url: URL;
  try { url = new URL(source); } catch { return source; }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith("/user-attachments/assets/")) return source;
  const html = await invoke<string>("github_render_image", { accountId: link.accountId, repository: link.repository, source });
  const preview = new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src");
  if (!preview) throw new Error("GitHub could not authorize this image. Check repository access and token permissions.");
  const signed = new URL(preview);
  if (signed.protocol !== "https:" || signed.username || signed.password || signed.port || !["github.com", "private-user-images.githubusercontent.com", "user-images.githubusercontent.com", "camo.githubusercontent.com", "github-production-user-asset-6210df.s3.amazonaws.com"].includes(signed.hostname)) {
    throw new Error("GitHub returned an unsupported image host.");
  }
  return signed.href;
}

export function normalizeGitHubLink(value: unknown): GitHubLink | undefined {
  if (!value || typeof value !== "object") return undefined;
  const link = value as GitHubLink;
  if (!positiveId(link.accountId) || !positiveId(link.repositoryId) || !positiveId(link.number) || !validKind(link.kind) || !validRepository(link.repository)
    || typeof link.accountLogin !== "string" || !["open", "closed", "merged"].includes(link.state) || !link.synced
    || typeof link.synced.title !== "string" || typeof link.synced.description !== "string" || typeof link.synced.completed !== "boolean") return undefined;
  const url = `https://github.com/${link.repository}/${link.kind === "issue" ? "issues" : "pull"}/${link.number}`;
  return { accountId: link.accountId, accountLogin: link.accountLogin, repositoryId: link.repositoryId, repository: link.repository,
    number: link.number, kind: link.kind, url, state: link.state, synced: { ...link.synced }, ...(typeof link.error === "string" ? { error: link.error } : {}) };
}

export function loadGitHubInterval(): number {
  const value = Number(fileStore.getItem(githubIntervalKey));
  return value === 1 || value === 15 ? value : 5;
}

export function loadGitHubInbox(key: string): GitHubInboxState {
  const empty: GitHubInboxState = { pending: [], ignored: [], imported: [], lastSync: null };
  try {
    const value = JSON.parse(fileStore.getItem(key) ?? "null") as GitHubInboxState | null;
    if (!value || !Array.isArray(value.pending) || !Array.isArray(value.ignored) || !Array.isArray(value.imported)) return empty;
    const keys = (values: unknown[]) => [...new Set(values.filter((key): key is string => typeof key === "string" && /^(issue|pullRequest):[1-9]\d*$/.test(key)))];
    const pending = value.pending.filter((item) => item && positiveId(item.number) && validKind(item.kind) && typeof item.reason === "string" && typeof item.updatedAt === "string").map((entry) => {
      const item = entry.item;
      return { number: entry.number, kind: entry.kind, reason: entry.reason, updatedAt: entry.updatedAt,
        ...(item && item.number === entry.number && item.kind === entry.kind && typeof item.title === "string" && typeof item.description === "string" && ["open", "closed", "merged"].includes(item.state) ? { item } : {}),
        ...(typeof entry.error === "string" ? { error: entry.error } : {}) };
    });
    const result = { pending, ignored: keys(value.ignored), imported: keys(value.imported), lastSync: typeof value.lastSync === "number" && Number.isFinite(value.lastSync) ? value.lastSync : null };
    return mergeGitHubNotifications(result, []);
  } catch { return empty; }
}

export function saveGitHubInbox(key: string, state: GitHubInboxState) { fileStore.setItem(key, JSON.stringify(state)); }

export function mergeGitHubNotifications(state: GitHubInboxState, notifications: GitHubNotification[]): GitHubInboxState {
  const hidden = new Set([...state.ignored, ...state.imported]);
  const pending = new Map(state.pending.filter((item) => !hidden.has(githubItemKey(item))).map((item) => [githubItemKey(item), item]));
  for (const notification of notifications) {
    const key = githubItemKey(notification);
    if (!hidden.has(key)) pending.set(key, { ...pending.get(key), ...notification });
  }
  return { ...state, pending: [...pending.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
}

export function dismissGitHubItem(state: GitHubInboxState, item: Pick<GitHubItem, "number" | "kind">, action: "ignored" | "imported"): GitHubInboxState {
  const key = githubItemKey(item);
  return { ...state, pending: state.pending.filter((entry) => githubItemKey(entry) !== key), [action]: [...new Set([...state[action], key])] };
}

export function githubImportedTask(item: GitHubItem, account: GitHubAccount, repository: GitHubRepository, task: RepositoryTask): RepositoryTask {
  return { ...task, ...githubValues(item), parentId: null, manualStatus: item.state === "open" ? item.kind === "issue" ? "inbox" : "inReview" : null,
    github: { accountId: account.id, accountLogin: account.login, repositoryId: repository.id, repository: repository.fullName,
      number: item.number, kind: item.kind, url: `https://github.com/${repository.fullName}/${item.kind === "issue" ? "issues" : "pull"}/${item.number}`, state: item.state, synced: githubValues(item) } };
}
