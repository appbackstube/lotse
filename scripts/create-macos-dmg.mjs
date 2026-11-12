import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createMacosDmg(app, output, volumeName) {
  function run(command, args) {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
  }

  const temporary = `${output}.${process.pid}.dmg`;
  const stagingRoot = mkdtempSync(join(tmpdir(), "lotse-dmg-"));
  const stage = join(stagingRoot, volumeName);
  try {
    mkdirSync(stage);
    run("ditto", [app, join(stage, `${volumeName}.app`)]);
    symlinkSync("/Applications", join(stage, "Applications"));
    const diskutilImages = spawnSync("diskutil", ["image", "create", "from", "--help"], { stdio: "ignore" }).status === 0;
    // macOS 15 names the volume after the source folder; --volumeName requires newer macOS.
    if (diskutilImages) run("diskutil", ["image", "create", "from", "--format", "ULMO", stage, temporary]);
    else run("hdiutil", ["create", "-srcfolder", stage, "-volname", volumeName, "-format", "ULMO", "-fs", "HFS+", "-o", temporary]);
    run("hdiutil", ["verify", temporary]);
    renameSync(temporary, output);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(temporary, { force: true });
  }
}
