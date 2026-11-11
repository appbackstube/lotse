// Open /scripts/new-task-ui.html through Vite. Creates no repository tasks.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NewTaskButton, type NewTaskDraft } from "../src/components/NewTaskButton";
import "../src/App.css";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const created: NewTaskDraft[] = [];
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); }); };
const trigger = () => document.querySelector<HTMLButtonElement>('[aria-label="New task"]')!;
const input = () => document.querySelector<HTMLInputElement>('input[placeholder="Task title"]')!;
const submit = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const shortcut = async (options: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { key: "N", shiftKey: true, bubbles: true, cancelable: true, ...options });
  await act(async () => (document.activeElement ?? window).dispatchEvent(event)); await settle();
  return event.defaultPrevented;
};
const type = async (value: string, element: HTMLInputElement | HTMLTextAreaElement = input()) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
try {
  await act(async () => (fixtureRoot = createRoot(document.getElementById("root")!)).render(<main className="ios-app p-6"><div className="flex items-center gap-4"><h1>Tasks</h1><NewTaskButton onCreate={(title) => created.push(title)} /></div></main>));
  await act(async () => trigger().click()); await settle();
  check(document.querySelector('[role="dialog"]'), "Plus button must open the modal");
  check(document.activeElement === input(), "Task title should receive focus");
  check(submit().disabled, "Empty titles must not be submitted");
  await type("   ");
  check(submit().disabled, "Whitespace titles must not be submitted");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  check(created.length === 0, "Invalid submit created a task");
  await type("  New task from modal  ");
  await type("## Expected behavior\n\nPreserve **Markdown** and line breaks.", document.querySelector("textarea")!);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Status"]')!.click()); await settle();
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.includes("In review"))!.click()); await settle();
  await act(async () => submit().click()); await settle();
  check(created.length === 1 && created[0].title === "New task from modal", "Submit must create exactly one task with a trimmed title");
  check(created[0].status === "inReview", "Selected status must reach task creation");
  check(created[0].description === "## Expected behavior\n\nPreserve **Markdown** and line breaks.", "Description must be preserved exactly");
  check(!document.querySelector('[role="dialog"]'), "Successful creation must close the modal");
  await act(async () => trigger().click()); await settle();
  check(input().value === "", "Reopening must start with a blank title");
  check(document.querySelector("textarea")!.value === "" && document.querySelector('[aria-label="Status"]')!.textContent?.includes("Inbox"), "Reopening must reset description and status");
  await type("Discarded draft");
  await type("Discarded description", document.querySelector("textarea")!);
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Cancel")!.click()); await settle();
  check(!document.querySelector('[role="dialog"]') && created.length === 1, "Cancel must close without creating a task");
  await act(async () => trigger().click()); await settle();
  check(input().value === "" && document.querySelector("textarea")!.value === "", "Cancel must discard the modal draft");
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click()); await settle();
  check(trigger().getAttribute("aria-keyshortcuts") === "Meta+Shift+N Control+Shift+N", "Button must expose both shortcuts");
  check(!await shortcut({ metaKey: true, shiftKey: false }), "Cmd+N must keep its existing behavior");
  check(!await shortcut({ shiftKey: true }) && !document.querySelector('[role="dialog"]'), "Shift+N alone must not open the modal");
  check(!await shortcut({ ctrlKey: true, altKey: true }), "Alt-modified shortcuts must be ignored");
  check(!await shortcut({ metaKey: true, isComposing: true }), "Composition must not open the modal");
  check(await shortcut({ metaKey: true }), "Cmd+Shift+N must be handled");
  check(document.activeElement === input(), "Shortcut must focus the title");
  await type("Keep this draft");
  check(await shortcut({ ctrlKey: true, key: "n" }), "Ctrl+Shift+N must work while typing");
  check(input().value === "Keep this draft" && document.querySelectorAll('[role="dialog"]').length === 1, "Repeated shortcuts must preserve the draft in one modal");
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click()); await settle();
  check(await shortcut({ ctrlKey: true }), "Ctrl+Shift+N must open the modal");
  check(document.activeElement === input() && input().value === "", "Ctrl shortcut must focus a fresh title");
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click()); await settle();
  document.getElementById("result")!.textContent = "PASS: plus button, modal, autofocus, validation, creation, draft reset, Cmd/Ctrl+Shift+N, modifier guards and draft preservation.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`;
  console.error(error);
} finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
