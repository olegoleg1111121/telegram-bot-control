import http.client
import json
import threading
import time
from urllib.parse import urlsplit, parse_qs

import pytest

from telegram_bot_control.web import DashboardServer, DashboardHandler


@pytest.fixture
def web(tmp_path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "index.html").write_text("<html>dashboard</html>")
    (tmp_path / "private.txt").write_text("PRIVATE DATA")
    server = DashboardServer(tmp_path / "data", "127.0.0.1", 0, assets=assets)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()
    thread.join(timeout=3)


def request(server, path, data=None, *, cookie="", origin=None):
    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
    headers = {
        "Content-Type": "application/json",
        "X-Bot-Control": "1",
        "Cookie": cookie,
        "Origin": origin or f"http://127.0.0.1:{server.server_port}",
    }
    connection.request(
        "GET" if data is None else "POST",
        path,
        body=None if data is None else json.dumps(data),
        headers=headers,
    )
    response = connection.getresponse()
    result = response.status, dict(response.getheaders()), response.read()
    connection.close()
    return result


def login(server):
    code, headers, _ = request(server, "/api/login", {"key": server.access_key})
    assert code == 200
    assert "HttpOnly" in headers["Set-Cookie"] and "SameSite=Strict" in headers["Set-Cookie"]
    return headers["Set-Cookie"].split(";", 1)[0]


def test_dashboard_requires_auth_for_telemetry_and_control(web):
    assert request(web, "/")[0] == 200
    assert request(web, "/api/rpc", {"method": "snapshot"})[0] == 401
    assert request(web, "/api/rpc", {"method": "control_bot"})[0] == 401
    cookie = login(web)
    code, _, body = request(web, "/api/rpc", {"method": "snapshot"}, cookie=cookie)
    assert code == 200
    assert json.loads(body)["result"]["bots"] == []
    assert web.access_key.encode() not in body


def test_csrf_logout_and_private_paths(web):
    cookie = login(web)
    assert (
        request(
            web,
            "/api/rpc",
            {"method": "save_settings"},
            cookie=cookie,
            origin="https://other.example",
        )[0]
        == 403
    )
    assert request(web, "/../private.txt")[0] == 404
    assert request(web, "/%2e%2e/private.txt")[0] == 404
    assert request(web, "/api/rpc", {"method": "web_start"}, cookie=cookie)[0] == 400
    assert request(web, "/api/logout", {}, cookie=cookie)[0] == 200
    assert request(web, "/api/rpc", {"method": "snapshot"}, cookie=cookie)[0] == 401


def test_wrong_key_and_login_rate_limit(web):
    for _ in range(10):
        assert request(web, "/api/login", {"key": "incorrect"})[0] == 401
    assert request(web, "/api/login", {"key": "incorrect"})[0] == 429


def test_one_time_browser_launch_requires_valid_origin_and_cannot_be_replayed(web):
    url = web.browser_url()
    token = parse_qs(urlsplit(url).fragment)["launch"][0]
    assert urlsplit(url).query == "" and token != web.access_key
    assert 0 < web.launch_expires - time.monotonic() <= 60
    assert request(web, "/api/launch", {"token": token}, origin="https://other.example")[0] == 403
    assert request(web, "/api/launch", {"token": "wrong"})[0] == 401
    code, headers, body = request(web, "/api/launch", {"token": token})
    assert code == 200 and "HttpOnly" in headers["Set-Cookie"]
    cookie = headers["Set-Cookie"].split(";", 1)[0]
    assert request(web, "/api/rpc", {"method": "snapshot"}, cookie=cookie)[0] == 200
    assert token.encode() not in body and web.access_key.encode() not in body
    assert request(web, "/api/launch", {"token": token})[0] == 401


def test_expired_launch_and_remote_address_keep_normal_authentication(web):
    token = parse_qs(urlsplit(web.browser_url()).fragment)["launch"][0]
    web.launch_expires = time.monotonic() - 1
    assert request(web, "/api/launch", {"token": token})[0] == 401
    assert request(web, "/api/rpc", {"method": "snapshot"})[0] == 401
    token = parse_qs(urlsplit(web.browser_url()).fragment)["launch"][0]

    class RemoteAddressHandler(DashboardHandler):
        def setup(self):
            super().setup()
            self.client_address = ("192.0.2.10", self.client_address[1])

    web.RequestHandlerClass = RemoteAddressHandler
    assert request(web, "/api/launch", {"token": token})[0] == 401
    web.RequestHandlerClass = DashboardHandler
    assert request(web, "/api/launch", {"token": token})[0] == 200
    assert login(web)  # The normal owner-key login remains available.


def test_web_bind_validation(tmp_path):
    with pytest.raises(ValueError):
        DashboardServer(tmp_path, "external.example", 8765)
    with pytest.raises(ValueError):
        DashboardServer(tmp_path, "127.0.0.1", -1)


def test_authenticated_input_validation_and_cleanup_confirmation(web):
    cookie = login(web)
    assert request(web, "/api/rpc", {"method": []}, cookie=cookie)[0] == 400
    settings = {
        "statistics_days": 1,
        "errors_days": 30,
        "diagnostics_days": 7,
        "heartbeat_seconds": 10,
        "connection_timeout_seconds": 30,
    }
    assert (
        request(
            web,
            "/api/rpc",
            {"method": "save_settings", "params": {"settings": settings}},
            cookie=cookie,
        )[0]
        == 400
    )
    code, _, body = request(
        web,
        "/api/rpc",
        {"method": "save_settings", "params": {"settings": settings, "confirm_cleanup": True}},
        cookie=cookie,
    )
    assert code == 200 and json.loads(body)["result"]["settings"]["statistics_days"] == 1


def test_malformed_session_cookie_does_not_expose_data(web):
    code, _, body = request(web, "/api/session", cookie="broken cookie; botcontrol_session=]")
    assert code == 200 and json.loads(body)["authenticated"] is False
