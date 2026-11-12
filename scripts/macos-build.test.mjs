import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMacosDmg } from "./create-macos-dmg.mjs";

test("macOS can package and verify a DMG before compiling the app", { skip: process.platform !== "darwin" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "lotse-dmg-test-"));
  try {
    const app = join(directory, "Lotse.app");
    mkdirSync(app);
    writeFileSync(join(app, "fixture.txt"), "Synthetic packaging test, no user data.\n");
    const output = join(directory, "Lotse.dmg");
    createMacosDmg(app, output, "Lotse");
    assert.ok(statSync(output).size > 0);
    assert.deepEqual(readdirSync(directory).sort(), ["Lotse.app", "Lotse.dmg"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const script of ["prepare-app-server.sh", "build-oauth-app-server.sh"]) {
  test(`${script} rejects unsupported targets before downloading or building`, () => {
    for (const target of ["arm64", "x86_64-unknown-linux-gnu", "../../outside", ""]) {
      const result = spawnSync("/bin/sh", [fileURLToPath(new URL(script, import.meta.url)), target], {
        encoding: "utf8",
        env: { PATH: "/nonexistent" },
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /^Usage:/);
      assert.equal(result.stdout, "");
    }
  });
}
