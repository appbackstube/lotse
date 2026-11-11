#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
out="$root/src-tauri/binaries"
manifest="$out/manifest.json"

value() {
  node -p "require(process.argv[1])$1" "$manifest"
}

release=$(value '.release')

fetch() {
  target="$1"
  asset=$(value ".assets['$target'].file")
  checksum=$(value ".assets['$target'].sha256")
  archive=$(mktemp -t chaoticreview-app-server.XXXXXX)
  unpack=$(mktemp -d -t chaoticreview-app-server.XXXXXX)
  trap 'rm -f "$archive"; rm -rf "$unpack"' EXIT INT TERM
  curl --fail --location --silent --show-error "https://github.com/openai/codex/releases/download/$release/$asset" -o "$archive"
  echo "$checksum  $archive" | shasum -a 256 -c -
  tar -xzf "$archive" -C "$unpack"
  package_manifest=$(find "$unpack" -type f -name 'codex-package.json' -print -quit)
  package=$(dirname "$package_manifest")
  binary=$(find "$unpack" -type f -name 'codex-app-server' -print -quit)
  code_host=$(find "$unpack" -type f -name 'codex-code-mode-host' -print -quit)
  test -n "$binary"
  test -n "$code_host"
  test -n "$package_manifest"
  test "$(node -p "require(process.argv[1]).version" "$package_manifest")" = "$(value '.version')"
  test "$(node -p "require(process.argv[1]).target" "$package_manifest")" = "$target"
  test "$(node -p "require(process.argv[1]).entrypoint" "$package_manifest")" = "bin/codex-app-server"
  test -x "$binary"
  test -x "$code_host"
  rm -rf "$out/codex-runtime-$target"
  cp -R "$package" "$out/codex-runtime-$target"
  trap - EXIT INT TERM
  rm -f "$archive"
  rm -rf "$unpack"
}

mkdir -p "$out"
test -f "$manifest"
fetch aarch64-apple-darwin
fetch x86_64-apple-darwin

case "$(uname -m)" in
  arm64) dev_target=aarch64-apple-darwin ;;
  x86_64) dev_target=x86_64-apple-darwin ;;
  *) exit 1 ;;
esac
sh "$root/scripts/build-oauth-app-server.sh"
"$out/codex-runtime-$dev_target/bin/codex-app-server" --version
smoke_home=$(mktemp -d -t chaoticreview-app-server-smoke.XXXXXX)
trap 'rm -rf "$smoke_home"' EXIT INT TERM
printf '%s\n' 'cli_auth_credentials_store = "file"' 'mcp_oauth_credentials_store = "file"' '[mcp_servers.smoke]' 'url = "https://example.com/mcp"' '[mcp_servers.smoke.oauth]' 'client_id = "test-client"' 'client_secret_env_var = "TEST_MCP_OAUTH_SECRET"' > "$smoke_home/config.toml"
{ printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"ChaoticReview","version":"0.1.0"},"capabilities":{"experimentalApi":true}}}' '{"jsonrpc":"2.0","method":"initialized","params":{}}'; sleep 2; } | CODEX_HOME="$smoke_home" "$out/codex-runtime-$dev_target/bin/codex-app-server" --strict-config > "$smoke_home/output.jsonl"
grep -q '"id":1' "$smoke_home/output.jsonl"
