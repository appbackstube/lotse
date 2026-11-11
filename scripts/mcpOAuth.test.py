"""Exercise file authentication using only temporary files and a local synthetic provider."""

import argparse
import base64
import hashlib
import http.server
import json
import os
import platform
import queue
import socket
import subprocess
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


SECRET_ENV = "CHAOTICREVIEW_MCP_OAUTH_726576696577_SECRET"


class Provider(http.server.BaseHTTPRequestHandler):
    token_requests = 0

    def log_message(self, *_args):
        pass

    def respond(self, body, status=200):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        base = f"http://127.0.0.1:{self.server.server_port}"
        if "oauth-protected-resource" in self.path:
            self.respond({"resource": base + "/mcp", "authorization_servers": [base]})
        elif "oauth-authorization-server" in self.path:
            self.respond({
                "issuer": base,
                "authorization_endpoint": base + "/authorize",
                "token_endpoint": base + "/token",
                "registration_endpoint": base + "/register",
                "code_challenge_methods_supported": ["S256"],
                "token_endpoint_auth_methods_supported": ["client_secret_post"] if self.server.require_secret else ["none"],
                "scopes_supported": ["read"],
            })
        elif self.headers.get("Authorization") == "Bearer synthetic-access-token":
            self.send_response(405)
            self.end_headers()
        else:
            self.send_response(401)
            self.send_header("WWW-Authenticate", f'Bearer resource_metadata="{base}/.well-known/oauth-protected-resource"')
            self.end_headers()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if self.path == "/register":
            self.respond({"client_id": "synthetic-public-client", "redirect_uris": json.loads(body)["redirect_uris"]})
        elif self.path == "/token":
            Provider.token_requests += 1
            fields = urllib.parse.parse_qs(body.decode())
            assert fields.get("code") == ["synthetic-authorization-code"], fields
            if self.server.require_secret:
                assert fields.get("client_id") == ["synthetic-registered-client"], "Registered client ID missing from token request"
                assert fields.get("client_secret") == ["synthetic-review-secret"], "Client secret missing from token request"
                assert not self.headers.get("Authorization"), "Slack requires client_secret_post, not HTTP Basic authentication"
            assert fields.get("code_verifier"), "Token exchange must include the PKCE verifier"
            self.respond({"access_token": "synthetic-access-token", "refresh_token": "synthetic-refresh-token",
                          "token_type": "Bearer", "expires_in": 3600, "scope": "read"})
        elif self.path == "/mcp" and self.headers.get("Authorization") == "Bearer synthetic-access-token":
            request = json.loads(body)
            if "id" not in request:
                self.send_response(202)
                self.end_headers()
                return
            result = {"tools": []}
            if request["method"] == "initialize":
                result = {"protocolVersion": request["params"]["protocolVersion"],
                          "capabilities": {"tools": {}}, "serverInfo": {"name": "synthetic-provider", "version": "1"}}
            self.respond({"jsonrpc": "2.0", "id": request["id"], "result": result})
        else:
            self.do_GET()


