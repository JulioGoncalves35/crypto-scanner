"""Thin HTTP wrappers for the Node scanner backend.

Provides functions to communicate with the backend API running on
http://localhost:3001 (configurable via SCANNER_BACKEND_URL env var).

Handles:
- Account info & settings
- Trade CRUD operations
- Scan execution & candidate retrieval
- Risk management (tighten-stop)
- Reflection storage
"""
import os
from typing import Any
import httpx

from src.schemas import OpenPayload
from src.db import get_latest_scan_id

BASE = os.environ.get("SCANNER_BACKEND_URL", "http://localhost:3001")
TIMEOUT = httpx.Timeout(15.0, connect=5.0)
SCAN_TIMEOUT = httpx.Timeout(180.0, connect=5.0)


def _client(timeout: httpx.Timeout = TIMEOUT) -> httpx.Client:
    """Create a configured HTTP client."""
    return httpx.Client(base_url=BASE, timeout=timeout)


def get_account() -> dict[str, Any]:
    """Fetch account info (capital, stats, limits)."""
    with _client() as c:
        r = c.get("/api/account")
        r.raise_for_status()
        return r.json()


def get_active_trades() -> list[dict[str, Any]]:
    """Fetch list of active and in-progress trades.

    Returns trades with status in: active, m1, m2, m3.
    Excludes stopped/expired/manual trades.
    """
    with _client() as c:
        r = c.get("/api/trades/active")
        r.raise_for_status()
        return r.json()


def _normalize_candidate(c: dict) -> dict:
    """Map backend candidate shape to Candidate schema fields."""
    def _price(v):
        return v["price"] if isinstance(v, dict) else v

    def _pct(v):
        if isinstance(v, str):
            return float(v.replace("%", "").strip())
        return v

    return {
        "coin":      c.get("coin", ""),
        "direction": c.get("dir"),
        "timeframe": c.get("timeframe"),
        "regime_score": int(c.get("regimeScore", 0)),
        "entry_score":  int(c.get("entryScore", 0)),
        "entry":     c.get("entry"),
        "stop":      c.get("stop"),
        "m1":        _price(c.get("m1")),
        "m2":        _price(c.get("m2")),
        "m3":        _price(c.get("m3")),
        "stop_pct":  _pct(c.get("stopPct")),
        "leverage":  c.get("leverage"),
        "signals":   [r["text"] for r in c.get("reasons", []) if isinstance(r, dict)],
    }


def get_latest_scan_candidates() -> tuple[int, list[dict]]:
    """Run a fresh scan and return candidates.

    Calls POST /api/scan/preview which runs the 15m cron logic
    and returns scored setups that passed the minimum score filter.

    Returns:
        (scan_id, candidates_list)
        scan_id: -1 if scan failed
        candidates: list of normalized Candidate dicts
    """
    with _client(SCAN_TIMEOUT) as c:
        r = c.post("/api/scan/preview", json={})
        r.raise_for_status()
        data = r.json()

    raw = data.get("candidates", [])
    candidates = [_normalize_candidate(c) for c in raw]
    scan_id = get_latest_scan_id()
    return scan_id, candidates


def open_trade(payload: OpenPayload) -> dict[str, Any]:
    """Open a new trade (Leader-driven).

    If 409: position blocked (max_positions, capital, or risk cap exceeded).
    Returns dict with:
    - On success: {"id": "bk-...", "status": "active", ...}
    - On block: {"blocked": True, "reason": "..."}
    """
    body = payload.model_dump()
    body["dir"] = body.pop("direction")  # backend expects 'dir', not 'direction'
    with _client() as c:
        r = c.post("/api/trades/open", json=body)
        if r.status_code == 409:
            return {"blocked": True, "reason": r.json().get("error", "blocked")}
        if r.status_code == 400:
            return {"blocked": True, "reason": r.json().get("error", r.text)}
        r.raise_for_status()
        return r.json()


def tighten_stop(trade_id: str, new_stop: float) -> dict[str, Any]:
    """Move a trade's stop-loss closer (direction-aware).

    Returns dict with:
    - On success: {"id": "...", "stop": new_stop, ...}
    - On block (400/409): {"blocked": True, "reason": "..."}
      - 400: stop would be looser (or already at tight limit)
      - 409: trade not in active state
    """
    with _client() as c:
        r = c.post(
            f"/api/trades/{trade_id}/tighten-stop",
            json={"new_stop": new_stop}
        )
        if r.status_code in (400, 409):
            return {"blocked": True, "reason": r.json().get("error", "rejected")}
        r.raise_for_status()
        return r.json()


def close_trade(trade_id: str) -> dict[str, Any]:
    """Close a trade at current market price (manual exit).

    Returns dict with:
    - {"id": "...", "status": "manual", "pnl_closed": <float>, ...}
    """
    with _client() as c:
        r = c.post(f"/api/trades/{trade_id}/close")
        r.raise_for_status()
        return r.json()


def get_recent_reflections(limit: int = 10) -> list[dict]:
    """Fetch recent post-trade reflections (Leader memory).

    Args:
        limit: number of reflections to fetch (1-200, default 10)

    Returns list of reflection dicts with keys:
    - trade_id, reflection_text, lesson_tag, created_at
    """
    with _client() as c:
        r = c.get("/api/reflections", params={"limit": limit})
        r.raise_for_status()
        return r.json()
