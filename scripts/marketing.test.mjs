import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { getRepositoryUrl } from "../docs/site.js";

const directory = new URL("../docs/", import.meta.url);
const html = readFileSync(new URL("index.html", directory), "utf8");

test("repository links work for project Pages, user Pages, and custom domains", () => {
  assert.equal(getRepositoryUrl("example.github.io", "/lotse/"), "https://github.com/example/lotse");
  assert.equal(getRepositoryUrl("example.github.io", "/lotse/index.html"), "https://github.com/example/lotse");
  assert.equal(getRepositoryUrl("example.github.io", "/"), "https://github.com/example/example.github.io");
  assert.equal(getRepositoryUrl("example.github.io", "/index.html"), "https://github.com/example/example.github.io");
  assert.equal(getRepositoryUrl("lotse.example", "/", "https://github.com/example/lotse/"), "https://github.com/example/lotse");
  assert.equal(getRepositoryUrl("localhost", "/"), null);
  assert.equal(getRepositoryUrl("example.github.io.evil.test", "/lotse/"), null);
  assert.equal(getRepositoryUrl("example.github.io", "/%2fmalformed/"), null);
});

test("repository configuration rejects unrelated URLs and embedded credentials", () => {
  for (const value of ["javascript:alert(1)", "https://evil.test/example/lotse", "https://github.com/example/lotse/issues", "https://user:secret@github.com/example/lotse", "https://github.com/example/lotse?x=y", "not a URL"]) {
    assert.equal(getRepositoryUrl("localhost", "/", value), null);
  }
  assert.equal(getRepositoryUrl("example.github.io", "/lotse/", "not a URL"), "https://github.com/example/lotse");
});

test("static assets and internal links resolve from a GitHub Pages subdirectory", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "HTML IDs must be unique");
  for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (target === "#") continue;
    if (target.startsWith("#")) {
      assert.ok(ids.includes(target.slice(1)), `Missing anchor: ${target}`);
    } else {
      assert.ok(target.startsWith("./"), `Assets must use portable relative paths: ${target}`);
      assert.ok(existsSync(new URL(target, directory)), `Missing asset: ${target}`);
    }
  }
  assert.match(html, /<html lang="en">/);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.ok(existsSync(new URL(".nojekyll", directory)));
});

test("tour tabs have corresponding panels and a visible default", () => {
  const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map((match) => match[0]);
  const panels = [...html.matchAll(/<(?:section|figure)\b[^>]*role="tabpanel"[^>]*>/g)].map((match) => match[0]);
  assert.equal(tabs.length, 5);
  assert.equal(panels.length, 5);
  assert.equal(tabs.filter((tab) => tab.includes('aria-selected="true"')).length, 1);
  assert.equal(panels.filter((panel) => !/\bhidden\b/.test(panel)).length, 1);
  for (const tab of tabs) {
    const id = tab.match(/\bid="([^"]+)"/)[1];
    const panelId = tab.match(/aria-controls="([^"]+)"/)[1];
    assert.ok(panels.some((panel) => panel.includes(`id="${panelId}"`) && panel.includes(`aria-labelledby="${id}"`)));
  }
});

test("product images are real PNG assets with interface attribution", () => {
  const assets = [...html.matchAll(/src="(\.\/assets\/[^\"]+\.png)"/g)].map((match) => match[1]);
  assert.ok(assets.includes("./assets/taskboard.png"));
  assert.ok(assets.includes("./assets/workspace.png"));
  assert.ok(assets.includes("./assets/connections.png"));
  for (const asset of assets) {
    const bytes = readFileSync(new URL(asset, directory));
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `Invalid PNG: ${asset}`);
  }
  assert.match(html, /Actual Lotse interface/);
  assert.match(readFileSync(new URL("styles.css", directory), "utf8"), /prefers-reduced-motion: reduce/);
});
