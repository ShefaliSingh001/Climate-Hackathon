import json
import shutil
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi.testclient import TestClient

from backend.app import db as db_module
from backend.app import main
from backend.app.impact import impact_for
from backend.app.report import MODEL, write_report
from backend.tests.conftest import SQLITE_FILE

REPORT = {"headline": "3,819 tonnes matched.", "summary": ["One.", "Two."], "highlights": ["A", "B", "C"]}


@pytest.fixture
def impact(marketplace):
    return impact_for(*marketplace)


@pytest.fixture
def fake_claude(monkeypatch):
    """A local stand-in for the Messages API that records what it was sent."""
    seen = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            seen["path"] = self.path
            seen["headers"] = dict(self.headers)
            seen["body"] = json.loads(self.rfile.read(int(self.headers["content-length"])))
            body = json.dumps({
                "id": "msg_test", "type": "message", "role": "assistant", "model": MODEL,
                "content": [{"type": "text", "text": json.dumps(REPORT)}],
                "stop_reason": "end_turn", "stop_sequence": None,
                "usage": {"input_tokens": 10, "output_tokens": 10},
            }).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("ANTHROPIC_BASE_URL", f"http://127.0.0.1:{server.server_port}")
    yield seen
    server.shutdown()


def test_template_report_without_key(monkeypatch, impact):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    r = write_report(impact)
    assert r["source"] == "template" and "ANTHROPIC_API_KEY" in r["note"]
    assert len(r["summary"]) == 3 and len(r["highlights"]) == 3
    assert "2035" in r["headline"] and "recycled" in r["headline"]


def test_claude_request_and_response(fake_claude, impact):
    r = write_report(impact)
    assert r == {**REPORT, "source": "claude", "model": MODEL, "note": None}

    body = fake_claude["body"]
    assert fake_claude["path"].startswith("/v1/messages")
    assert body["model"] == "claude-opus-5-5"
    assert body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in fake_claude["headers"]["anthropic-beta"]
    assert body["output_config"]["format"]["type"] == "json_schema"
    # Claude gets the dashboard's numbers, not made-up ones.
    sent = json.loads(body["messages"][0]["content"].split("\n\n", 1)[1])
    assert sent["co2eAvoidedT"] == impact["co2eAvoidedT"]


def test_api_endpoints(monkeypatch, tmp_path):
    copy = tmp_path / "circulink.db"
    shutil.copy(SQLITE_FILE, copy)
    monkeypatch.setattr(db_module, "DB_PATH", copy)
    monkeypatch.setattr(db_module, "_ready", set())
    monkeypatch.setattr(db_module, "DATABASE_URL", "")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    client = TestClient(main.app)
    stats = client.get("/impact").json()
    assert stats["tonnesRecirculated"] > 0 and stats["outlook"]["years"][-1] == 2035
    report = client.post("/impact/report").json()
    assert report["source"] == "template" and report["generatedAt"]
