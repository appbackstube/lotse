#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  set -- aarch64-apple-darwin x86_64-apple-darwin
fi
for target in "$@"; do
  case "$target" in
    aarch64-apple-darwin|x86_64-apple-darwin) ;;
    *) echo "Usage: $0 [aarch64-apple-darwin] [x86_64-apple-darwin]" >&2; exit 1 ;;
  esac
done

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_dir=$(mktemp -d -t chaoticreview-codex-oauth.XXXXXX)
trap 'rm -rf "$source_dir"' EXIT INT TERM

git clone --quiet --depth 1 --branch rust-v0.163.0 https://github.com/openai/codex.git "$source_dir"
test "$(git -C "$source_dir" rev-parse HEAD)" = 83086188ae0614bd882818ff1aa23f3194962012
git -C "$source_dir" apply "$root/scripts/patches/codex-oauth-env-v0.163.0.patch"

(cd "$source_dir/codex-rs" && rustup target add "$@")
for target in "$@"; do
  (cd "$source_dir/codex-rs" && cargo build --release --locked -p codex-app-server --target "$target")
  install -m 755 "$source_dir/codex-rs/target/$target/release/codex-app-server" \
    "$root/src-tauri/binaries/codex-runtime-$target/bin/codex-app-server"
done
