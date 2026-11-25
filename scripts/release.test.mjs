import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { githubRepository, release, releaseVersion } from "./release.mjs";

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

const verifiedHead = "a".repeat(40);
const prepareRuntimes = "sh scripts/prepare-app-server.sh";

function releaseFixture(context, { checkError, runtimeError, headAfterBuild = verifiedHead, statusAfterBuild = "" } = {}) {
  const checkout = mkdtempSync(join(tmpdir(), "lotse-release-test-"));
  context.after(() => rmSync(checkout, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries({
    "package.json": '{"version":"1.2.3"}',
    "src-tauri/tauri.conf.json": '{"productName":"Lotse","version":"1.2.3"}',
    "src-tauri/Cargo.toml": 'version = "1.2.3"\n',
    "node_modules/.bin/tauri": "",
    "src-tauri/binaries/codex-runtime-aarch64-apple-darwin/bin/codex-app-server": "stale Apple Silicon runtime",
    "src-tauri/binaries/codex-runtime-x86_64-apple-darwin/bin/codex-app-server": "stale Intel runtime",
    "src-tauri/target/share/Lotse_1.2.3_aarch64.dmg": "Apple Silicon fixture",
    "src-tauri/target/share/Lotse_1.2.3_x86_64.dmg": "Intel fixture",
  })) {
    const path = join(checkout, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }

  const actions = [];
  let built = false;
  function run(program, args) {
    const invocation = [program, ...args].join(" ");
    switch (invocation) {
      case "git rev-parse HEAD": return built ? headAfterBuild : verifiedHead;
      case "git status --porcelain": return built ? statusAfterBuild : "";
      case "git remote get-url origin": return "git@github.com:appbackstube/lotse.git";
      case "git ls-remote --exit-code origin refs/heads/main": return `${verifiedHead}\trefs/heads/main`;
      case "git tag --list v1.2.3":
      case "git ls-remote --tags origin refs/tags/v1.2.3":
      case "gh auth status": return "";
    }
    actions.push(invocation);
    if (invocation === "npm run release:check" && checkError) throw checkError;
    if (invocation === prepareRuntimes && runtimeError) throw runtimeError;
    if (invocation === "npm run build:mac") built = true;
  }
  return { actions, execute: () => release(checkout, run) };
}

test("failed release checks prevent building and publishing", (context) => {
  const checkError = new Error("release checks failed");
  const { actions, execute } = releaseFixture(context, { checkError });
  assert.throws(execute, checkError);
  assert.deepEqual(actions, ["npm run release:check"]);
});

test("runtime preparation failure prevents building and publishing even with runtimes on disk", (context) => {
  const runtimeError = new Error("runtime preparation failed");
  const { actions, execute } = releaseFixture(context, { runtimeError });
  assert.throws(execute, runtimeError);
  assert.deepEqual(actions, ["npm run release:check", prepareRuntimes]);
});

for (const [change, result] of Object.entries({
  "HEAD moves": { headAfterBuild: "b".repeat(40) },
  "working tree becomes dirty": { statusAfterBuild: " M package.json" },
})) {
  test(`nothing is published when the ${change} during the build`, (context) => {
    const { actions, execute } = releaseFixture(context, result);
    assert.throws(execute, /HEAD or working tree changed/);
    assert.deepEqual(actions, ["npm run release:check", prepareRuntimes, "npm run build:mac"]);
  });
}

test("a clean release tags the verified commit explicitly after checks and build", (context) => {
  const { actions, execute } = releaseFixture(context);
  execute();
  assert.deepEqual(actions.slice(0, 5), [
    "npm run release:check",
    prepareRuntimes,
    "npm run build:mac",
    `git tag -a v1.2.3 -m lotse-local-release ${verifiedHead}`,
    "git push origin refs/tags/v1.2.3",
  ]);
});
