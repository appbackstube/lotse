import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { DragDropProvider, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronRight, Copy, Ellipsis, FilePlus2, FileText, Folder, FolderPlus, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { revealSearchSource } from "../spotlight";
import { MarkdownEditor } from "@/components/MarkdownEditor";

type Entry = { path: string; name: string; folder: boolean };
type MemoryFile = { path: string; content: string; draft: string; revision: string };
type Create = { parent: string; folder: boolean };
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);
const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const belongsTo = (path: string, ancestor: string) => path === ancestor || path.startsWith(`${ancestor}/`);
const canMoveTo = (path: string, folder: string) => parentOf(path) !== folder && !belongsTo(folder, path);

function MemoryTreeItem({ entry, editing, draggingPath, expanded, setExpanded, children }: { entry: Entry; editing: boolean; draggingPath: string | null; expanded: boolean; setExpanded: Dispatch<SetStateAction<Set<string>>>; children: (bindings: { ref: (element: Element | null) => void; isDragging: boolean; isDropTarget: boolean }) => ReactNode }) {
  const { ref: dragRef, isDragging } = useDraggable({ id: entry.path, type: "memory-entry", disabled: editing });
  const { ref: dropRef, isDropTarget } = useDroppable({ id: `memory-folder:${entry.path}`, type: "memory-folder", accept: "memory-entry", disabled: !entry.folder });
  useEffect(() => {
    if (!isDropTarget || !draggingPath || !canMoveTo(draggingPath, entry.path) || expanded) return;
    const timer = window.setTimeout(() => setExpanded((current) => new Set(current).add(entry.path)), 650);
    return () => window.clearTimeout(timer);
  }, [isDropTarget, draggingPath, expanded, entry.path, setExpanded]);
  return children({ ref: (element) => { dragRef(element); dropRef(element); }, isDragging, isDropTarget: isDropTarget && !!draggingPath && canMoveTo(draggingPath, entry.path) });
}

function MemoryRootTarget({ draggingPath, children }: { draggingPath: string | null; children: (bindings: { ref: (element: Element | null) => void; isDropTarget: boolean }) => ReactNode }) {
  const { ref, isDropTarget } = useDroppable({ id: "memory-root", type: "memory-folder", accept: "memory-entry" });
  return children({ ref, isDropTarget: isDropTarget && !!draggingPath && canMoveTo(draggingPath, "") });
}

