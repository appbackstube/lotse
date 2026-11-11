import { act } from "react";
import { emit } from "@tauri-apps/api/event";
import { taskStorageKey } from "../src/tasks";
import type { RepositoryTask } from "../src/types";

export async function checkTaskDetailFields({ taskId, repositoryRoot, storage, stateWrites, branchReads, openedUrls, otherTaskTitle, switchRepository }: {
  taskId: string; repositoryRoot: string; storage: Record<string, string>;
  stateWrites: () => number; branchReads: () => number; openedUrls: string[];
  otherTaskTitle: string; switchRepository: () => Promise<void>;
}) {
  const checked: string[] = [];
  const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => {
    const element = document.querySelector<T>(selector);
    check(element, `Missing field/control: ${selector}`); return element!;
  };
  const settle = async (ms = 50) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); };
  const saved = () => (JSON.parse(storage[taskStorageKey(repositoryRoot)]) as RepositoryTask[]).find((task) => task.id === taskId)!;
  const idle = async () => { await settle(350); await settle(200); };
  const click = async (element: HTMLElement) => { await act(async () => { element.focus(); element.click(); }); await settle(); };
  const visible = (element: HTMLElement) => !!element.getBoundingClientRect().width;
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === label && visible(element))!;
  const change = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(async () => {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const burst = async (label: string, selector: string, values: string[]) => {
    const element = get<HTMLInputElement | HTMLTextAreaElement>(selector);
    await act(async () => element.focus()); await idle();
    const before = stateWrites();
    const started = performance.now();
    for (const value of values) await change(element, value);
    check(stateWrites() === before, `${label}: typing must not update global task state per character`);
    check(get(selector) === element && document.activeElement === element, `${label}: typing must preserve the input and focus`);
    console.info(`${label}: ${values.length} edits, ${Math.round(performance.now() - started)} ms, 0 global task updates`);
    checked.push(label); return element;
  };
  const choose = async (trigger: HTMLElement, option: string) => {
    await click(trigger);
    const item = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) => element.textContent?.trim() === option);
    check(item, `Missing option ${option}`); await click(item!); await idle();
  };

  get<HTMLDetailsElement>(".task-details-custom").open = true;
  const originalTitle = saved().title;
  const title = await burst("Title", ".task-details-title-input", ["Field", "Field audit", "Field audit renamed"]);
  await idle(); check(saved().title === originalTitle, "Title must stay a draft until blur/Enter");
  await act(async () => title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))); await idle();
  check(saved().title === "Field audit renamed", "Enter must save the title");
  await act(async () => title.focus());
  await change(title, "   "); await act(async () => title.blur()); await idle();
  check(title.value === "Field audit renamed", "An empty title must restore the last valid title");

  const description = get<HTMLElement>('.task-description-editor [contenteditable="true"]');
  await act(async () => {
    description.focus(); const range = document.createRange(); range.selectNodeContents(description); range.collapse(false);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  }); await idle();
  const beforeDescription = stateWrites();
  for (const text of [" Fast", " description", " edit"]) await act(async () => { check(document.execCommand("insertText", false, text), "Description input failed"); });
  check(stateWrites() === beforeDescription, "Description must stay off the global keystroke path");
  await idle(); check(!saved().description.endsWith(" Fast description edit") && stateWrites() === beforeDescription, "Description must remain a local draft after a pause");
  await click(get('[aria-label="Save description"]')); await idle();
  check(saved().description.endsWith(" Fast description edit"), "Explicit saving must preserve the full description edit");
  checked.push("Description");

  for (const [id, label, values] of [
    ["perf", "Custom text", ["A", "AB", "ABC audit"]],
    ["multiline", "Custom multiline", ["First", "First line\nSecond", "First line\nSecond line"]],
    ["url", "Custom URL", ["https://", "https://example.invalid", "https://example.invalid/audit"]],
  ] as const) {
    await burst(label, `#task-custom-${id}`, [...values]);
    if (id === "url") {
      const open = get<HTMLButtonElement>('[aria-label="Open Website in browser"]');
      check(!open.disabled, "A valid URL must enable its action immediately, before autosave");
      await click(open); check(openedUrls.at(-1) === values.at(-1), "URL action must use the latest draft");
    }
    await idle(); check(saved().customFields[id] === values.at(-1), `${label} must autosave the latest value`);
  }
  const url = get<HTMLInputElement>("#task-custom-url"); await change(url, "javascript:alert(1)");
  check(get<HTMLButtonElement>('[aria-label="Open Website in browser"]').disabled, "Unsafe URLs must remain disabled");
  await change(url, "https://example.invalid/audit"); await idle();
  await change(get<HTMLInputElement>("#task-custom-perf"), ""); await idle();
  check(!("perf" in saved().customFields), "Clearing a custom text field must remove its saved value");

  await burst("Branch name", '[aria-label="Branch name"]', ["feature/f", "feature/fi", "feature/field-audit"]);
  await idle(); check(saved().newBranchName === "feature/field-audit", "Branch draft must autosave");
  await click(get(".task-details-row .model-picker-trigger"));
  const beforeSearch = branchReads();
  await burst("Branch search", '[aria-label="Search branches"]', ["fea", "feature", "feature/monthly"]);
  check(branchReads() === beforeSearch, "Branch search must filter locally without fetching on each character");
  await click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) => element.textContent?.trim() === "feature/monthly-report")!); await idle();
  check(saved().worktreeStart?.kind === "branch" && saved().worktreeStart?.branch === "feature/monthly-report", "Start-from selection must persist");
  checked.push("Start from");

  await choose(get('[aria-label="Task status"]'), "In review"); check(saved().manualStatus === "inReview", "Status did not save");
  checked.push("Status");
  await choose(get('[aria-label="Task color"]'), "Purple"); check(saved().color === "purple", "Color did not save");
  checked.push("Color");
  await choose(get('[aria-label="Where the agent works"]'), "Workspace"); check(saved().location === "workspace", "Workspace location did not save");
  await choose(get('[aria-label="Where the agent works"]'), "Work on existing");
  await choose(get(".task-details-row .model-picker-trigger"), "origin/main");
  check(saved().worktreeStart?.kind === "existing" && saved().worktreeStart?.remote, "Existing remote branch did not save");
  await choose(get('[aria-label="Where the agent works"]'), "New Branch"); check(saved().location === "worktree", "New-branch location did not save");
  checked.push("Location", "Existing branch");
  await choose(get("#task-custom-choice"), "Selected"); check(saved().customFields.choice === "selected", "Custom selection did not save");
  await choose(get("#task-custom-choice"), "No value"); check(!("choice" in saved().customFields), "Clearing a selection must remove its value");
  checked.push("Custom selection");

  const [start, deadline] = [...document.querySelectorAll<HTMLInputElement>('.task-details-schedule input[type="date"]')];
  await burst("Start date", ".task-details-schedule label:first-child input", ["2026-10-25", "2026-10-26", "2026-10-29"]);
  await idle(); check(saved().startDate === "2026-10-29", "Start date did not save");
  await burst("Deadline", ".task-details-schedule label:last-child input", ["2026-10-31", "2026-11-01", "2026-10-31"]);
  await idle(); check(saved().deadline === "2026-10-31", "Deadline did not save");
  const beforeInvalidDate = stateWrites();
  await change(start, "2026-11-05"); await idle();
  check(stateWrites() === beforeInvalidDate && saved().startDate === "2026-10-29" && start.getAttribute("aria-invalid") === "true", "Invalid date ranges must stay local and leave saved dates intact");
  await change(start, "2026-10-29"); await idle();
  Object.defineProperty(start, "validity", { configurable: true, value: { badInput: true } });
  const beforePartialDate = stateWrites(); await change(start, "");
  delete (start as unknown as { validity?: unknown }).validity;
  check(stateWrites() === beforePartialDate && saved().startDate === "2026-10-29", "Incomplete native date input must not clear a saved date");
  await change(deadline, ""); await idle(); check(saved().deadline === null, "Clearing a date must persist");

  const comment = await burst("New comment", '[aria-label="Write a task comment"]', ["Co", "Comment", "Comment audit"]);
  await idle(); check(!saved().comments.some((entry) => entry.body === "Comment audit"), "Unsubmitted comments must remain drafts");
  await click(button("Add comment")); await idle(); check(saved().comments.at(-1)?.body === "Comment audit" && !comment.value, "Comment submit must save once and clear its draft");
  await change(comment, "Keyboard comment");
  await act(async () => comment.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }))); await idle();
  check(saved().comments.at(-1)?.body === "Keyboard comment", "Keyboard comment submission must still work");
  await click(get('[aria-label="Toggle checklist item"]')); await idle();
  check(saved().comments[0].body.startsWith("- [x]"), "Comment checklist updates must save");
  checked.push("Comment checklist");
  await click([...document.querySelectorAll<HTMLElement>('[aria-label="Delete user comment"]')].at(-1)!); await idle();
  check(!saved().comments.some((entry) => entry.body === "Keyboard comment"), "Comment deletion must save");

  await click(button("qa/fields #7")); check(openedUrls.at(-1) === "https://github.com/qa/fields/issues/7", "GitHub link must use the known issue URL");
  checked.push("GitHub link (read-only)");
  await click(get("#task-assets-dropzone")); await idle(); check(saved().assets.some((asset) => asset.id === "audit-asset"), "Attachment selection must preserve the imported file");
  const dialogsBeforeDownload = document.querySelectorAll('[role="dialog"]').length;
  await click(get('[aria-label="Download qa.txt"]'));
  check(document.querySelectorAll('[role="dialog"]').length === dialogsBeforeDownload && saved().assets.some((asset) => asset.id === "audit-asset"), "Downloading must preserve the attachment without opening its preview");
  await click(get('[aria-label="Download qa.txt"]'));
  check(document.body.textContent?.includes("Could not download file: Synthetic save failure"), "Download failures must be visible");
  await click(get('[aria-label="Download qa.txt"]'));
  check(!document.body.textContent?.includes("Could not download file:"), "A retry must clear the download error");
  await click(get('[aria-label="Preview qa.txt"]')); check(document.body.textContent?.includes("Synthetic attachment"), "Attachment preview must load asynchronously");
  await click([...document.querySelectorAll<HTMLElement>('[role="dialog"] [data-slot="dialog-close"]')].at(-1)!);
  await click(get('[aria-label="Remove qa.txt"]')); await idle(); check(!saved().assets.some((asset) => asset.id === "audit-asset"), "Attachment removal must save");
  checked.push("Attachments");

  // No blur between these programmatic edits: close must flush every pending field.
  await change(get<HTMLInputElement>('[aria-label="Branch name"]'), "feature/native-close");
  await change(get<HTMLInputElement>("#task-custom-perf"), "native close text");
  await change(get<HTMLTextAreaElement>("#task-custom-multiline"), "native close multiline");
  await act(async () => { await emit("tauri://close-requested"); });
  check(saved().newBranchName === "feature/native-close" && saved().customFields.perf === "native close text" && saved().customFields.multiline === "native close multiline", "Native close must flush all pending fields without overwriting another field");
  await idle();
  const auditTitle = saved().title;
  await act(async () => {
    description.focus(); const range = document.createRange(); range.selectNodeContents(description); range.collapse(false);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
    check(document.execCommand("insertText", false, " description saved before task switch"), "Description input before task switching failed");
  });
  await change(get<HTMLInputElement>("#task-custom-perf"), "saved before task switch");
  await act(async () => button(otherTaskTitle).click()); await idle();
  check(saved().description.endsWith(" description saved before task switch"), "Task switching without blur must save the original description draft");
  check(!get('.task-description-editor [contenteditable="true"]').textContent?.includes("description saved before task switch"), "Description drafts must not leak into another task");
  check(saved().customFields.perf === "saved before task switch", "Task switching must flush the old task's draft");
  check(get<HTMLInputElement>("#task-custom-perf").value !== "saved before task switch", "Drafts must not leak into another task");
  await click(button(auditTitle)); await idle();
  await change(get<HTMLInputElement>("#task-custom-perf"), "saved in original repository");
  await change(get<HTMLTextAreaElement>("#task-custom-multiline"), "also in original repository");
  await act(async () => { await switchRepository(); }); await idle();
  check(saved().customFields.perf === "saved in original repository" && saved().customFields.multiline === "also in original repository", "Repository switching must flush every field to its original repository");
  check(JSON.parse(storage[taskStorageKey("/other-field-audit-repository")] ?? "[]").length === 0, "Old drafts must not enter the new repository");
  return checked;
}
