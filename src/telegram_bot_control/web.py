"""Optional authenticated owner dashboard; unused by the embedded SDK and stdio mode."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import sys
import threading
import time
import webbrowser
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from . import __version__
from .bridge import Bridge
from .config import data_directory
from .privacy import redact

RPC_METHODS = frozenset(
    {
        "hello",
        "snapshot",
        "launch_profile",
        "save_launch_profile",
        "control_bot",
        "logs",
        "action_analytics",
        "inspect_project",
        "register_project",
        "preview_retention",
        "save_settings",
    }
)
MAX_BODY = 1024 * 1024
SESSION_SECONDS = 8 * 3600


def asset_directory() -> Path:
    bundled = Path(__file__).with_name("web_assets")
    if (bundled / "index.html").is_file():
        return bundled
    checkout = Path(__file__).resolve().parents[2] / "desktop/dist"
    if (checkout / "index.html").is_file():
        return checkout
    raise ValueError(
        "Web files are missing. Reinstall the ready-made package: "
        "python -m pip install --upgrade --force-reinstall telegram-bot-control. "
        "Source development: https://github.com/olegoleg1111121/telegram-bot-control/blob/main/docs/development.en.md"
    )


class DashboardServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != "nt"

    def __init__(
        self,
        directory: Path,
        host: str,
        port: int,
        *,
        assets: Path | None = None,
        access_key: str | None = None,
    ):
        if host not in ("127.0.0.1", "0.0.0.0") or type(port) is not int or not 0 <= port <= 65535:
            raise ValueError("Invalid web listen address or port")
        self.assets = (assets or asset_directory()).resolve()
        self.bridge = Bridge(directory)
        self.access_key = access_key or secrets.token_urlsafe(32)
        if len(self.access_key) < 32:
            raise ValueError("Web access key must contain at least 32 characters")
        self.key_hash = hashlib.sha256(self.access_key.encode()).digest()
        self.sessions: dict[str, float] = {}
        self.failures: dict[str, tuple[int, float]] = {}
        self.guard = threading.RLock()
        self.launch_hash: bytes | None = None
        self.launch_expires = 0.0
        super().__init__((host, port), DashboardHandler)

    def browser_url(self) -> str:
        """A short-lived, single-use local launch capability, never the access key."""
        token = secrets.token_urlsafe(32)
        with self.guard:
            self.launch_hash = hashlib.sha256(token.encode()).digest()
            self.launch_expires = time.monotonic() + 60
        return f"http://127.0.0.1:{self.server_port}/#launch={token}"

    def authenticated(self, cookie: str | None) -> bool:
        try:
            jar = SimpleCookie(cookie or "")
            value = jar["botcontrol_session"].value
        except (KeyError, ValueError, CookieError):
            return False
        with self.guard:
            return self.sessions.get(value, 0) > time.monotonic()


class DashboardHandler(BaseHTTPRequestHandler):
    server: DashboardServer
    server_version = "BotControl"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, *_):
        # Never write access keys, requests, bot identifiers or paths to access logs.
        pass

    def reply(self, status: int, value, *, cookie: str | None = None):
        body = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.security_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def security_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        )

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/session":
            return self.reply(
                200,
                {
                    "authenticated": self.server.authenticated(self.headers.get("Cookie")),
                    "version": __version__,
                },
            )
        if path.startswith("/api/"):
            return self.reply(405, {"error": "POST required"})
        # Only application assets are public. API data always requires a session.
        relative = unquote(path).lstrip("/") or "index.html"
        target = (self.server.assets / relative).resolve()
        if not target.is_relative_to(self.server.assets) or not target.is_file():
            return self.reply(404, {"error": "Not found"})
        if target.suffix.lower() not in (
            ".html",
            ".js",
            ".css",
            ".woff2",
            ".png",
            ".svg",
            ".ico",
            ".txt",
        ):
            return self.reply(404, {"error": "Not found"})
        body = target.read_bytes()
        if target.name == "index.html":
            body = body.replace(b"connect-src 'none'", b"connect-src 'self'")
        self.send_response(200)
        self.security_headers()
        content_type = {
            ".js": "text/javascript",
            ".css": "text/css",
            ".html": "text/html; charset=utf-8",
            ".woff2": "font/woff2",
        }.get(target.suffix.lower())
        self.send_header(
            "Content-Type",
            content_type or mimetypes.guess_type(str(target))[0] or "application/octet-stream",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        origin = self.headers.get("Origin", "")
        try:
            parsed_origin = urlsplit(origin)
        except ValueError:
            return self.reply(403, {"error": "Origin check failed"})
        if (
            parsed_origin.scheme not in ("http", "https")
            or parsed_origin.netloc != self.headers.get("Host", "")
            or self.headers.get("X-Bot-Control") != "1"
        ):
            return self.reply(403, {"error": "Origin check failed"})
        if self.headers.get_content_type() != "application/json":
            return self.reply(415, {"error": "JSON required"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                return self.reply(413, {"error": "Request too large or empty"})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("Expected an object")
        except (ValueError, UnicodeError):
            return self.reply(400, {"error": "Invalid JSON"})
        path = urlsplit(self.path).path
        if path == "/api/login":
            return self.login(data)
        if path == "/api/launch":
            with self.server.guard:
                token = data.get("token", "")
                good = (
                    self.client_address[0] == "127.0.0.1"
                    and isinstance(token, str)
                    and self.server.launch_hash is not None
                    and self.server.launch_expires > time.monotonic()
                    and hmac.compare_digest(
                        hashlib.sha256(token.encode()).digest(), self.server.launch_hash
                    )
                )
                if not good:
                    return self.reply(401, {"error": "Launch link expired or already used"})
                self.server.launch_hash = None
                self.server.launch_expires = 0
                return self.create_session()
        if not self.server.authenticated(self.headers.get("Cookie")):
            return self.reply(401, {"error": "Sign in required"})
        if path == "/api/logout":
            jar = SimpleCookie(self.headers.get("Cookie", ""))
            with self.server.guard:
                self.server.sessions.pop(jar["botcontrol_session"].value, None)
            return self.reply(
                200,
                {"ok": True},
                cookie="botcontrol_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
            )
        if (
            path != "/api/rpc"
            or not isinstance(data.get("method"), str)
            or data.get("method") not in RPC_METHODS
            or not isinstance(data.get("params", {}), dict)
        ):
            return self.reply(400, {"error": "Unknown method or invalid params"})
        try:
            with self.server.guard:
                result = self.server.bridge.call(data["method"], data.get("params", {}))
            if data["method"] == "hello":
                result.update(runtime="web", python=sys.executable)
            if data["method"] == "snapshot":
                result["meta"]["transport"] = "http"
            return self.reply(200, {"result": result})
        except Exception as error:
            return self.reply(400, {"error": redact(str(error))[:500]})

    def login(self, data):
        address = self.client_address[0]
        now = time.monotonic()
        with self.server.guard:
            self.server.failures = {
                key: value for key, value in self.server.failures.items() if value[1] > now
            }
            count, expires = self.server.failures.get(address, (0, now + 300))
            if count >= 10:
                return self.reply(429, {"error": "Too many attempts. Try again later."})
            key = data.get("key", "")
            good = isinstance(key, str) and hmac.compare_digest(
                hashlib.sha256(key.encode()).digest(), self.server.key_hash
            )
            if not good:
                if len(self.server.failures) < 1024 or address in self.server.failures:
                    self.server.failures[address] = (count + 1, expires)
                return self.reply(401, {"error": "Invalid access key"})
            self.server.failures.pop(address, None)
            return self.create_session()

    def create_session(self):
        now = time.monotonic()
        with self.server.guard:
            self.server.sessions = {
                key: expires for key, expires in self.server.sessions.items() if expires > now
            }
            if len(self.server.sessions) >= 64:
                return self.reply(429, {"error": "Session limit reached"})
            session = secrets.token_urlsafe(32)
            self.server.sessions[session] = now + SESSION_SECONDS
        secure = "; Secure" if urlsplit(self.headers.get("Origin", "")).scheme == "https" else ""
        return self.reply(
            200,
            {"ok": True},
            cookie=f"botcontrol_session={session}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_SECONDS}{secure}",
        )


def run(
    directory: Path, host: str, port: int, *, child: bool = False, open_browser: bool = False
) -> int:
    try:
        try:
            server = DashboardServer(
                directory, host, port, access_key=os.environ.get("BOTCONTROL_WEB_KEY")
            )
        except OSError:
            if not open_browser or host != "127.0.0.1" or not port:
                raise
            server = DashboardServer(
                directory, host, 0, access_key=os.environ.get("BOTCONTROL_WEB_KEY")
            )
    except (OSError, ValueError) as error:
        print(
            f"Не удалось открыть панель / Could not start dashboard: {redact(str(error))}",
            file=sys.stderr,
        )
        return 1
    info = {
        "running": True,
        "host": host,
        "port": server.server_port,
        "url": f"http://127.0.0.1:{server.server_port}",
        "key": server.access_key,
    }
    if child:
        print(json.dumps(info), flush=True)

        def watch_parent():
            sys.stdin.buffer.read()
            server.shutdown()

        threading.Thread(target=watch_parent, daemon=True).start()
    else:
        print(
            f"Панель / Dashboard: {info['url']}\nКлюч доступа / Access key: {info['key']}\nДля остановки нажмите Ctrl+C / Press Ctrl+C to stop.",
            flush=True,
        )
        if open_browser:
            launch_url = server.browser_url()

            def browse():
                try:
                    if webbrowser.open(launch_url, new=2):
                        return
                except Exception:
                    pass
                print(
                    "Откройте адрес панели вручную и введите ключ из терминала / Open the dashboard URL manually and enter its access key.",
                    flush=True,
                )

            threading.Thread(target=browse, daemon=True).start()
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def main():
    parser = argparse.ArgumentParser(description="Optional Bot Control web dashboard")
    parser.add_argument("--data-dir")
    parser.add_argument("--host", choices=("127.0.0.1", "0.0.0.0"), default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--child", action="store_true")
    args = parser.parse_args()
    return run(data_directory(args.data_dir), args.host, args.port, child=args.child)


if __name__ == "__main__":
    raise SystemExit(main())
