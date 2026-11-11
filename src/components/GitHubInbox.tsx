import { useState } from "react";
import { GitPullRequest, GitMerge, CircleDot, ExternalLink, RefreshCw, Plus, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { githubItemKey } from "../github";
import type { GitHubInboxController } from "../useGitHubInbox";
import type { RepositoryTask } from "../types";

function GitHubIcon({ size = 15 }: { size?: number }) {
  return <span className="github-octocat" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function GitHubInbox({ github, onSettings }: { github: GitHubInboxController; onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const [linkError, setLinkError] = useState("");
  const pending = github.repository ? github.inbox.pending : [];
  const error = github.connectionError || github.error || linkError;
  const refreshedAt = github.inbox.lastSync ? new Date(github.inbox.lastSync) : null;
  const openItem = (number: number, kind: "issue" | "pullRequest") => {
    if (!github.repository) return;
    setLinkError("");
    void openUrl(`https://github.com/${github.repository.fullName}/${kind === "issue" ? "issues" : "pull"}/${number}`).catch((error) => setLinkError(String(error)));
  };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger className="top-button github-inbox-trigger" aria-label={`GitHub Inbox (${pending.length})`} title="GitHub Inbox">
      <GitHubIcon />{pending.length > 0 && <span className="github-inbox-count" aria-hidden="true">{pending.length.toLocaleString()}</span>}
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} className="github-inbox-popover">
      <header className="github-inbox-header">
        <div className="min-w-0"><PopoverTitle className="github-inbox-heading">GitHub Inbox</PopoverTitle>{github.repository && <p className="github-inbox-repository" title={github.repository.fullName}>{github.repository.fullName}</p>}</div>
        <Button variant="ghost" size="icon-sm" className="github-inbox-refresh" disabled={github.busy || github.resolving || github.accountBusy} aria-label="Refresh GitHub Inbox" title="Refresh GitHub notifications" onClick={() => void (github.account ? github.refresh() : github.reloadConnection())}><RefreshCw size={14} className={github.busy || github.resolving ? "animate-spin" : ""} /></Button>
      </header>
      {error && <p role="alert" className="github-inbox-error">{error}</p>}
      {github.accountBusy || github.resolving ? <p role="status" className="github-inbox-empty">Checking GitHub connection…</p>
        : !github.account ? <div className="github-inbox-empty"><GitHubIcon size={24} /><p>Bring your GitHub work into Tasks.</p><Button size="sm" variant="outline" onClick={() => { setOpen(false); onSettings(); }}>Connect GitHub</Button></div>
        : !github.repository ? <p className="github-inbox-empty">Open a repository with a GitHub.com origin to use the inbox.</p>
        : <>
          {pending.length ? <ScrollArea className="github-inbox-list"><div>{pending.map((entry) => {
            const state = entry.item?.state;
            const Icon = state === "merged" ? GitMerge : entry.kind === "issue" ? CircleDot : GitPullRequest;
            return <article key={githubItemKey(entry)} className="github-inbox-row" aria-label={`${entry.kind === "issue" ? "Issue" : "Pull request"} #${entry.number}`}>
              <Icon size={16} strokeWidth={1.6} className={`github-inbox-item-icon github-inbox-item-${state ?? "loading"}`} aria-label={entry.kind === "issue" ? "Issue" : "Pull request"} />
              <div className="min-w-0">
                <Button variant="ghost" className="github-inbox-title" aria-label={`${entry.item?.title ?? "View item"} — open #${entry.number} on GitHub`} title={entry.item?.title} onClick={() => openItem(entry.number, entry.kind)}><span>{entry.item?.title ?? `${entry.kind === "issue" ? "Issue" : "Pull request"} #${entry.number}`}</span><ExternalLink size={12} /></Button>
                <div className="github-inbox-row-footer">
                  <div className="github-inbox-meta"><span>#{entry.number}</span><span className="capitalize">{state ?? "Loading"}</span><span>{entry.reason.replace(/_/g, " ")}</span></div>
                  <div className="github-inbox-actions">
                    <Button variant="ghost" size="icon-sm" className="github-inbox-ignore" aria-label={`Dismiss #${entry.number}`} title="Dismiss" disabled={github.busy} onClick={() => github.ignore(entry)}><X size={14} aria-hidden="true" /></Button>
                    <Button variant="secondary" size="icon-sm" className="github-inbox-import" aria-label={`Add #${entry.number} to Tasks`} title="Add to Tasks" disabled={github.busy || !entry.item || !!entry.error} onClick={() => void github.importItem(entry)}><Plus size={14} aria-hidden="true" /></Button>
                  </div>
                </div>
                {entry.error && <p role="alert" className="github-inbox-item-error">{entry.error}</p>}
              </div>
            </article>;
          })}</div></ScrollArea> : <div role="status" className="github-inbox-empty"><GitHubIcon size={26} /><p>{github.busy ? "Checking for updates…" : "You’re all caught up."}</p></div>}
          <footer className="github-inbox-footer"><span>@{github.account.login}</span><span role="status" title={refreshedAt?.toLocaleString()}>{github.busy ? "Refreshing…" : refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not refreshed yet"}</span></footer>
        </>}
    </PopoverContent>
  </Popover>;
}

export function GitHubSettings({ github }: { github: GitHubInboxController }) {
  const [token, setToken] = useState("");
  return <section className="mt-10" aria-labelledby="github-settings-title">
    <h2 id="github-settings-title" className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">GitHub</h2>
    <div className="space-y-4 rounded-xl border border-[#294536] bg-[#111A15] p-5">
      <div className="flex items-center justify-between gap-3"><p className="text-sm">{github.accountBusy ? "Checking connection…" : github.account ? `Connected as @${github.account.login}` : "No GitHub account connected"}</p>{github.account && <Button variant="ghost" size="sm" disabled={github.accountBusy} onClick={() => void github.disconnect()}>Disconnect</Button>}</div>
      <p className="text-sm text-[#7C9B88]">Use a classic personal access token with <code>notifications</code> access, plus <code>repo</code> access for private repositories. Fine-grained tokens cannot read notifications. The token is stored as plaintext in ~/.lotse/credentials.json.</p>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void github.connect(token).then((saved) => { if (saved) setToken(""); }); }}>
        <Input type="password" value={token} onChange={(event) => setToken(event.currentTarget.value)} autoComplete="off" spellCheck={false} placeholder="ghp_…" aria-label="GitHub classic personal access token" disabled={github.accountBusy} className="min-w-48 flex-1" />
        <Button type="submit" variant="outline" disabled={github.accountBusy || !token.trim()}>{github.account ? "Replace token" : "Connect GitHub"}</Button>
        {!github.account && <Button variant="ghost" disabled={github.accountBusy} onClick={() => void github.reloadConnection()}>Retry connection</Button>}
      </form>
      {github.connectionError && <p role="alert" className="text-sm text-[#FB7185]">{github.connectionError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><label id="github-interval-label" className="text-sm">Inbox refresh interval</label><Select value={String(github.interval)} onValueChange={(value) => { if (value) github.setInterval(Number(value)); }}><SelectTrigger aria-labelledby="github-interval-label" className="w-40"><SelectValue>{(value) => `${value} ${value === "1" ? "minute" : "minutes"}`}</SelectValue></SelectTrigger><SelectContent className="ios-select-content">{[1, 5, 15].map((value) => <SelectItem key={value} value={String(value)}>{value} {value === 1 ? "minute" : "minutes"}</SelectItem>)}</SelectContent></Select></div>
      <p className="text-xs text-[#7C9B88]">The inbox refreshes while a repository is open in Lotse. Import copies an issue or PR into Tasks once. Task edits and GitHub changes stay independent; completing a task does not close the issue or PR.</p>
    </div>
  </section>;
}

export function GitHubTaskLink({ task }: { task: RepositoryTask }) {
  const [error, setError] = useState("");
  const link = task.github;
  if (!link) return null;
  return <div className="space-y-1 text-xs"><Button variant="outline" size="sm" className="max-w-full justify-start" onClick={() => { setError(""); void openUrl(link.url).catch((reason) => setError(String(reason))); }}><GitHubIcon size={14} /><span className="truncate">{link.repository} #{link.number}</span><ExternalLink size={12} /></Button><p className="text-[#7C9B88]">Last known GitHub state: {link.state} · Sync disabled</p>{error && <p role="alert" className="text-[#FB7185]">{error}</p>}</div>;
}
