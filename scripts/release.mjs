import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function releaseVersion(packageVersion, appVersion, cargoVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(appVersion) || packageVersion !== appVersion || cargoVersion !== appVersion) {
    throw new Error("package.json, tauri.conf.json, and Cargo.toml must have the same stable version.");
  }
  return `v${appVersion}`;
}

export function githubRepository(remote) {
  const match = remote.trim().match(/^(?:git@github\.com:|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/i);
  if (!match) throw new Error("origin must point to a GitHub repository using HTTPS or SSH.");
  return match[1];
}

function command(program, args, capture = false) {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} ${args.join(" ")} failed (exit ${result.status})${capture && result.stderr ? `: ${result.stderr.trim()}` : ""}`);
  return capture ? result.stdout.trim() : "";
}

function release() {
  if (process.platform !== "darwin") throw new Error("Local releases require macOS.");
  const app = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const cargo = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
  const tag = releaseVersion(packageJson.version, app.version, cargo.match(/^version = "([^"]+)"/m)?.[1]);
  const repo = githubRepository(command("git", ["remote", "get-url", "origin"], true));
  if (command("git", ["status", "--porcelain"], true)) throw new Error("Working tree must be clean.");
  const head = command("git", ["rev-parse", "HEAD"], true);
  const remoteMain = command("git", ["ls-remote", "--exit-code", "origin", "refs/heads/main"], true).split(/\s+/)[0];
  if (head !== remoteMain) throw new Error("HEAD must match origin/main on GitHub. Commit and push the release version first.");
  const localTag = command("git", ["tag", "--list", tag], true);
  const remoteTag = command("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`], true);
  if (localTag || remoteTag) throw new Error(`Tag ${tag} already exists; choose a new version.`);
  command("gh", ["auth", "status"]);
  if (!existsSync(join(root, "node_modules/.bin/tauri"))) throw new Error("Dependencies missing; run npm ci first.");
  for (const target of ["aarch64-apple-darwin", "x86_64-apple-darwin"]) {
    if (!existsSync(join(root, `src-tauri/binaries/codex-runtime-${target}`))) {
      throw new Error("Both runtimes are required; run sh scripts/prepare-app-server.sh first.");
    }
  }

  command("npm", ["run", "build:mac"]);
  const directory = mkdtempSync(join(tmpdir(), "lotse-release-"));
  try {
    const assets = [["aarch64", "Lotse_Apple_Silicon.dmg"], ["x86_64", "Lotse_Intel.dmg"]];
    const sums = [];
    for (const [suffix, name] of assets) {
      const source = join(root, "src-tauri/target/share", `${app.productName}_${app.version}_${suffix}.dmg`);
      if (!statSync(source).size) throw new Error(`Empty build artifact: ${source}`);
      const destination = join(directory, name);
      copyFileSync(source, destination);
      sums.push(`${createHash("sha256").update(readFileSync(destination)).digest("hex")}  ${name}`);
    }
    writeFileSync(join(directory, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
    command("git", ["tag", "-a", tag, "-m", "lotse-local-release"]);
    command("git", ["push", "origin", `refs/tags/${tag}`]);
    const notes = "Download the DMG for your Mac: Apple Silicon or Intel. Open it and drag Lotse to Applications. These local builds are not automatically notarized by Apple. SHA256SUMS.txt contains checksums for both downloads.";
    command("gh", ["release", "create", tag, "--repo", repo, "--verify-tag", "--draft", "--title", `Lotse ${tag}`, "--notes", notes,
      ...assets.map(([, name]) => join(directory, name)), join(directory, "SHA256SUMS.txt")]);
    command("gh", ["release", "edit", tag, "--repo", repo, "--draft=false", "--latest"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    release();
  } catch (error) {
    console.error(`Release failed: ${error.message}\nIf a tag was created, inspect the local tag and GitHub draft before retrying.`);
    process.exitCode = 1;
  }
}
