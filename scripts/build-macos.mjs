import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMacosDmg } from "./create-macos-dmg.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const variants = {
  arm64: { target: "aarch64-apple-darwin", arch: "arm64", suffix: "aarch64" },
  intel: { target: "x86_64-apple-darwin", arch: "x86_64", suffix: "x86_64" },
};
const requested = process.argv.slice(2);
const selected = requested.length ? requested : Object.keys(variants);

if (process.platform !== "darwin" || selected.some((name) => !variants[name])) {
  console.error("Usage on macOS: node scripts/build-macos.mjs [arm64] [intel]");
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

const shareDir = join(root, "src-tauri/target/share");
mkdirSync(shareDir, { recursive: true });

for (const name of selected) {
  const { target, arch, suffix } = variants[name];
  const runtime = `binaries/codex-runtime-${target}`;
  if (!existsSync(join(root, "src-tauri", runtime))) {
    throw new Error(`Missing ${runtime}. Run scripts/prepare-app-server.sh first.`);
  }

  // Tauri's DMG config has no LZMA option; package the verified app below.
  run(join(root, "node_modules/.bin/tauri"), [
    "build", "--target", target, "--bundles", "app", "--ci",
    "--config", JSON.stringify({ bundle: { resources: [runtime] } }),
  ]);

  const bundleDir = join(root, "src-tauri/target", target, "release/bundle");
  const app = join(bundleDir, "macos", `${config.productName}.app`);
  const resourceDir = join(app, "Contents/Resources/binaries");
  if (!existsSync(join(resourceDir, `codex-runtime-${target}`))
    || existsSync(join(resourceDir, `codex-runtime-${name === "arm64" ? variants.intel.target : variants.arm64.target}`))) {
    throw new Error(`Unexpected runtime contents in ${resourceDir}`);
  }
  const actualArch = execFileSync("lipo", ["-archs", join(app, "Contents/MacOS/chaoticreview")], { encoding: "utf8" }).trim();
  if (actualArch !== arch) throw new Error(`Expected ${arch} app, got ${actualArch}`);

  const signature = spawnSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "ignore" });
  if (signature.status !== 0) {
    if (config.bundle.macOS?.signingIdentity || process.env.APPLE_SIGNING_IDENTITY) throw new Error(`Developer ID signing failed for ${app}`);
    run("codesign", ["--force", "--deep", "--sign", "-", app]);
  }
  run("codesign", ["--verify", "--deep", "--strict", app]);

  const output = join(shareDir, `${config.productName}_${config.version}_${suffix}.dmg`);
  createMacosDmg(app, output, config.productName);
  console.log(`Ready to share: ${output} (${(statSync(output).size / 1024 / 1024).toFixed(1)} MiB)`);
}
