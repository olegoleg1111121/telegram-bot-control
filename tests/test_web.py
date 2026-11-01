import http.client
import json
import threading

import pytest

from telegram_bot_control.web import DashboardServer


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
