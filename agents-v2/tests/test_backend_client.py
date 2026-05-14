"""Test suite for backend HTTP client."""
import json
import respx
import httpx
import pytest

from src.backend_client import (
    get_account,
    get_active_trades,
    get_latest_scan_candidates,
    open_trade,
    tighten_stop,
    close_trade,
    get_recent_reflections,
)
from src.schemas import OpenPayload


@respx.mock
def test_get_account():
    """Test fetching account info."""
    respx.get("http://localhost:3001/api/account").mock(
        return_value=httpx.Response(
            200, json={"id": 1, "current_capital": 1000, "total_pnl_closed": 50}
        )
    )
    acc = get_account()
    assert acc["current_capital"] == 1000
    assert acc["total_pnl_closed"] == 50


@respx.mock
def test_get_active_trades():
    """Test fetching active trades list."""
    respx.get("http://localhost:3001/api/trades/active").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": "bk-1", "coin": "BTC", "status": "active", "entry": 100},
                {"id": "bk-2", "coin": "ETH", "status": "m1", "entry": 50},
            ],
        )
    )
    trades = get_active_trades()
    assert len(trades) == 2
    assert trades[0]["id"] == "bk-1"
    assert trades[1]["status"] == "m1"


@respx.mock
def test_get_latest_scan_candidates():
    """Test fetching latest scan candidates."""
    respx.post("http://localhost:3001/api/scan/preview").mock(
        return_value=httpx.Response(
            200,
            json={
                "scan_id": 42,
                "candidates": [
                    {
                        "coin": "BTC",
                        "direction": "buy",
                        "timeframe": "1h",
                        "score": 88,
                        "entry": 100,
                        "stop": 95,
                        "m1": 105,
                        "m2": 110,
                        "m3": 115,
                        "stop_pct": 0.05,
                        "leverage": 10,
                    }
                ],
            },
        )
    )
    scan_id, candidates = get_latest_scan_candidates()
    assert scan_id == 42
    assert len(candidates) == 1
    assert candidates[0]["coin"] == "BTC"


@respx.mock
def test_open_trade_success():
    """Test successful trade opening."""
    captured = {}

    def handler(request):
        captured["body"] = json.loads(request.content)
        return httpx.Response(201, json={"id": "bk-1", "status": "active"})

    respx.post("http://localhost:3001/api/trades/open").mock(side_effect=handler)
    payload = OpenPayload(
        coin="XRPUSDT",
        direction="buy",
        timeframe="1h",
        regime_score=60,
        entry_score=40,
        entry=1,
        stop=0.95,
        m1=1.05,
        m2=1.1,
        m3=1.15,
        stop_pct=0.05,
        leverage=10,
    )
    res = open_trade(payload)
    assert res["id"] == "bk-1"
    assert captured["body"]["coin"] == "XRP"  # USDT stripped


@respx.mock
def test_open_trade_409_returns_blocked():
    """Test 409 response returns blocked dict."""
    respx.post("http://localhost:3001/api/trades/open").mock(
        return_value=httpx.Response(
            409, json={"error": "max_positions reached"}
        )
    )
    payload = OpenPayload(
        coin="BTC",
        direction="buy",
        timeframe="1h",
        regime_score=60,
        entry_score=40,
        entry=1,
        stop=0.9,
        m1=1.1,
        m2=1.2,
        m3=1.3,
        stop_pct=0.1,
        leverage=10,
    )
    res = open_trade(payload)
    assert res["blocked"] is True
    assert "max_positions" in res["reason"]


@respx.mock
def test_tighten_stop_success():
    """Test successful tighten-stop."""
    respx.post("http://localhost:3001/api/trades/bk-1/tighten-stop").mock(
        return_value=httpx.Response(200, json={"id": "bk-1", "stop": 98})
    )
    res = tighten_stop("bk-1", 98)
    assert res["id"] == "bk-1"
    assert res["stop"] == 98


@respx.mock
def test_tighten_stop_400_returns_blocked():
    """Test 400 response (e.g., stop looser) returns blocked dict."""
    respx.post("http://localhost:3001/api/trades/bk-1/tighten-stop").mock(
        return_value=httpx.Response(400, json={"error": "stop looser than current"})
    )
    res = tighten_stop("bk-1", 99)
    assert res["blocked"] is True
    assert "looser" in res["reason"]


@respx.mock
def test_tighten_stop_409_returns_blocked():
    """Test 409 response (e.g., trade inactive) returns blocked dict."""
    respx.post("http://localhost:3001/api/trades/bk-1/tighten-stop").mock(
        return_value=httpx.Response(409, json={"error": "trade not active"})
    )
    res = tighten_stop("bk-1", 98)
    assert res["blocked"] is True
    assert "active" in res["reason"]


@respx.mock
def test_close_trade():
    """Test closing a trade."""
    respx.post("http://localhost:3001/api/trades/bk-1/close").mock(
        return_value=httpx.Response(
            200, json={"id": "bk-1", "status": "manual", "pnl_closed": 50}
        )
    )
    res = close_trade("bk-1")
    assert res["id"] == "bk-1"
    assert res["status"] == "manual"
    assert res["pnl_closed"] == 50


@respx.mock
def test_get_recent_reflections():
    """Test fetching recent reflections."""
    respx.get("http://localhost:3001/api/reflections").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "trade_id": "bk-1",
                    "reflection_text": "Good R:R setup",
                    "lesson_tag": "R_R_EXECUTION",
                }
            ],
        )
    )
    reflections = get_recent_reflections(limit=10)
    assert len(reflections) == 1
    assert reflections[0]["lesson_tag"] == "R_R_EXECUTION"


def test_normalize_candidate_maps_dual_score():
    from src.backend_client import _normalize_candidate
    raw = {
        "coin": "BTC", "dir": "buy", "timeframe": "1h",
        "regimeScore": 55, "entryScore": -10,
        "entry": 100.0, "stop": 98.0,
        "m1": {"price": 102.0}, "m2": {"price": 104.0}, "m3": {"price": 106.0},
        "stopPct": "-2.00%", "leverage": 10, "reasons": [],
    }
    out = _normalize_candidate(raw)
    assert out["regime_score"] == 55
    assert out["entry_score"] == -10
    assert "score" not in out


@respx.mock
def test_get_recent_reflections_custom_limit():
    """Test reflections with custom limit param."""
    captured = {}

    def handler(request):
        captured["params"] = dict(request.url.params)
        return httpx.Response(200, json=[])

    respx.get("http://localhost:3001/api/reflections").mock(side_effect=handler)
    get_recent_reflections(limit=20)
    assert captured["params"]["limit"] == "20"
