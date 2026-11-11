// Open /scripts/markdown-ui.html through Vite. No GitHub or account access.
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MDXEditor } from "@mdxeditor/editor";
import { MarkdownEditor } from "../src/components/MarkdownEditor";
import { mockIPC } from "./mockTauri";
import { previewGitHubImage, type GitHubLink } from "../src/github";
import "@mdxeditor/editor/style.css";
import "../src/App.css";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const image = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const table = `# Imported PR\n\n| Before | After |\n| --- | --- |\n| <img src="${image}" alt="Before preview" width="80" /> | ![After preview](${image}) |`;
const unknown = "# Preserve this description\n\n<UnsupportedWidget />";
const unknownCell = "| Preview |\n| --- |\n| <UnsupportedWidget /> |";
let previewCalls = 0;
let previewHtml = '<img src="https://private-user-images.githubusercontent.com/1/preview.png?jwt=temporary" />';
mockIPC((command) => { if (command === "github_render_image") { previewCalls++; return previewHtml; } });
const link: GitHubLink = { accountId: 1, accountLogin: "alice", repositoryId: 2, repository: "o/r", number: 3, kind: "issue", url: "https://github.com/o/r/issues/3", state: "open", synced: { title: "", description: "", completed: false } };
let value = table;
let replace: (source: string, remount?: boolean) => void;
let setReadOnly: (readOnly: boolean) => void;
const changes: string[] = [];
let changeBase = "";
const caughtErrors: unknown[] = [];
const unhandled: unknown[] = [];
const richEditor = MDXEditor as unknown as { render: (...args: any[]) => any };
const renderRichEditor = richEditor.render;
let richEditorRenders = 0;
richEditor.render = (...args) => { richEditorRenders++; return renderRichEditor(...args); };
window.addEventListener("error", (event) => unhandled.push(event.error));
function Fixture() {
  const [source, setSource] = useState(table);
  const [version, setVersion] = useState(0);
  const [readOnly, updateReadOnly] = useState(false);
  value = source;
  setReadOnly = updateReadOnly;
  replace = (source, remount = false) => { setSource(source); if (remount) setVersion((version) => version + 1); };
  return <main className="mx-auto max-w-3xl p-8"><h1 className="mb-5 text-lg font-semibold">Imported PR description</h1><div className="task-details-control task-description-editor p-4"><MarkdownEditor key={version} value={source} readOnly={readOnly} onChange={(next) => { changeBase = source; changes.push(next); setSource(next); }} placeholder="Issue description" contentClassName="chat-markdown task-description-content" maxLength={20_000} /></div></main>;
}
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const settle = async () => { for (let index = 0; index < 15; index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
try {
  const attachment = "https://github.com/user-attachments/assets/1234-abcd";
  check((await previewGitHubImage(attachment, link)).includes("?jwt=temporary"), "Private images must use the authenticated signed preview");
  check(previewCalls === 1, "Private preview did not request authorization");
  check(await previewGitHubImage(image, link) === image && previewCalls === 1, "Local images should not be sent to GitHub");
  previewHtml = '<img src="https://evil.example/image.png" />';
  let rejected = false;
  try { await previewGitHubImage(attachment, link); } catch { rejected = true; }
  check(rejected, "Preview must reject unexpected image hosts");
  previewHtml = "<p>Image unavailable</p>";
  rejected = false;
  try { await previewGitHubImage(attachment, link); } catch { rejected = true; }
  check(rejected, "Unavailable private images must report a useful error");
  await act(async () => (fixtureRoot = createRoot(document.getElementById("root")!, { onCaughtError: (error) => caughtErrors.push(error) })).render(<Fixture />));
  await settle();
  check(document.querySelectorAll(".mdxeditor table img").length === 2, "HTML and Markdown images must render inside table cells");
  check(!document.querySelector("textarea"), "Supported image tables must use rich text");
  check(value === table && changes.length === 0, "Opening rich text must preserve the original description");
  check(caughtErrors.length === 0 && unhandled.length === 0, "Image table raised an editor error");
  await act(async () => replace(`# Synced description\n\n<img src="${image}" alt="Synced preview" />`));
  await settle();
  check(document.querySelector('img[alt="Synced preview"]'), "A synced HTML image did not update the editor");
  check(changes.length === 0, "Remote image updates must not rewrite Markdown automatically");
  await act(async () => replace(unknown, true)); await settle();
  check(document.querySelector("textarea")?.value === unknown, "Unsupported root markup must preserve the exact source");
  check(changes.length === 0, "Parser fallback must not save a partial description");
  await act(async () => replace(unknownCell, true)); await settle();
  check(document.querySelector("textarea")?.value === unknownCell, "Unsupported table cells must fall back without blanking the workspace");
  check(caughtErrors.length > 0 && unhandled.length === 0, "Nested editor errors escaped the local boundary");
  await act(async () => setReadOnly(true)); await settle();
  check(document.querySelector("textarea")?.readOnly, "Source fallback must honor read-only mode");
  await act(async () => setReadOnly(false)); await settle();
  const sourceInput = document.querySelector<HTMLTextAreaElement>("textarea")!;
  const editedSource = unknownCell + "\n\nPreserved source edit.";
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(sourceInput, editedSource);
    sourceInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check(value === editedSource && sourceInput.value === editedSource, "Source fallback must still save exact text");
  await act(async () => replace("# Changes\n\n- `ChatViewController` connects on appear.\n- **`ChatDataController`** counts socket holders.", true)); await settle();
  const inlineCode = [...document.querySelectorAll<HTMLElement>(".chat-markdown code")];
  check(inlineCode.length === 2, "Plain and bold inline code must render in rich text");
  for (const code of inlineCode) {
    const text = code.firstElementChild!;
    const style = getComputedStyle(text);
    check(style.backgroundColor === "rgba(0, 0, 0, 0)", "Nested inline code must not cover the themed background");
    check(style.padding === "0px" && style.fontSize === getComputedStyle(code).fontSize, "Nested inline code must not duplicate padding or shrink text");
  }
  const longDescription = "# Long task\n\n" + "A paragraph with **formatting**, a [link](https://example.invalid) and `code`.\n\n".repeat(180);
  await act(async () => replace(longDescription, true)); await settle();
  const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
  await act(async () => {
    editor.focus();
    const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  });
  const rendersBeforeTyping = richEditorRenders;
  const started = performance.now();
  for (const character of " Typing stays responsive.") {
    const previous = value;
    await act(async () => {
      check(document.execCommand("insertText", false, character), "Typing must reach the rich text editor");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    check(changeBase === previous, "Typing must call the latest onChange handler");
  }
  console.info(JSON.stringify({ descriptionTypingMs: Math.round(performance.now() - started), richEditorRenders: richEditorRenders - rendersBeforeTyping }));
  check(value.endsWith(" Typing stays responsive."), "Typing in a long description must preserve every character");
  check(document.querySelector('[contenteditable="true"]') === editor && document.activeElement === editor, "Typing must preserve the editor and keyboard focus");
  check(richEditorRenders === rendersBeforeTyping, "Local typing must not rerender the rich editor and refresh all its plugins");
  const beforeOverflow = value;
  await act(async () => { document.execCommand("insertText", false, "x".repeat(20_000)); }); await settle();
  check(value === beforeOverflow && editor.textContent?.endsWith(" Typing stays responsive."), "Over-limit edits must preserve the last valid description");
  await act(async () => setReadOnly(true)); await settle();
  check(editor.contentEditable === "false", "Rich text must honor read-only changes");
  await act(async () => setReadOnly(false)); await settle();
  check(editor.contentEditable === "true", "Rich text must become editable again");
  document.getElementById("result")!.textContent = "PASS: responsive long-description typing without rich-editor rerenders; current callbacks, focus, limits, read-only changes, source editing; private GitHub preview authorization, host validation, image tables, external updates, fallbacks and inline code styling.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`;
  console.error(error);
} finally {
  richEditor.render = renderRichEditor;
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
