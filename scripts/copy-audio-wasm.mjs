import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--offline", "--locked", "--format-version", "1", "--filter-platform", "wasm32-unknown-unknown", "--manifest-path", "audio-denoise/Cargo.toml"], { encoding: "utf8" }));
mkdirSync("public/audio", { recursive: true });
copyFileSync(join(metadata.target_directory, "wasm32-unknown-unknown", "release", "lotse_audio_denoise.wasm"), "public/audio/lotse_audio_denoise.wasm");
const notices = [];
for (const dependency of metadata.packages.filter(item => item.source)) {
  const directory = dirname(dependency.manifest_path);
  const files = readdirSync(directory).filter(name => /^(LICENSE|COPYING|NOTICE)([-_.].*)?$/i.test(name));
  if (!files.length) throw new Error(`No license file for ${dependency.name}`);
  notices.push(`# ${dependency.name} ${dependency.version} (${dependency.license})\n\n${files.map(name => `## ${name}\n\n${readFileSync(join(directory, name), "utf8")}`).join("\n\n")}`);
}
writeFileSync("public/audio/licenses.txt", notices.join("\n\n"));
