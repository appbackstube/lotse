import assert from "node:assert/strict";
import { test } from "node:test";
import { githubRepository, releaseVersion } from "./release.mjs";

test("release requires matching stable versions", () => {
  assert.equal(releaseVersion("1.2.3", "1.2.3", "1.2.3"), "v1.2.3");
  assert.throws(() => releaseVersion("1.2.4", "1.2.3", "1.2.3"));
  assert.throws(() => releaseVersion("1.2.3-beta", "1.2.3-beta", "1.2.3-beta"));
});

test("release accepts GitHub origin URLs only", () => {
  assert.equal(githubRepository("git@github.com:appbackstube/lotse.git"), "appbackstube/lotse");
  assert.equal(githubRepository("https://github.com/appbackstube/lotse"), "appbackstube/lotse");
  assert.throws(() => githubRepository("https://example.com/appbackstube/lotse.git"));
});