class Runtime:
    def __init__(self, binary, home):
        self.messages = queue.Queue()
        self.notifications = []
        self.next_id = 0
        self.stderr = (home / "stderr.log").open("w")
        self.process = subprocess.Popen(
            [str(binary), "--strict-config"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=self.stderr, text=True,
            env={**{key: value for key, value in os.environ.items()
                    if key not in {"OPENAI_API_KEY", "OPENAI_AUTH_TOKEN", "CODEX_API_KEY"}},
                 "CODEX_HOME": str(home), "OPENAI_BASE_URL": "http://127.0.0.1:1/v1",
                 SECRET_ENV: "synthetic-review-secret"},
        )
        threading.Thread(target=self.read, daemon=True).start()
        self.request("initialize", {"clientInfo": {"name": "LotseOAuthTest", "version": "0.1"}, "capabilities": {"experimentalApi": True}})
        self.process.stdin.write('{"jsonrpc":"2.0","method":"initialized","params":{}}\n')
        self.process.stdin.flush()

    def read(self):
        for line in self.process.stdout:
            self.messages.put(json.loads(line))

    def request(self, method, params, expect_error=False):
        self.next_id += 1
        self.process.stdin.write(json.dumps({"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params}) + "\n")
        self.process.stdin.flush()
        while True:
            item = self.messages.get(timeout=20)
            if item.get("id") == self.next_id:
                if expect_error:
                    assert "error" in item, item
                    return item["error"]
                assert "result" in item, item
                return item["result"]
            self.notifications.append(item)

    def completion(self, login_id):
        while True:
            for item in self.notifications:
                if item.get("method") == "mcpServer/oauthLogin/completed" and item["params"].get("loginId") == login_id:
                    self.notifications.remove(item)
                    return item["params"]
            self.notifications.append(self.messages.get(timeout=20))

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.stderr.close()


def check(binary, provider, registered, complete_path):
    provider.require_secret = registered
    server_url = f"http://127.0.0.1:{provider.server_port}/mcp"
    callback_id = base64.urlsafe_b64encode(hashlib.sha256(server_url.encode()).digest()[:9]).decode().rstrip("=")
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    callback = f"http://localhost:{port}/callback" + (f"/{callback_id}" if complete_path else "")
    expected = f"http://localhost:{port}/callback/{callback_id}"
    with tempfile.TemporaryDirectory(prefix="lotse-oauth-test-") as tmp:
        home = Path(tmp)
        config = f'''check_for_update_on_startup = false
cli_auth_credentials_store = "file"
mcp_oauth_credentials_store = "file"
shell_environment_policy.exclude = {json.dumps(["CHAOTICREVIEW_MCP_OAUTH_*"] if complete_path else [])}
[mcp_servers.oauth-test]
url = "{server_url}"
scopes = ["read"]
[mcp_servers.oauth-test.oauth]
callback_url = "{callback}"
callback_port = {port}
'''
        if registered:
            config += f'client_id = "synthetic-registered-client"\nclient_secret_env_var = "{SECRET_ENV}"\n'
        (home / "config.toml").write_text(config)
        runtime = Runtime(binary, home)
        try:
            login = runtime.request("mcpServer/oauth/login", {"name": "oauth-test", "timeoutSecs": 20})
            query = urllib.parse.parse_qs(urllib.parse.urlparse(login["authorizationUrl"]).query)
            assert query["redirect_uri"] == [expected], query["redirect_uri"]
            assert query["code_challenge_method"] == ["S256"]
            duplicate = runtime.request("mcpServer/oauth/login", {"name": "oauth-test"}, expect_error=True)
            assert "already pending" in duplicate["message"], duplicate
            runtime.request("mcpServer/oauth/cancel", {"name": "oauth-test", "loginId": login["loginId"]})
            retry = runtime.request("mcpServer/oauth/login", {"name": "oauth-test", "timeoutSecs": 20})
            assert retry["loginId"] != login["loginId"]
            # A delayed cancellation must not stop a newer attempt.
            runtime.request("mcpServer/oauth/cancel", {"name": "oauth-test", "loginId": login["loginId"]})
            duplicate = runtime.request("mcpServer/oauth/login", {"name": "oauth-test"}, expect_error=True)
            assert "already pending" in duplicate["message"], duplicate
            retry_query = urllib.parse.parse_qs(urllib.parse.urlparse(retry["authorizationUrl"]).query)
            denied = expected + "?" + urllib.parse.urlencode({"error": "access_denied", "state": retry_query["state"][0]})
            try:
                urllib.request.urlopen(denied, timeout=5)
                raise AssertionError("provider denial must return HTTP 400")
            except urllib.error.HTTPError as error:
                assert error.code == 400
            assert runtime.completion(retry["loginId"])["success"] is False
            expiring = runtime.request("mcpServer/oauth/login", {"name": "oauth-test", "timeoutSecs": 1})
            assert runtime.completion(expiring["loginId"])["success"] is False
            probe = runtime.request("command/exec", {
                "command": ["/bin/sh", "-c", f'test -z "${{{SECRET_ENV}}}" && printf SECRET_FILTERED'],
                "cwd": tmp, "timeoutMs": 2000, "sandboxPolicy": {"type": "dangerFullAccess"},
            })
            assert probe["exitCode"] == 0 and probe["stdout"] == "SECRET_FILTERED", "OAuth secret leaked into a child command"
            assert not (home / ".credentials.json").exists(), "cancelled sign-ins must not persist tokens"
            login = runtime.request("mcpServer/oauth/login", {"name": "oauth-test", "timeoutSecs": 20})
            query = urllib.parse.parse_qs(urllib.parse.urlparse(login["authorizationUrl"]).query)
            accepted = expected + "?" + urllib.parse.urlencode({"code": "synthetic-authorization-code", "state": query["state"][0]})
            with urllib.request.urlopen(accepted, timeout=5) as response:
                assert response.status == 200
            assert runtime.completion(login["loginId"])["success"] is True
            tokens = home / ".credentials.json"
            assert "synthetic-access-token" in tokens.read_text()
            assert tokens.stat().st_mode & 0o777 == 0o600
            runtime.close()
            runtime = Runtime(binary, home)
            status = runtime.request("mcpServerStatus/list", {"detail": "toolsAndAuthOnly", "limit": 100})
            assert any(item["name"] == "oauth-test" and item["authStatus"].lower() == "oauth" for item in status["data"]), status
            runtime.request("account/login/start", {"type": "apiKey", "apiKey": "synthetic-api-key"})
            auth = home / "auth.json"
            assert "synthetic-api-key" in auth.read_text()
            assert auth.stat().st_mode & 0o777 == 0o600
            runtime.close()
            runtime = Runtime(binary, home)
            assert runtime.request("account/read", {"refreshToken": False})["account"]["type"] == "apiKey"
            runtime.request("account/logout", {})
            assert not auth.exists() or "synthetic-api-key" not in auth.read_text()
            runtime.close()
            runtime = Runtime(binary, home)
            assert runtime.request("account/read", {"refreshToken": False})["account"] is None
        finally:
            runtime.close()
    print(f"PASS registered={registered}, complete_callback={complete_path}: callback, PKCE, cancel/retry, denial, timeout, secret filtering, OAuth persistence, account persistence/logout")


if __name__ == "__main__":
    target = "aarch64" if platform.machine() == "arm64" else "x86_64"
    default_binary = Path(__file__).resolve().parents[1] / f"src-tauri/binaries/codex-runtime-{target}-apple-darwin/bin/codex-app-server"
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, default=default_binary)
    args = parser.parse_args()
    provider = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Provider)
    threading.Thread(target=provider.serve_forever, daemon=True).start()
    try:
        for registered, complete_path in [(True, False), (True, True), (False, False)]:
            check(args.binary.resolve(), provider, registered, complete_path)
        assert Provider.token_requests == 3, "each test must exchange exactly one synthetic authorization code"
    finally:
        provider.shutdown()
        provider.server_close()
