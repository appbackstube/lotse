import { act } from "react";
import type { SearchDocument, SearchResponse } from "../src/spotlight";
import { searchDocuments } from "../src/spotlight";

export const spotlightFixture = {
  fail: false,
  delay: 0,
  reads: 0,
  memory: "# Navigation\n\nUse the keyboard to open Spotlight and find your source.",
  async search(query: string): Promise<SearchResponse> {
    this.reads++;
    const delay = this.delay;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (this.fail) throw new Error("Synthetic read failure");
    const docs: SearchDocument[] = [
      { id: "memory:navigation.md", kind: "Memory", title: "navigation.md", body: this.memory, breadcrumb: "Memory / navigation.md", target: { type: "memory", path: "navigation.md" } },
      { id: "archive:message", kind: "Chat", title: "Archived discussion", body: "Archived discussion: we agreed on repository navigation.", breadcrumb: "Workspace / Working copy / Chat", target: { type: "workspace", messageId: "archived-message", context: "archived", archiveId: "archive" } },
    ];
    return { documents: searchDocuments(docs, query), errors: [] };
  },
};

export async function checkSpotlight(taskId: string, taskTitle: string, otherTaskTitle: string, switchRepository: () => Promise<void>) {
  const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => {
    const el = document.querySelector<T>(selector); check(el, `Missing ${selector}`); return el!;
  };
  const settle = async (ms = 100) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); };
  const click = async (el: HTMLElement) => { await act(async () => { el.focus(); el.click(); }); await settle(); };
  const change = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(async () => {
      const prototype = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const key = async (el: EventTarget, key: string, extra = {}) => { await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...extra })); }); await settle(); };
  const launch = async () => { await key(window, "k", { metaKey: true }); await settle(300); };
  const input = () => get<HTMLInputElement>('.spotlight-popup input');
  const query = async (value: string) => { await change(input(), value); await settle(350); };
  const result = (text: string, kind?: string) => [...document.querySelectorAll<HTMLElement>('.spotlight-result')].find(el => el.textContent?.includes(text) && (!kind || el.querySelector("small")?.textContent === kind))!;
  const visibleButton = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent?.trim() === name && el.getBoundingClientRect().width)!;

  const composer = get<HTMLTextAreaElement>('[aria-label="Review Agent message"]');
  await act(async () => composer.focus()); await change(composer, "Keep my unsent chat draft");
  const comment = get<HTMLTextAreaElement>('[aria-label="Write a task comment"]');
  await act(async () => comment.focus()); await change(comment, "Keep my unsent comment");
  await launch();
  check(document.activeElement === input(), "Keyboard opening must focus the search field");
  check(!document.querySelector('.spotlight-popup .scope, .spotlight-popup .examples'), "Removed information and example rows must stay absent");
  check(!document.querySelector('.spotlight-popup')!.textContent?.includes("Open a result to continue"), "Removed instruction must stay absent");
  check(getComputedStyle(get('.spotlight-popup')).animationName === (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'spotlight-appear'), "Opening must use the approved motion setting");
  await query("monthly REPORT");
  check(result(taskTitle, "Task"), "Case-insensitive multiword search must find task titles");
  await key(input(), "ArrowDown");
  check(input().getAttribute("aria-activedescendant") === "spotlight-result-1", "Arrow keys must move the active selection");
  await key(input(), "Escape");
  check(!document.querySelector('.spotlight-popup'), "Escape must close search");
  check(document.activeElement === comment, "Escape must restore the previous focus");
  check(get<HTMLTextAreaElement>('[aria-label="Write a task comment"]').value === "Keep my unsent comment", "Closing must preserve the comment draft");
  await launch(); await query(otherTaskTitle); await click(result(otherTaskTitle, "Task")); await settle(300);
  check(get<HTMLInputElement>('.task-details-title-input').value === otherTaskTitle, "Enter/click navigation must open the correct task");
  await launch(); await query(taskTitle); await key(input(), "Enter"); await settle(300);
  check(get<HTMLTextAreaElement>('[aria-label="Review Agent message"]').value === "Keep my unsent chat draft", "Task navigation must preserve unsent chat drafts");
  check(get<HTMLTextAreaElement>('[aria-label="Write a task comment"]').value === "Keep my unsent comment", "Task navigation must preserve unsent comment drafts");
  await launch(); await query("Keep the comment visible"); await click(result(taskTitle, "Comment")); await settle(300);
  check(get(`[data-search-comment="review-comment"]`).classList.contains("spotlight-source-current"), "Comment result must reveal its exact source");
  await launch(); await query("ready for review"); await click(result("ready for review", "Chat")); await settle(300);
  check(get('[data-search-message="response"]').classList.contains('spotlight-source-current'), "Chat result must reveal its exact message");
  await launch(); await query("Spotlight keyboard"); await click(result("navigation.md", "Memory")); await settle(400);
  check(get('[aria-label="Memory editor"]').textContent?.includes('navigation.md'), "Memory result must open its file");
  check(document.querySelector('.memory-description-content.spotlight-source-current'), "Memory result must reveal its content");
  await launch(); await query("not-present-anywhere");
  check(get('.spotlight-empty h2').textContent === 'No results found', "Empty results must be distinct from empty query");
  await click(get('[aria-label="Clear search"]'));
  check(get('.spotlight-empty h2').textContent === 'Find your place.', "Clear must return to the empty input state");
  spotlightFixture.fail = true;
  await query("report");
  check(get('.spotlight-error').textContent?.includes('incomplete'), "Read failures must report incomplete results");
  check(result(taskTitle, "Task"), "A read failure must keep local task results usable");
  spotlightFixture.fail = false;
  await click(get('.spotlight-error button')); await settle(300);
  check(!document.querySelector('.spotlight-error'), "Retry must recover from a transient failure");
  spotlightFixture.delay = 500;
  await query("navigation");
  spotlightFixture.delay = 0;
  await query("not-present-anywhere"); await settle(600);
  check(!document.querySelector('.spotlight-result'), "An older async response must not replace the latest query");
  await query("Archived discussion"); await click(result("Archived discussion", "Chat")); await settle(300);
  check(get('.spotlight-archive').textContent?.includes('Read only'), "Historical workspace chats must open without replacing the live session");
  check(get('[data-archive-message="archived-message"]').classList.contains('spotlight-source-current'), "Historical chat must reveal its matching message");
  await click(get('.spotlight-archive [data-slot="dialog-close"]')); await settle(200);
  await click(visibleButton('Tasks')); await click(visibleButton(taskTitle));
  check(get<HTMLTextAreaElement>('[aria-label="Write a task comment"]').value === 'Keep my unsent comment', "Memory and archive navigation must preserve comment drafts");
  check(get(`[data-search-task="${taskId}"]`), "Search must return to the original task");
  await launch(); spotlightFixture.delay = 600; await query("navigation");
  await switchRepository(); await settle(900); spotlightFixture.delay = 0;
  check(!document.querySelector('.spotlight-popup'), "Changing repository must close the old search");
  await launch(); await query("monthly report");
  check(!document.querySelector('.spotlight-result'), "The new repository must not show results from the old one");
  await key(input(), 'Escape');
}
