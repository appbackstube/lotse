import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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
