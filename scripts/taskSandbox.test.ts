import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { applyTaskSandboxUpdate, patchSavedSandbox, sandboxLinkUrl, sandboxMaxBytes, sandboxRevision, validSandboxHtml } from "../src/taskSandbox.ts";

const previewUrl = "http://127.0.0.1:9000/sandbox/private-token";
assert.equal(sandboxLinkUrl("https://example.com/path?q=test#section", previewUrl), "https://example.com/path?q=test#section");
assert.equal(sandboxLinkUrl("http://localhost:3000/", previewUrl), "http://localhost:3000/");
for (const url of [undefined, {}, "", "#section", "/local", "javascript:alert(1)", "file:///etc/hosts", "data:text/html,test", "mailto:test@example.com", "tauri://localhost/", "https://user:password@example.com/", "http://127.0.0.1:9000/mcp", previewUrl, "https://example.com/" + "x".repeat(8192)]) {
  assert.equal(sandboxLinkUrl(url, previewUrl), null);
}

class TestElement { tagName = "A"; }
class TestAnchor extends TestElement {
  href: string;
  download: boolean;
  constructor(href: string, download = false) { super(); this.href = href; this.download = download; }
  getAttribute(name: string) { return name === "href" ? this.href : null; }
  hasAttribute(name: string) { return name === "download" && this.download; }
}
const listeners = new Map<string, (event: any) => void>();
const messages: { type: string; url?: string; message?: string }[] = [];
runInNewContext(readFileSync(new URL("../src-tauri/src/sandboxPreview.js", import.meta.url), "utf8"), {
  URL, location: { href: previewUrl }, Element: TestElement, HTMLAnchorElement: TestAnchor,
  parent: { postMessage: (message: typeof messages[number]) => messages.push(message) },
  addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler),
});
assert.equal(messages[0].type, "task-sandbox-ready");
function clickLink(href: string, options: { type?: string; button?: number; trusted?: boolean; prevented?: boolean; download?: boolean } = {}) {
  messages.length = 0;
  let prevented = false;
  const type = options.type ?? "click";
  listeners.get(type)!({ type, button: options.button ?? 0, isTrusted: options.trusted ?? true, defaultPrevented: options.prevented ?? false,
    composedPath: () => [new TestElement(), new TestAnchor(href, options.download)], preventDefault: () => { prevented = true; } });
  return prevented;
}
assert.equal(clickLink("https://example.com/path"), true);
assert.equal(messages[0].type, "task-sandbox-open-link");
assert.equal(messages[0].url, "https://example.com/path");
assert.equal(clickLink("https://example.com/", { type: "auxclick", button: 1 }), true);
for (const [href, options] of [
  ["#section", {}], ["/local", {}], [previewUrl, {}], ["javascript:alert(1)", {}], ["file:///etc/hosts", {}], ["https://user:password@example.com/", {}], ["https://[invalid", {}],
  ["https://example.com/", { trusted: false }], ["https://example.com/", { prevented: true }], ["https://example.com/", { download: true }], ["https://example.com/", { type: "auxclick", button: 2 }],
] as const) {
  assert.equal(clickLink(href, options), false);
  assert.equal(messages.length, 0, "Only a real click on an external web link may request the browser");
}
listeners.get("error")!({ message: "Test preview error" });
assert.equal(messages[0].type, "task-sandbox-error");
assert.equal(messages[0].message, "Test preview error");

const html = "<!doctype html><button onclick=\"this.textContent='Clicked'\">Click</button>";
assert.equal(await sandboxRevision(undefined), null);
assert.equal(await sandboxRevision("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
assert.equal(await applyTaskSandboxUpdate(undefined, { html, expectedRevision: null }), html);
const revision = await sandboxRevision(html);
assert.equal(await applyTaskSandboxUpdate(html, { html: "<h1>Updated</h1>", expectedRevision: revision }), "<h1>Updated</h1>");
await assert.rejects(applyTaskSandboxUpdate(html, { html: "<p>Stale</p>", expectedRevision: null }), /Sandbox changed/);
await assert.rejects(applyTaskSandboxUpdate("newer", { html: "<p>Stale</p>", expectedRevision: revision }), /Sandbox changed/);
for (const args of [null, [], {}, { html }, { html: " ", expectedRevision: null }, { html: 123, expectedRevision: null }, { html, expectedRevision: "bad" }, { html, expectedRevision: null, taskId: "other" }]) {
  await assert.rejects(applyTaskSandboxUpdate(undefined, args));
}
assert.equal(validSandboxHtml("a".repeat(sandboxMaxBytes)), true);
assert.equal(validSandboxHtml("a".repeat(sandboxMaxBytes + 1)), false);
assert.equal(validSandboxHtml("é".repeat(sandboxMaxBytes / 2)), true);
assert.equal(validSandboxHtml("é".repeat(sandboxMaxBytes / 2 + 1)), false);
const pendingTasks = JSON.stringify([{ id: "one", title: "Unsaved title", sandboxHtml: "old" }, { id: "two", sandboxHtml: "other" }]);
const patched = patchSavedSandbox(pendingTasks, "one", html, 2000);
assert.deepEqual(JSON.parse(patched), [{ id: "one", title: "Unsaved title", sandboxHtml: html, updatedAt: 2000 }, { id: "two", sandboxHtml: "other" }]);
assert.equal(patchSavedSandbox(patched, "one", html, 2000), patched);
assert.equal(patchSavedSandbox(pendingTasks, "missing", html, 2000), pendingTasks);
assert.throws(() => patchSavedSandbox("{}", "one", html, 2000), /Task storage/);
console.log("Task sandbox revision and validation tests passed.");

assert.equal(JSON.parse(patchSavedSandbox(patched, "one", html, 1000))[0].updatedAt, 2000);
assert.equal(JSON.parse(patchSavedSandbox(patched, "one", html, 3000))[0].updatedAt, 3000);
