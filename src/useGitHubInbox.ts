import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RepositoryTask } from "./types";
import { fileStore } from "./fileStore";
import { saveTasks } from "./tasks";
import { dismissGitHubItem, githubImportedTask, githubInboxKey, githubIntervalKey, githubItemKey, githubNotificationsContext, loadGitHubInbox, loadGitHubInterval, mergeGitHubNotifications, saveGitHubInbox,
  type GitHubAccount, type GitHubInboxState, type GitHubItem, type GitHubNotification, type GitHubPendingItem, type GitHubRepository } from "./github";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useGitHubInbox(options: {
  rootPath: string | undefined; ready: boolean; tasks: RepositoryTask[];
  setTasks: Dispatch<SetStateAction<RepositoryTask[]>>; makeTask: (item: GitHubItem) => RepositoryTask;
}) {
  const [account, setAccount] = useState<GitHubAccount | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [repository, setRepository] = useState<GitHubRepository | null>(null);
  const resolvedScope = useRef<{ rootPath: string; accountId: number } | null>(null);
  const [interval, setIntervalValue] = useState(loadGitHubInterval);
  const [inbox, setInbox] = useState<GitHubInboxState>({ pending: [], ignored: [], imported: [], lastSync: null });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const latest = useRef({ ...options, account, repository });
  latest.current = { ...options, account, repository };
  const generation = useRef(0);
  const accountRequest = useRef(0);
  const invalidateConnection = useCallback(() => { accountRequest.current++; generation.current++; }, []);
  const invalidateScope = useCallback(() => { generation.current++; }, []);
  const running = useRef(false);
  const lastAttempt = useRef(0);
  const scopeKey = account && repository ? githubInboxKey(account.id, repository.id) : null;
  const inboxRef = useRef({ key: scopeKey, value: inbox });

  const reloadConnection = useCallback(async () => {
    const request = ++accountRequest.current;
    generation.current++;
    setAccountBusy(true);
    setConnectionError("");
    try {
      const result = await invoke<GitHubAccount | null>("github_connection");
      if (request === accountRequest.current) { setAccount(result); setConnectionVersion((value) => value + 1); }
    } catch (error) { if (request === accountRequest.current) setConnectionError(errorMessage(error)); }
    finally { if (request === accountRequest.current) setAccountBusy(false); }
  }, []);

  useEffect(() => {
    void reloadConnection();
    let disposed = false;
    const stop = listen("github-connection-changed", () => void reloadConnection());
    void stop.then((unlisten) => { if (disposed) unlisten(); });
    return () => { disposed = true; invalidateConnection(); void stop.then((unlisten) => unlisten()); };
  }, [reloadConnection, invalidateConnection]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === githubIntervalKey) setIntervalValue(loadGitHubInterval());
      if (event.key === inboxRef.current.key && event.key) {
        const value = loadGitHubInbox(event.key);
        inboxRef.current = { key: event.key, value }; setInbox(value);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    const epoch = ++generation.current;
    setRepository(null); setError(""); setResolving(false);
    if (!account || !options.rootPath || !options.ready) return;
    setResolving(true);
    void invoke<GitHubRepository>("github_repository", { accountId: account.id }).then((value) => {
      if (generation.current === epoch) { resolvedScope.current = { rootPath: options.rootPath!, accountId: account.id }; setRepository(value); }
    }).catch((error) => { if (generation.current === epoch) setError(errorMessage(error)); })
      .finally(() => { if (generation.current === epoch) setResolving(false); });
    return () => { invalidateScope(); };
  }, [account, connectionVersion, options.rootPath, options.ready, invalidateScope]);

  useEffect(() => {
    const value = scopeKey ? loadGitHubInbox(scopeKey) : { pending: [], ignored: [], imported: [], lastSync: null };
    inboxRef.current = { key: scopeKey, value }; setInbox(value); lastAttempt.current = 0;
  }, [scopeKey]);

  const changeInbox = useCallback((key: string, update: (state: GitHubInboxState) => GitHubInboxState) => {
    if (inboxRef.current.key !== key) return;
    const value = update(inboxRef.current.value);
    saveGitHubInbox(key, value);
    inboxRef.current = { key, value }; setInbox(value);
  }, []);

  const refresh = useCallback(async () => {
    const { account, repository, rootPath, ready } = latest.current;
    if (!account || !rootPath || !ready || running.current || importingRef.current) return;
    if (!repository) return;
    const epoch = generation.current;
    const active = () => generation.current === epoch && latest.current.rootPath === rootPath && latest.current.account?.id === account.id && latest.current.ready;
    const key = githubInboxKey(account.id, repository.id);
    if (inboxRef.current.key !== key) return;
    running.current = true; setBusy(true); setError(""); lastAttempt.current = Date.now();
    const failures: string[] = [];
    const params = { accountId: account.id, repository: repository.fullName };
    try {
      // Existing links also suppress imports when recovering from an interrupted import.
      const linked = latest.current.tasks.filter((task) => task.github?.accountId === account.id && task.github.repositoryId === repository.id);
      if (linked.length) {
        try {
          saveTasks(rootPath, latest.current.tasks);
          await fileStore.flush();
          if (!active()) return;
          changeInbox(key, (state) => linked.reduce((state, task) => dismissGitHubItem(state, task.github!, "imported"), state));
        } catch (error) { failures.push(`Cannot save imported tasks: ${errorMessage(error)}`); }
      }
      try {
        const notifications = await invoke<GitHubNotification[]>("github_fetch_inbox", params);
        if (!active()) return;
        changeInbox(key, (state) => mergeGitHubNotifications(state, notifications));
      } catch (error) { if (!active()) return; failures.push(errorMessage(error)); }

      for (const pending of [...inboxRef.current.value.pending]) {
        if (!active()) return;
        if (!inboxRef.current.value.pending.some((item) => githubItemKey(item) === githubItemKey(pending))) continue;
        try {
          const item = await invoke<GitHubItem>("github_get_item", { ...params, kind: pending.kind, number: pending.number });
          if (!active()) return;
          changeInbox(key, (state) => ({ ...state, pending: state.pending.map((entry) => githubItemKey(entry) === githubItemKey(item) ? { ...entry, item, error: undefined } : entry) }));
        } catch (error) {
          if (!active()) return;
          const text = errorMessage(error); failures.push(`#${pending.number}: ${text}`);
          changeInbox(key, (state) => ({ ...state, pending: state.pending.map((entry) => githubItemKey(entry) === githubItemKey(pending) ? { ...entry, error: text } : entry) }));
        }
      }

      if (active()) {
        setError([...new Set(failures)].slice(0, 3).join("\n"));
        if (!failures.length) changeInbox(key, (state) => ({ ...state, lastSync: Date.now() }));
      }
    } finally { running.current = false; setBusy(false); }
  }, [changeInbox]);

  useEffect(() => {
    const tick = () => { if (Date.now() - lastAttempt.current >= interval * 60_000) void refresh(); };
    void refresh();
    const timer = window.setInterval(tick, 15_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [scopeKey, interval, refresh]);

  const connect = async (token: string) => {
    generation.current++; setAccountBusy(true); setConnectionError("");
    try { await invoke("github_connect", { token }); await reloadConnection(); return true; }
    catch (error) { setConnectionError(errorMessage(error)); return false; }
    finally { setAccountBusy(false); setConnectionVersion((value) => value + 1); }
  };
  const disconnect = async () => {
    generation.current++; setAccountBusy(true); setConnectionError("");
    try { await invoke("github_disconnect"); setAccount(null); await reloadConnection(); }
    catch (error) { setConnectionError(errorMessage(error)); }
    finally { setAccountBusy(false); setConnectionVersion((value) => value + 1); }
  };

  const ignore = (item: GitHubPendingItem) => { if (scopeKey) changeInbox(scopeKey, (state) => dismissGitHubItem(state, item, "ignored")); };
  const importItem = async (pending: GitHubPendingItem) => {
    if (!scopeKey || !account || !repository || !pending.item || pending.error || busy || importingRef.current || !options.ready || !options.rootPath) return;
    const state = inboxRef.current.value;
    const id = githubItemKey(pending);
    if (state.ignored.includes(id) || state.imported.includes(id)) return;
    const task = githubImportedTask(pending.item, account, repository, options.makeTask(pending.item));
    importingRef.current = true; setImporting(true);
    const tasks = latest.current.tasks;
    const next = tasks.some((entry) => entry.github?.accountId === account.id && entry.github.repositoryId === repository.id && githubItemKey(entry.github) === id) ? tasks : [...tasks, task];
    saveTasks(options.rootPath, next);
    options.setTasks(next);
    try {
      // Persist the task before its tombstone; interrupted imports recover from the link.
      await fileStore.flush();
      changeInbox(scopeKey, (state) => dismissGitHubItem(state, pending, "imported"));
    } catch (error) { setError(`Could not finish importing: ${errorMessage(error)}`); }
    finally { importingRef.current = false; setImporting(false); }
  };

  const notificationsContext = useMemo(() => {
    const scoped = options.ready && resolvedScope.current?.rootPath === options.rootPath && resolvedScope.current?.accountId === account?.id;
    return githubNotificationsContext(account, scoped ? repository : null, inboxRef.current.key === scopeKey && inboxRef.current.value === inbox ? inbox : null, connectionError || error, accountBusy || resolving || busy);
  }, [options.ready, options.rootPath, account, repository, inbox, scopeKey, connectionError, error, accountBusy, resolving, busy]);

  return { account, accountBusy, connectionError, repository, interval, inbox, error, busy: busy || importing, resolving, notificationsContext,
    refresh: async () => { if (!latest.current.repository) setConnectionVersion((value) => value + 1); else await refresh(); }, connect, disconnect, reloadConnection,
    setInterval: (value: number) => { if ([1, 5, 15].includes(value)) { fileStore.setItem(githubIntervalKey, String(value)); setIntervalValue(value); } }, ignore, importItem };
}

export type GitHubInboxController = ReturnType<typeof useGitHubInbox>;
