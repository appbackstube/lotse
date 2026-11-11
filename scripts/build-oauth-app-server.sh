#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_dir=$(mktemp -d -t chaoticreview-codex-oauth.XXXXXX)
trap 'rm -rf "$source_dir"' EXIT INT TERM

git clone --quiet --depth 1 --branch rust-v0.163.0 https://github.com/openai/codex.git "$source_dir"
test "$(git -C "$source_dir" rev-parse HEAD)" = 83086188ae0614bd882818ff1aa23f3194962012
git -C "$source_dir" apply "$root/scripts/patches/codex-oauth-env-v0.163.0.patch"

(cd "$source_dir/codex-rs" && rustup target add aarch64-apple-darwin x86_64-apple-darwin)
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  (cd "$source_dir/codex-rs" && cargo build --release --locked -p codex-app-server --target "$target")
  install -m 755 "$source_dir/codex-rs/target/$target/release/codex-app-server" \
    "$root/src-tauri/binaries/codex-runtime-$target/bin/codex-app-server"
done