export function MemoryWorkspace({ repositoryRoot, flushRef, openRef, visible }: { repositoryRoot: string; flushRef: RefObject<(() => Promise<boolean>) | null>; openRef: RefObject<((path: string, query: string) => Promise<boolean>) | null>; visible: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [file, setFile] = useState<MemoryFile | null>(null);
  const fileRef = useRef<MemoryFile | null>(null);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [creating, setCreating] = useState<Create | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [error, setError] = useState("");
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [conflict, setConflictState] = useState(false);
  const conflictRef = useRef(false);
  const savePromise = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => true);
  const loadRequest = useRef(0);
  const [searchReveal, setSearchReveal] = useState<{ path: string; query: string; request: number } | null>(null);
  const editorPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!searchReveal || !visible || file?.path !== searchReveal.path) return;
    return revealSearchSource(() => editorPanel.current?.querySelector<HTMLElement>(".memory-description-content, textarea") ?? null, searchReveal.query);
  }, [searchReveal, visible, file?.path]);

  const setCurrent = (next: MemoryFile | null) => { fileRef.current = next; setFile(next); };
  const setConflict = (next: boolean) => { conflictRef.current = next; setConflictState(next); };
  const refreshTree = async () => {
    try { setEntries(await invoke<Entry[]>("list_memory")); setError(""); }
    catch (reason) { setError(errorText(reason)); }
  };
  const loadFile = useCallback(async (path: string) => {
    const request = ++loadRequest.current;
    try {
      const loaded = await invoke<Omit<MemoryFile, "draft">>("read_memory", { path });
      if (request !== loadRequest.current) return false;
      setCurrent({ ...loaded, draft: loaded.content });
      setSelectedFolder("");
      setConflict(false);
      setError("");
      return true;
    } catch (reason) { if (request === loadRequest.current) setError(errorText(reason)); return false; }
  }, []);
  const save = async (): Promise<boolean> => {
    if (savePromise.current) {
      if (!await savePromise.current) return false;
      return save();
    }
    const current = fileRef.current;
    if (!current || current.draft === current.content) return true;
    if (conflictRef.current) return false;
    const pending = (async () => {
      try {
        const saved = await invoke<Omit<MemoryFile, "draft">>("write_memory", {
          path: current.path, content: current.draft, expectedRevision: current.revision,
        });
        if (fileRef.current?.path === current.path) setCurrent({ ...fileRef.current, content: saved.content, revision: saved.revision });
        setError("");
        return true;
      } catch (reason) {
        const text = errorText(reason);
        if (text.includes("revision conflict")) setConflict(true);
        setError(text);
        return false;
      }
    })();
    savePromise.current = pending;
    const okay = await pending;
    if (savePromise.current === pending) savePromise.current = null;
    if (okay && fileRef.current?.path === current.path && fileRef.current.draft !== fileRef.current.content) return save();
    return okay;
  };
  saveRef.current = save;
  useEffect(() => { flushRef.current = () => saveRef.current(); return () => { flushRef.current = null; }; }, [flushRef]);

  useEffect(() => {
    void refreshTree();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<{ repositoryRoot: string; path: string; destinationPath?: string }>("mcp-memory-updated", async ({ payload }) => {
      if (disposed || payload.repositoryRoot !== repositoryRoot) return;
      await refreshTree();
      const current = fileRef.current;
      if (payload.destinationPath) {
        const destination = payload.destinationPath;
        const rebase = (path: string) => destination + path.slice(payload.path.length);
        setSelectedFolder((path) => path && belongsTo(path, payload.path) ? rebase(path) : path);
        setExpanded((paths) => new Set([...paths].map((path) => belongsTo(path, payload.path) ? rebase(path) : path)));
        if (!current || !belongsTo(current.path, payload.path)) return;
        const movedPath = rebase(current.path);
        loadRequest.current++;
        setCurrent({ ...current, path: movedPath });
        if (current.draft !== current.content || savePromise.current) { setConflict(true); return; }
        await loadFile(movedPath);
        return;
      }
      if (current?.path !== payload.path) return;
      if (current.draft !== current.content || savePromise.current) { setConflict(true); return; }
      try {
        const loaded = await invoke<Omit<MemoryFile, "draft">>("read_memory", { path: current.path });
        if (fileRef.current?.path === current.path && fileRef.current.draft === fileRef.current.content) setCurrent({ ...loaded, draft: loaded.content });
      } catch (reason) { setError(errorText(reason)); }
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch((reason) => { if (!disposed) setError(errorText(reason)); });
    return () => { disposed = true; unlisten?.(); };
  }, [repositoryRoot, loadFile]);

  useEffect(() => {
    if (!file || file.draft === file.content || conflict || error) return;
    const timer = window.setTimeout(() => { void saveRef.current(); }, 500);
    return () => window.clearTimeout(timer);
  }, [file, conflict, error]);

  useEffect(() => {
    if (!file || file.draft === file.content) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [file]);

  const selectFile = async (path: string) => {
    if (fileRef.current?.path === path) { setSelectedFolder(""); return true; }
    if (!await saveRef.current()) return false;
    setSelectedFolder("");
    return loadFile(path);
  };
  useEffect(() => {
    openRef.current = async (path, query) => {
      // Re-read even an already selected file to detect removed or changed results.
      if (!await saveRef.current() || !await loadFile(path)) return false;
      setExpanded((current) => { const next = new Set(current); let parent = parentOf(path); while (parent) { next.add(parent); parent = parentOf(parent); } return next; });
      setSearchReveal({ path, query, request: Date.now() });
      return true;
    };
    return () => { openRef.current = null; };
  }, [openRef, loadFile]);
  const toggleFolder = async (path: string) => {
    if (!await saveRef.current()) return;
    loadRequest.current++;
    setCurrent(null);
    setSelectedFolder(path);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };
  const startCreate = (parent: string, folder: boolean) => {
    setRenaming(null); setCreating({ parent, folder }); setNameDraft("");
    if (parent) setExpanded((current) => new Set(current).add(parent));
  };
  const submitName = async () => {
    const rawName = nameDraft.trim();
    const isFile = renaming ? entries.find((entry) => entry.path === renaming)?.folder === false : creating?.folder === false;
    const name = isFile && rawName && !rawName.endsWith(".md") ? `${rawName}.md` : rawName;
    if (!name || name.includes("/") || name.includes("\\") || name === "." || name === ".." || /[\x00-\x1f\x7f]/.test(name)) { setError("Enter a valid name without path separators."); return; }
    if (renaming) {
      if (!await saveRef.current()) return;
      try {
        const oldPath = renaming;
        const newPath = await invoke<string>("rename_memory_entry", { path: oldPath, newName: name });
        if (fileRef.current && belongsTo(fileRef.current.path, oldPath)) setCurrent({ ...fileRef.current, path: newPath + fileRef.current.path.slice(oldPath.length) });
        if (selectedFolder && belongsTo(selectedFolder, oldPath)) setSelectedFolder(newPath + selectedFolder.slice(oldPath.length));
        setExpanded((current) => new Set([...current].map((path) => belongsTo(path, oldPath) ? newPath + path.slice(oldPath.length) : path)));
        setRenaming(null); setError(""); await refreshTree();
      } catch (reason) { setError(errorText(reason)); }
      return;
    }
    if (!creating) return;
    const path = creating.parent ? `${creating.parent}/${name}` : name;
    if (!await saveRef.current()) return;
    try {
      if (creating.folder) await invoke("create_memory_folder", { path });
      else {
        const created = await invoke<Omit<MemoryFile, "draft">>("write_memory", { path, content: "", expectedRevision: null });
        loadRequest.current++;
        setCurrent({ ...created, draft: created.content });
        setSelectedFolder("");
      }
      setCreating(null); setError(""); await refreshTree();
    } catch (reason) { setError(errorText(reason)); }
  };
  const deleteEntry = async (entry: Entry) => {
    if (!await ask(`Delete ${entry.name}${entry.folder ? " and everything inside it" : ""}?`, { title: "Delete memory", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" })) return;
    if (fileRef.current && belongsTo(fileRef.current.path, entry.path) && !await saveRef.current()) return;
    try {
      await invoke("delete_memory_entry", { path: entry.path });
      if (fileRef.current && belongsTo(fileRef.current.path, entry.path)) setCurrent(null);
      if (selectedFolder && belongsTo(selectedFolder, entry.path)) setSelectedFolder("");
      await refreshTree();
    } catch (reason) { setError(errorText(reason)); }
  };
  const moveEntry = async (oldPath: string, folder: string) => {
    if (!canMoveTo(oldPath, folder) || !await saveRef.current()) return;
    try {
      const name = oldPath.slice(oldPath.lastIndexOf("/") + 1);
      const destinationPath = folder ? `${folder}/${name}` : name;
      const newPath = await invoke<string>("move_memory_entry", { path: oldPath, destinationPath });
      const rebase = (path: string) => newPath + path.slice(oldPath.length);
      if (fileRef.current && belongsTo(fileRef.current.path, oldPath)) setCurrent({ ...fileRef.current, path: rebase(fileRef.current.path) });
      setSelectedFolder((path) => path && belongsTo(path, oldPath) ? rebase(path) : path);
      setExpanded((paths) => { const next = new Set([...paths].map((path) => belongsTo(path, oldPath) ? rebase(path) : path)); if (folder) next.add(folder); return next; });
      await refreshTree();
    } catch (reason) { setError(errorText(reason)); }
  };
  const endDrag = (event: DragEndEvent) => {
    setDraggingPath(null);
    if (event.canceled || !event.operation.source || !event.operation.target) return;
    const path = String(event.operation.source.id);
    const target = String(event.operation.target.id);
    if (target === "memory-root") void moveEntry(path, "");
    else if (target.startsWith("memory-folder:")) void moveEntry(path, target.slice("memory-folder:".length));
  };
  const createParent = selectedFolder || (file ? parentOf(file.path) : "");
  const nameInput = (label: string) => <input autoFocus aria-label={label} value={nameDraft} onChange={(event) => setNameDraft(event.currentTarget.value)} onBlur={() => { setCreating(null); setRenaming(null); }} onKeyDown={(event) => {
    if (event.key === "Enter") { event.preventDefault(); void submitName(); }
    if (event.key === "Escape") { setCreating(null); setRenaming(null); }
  }} className="min-w-0 flex-1 rounded border border-[#52745d] bg-[#111A15] px-1 py-0.5 text-sm text-[#E8FFF0] outline-none" />;
  const renderChildren = (parent: string, depth: number): React.ReactNode => <>
    {entries.filter((entry) => parentOf(entry.path) === parent).sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name)).map((entry) => <MemoryTreeItem key={entry.path} entry={entry} editing={renaming === entry.path} draggingPath={draggingPath} expanded={expanded.has(entry.path)} setExpanded={setExpanded}>{({ ref, isDragging, isDropTarget }) => <div>
      <div ref={ref} role="button" tabIndex={renaming === entry.path ? -1 : 0} onClick={(event) => { if ((event.target as Element).closest("button, input")) return; if (entry.folder) void toggleFolder(entry.path); else void selectFile(entry.path); }} onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); if (entry.folder) void toggleFolder(entry.path); else void selectFile(entry.path); } }} className={`memory-tree-row group flex min-h-8 items-center gap-1 rounded-md pr-1 ${isDragging ? "opacity-40" : ""} ${isDropTarget ? "bg-[#294536] ring-1 ring-inset ring-[#52745d]" : file?.path === entry.path || selectedFolder === entry.path ? "bg-[#183522]" : "hover:bg-[#111A15]"}`} style={{ paddingLeft: 8 + depth * 16 }}>
        {entry.folder ? <button type="button" onClick={() => void toggleFolder(entry.path)} aria-label={`${expanded.has(entry.path) ? "Collapse" : "Expand"} ${entry.name}`} className="grid size-5 shrink-0 place-items-center text-[#7C9B88]">{expanded.has(entry.path) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="w-5 shrink-0" />}
        {renaming === entry.path ? nameInput("Rename memory entry") : <span className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm text-[#E8FFF0]">{entry.folder ? <Folder size={15} className="shrink-0 text-[#7C9B88]" /> : <FileText size={15} className="shrink-0 text-[#7C9B88]" />}<span className="truncate">{entry.name}</span></span>}
        <DropdownMenu><DropdownMenuTrigger aria-label={`Actions for ${entry.name}`} className="grid size-6 shrink-0 place-items-center rounded text-[#7C9B88] opacity-0 hover:bg-[#294536] group-hover:opacity-100 focus:opacity-100"><Ellipsis size={14} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="border border-[#294536] bg-[#111A15] text-[#E8FFF0]">
          {entry.folder && <><DropdownMenuItem onClick={() => startCreate(entry.path, false)}><FilePlus2 size={14} /> New file</DropdownMenuItem><DropdownMenuItem onClick={() => startCreate(entry.path, true)}><FolderPlus size={14} /> New folder</DropdownMenuItem></>}
          <DropdownMenuItem onClick={() => { setCreating(null); setRenaming(entry.path); setNameDraft(entry.name); }}><Pencil size={14} /> Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => void deleteEntry(entry)}><Trash2 size={14} /> Delete</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </div>
      {entry.folder && expanded.has(entry.path) && renderChildren(entry.path, depth + 1)}
    </div>}</MemoryTreeItem>)}
    {creating?.parent === parent && <div className="flex min-h-8 items-center gap-2 px-2" style={{ paddingLeft: 33 + depth * 16 }}>{creating.folder ? <Folder size={15} /> : <FileText size={15} />}{nameInput(creating.folder ? "New folder name" : "New Markdown file name")}</div>}
  </>;

  return <>
    <aside className="ios-file-list relative z-10 mt-[-52px] flex h-[calc(100%+52px)] min-h-0 flex-col border-r border-[#294536] bg-[#0B110E]" style={{ display: visible ? undefined : "none" }} aria-label="Memory files">
      <div data-tauri-drag-region className="ios-sidebar-titlebar flex h-[52px] shrink-0 items-center border-b border-[#294536] pl-[88px] pr-2"><span className="truncate text-sm font-semibold text-[#E8FFF0]">Memory</span></div>
      <DragDropProvider onDragStart={(event) => setDraggingPath(String(event.operation.source?.id ?? ""))} onDragEnd={endDrag}>
        <MemoryRootTarget draggingPath={draggingPath}>{({ ref, isDropTarget }) => <div ref={ref} className={`ios-file-sidebar-header flex items-center justify-between gap-2 ${isDropTarget ? "bg-[#294536]" : ""}`}><h2 className="text-[13px] font-semibold text-[#7C9B88]">Files</h2><div className="flex gap-1"><button type="button" onClick={() => startCreate(createParent, false)} aria-label="New memory file" title="New file" className="quiet-button memory-action-button"><FilePlus2 size={14} /></button><button type="button" onClick={() => startCreate(createParent, true)} aria-label="New memory folder" title="New folder" className="quiet-button memory-action-button"><FolderPlus size={14} /></button><button type="button" onClick={() => void refreshTree()} aria-label="Refresh memory" title="Refresh" className="quiet-button memory-action-button"><RefreshCw size={14} /></button></div></div>}</MemoryRootTarget>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{renderChildren("", 0)}{entries.length === 0 && !creating && <p className="px-3 py-4 text-xs text-[#7C9B88]">Create a file or folder to start.</p>}</div>
      </DragDropProvider>
    </aside>
    <section ref={editorPanel} className="memory-editor-panel flex min-h-0 min-w-0 flex-col bg-[#0B110E]" style={{ display: visible ? undefined : "none" }} aria-label="Memory editor">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#294536] px-5"><span className="truncate text-sm font-semibold text-[#E8FFF0]">{file?.path ?? "Memory"}</span>{file && <div className="ml-3 flex shrink-0 items-center gap-3"><span className="text-xs text-[#7C9B88]">{conflict ? "Conflict" : error ? "Save failed" : file.draft !== file.content ? "Unsaved" : "Saved"}</span><button type="button" className="quiet-button flex items-center gap-1.5 text-xs" aria-label="Copy memory Markdown" title="Copy Markdown" onClick={() => { void navigator.clipboard.writeText(fileRef.current?.draft ?? "").catch((reason) => setError(errorText(reason))); }}><Copy size={14} /> Copy</button></div>}</header>
      {error && <div role="alert" className="flex items-center justify-between gap-3 border-b border-[#482631] bg-[#25151b] px-5 py-2 text-sm text-[#FB7185]"><span>{error}</span>{file && !conflict && file.draft !== file.content && <button type="button" onClick={() => { setError(""); void saveRef.current(); }} className="quiet-button shrink-0">Retry</button>}</div>}
      {conflict && <div role="alert" className="flex items-center gap-3 border-b border-[#705d28] bg-[#292518] px-5 py-2 text-sm text-[#E8D888]"><span className="flex-1">An agent changed or moved this file. Your draft is preserved.</span><button type="button" className="quiet-button" onClick={() => { if (file) void navigator.clipboard.writeText(file.draft).catch((reason) => setError(errorText(reason))); }}>Copy draft</button><button type="button" className="quiet-button" onClick={() => { if (file) void ask("Discard your unsaved draft and load the agent's version?", { title: "Reload memory", kind: "warning", okLabel: "Reload", cancelLabel: "Keep draft" }).then((confirmed) => { if (confirmed) void loadFile(file.path); }); }}>Reload</button></div>}
      {file ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5"><div className="mx-auto max-w-[850px]" key={file.path}><MarkdownEditor value={file.draft} onChange={(draft) => { if (fileRef.current?.path === file.path) { setCurrent({ ...fileRef.current, draft }); setError(""); } }} placeholder="Write a memory…" contentClassName="chat-markdown memory-description-content" maxBytes={1_000_000} /></div></div> : <div className="grid flex-1 place-items-center text-sm text-[#7C9B88]">Select or create a Markdown file.</div>}
    </section>
  </>;
}
