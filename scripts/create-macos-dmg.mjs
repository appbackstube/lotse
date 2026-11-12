import { spawnSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createMacosDmg(app, output, volumeName) {
  function run(command, args) {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
  }

  const temporary = `${output}.${process.pid}.dmg`;
  const stage = mkdtempSync(join(tmpdir(), "lotse-dmg-"));
  try {
    run("ditto", [app, join(stage, `${volumeName}.app`)]);
    symlinkSync("/Applications", join(stage, "Applications"));
    run("hdiutil", ["create", "-srcfolder", stage, "-volname", volumeName, "-format", "UDZO", "-fs", "HFS+", "-o", temporary]);
    run("hdiutil", ["verify", temporary]);
    renameSync(temporary, output);
  } finally {
    rmSync(stage, { recursive: true, force: true });
    rmSync(temporary, { force: true });
  }
}
