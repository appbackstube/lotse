import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { invoke } from "@tauri-apps/api/core";
import { FileText, ListTodo, MessageCircle, Search, X, CircleX } from "lucide-react";
import { Dialog, DialogClose, DialogTitle } from "./ui/dialog";
import { searchDocuments, searchSnippet, searchWords, taskSearchDocuments, workspaceSearchContext, workspaceSearchDocuments, type SearchDocument, type SearchResponse } from "../spotlight";
import type { RepositoryTask, ReviewSession } from "../types";

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  const words = searchWords(query).sort((a, b) => b.length - a.length);
  if (!words.length) return text;
  const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(pattern).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>)}</>;
}

export function SpotlightSearch({ repositoryRoot, repositoryName, tasks, review, onNavigate, onOpening }: {
  repositoryRoot: string; repositoryName: string; tasks: RepositoryTask[]; review: ReviewSession | null;
  onNavigate: (document: SearchDocument, query: string) => Promise<boolean>;
  onOpening: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse>({ documents: [], errors: [] });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const [opening, setOpening] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const openingRef = useRef(false);
  const onOpeningRef = useRef(onOpening);
  onOpeningRef.current = onOpening;
  const hasQuery = searchWords(query).length > 0;
  const changeOpen = (value: boolean) => {
    if (value) { previousFocus.current = document.activeElement as HTMLElement | null; onOpeningRef.current(); setQuery(""); setNavigationError(""); setResponse({ documents: [], errors: [] }); }
    setOpen(value);
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k" || event.isComposing) return;
      event.preventDefault(); event.stopPropagation();
      if (open) { input.current?.focus(); return; }
      previousFocus.current = document.activeElement as HTMLElement | null;
      onOpeningRef.current(); setQuery(""); setNavigationError(""); setOpen(true);
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [open]);
  useEffect(() => {
    let cancelled = false;
    setResponse({ documents: [], errors: [] });
    setSelected(0);
    if (!open || !hasQuery) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      void invoke<SearchResponse>("search_repository_content", { repositoryRoot, query }).then((next) => {
        if (!cancelled && mounted.current) setResponse(next);
      }).catch(() => {
        if (!cancelled && mounted.current) setResponse({ documents: [], errors: ["Memory and saved workspace chats could not be searched. Results are incomplete."] });
      }).finally(() => { if (!cancelled && mounted.current) setLoading(false); });
    }, 150);
    return () => { clearTimeout(timer); cancelled = true; };
  }, [open, query, hasQuery, repositoryRoot, revision]);
  const documents = useMemo(() => {
    if (!open || !hasQuery) return [];
    const context = review ? workspaceSearchContext(review) : null;
    return searchDocuments([...taskSearchDocuments(tasks), ...workspaceSearchDocuments(review), ...response.documents.filter((doc) => doc.target.type !== "workspace" || doc.target.context !== context)], query);
  }, [tasks, review, response, query, open, hasQuery]);
  const index = Math.min(selected, Math.max(0, documents.length - 1));
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [index, documents]);
  const navigate = async (document: SearchDocument) => {
    if (openingRef.current) return;
    openingRef.current = true; setOpening(true); setNavigationError("");
    try {
      if (await onNavigate(document, query)) { if (mounted.current) setOpen(false); }
      else if (mounted.current) { setNavigationError("This result could not be opened. Your drafts are preserved. Search again or retry."); setRevision((value) => value + 1); }
    } catch (reason) { if (mounted.current) { setNavigationError(reason instanceof Error ? reason.message : String(reason)); setRevision((value) => value + 1); } }
    finally { openingRef.current = false; if (mounted.current) setOpening(false); }
  };
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogPrimitive.Trigger className="top-button spotlight-trigger" aria-label="Search current repository" aria-keyshortcuts="Meta+K Control+K" title="Search (⌘K / Ctrl+K)"><Search size={15} /><span>Search</span><kbd>⌘ K</kbd></DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="spotlight-backdrop" />
      <DialogPrimitive.Popup className="spotlight-popup" initialFocus={input} finalFocus={() => previousFocus.current?.isConnected && previousFocus.current.getClientRects().length ? previousFocus.current : undefined}>
        <DialogTitle className="sr-only">Search in {repositoryName}</DialogTitle>
        <div className="spotlight-input-row"><Search size={22} aria-hidden="true" /><input ref={input} value={query} maxLength={500} onChange={(event) => { setQuery(event.currentTarget.value); setSelected(0); setNavigationError(""); }} placeholder={`Search anything in ${repositoryName}…`} aria-label="Search tasks, comments, chats and memory" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="spotlight-results" aria-activedescendant={documents.length ? `spotlight-result-${index}` : undefined} autoComplete="off" spellCheck={false} onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && documents.length) { event.preventDefault(); setSelected((index + (event.key === "ArrowDown" ? 1 : -1) + documents.length) % documents.length); }
          if (event.key === "Enter" && documents[index]) { event.preventDefault(); void navigate(documents[index]); }
        }} />{query && <button type="button" className="spotlight-icon-button" aria-label="Clear search" onClick={() => { setQuery(""); input.current?.focus(); }}><CircleX size={16} /></button>}<DialogClose className="spotlight-icon-button" aria-label="Close search"><X size={17} /></DialogClose></div>
        {(response.errors.length > 0 || navigationError) && <div className="spotlight-error" role="alert">{navigationError || `Results are incomplete. ${response.errors.join(" ")}`} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></div>}
        <div ref={list} id="spotlight-results" role="listbox" aria-label="Search results" aria-busy={loading} className="spotlight-results">
          {documents.map((document, resultIndex) => {
            const Icon = document.kind === "Task" ? ListTodo : document.kind === "Memory" ? FileText : MessageCircle;
            return <div key={document.id} id={`spotlight-result-${resultIndex}`} role="option" aria-selected={resultIndex === index} aria-disabled={opening} className="spotlight-result" onMouseDown={(event) => event.preventDefault()} onClick={() => { void navigate(document); }}><span className="spotlight-result-icon"><Icon size={19} /></span><div className="spotlight-result-body"><div className="spotlight-result-heading"><span><SearchHighlight text={document.title} query={query} /></span><small>{document.kind}</small></div><div className="spotlight-breadcrumb">{document.breadcrumb}</div><div className="spotlight-snippet"><SearchHighlight text={searchSnippet(document.body, query)} query={query} /></div></div><span className="spotlight-enter" aria-hidden="true">↵</span></div>;
          })}
        </div>
        {!documents.length && <div className="spotlight-empty"><Search size={25} aria-hidden="true" /><h2>{!hasQuery ? "Find your place." : loading ? "Searching…" : "No results found"}</h2><p>{!hasQuery ? "Search tasks, conversations and memory." : loading ? "Searching this repository." : "Try another word or a shorter phrase."}</p></div>}
        <footer className="spotlight-footer"><span role="status" aria-live="polite">{opening ? "Opening…" : !hasQuery ? "Start typing to search" : `${documents.length} result${documents.length === 1 ? "" : "s"}${loading ? " · Searching…" : ""}`}</span><span><kbd>↑</kbd><kbd>↓</kbd> select</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></footer>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  </Dialog>;
}
