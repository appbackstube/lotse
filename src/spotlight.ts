import type { ChatMessage, RepositoryTask, ReviewSession } from "./types";

export type SearchTarget =
  | { type: "task"; taskId: string; commentId?: string; messageId?: string }
  | { type: "memory"; path: string }
  | { type: "workspace"; messageId: string; context: string; archiveId?: string };
export type SearchDocument = { id: string; kind: "Task" | "Comment" | "Chat" | "Memory"; title: string; body: string; breadcrumb: string; target: SearchTarget };
export type SearchResponse = { documents: SearchDocument[]; errors: string[] };
export const searchWords = (query: string) => [...new Set(query.toLowerCase().trim().split(/\s+/).filter(Boolean))];
export const workspaceSearchContext = (review: ReviewSession) => JSON.stringify([review.mode, review.baseRef, review.compareRef, review.mode === "workingCopy" ? review.baseOid : null]);
export const messageTitle = (message: ChatMessage) => message.body.trim().split("\n").find(Boolean)?.slice(0, 100) || (message.role === "user" ? "Your message" : "Agent message");

export function taskSearchDocuments(tasks: RepositoryTask[]): SearchDocument[] {
  return tasks.flatMap((task) => [
    { id: `task:${task.id}`, kind: "Task" as const, title: task.title, body: task.description, breadcrumb: `Tasks / ${task.completed ? "Done / " : ""}${task.title}`, target: { type: "task" as const, taskId: task.id } },
    ...task.comments.map((comment) => ({ id: `comment:${task.id}:${comment.id}`, kind: "Comment" as const, title: task.title, body: comment.body, breadcrumb: `${task.title} / Comments / ${comment.author === "user" ? "You" : "Agent"}`, target: { type: "task" as const, taskId: task.id, commentId: comment.id } })),
    ...task.chatMessages.map((message) => ({ id: `chat:${task.id}:${message.id}`, kind: "Chat" as const, title: messageTitle(message), body: message.body, breadcrumb: `${task.title} / Chat / ${message.role === "user" ? "You" : "Agent"}`, target: { type: "task" as const, taskId: task.id, messageId: message.id } })),
  ]);
}

export function workspaceSearchDocuments(review: ReviewSession | null): SearchDocument[] {
  if (!review) return [];
  const context = workspaceSearchContext(review);
  return review.chatMessages.map((message) => ({ id: `workspace:current:${message.id}`, kind: "Chat", title: messageTitle(message), body: message.body, breadcrumb: `Workspace / Chat / ${message.role === "user" ? "You" : "Agent"}`, target: { type: "workspace", messageId: message.id, context } }));
}

export function searchDocuments(documents: SearchDocument[], query: string): SearchDocument[] {
  const words = searchWords(query);
  if (!words.length) return [];
  const normalized = query.trim().toLowerCase();
  const rank = (doc: SearchDocument) => {
    const title = doc.title.toLowerCase();
    return title === normalized ? 0 : title.startsWith(normalized) ? 1 : words.every((word) => title.includes(word)) ? 2 : 3;
  };
  return documents.filter((doc) => {
    const text = `${doc.title}\n${doc.body}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

export function searchSnippet(body: string, query: string): string {
  const text = body.replace(/\s+/g, " ");
  const positions = searchWords(query).map((word) => text.toLowerCase().indexOf(word)).filter((position) => position >= 0);
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 40);
  return `${start ? "…" : ""}${text.slice(start, start + 180)}${text.length > start + 180 ? "…" : ""}`;
}

// CSS highlights leave rich-text editor state and the user's draft untouched.
export function revealSearchSource(find: () => HTMLElement | null, query: string): () => void {
  let frame = 0;
  let highlighted: HTMLElement | null = null;
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightClass = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  const reveal = () => {
    const source = find();
    if (!source || !source.getClientRects().length) return false;
    const words = searchWords(query);
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
    const ranges: Range[] = [];
    let node: Node | null;
    while (ranges.length < 1000 && (node = walker.nextNode())) {
      if (node.parentElement?.closest("button, textarea, input")) continue;
      const text = node.textContent?.toLowerCase() ?? "";
      for (const word of words) {
        let offset = text.indexOf(word);
        while (offset >= 0 && ranges.length < 1000) {
          const range = document.createRange();
          if (offset + word.length > (node.textContent?.length ?? 0)) break;
          range.setStart(node, offset); range.setEnd(node, offset + word.length);
          ranges.push(range);
          offset = text.indexOf(word, offset + word.length);
        }
      }
    }
    if (!source.textContent?.trim() && !(source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement || source.isContentEditable)) return false;
    highlighted = source;
    source.classList.add("spotlight-source-current");
    if (highlights && HighlightClass) highlights.set("spotlight-source", new HighlightClass(...ranges));
    const first = ranges[0]?.startContainer.parentElement ?? source;
    first.scrollIntoView({ block: "center", behavior: "instant" });
    return true;
  };
  const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (reveal()) observer.disconnect(); }); });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "hidden", "data-hidden"] });
  frame = requestAnimationFrame(() => { if (reveal()) observer.disconnect(); });
  const timeout = window.setTimeout(() => observer.disconnect(), 3000);
  return () => { cancelAnimationFrame(frame); clearTimeout(timeout); observer.disconnect(); highlighted?.classList.remove("spotlight-source-current"); highlights?.delete("spotlight-source"); };
}
