import { useRef, useState, type ReactNode } from "react";
import { Bot, CircleHelp, FolderGit2, GitPullRequest, KeyRound, ListTodo, Plug, Search, Settings, SlidersHorizontal, Timer, X } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

const pages = [
  { id: "general", label: "General", group: "Personal", icon: Settings, keywords: "notifications diff review simulator" },
  { id: "tasks", label: "Tasks", group: "Personal", icon: ListTodo, keywords: "kanban gantt list modal custom fields options" },
  { id: "pomodoro", label: "Pomodoro", group: "Personal", icon: Timer, keywords: "focus timer sessions breaks" },
  { id: "providers", label: "Model providers", group: "Agent", icon: SlidersHorizontal, keywords: "api keys openrouter global repository default credentials setup onboarding" },
  { id: "agent", label: "Agent preferences", group: "Agent", icon: Bot, keywords: "models favorites effort approval mode task location branch prefix commit user rules personalization" },
  { id: "mcp", label: "MCP servers", group: "Connections", icon: Plug, keywords: "tools integrations figma slack oauth" },
  { id: "github", label: "GitHub", group: "Connections", icon: GitPullRequest, keywords: "account token inbox refresh issues pull requests" },
  { id: "credentials", label: "Website credentials", group: "Connections", icon: KeyRound, keywords: "browser login password keychain" },
  { id: "repository", label: "Repository", group: "Workspace", icon: FolderGit2, keywords: "git branches fetch pull run command worktrees cleanup" },
  { id: "diagnostics", label: "Diagnostics", group: "Workspace", icon: CircleHelp, keywords: "troubleshooting bundled codex agent" },
] as const;

export type SettingsPage = typeof pages[number]["id"];

export function SettingsLayout({ page, onPageChange, onClose, browserSupported, children }: {
  page: SettingsPage;
  onPageChange: (page: SettingsPage) => void;
  onClose: () => void;
  browserSupported: boolean;
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const matches = pages.filter((item) => (item.id !== "credentials" || browserSupported)
    && `${item.label} ${item.group} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selectPage = (next: SettingsPage) => {
    onPageChange(next);
    content.current?.scrollTo(0, 0);
    heading.current?.focus();
  };

  return <section className="settings-layout" aria-labelledby="settings-title">
    <aside className="settings-sidebar">
      <header className="settings-sidebar-header"><h1 id="settings-title">Settings</h1><Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close settings"><X size={16} /></Button></header>
      <div className="settings-search"><Search size={16} aria-hidden="true" /><Input type="search" aria-label="Search settings" placeholder="Search settings" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></div>
      <nav aria-label="Settings sections" className="settings-nav">
        {(["Personal", "Agent", "Connections", "Workspace"] as const).map((group) => {
          const items = matches.filter((item) => item.group === group);
          return items.length > 0 && <div key={group} className="settings-nav-group"><p>{group}</p>{items.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" className="settings-nav-item" aria-current={page === id ? "page" : undefined} onClick={() => selectPage(id)}><Icon size={17} aria-hidden="true" /><span>{label}</span></Button>)}</div>;
        })}
        {matches.length === 0 && <p className="settings-search-empty" role="status">No settings found.</p>}
      </nav>
    </aside>
    <div className="settings-main" ref={content}>
      <div className="settings-content">
        <h2 className="settings-page-title" tabIndex={-1} ref={heading}>{pages.find((item) => item.id === page)?.label}</h2>
        {children}
      </div>
    </div>
  </section>;
}
