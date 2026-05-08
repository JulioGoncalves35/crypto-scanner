# Agents v0.2 — Free Council Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python multi-agent council (6 agents) using free LLM APIs (Gemini, Groq, OpenRouter) that consumes the existing Node scanner's candidates and decides paper trades, while preserving the current Claude Council intact.

**Architecture:** A LangGraph state machine orchestrates 6 specialized agents (Technical, Sentiment, News, Bull, Bear, Trader) plus a Risk Reviewer cron. Agents talk to the existing Node backend via HTTP (`localhost:3001`). All decisions are logged to a new SQLite table `agent_decisions` (in the same `data/scanner.db`). No file in `painel.html`, `painel-core.js`, `backend/scanner.js`, `backend/paper-trader.js`, or `.claude/agents/` is modified — the Claude Council remains the v0.1 fallback.

**Tech Stack:** Python 3.14+, LangGraph 0.2+, httpx, pydantic v2, sqlite3 (stdlib), `google-genai`, `groq`, `openai` (for OpenRouter compat). Reuses the existing `backend/` venv-free setup but lives in `agents-v2/` (Python).

---

## File Structure

```
agents-v2/
├── README.md                  # how to run + env setup
├── requirements.txt           # pinned deps
├── .env.example               # GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY
├── run_council.py             # entry: python run_council.py [--dry-run] [--scan-id N]
├── run_risk_review.py         # entry: cron-driven, reviews active trades
├── src/
│   ├── __init__.py
│   ├── config.py              # env loading + provider routing table
│   ├── llm_client.py          # unified client: call(provider, model, messages) → str|dict
│   ├── backend_client.py      # httpx wrappers for /api/* endpoints
│   ├── db.py                  # sqlite3 read/write for agent_decisions table
│   ├── schemas.py             # pydantic models for agent I/O
│   ├── prompts/
│   │   ├── __init__.py
│   │   ├── technical.py       # Technical Analyst prompt + system msg
│   │   ├── sentiment.py
│   │   ├── news.py
│   │   ├── bull.py
│   │   ├── bear.py
│   │   ├── trader.py
│   │   └── risk_reviewer.py
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── technical.py       # node fn: state → state
│   │   ├── sentiment.py
│   │   ├── news.py
│   │   ├── bull.py
│   │   ├── bear.py
│   │   ├── trader.py
│   │   └── risk_reviewer.py
│   └── graph.py               # LangGraph build_graph() + run(candidate)
└── tests/
    ├── __init__.py
    ├── test_schemas.py
    ├── test_backend_client.py # uses respx for mocked HTTP
    ├── test_llm_client.py     # mocked providers
    ├── test_db.py
    ├── test_prompts.py        # snapshot tests for prompt rendering
    └── test_graph_smoke.py    # end-to-end with all LLMs mocked
```

**Backend changes (Node side, minimal):**
```
backend/
└── db.js                      # add agent_decisions table migration
```

---

## Task 1: Bootstrap Python project skeleton

**Files:**
- Create: `agents-v2/README.md`
- Create: `agents-v2/requirements.txt`
- Create: `agents-v2/.env.example`
- Create: `agents-v2/.gitignore`
- Create: `agents-v2/src/__init__.py`
- Create: `agents-v2/tests/__init__.py`
- Modify: `.gitignore` (root) — add `agents-v2/.env`, `agents-v2/__pycache__`, `agents-v2/.pytest_cache`

- [ ] **Step 1: Create requirements.txt**

```
langgraph==0.2.74
langchain-core==0.3.29
google-genai==0.3.0
groq==0.13.1
openai==1.59.6
httpx==0.28.1
pydantic==2.10.4
python-dotenv==1.0.1
respx==0.22.0
pytest==8.3.4
pytest-asyncio==0.25.2
```

- [ ] **Step 2: Create .env.example**

```
# Required: at least one of each tier
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=

# Backend
SCANNER_BACKEND_URL=http://localhost:3001

# Behavior
COUNCIL_DRY_RUN=true       # if true, never POSTs /api/trades/open
COUNCIL_MIN_SCORE=80       # candidate filter applied before invoking council
COUNCIL_LOG_LEVEL=INFO
```

- [ ] **Step 3: Create agents-v2/.gitignore**

```
.env
__pycache__/
*.pyc
.pytest_cache/
.coverage
```

- [ ] **Step 4: Update root .gitignore**

Append to existing `.gitignore`:
```
agents-v2/.env
agents-v2/__pycache__/
agents-v2/**/__pycache__/
agents-v2/.pytest_cache/
```

- [ ] **Step 5: Create README.md**

```markdown
# Agents v0.2 — Free Council

Python multi-agent stack using free LLM APIs (Gemini, Groq, OpenRouter).
Reads candidates from the Node scanner backend (must be running on :3001),
runs a LangGraph council, decides paper trades, writes decision audit log.

## Setup

    cd agents-v2
    python -m venv .venv
    .venv\Scripts\activate              # Windows
    pip install -r requirements.txt
    copy .env.example .env              # then fill keys

## Run

    python run_council.py --dry-run     # safe: no /open call
    python run_council.py               # live (still paper trade in backend)
    python run_risk_review.py           # one-shot review of active positions

## Test

    pytest -v
```

- [ ] **Step 6: Create empty `__init__.py` files**

```python
# agents-v2/src/__init__.py
"""Agents v0.2 — Free Council."""
```
```python
# agents-v2/tests/__init__.py
```

- [ ] **Step 7: Commit**

```bash
git add agents-v2/ .gitignore
git commit -m "feat(agents-v2): bootstrap python skeleton + deps"
```

---

## Task 2: SQLite migration — agent_decisions table

**Files:**
- Modify: `backend/db.js` (add migration block after `trade_reflections` index)
- Create: `agents-v2/src/db.py`
- Create: `agents-v2/tests/test_db.py`

- [ ] **Step 1: Write the failing test**

Create `agents-v2/tests/test_db.py`:
```python
import os
import tempfile
import sqlite3
import pytest

from agents_v2.src.db import (
    ensure_table, insert_decision, get_decisions_for_scan,
)

@pytest.fixture
def tmp_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SCANNER_DB_PATH", path)
    ensure_table()
    yield path
    os.remove(path)

def test_insert_and_read_decision(tmp_db):
    insert_decision(
        scan_id=42, candidate_coin="BTC", candidate_tf="1h",
        candidate_score=88, candidate_dir="buy",
        agent_outputs={"technical": {"confidence_0_100": 75}},
        final_decision="OPEN", final_reason="bull dominant",
        trade_id="bk-abc",
    )
    rows = get_decisions_for_scan(42)
    assert len(rows) == 1
    assert rows[0]["candidate_coin"] == "BTC"
    assert rows[0]["final_decision"] == "OPEN"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents-v2 && pytest tests/test_db.py -v`
Expected: FAIL — `ModuleNotFoundError: agents_v2.src.db`

> Note: tests import as `agents_v2.src.<mod>`. Add `agents-v2/conftest.py` with `sys.path.insert(0, str(Path(__file__).parent.parent))` and rename folder to be importable, OR use `pip install -e .` style. For simplicity, create `agents-v2/conftest.py`:
```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
```
And imports become `from src.db import ...` (drop the `agents_v2.` prefix in step 1's test). Apply that simplification before re-running.

- [ ] **Step 3: Implement `agents-v2/src/db.py`**

```python
"""SQLite layer for agent decisions. Reads same DB as the Node backend."""
import json
import os
import sqlite3
from pathlib import Path
from typing import Any

DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "scanner.db"

def _path() -> Path:
    return Path(os.environ.get("SCANNER_DB_PATH", str(DEFAULT_DB)))

def _conn() -> sqlite3.Connection:
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(p))
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c

def ensure_table() -> None:
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS agent_decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id INTEGER,
                candidate_coin TEXT NOT NULL,
                candidate_tf TEXT NOT NULL,
                candidate_score INTEGER NOT NULL,
                candidate_dir TEXT NOT NULL,
                agent_outputs_json TEXT NOT NULL,
                final_decision TEXT NOT NULL,
                final_reason TEXT,
                trade_id TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_decisions_scan ON agent_decisions(scan_id)"
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_decisions_created ON agent_decisions(created_at DESC)"
        )

def insert_decision(*, scan_id, candidate_coin, candidate_tf,
                    candidate_score, candidate_dir, agent_outputs,
                    final_decision, final_reason, trade_id=None) -> int:
    with _conn() as c:
        cur = c.execute("""
            INSERT INTO agent_decisions
              (scan_id, candidate_coin, candidate_tf, candidate_score,
               candidate_dir, agent_outputs_json, final_decision,
               final_reason, trade_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (scan_id, candidate_coin, candidate_tf, candidate_score,
              candidate_dir, json.dumps(agent_outputs), final_decision,
              final_reason, trade_id))
        return cur.lastrowid

def get_decisions_for_scan(scan_id: int) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM agent_decisions WHERE scan_id = ? ORDER BY id",
            (scan_id,),
        ).fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents-v2 && pytest tests/test_db.py -v`
Expected: PASS (1 test).

- [ ] **Step 5: Mirror migration in Node `backend/db.js`**

After the `idx_reflections_trade` index creation (around line 84), add the same table so Node-side tooling can read it later:
```javascript
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER,
    candidate_coin TEXT NOT NULL,
    candidate_tf TEXT NOT NULL,
    candidate_score INTEGER NOT NULL,
    candidate_dir TEXT NOT NULL,
    agent_outputs_json TEXT NOT NULL,
    final_decision TEXT NOT NULL,
    final_reason TEXT,
    trade_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_decisions_scan    ON agent_decisions(scan_id);
  CREATE INDEX IF NOT EXISTS idx_decisions_created ON agent_decisions(created_at DESC);
`);
```

- [ ] **Step 6: Commit**

```bash
git add agents-v2/src/db.py agents-v2/tests/test_db.py agents-v2/conftest.py backend/db.js
git commit -m "feat(agents-v2): agent_decisions sqlite table + python wrapper"
```

---

## Task 3: Pydantic schemas for agent I/O

**Files:**
- Create: `agents-v2/src/schemas.py`
- Create: `agents-v2/tests/test_schemas.py`

- [ ] **Step 1: Write the failing test**

```python
# agents-v2/tests/test_schemas.py
import pytest
from pydantic import ValidationError

from src.schemas import (
    Candidate, TechnicalOutput, SentimentOutput, NewsOutput,
    ResearcherOutput, TraderOutput, CouncilState,
)

def test_candidate_strips_usdt_suffix():
    c = Candidate(coin="XRPUSDT", direction="buy", timeframe="1h",
                  score=88, entry=1.0, stop=0.95, m1=1.05, m2=1.10, m3=1.15,
                  stop_pct=0.05, leverage=10, signals=[])
    assert c.coin == "XRP"

def test_candidate_rejects_invalid_dir():
    with pytest.raises(ValidationError):
        Candidate(coin="BTC", direction="long", timeframe="1h",
                  score=80, entry=1, stop=0.9, m1=1.1, m2=1.2, m3=1.3,
                  stop_pct=0.1, leverage=10, signals=[])

def test_trader_output_open_requires_payload():
    with pytest.raises(ValidationError):
        TraderOutput(decision="OPEN", reason="x")

def test_trader_output_skip_no_payload_ok():
    t = TraderOutput(decision="SKIP", reason="bear dominant")
    assert t.payload is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents-v2 && pytest tests/test_schemas.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/schemas.py`**

```python
"""Pydantic models — strict typing across the council pipeline."""
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

Direction = Literal["buy", "sell"]
Timeframe = Literal["5m", "15m", "30m", "1h", "4h", "1D"]
Bias = Literal["bull", "bear", "neutral"]

class Candidate(BaseModel):
    coin: str
    direction: Direction
    timeframe: Timeframe
    score: int = Field(ge=0, le=100)
    entry: float
    stop: float
    m1: float
    m2: float
    m3: float
    stop_pct: float
    leverage: int = Field(ge=1, le=125)
    signals: list[str] = Field(default_factory=list)
    scan_id: Optional[int] = None

    @field_validator("coin", mode="before")
    @classmethod
    def strip_usdt(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        s = v.upper()
        return s[:-4] if s.endswith("USDT") else s

class TechnicalOutput(BaseModel):
    regime: Literal["trending_up", "trending_down", "ranging", "volatile", "unclear"]
    confluences: list[str]
    red_flags: list[str]
    confidence_0_100: int = Field(ge=0, le=100)
    tf_alignment: Literal["aligned", "mixed", "conflicting"]

class SentimentOutput(BaseModel):
    crowd_bias: Bias
    funding_signal: Literal["overheated_long", "overheated_short", "neutral", "unknown"]
    sentiment_score: int = Field(ge=-100, le=100)
    contrarian_alert: bool
    notes: str = ""

class NewsItem(BaseModel):
    headline: str
    confidence: Literal["VERIFIED", "MEDIUM", "UNVERIFIED"]
    source_count: int = Field(ge=0)

class NewsOutput(BaseModel):
    news_bias: Bias
    catalyst_window_hours: Optional[int] = None
    hard_block: bool
    block_reason: str = ""
    items: list[NewsItem] = Field(default_factory=list)

class ResearcherOutput(BaseModel):
    side: Literal["bull", "bear"]
    thesis: str
    evidence: list[str] = Field(min_length=1, max_length=5)
    counter_to_other_side: str
    expected_rr: float

class OpenPayload(BaseModel):
    """Mirrors POST /api/trades/open body; no USDT suffix in coin."""
    coin: str
    direction: Direction
    timeframe: Timeframe
    score: int
    entry: float
    stop: float
    m1: float
    m2: float
    m3: float
    stop_pct: float
    leverage: int
    type: Literal["scalp", "day", "swing"] = "day"
    signals: list[str] = Field(default_factory=list)

    @field_validator("coin", mode="before")
    @classmethod
    def no_usdt(cls, v: str) -> str:
        s = v.upper()
        return s[:-4] if s.endswith("USDT") else s

class TraderOutput(BaseModel):
    decision: Literal["OPEN", "SKIP", "OPEN_REDUCED"]
    reason: str
    size_multiplier: float = 1.0
    payload: Optional[OpenPayload] = None

    @model_validator(mode="after")
    def open_needs_payload(self):
        if self.decision in ("OPEN", "OPEN_REDUCED") and self.payload is None:
            raise ValueError("OPEN/OPEN_REDUCED requires payload")
        return self

class RiskReviewerOutput(BaseModel):
    trade_id: str
    action: Literal["HOLD", "EXIT", "TIGHTEN_STOP"]
    new_stop: Optional[float] = None
    reason: str

class CouncilState(BaseModel):
    """Shared state object flowing through the LangGraph."""
    candidate: Candidate
    technical: Optional[TechnicalOutput] = None
    sentiment: Optional[SentimentOutput] = None
    news: Optional[NewsOutput] = None
    bull: Optional[ResearcherOutput] = None
    bear: Optional[ResearcherOutput] = None
    trader: Optional[TraderOutput] = None
    errors: list[str] = Field(default_factory=list)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents-v2 && pytest tests/test_schemas.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add agents-v2/src/schemas.py agents-v2/tests/test_schemas.py
git commit -m "feat(agents-v2): pydantic schemas for council I/O"
```

---

## Task 4: Backend HTTP client

**Files:**
- Create: `agents-v2/src/backend_client.py`
- Create: `agents-v2/tests/test_backend_client.py`

- [ ] **Step 1: Write the failing test**

```python
# agents-v2/tests/test_backend_client.py
import json
import respx
import httpx
import pytest

from src.backend_client import (
    get_account, get_active_trades, get_latest_scan_candidates,
    open_trade, tighten_stop, close_trade,
)
from src.schemas import OpenPayload

@respx.mock
def test_get_account():
    respx.get("http://localhost:3001/api/account").mock(
        return_value=httpx.Response(200, json={"id": 1, "current_capital": 1000})
    )
    acc = get_account()
    assert acc["current_capital"] == 1000

@respx.mock
def test_open_trade_strips_usdt():
    captured = {}
    def handler(request):
        captured["body"] = json.loads(request.content)
        return httpx.Response(201, json={"id": "bk-1", "status": "active"})
    respx.post("http://localhost:3001/api/trades/open").mock(side_effect=handler)
    payload = OpenPayload(coin="XRPUSDT", direction="buy", timeframe="1h",
                          score=88, entry=1, stop=0.95, m1=1.05, m2=1.1, m3=1.15,
                          stop_pct=0.05, leverage=10)
    res = open_trade(payload)
    assert res["id"] == "bk-1"
    assert captured["body"]["coin"] == "XRP"  # USDT stripped

@respx.mock
def test_open_trade_409_returns_blocked():
    respx.post("http://localhost:3001/api/trades/open").mock(
        return_value=httpx.Response(409, json={"error": "max_positions reached"})
    )
    payload = OpenPayload(coin="BTC", direction="buy", timeframe="1h",
                          score=88, entry=1, stop=0.9, m1=1.1, m2=1.2, m3=1.3,
                          stop_pct=0.1, leverage=10)
    res = open_trade(payload)
    assert res["blocked"] is True
    assert "max_positions" in res["reason"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents-v2 && pytest tests/test_backend_client.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/backend_client.py`**

```python
"""Thin HTTP wrappers for the Node scanner backend."""
import os
from typing import Any
import httpx

from src.schemas import OpenPayload

BASE = os.environ.get("SCANNER_BACKEND_URL", "http://localhost:3001")
TIMEOUT = httpx.Timeout(15.0, connect=5.0)

def _client() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=TIMEOUT)

def get_account() -> dict[str, Any]:
    with _client() as c:
        r = c.get("/api/account")
        r.raise_for_status()
        return r.json()

def get_active_trades() -> list[dict[str, Any]]:
    with _client() as c:
        r = c.get("/api/trades/active")
        r.raise_for_status()
        return r.json()

def get_latest_scan_candidates() -> tuple[int, list[dict]]:
    """Returns (scan_id, candidates[]). Reads via /api/scan/preview which
    runs a fresh scan; for read-only of the cron's last log, query DB directly."""
    with _client() as c:
        r = c.post("/api/scan/preview", json={})
        r.raise_for_status()
        data = r.json()
        return data.get("scan_id", -1), data.get("candidates", [])

def open_trade(payload: OpenPayload) -> dict[str, Any]:
    body = payload.model_dump()
    with _client() as c:
        r = c.post("/api/trades/open", json=body)
        if r.status_code == 409:
            return {"blocked": True, "reason": r.json().get("error", "blocked")}
        r.raise_for_status()
        return r.json()

def tighten_stop(trade_id: str, new_stop: float) -> dict[str, Any]:
    with _client() as c:
        r = c.post(f"/api/trades/{trade_id}/tighten-stop",
                   json={"new_stop": new_stop})
        if r.status_code in (400, 409):
            return {"blocked": True, "reason": r.json().get("error", "rejected")}
        r.raise_for_status()
        return r.json()

def close_trade(trade_id: str) -> dict[str, Any]:
    with _client() as c:
        r = c.post(f"/api/trades/{trade_id}/close")
        r.raise_for_status()
        return r.json()

def get_recent_reflections(limit: int = 10) -> list[dict]:
    with _client() as c:
        r = c.get("/api/reflections", params={"limit": limit})
        r.raise_for_status()
        return r.json()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents-v2 && pytest tests/test_backend_client.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add agents-v2/src/backend_client.py agents-v2/tests/test_backend_client.py
git commit -m "feat(agents-v2): backend http client with respx tests"
```

---

## Task 5: LLM client — provider routing

**Files:**
- Create: `agents-v2/src/config.py`
- Create: `agents-v2/src/llm_client.py`
- Create: `agents-v2/tests/test_llm_client.py`

- [ ] **Step 1: Write the failing test**

```python
# agents-v2/tests/test_llm_client.py
import json
from unittest.mock import patch, MagicMock
import pytest

from src.llm_client import call_llm, ROUTES

def test_routes_cover_all_agents():
    expected = {"technical", "sentiment", "news", "bull", "bear", "trader", "risk_reviewer"}
    assert expected.issubset(ROUTES.keys())

def test_routes_have_fallback():
    for name, route in ROUTES.items():
        assert "primary" in route and "fallback" in route, f"{name} missing fallback"

def test_call_llm_uses_fallback_on_primary_error():
    fake_primary = MagicMock(side_effect=RuntimeError("rate limit"))
    fake_fallback = MagicMock(return_value='{"ok": true}')
    with patch("src.llm_client._PROVIDER_FNS", {
        "gemini-flash": fake_primary,
        "groq-llama70b": fake_fallback,
    }):
        with patch.dict(ROUTES, {
            "test_agent": {"primary": "gemini-flash", "fallback": "groq-llama70b"}
        }, clear=False):
            out = call_llm("test_agent", system="s", user="u", as_json=True)
    assert out == {"ok": True}
    fake_primary.assert_called_once()
    fake_fallback.assert_called_once()

def test_call_llm_returns_dict_when_as_json():
    fake = MagicMock(return_value='{"a": 1}')
    with patch("src.llm_client._PROVIDER_FNS", {"gemini-flash": fake}):
        with patch.dict(ROUTES, {
            "test_agent": {"primary": "gemini-flash", "fallback": "gemini-flash"}
        }, clear=False):
            out = call_llm("test_agent", system="s", user="u", as_json=True)
    assert out == {"a": 1}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents-v2 && pytest tests/test_llm_client.py -v`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `src/config.py`**

```python
"""Env loading."""
import os
from pathlib import Path
from dotenv import load_dotenv

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_ENV_FILE, override=False)

GEMINI_API_KEY     = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY       = os.environ.get("GROQ_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

DRY_RUN = os.environ.get("COUNCIL_DRY_RUN", "true").lower() == "true"
MIN_SCORE = int(os.environ.get("COUNCIL_MIN_SCORE", "80"))
LOG_LEVEL = os.environ.get("COUNCIL_LOG_LEVEL", "INFO")
```

- [ ] **Step 4: Implement `src/llm_client.py`**

```python
"""Unified LLM client with provider routing + fallback.

Provider IDs:
  gemini-flash   → Google AI Studio, Gemini 2.5 Flash (1500 RPD)
  gemini-pro     → Google AI Studio, Gemini 2.5 Pro (~50 RPD, reserve)
  groq-llama70b  → Groq, Llama 3.3 70B (1000 RPD, 30 RPM)
  openrouter-deepseek → OpenRouter, deepseek/deepseek-r1:free
"""
from __future__ import annotations
import json
import logging
from typing import Callable, Any

from src import config

log = logging.getLogger(__name__)

ROUTES: dict[str, dict[str, str]] = {
    "technical":     {"primary": "gemini-flash",        "fallback": "groq-llama70b"},
    "sentiment":     {"primary": "gemini-flash",        "fallback": "groq-llama70b"},
    "news":          {"primary": "gemini-flash",        "fallback": "openrouter-deepseek"},
    "bull":          {"primary": "groq-llama70b",       "fallback": "gemini-flash"},
    "bear":          {"primary": "groq-llama70b",       "fallback": "gemini-flash"},
    "trader":        {"primary": "gemini-pro",          "fallback": "gemini-flash"},
    "risk_reviewer": {"primary": "openrouter-deepseek", "fallback": "gemini-flash"},
}

# ─── Provider implementations ────────────────────────────────────────────────

def _call_gemini(model: str, system: str, user: str, as_json: bool) -> str:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=config.GEMINI_API_KEY)
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json" if as_json else "text/plain",
        temperature=0.3,
    )
    resp = client.models.generate_content(
        model=model, contents=user, config=cfg,
    )
    return resp.text

def _call_groq(model: str, system: str, user: str, as_json: bool) -> str:
    from groq import Groq
    client = Groq(api_key=config.GROQ_API_KEY)
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    if as_json:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content

def _call_openrouter(model: str, system: str, user: str, as_json: bool) -> str:
    from openai import OpenAI
    client = OpenAI(
        api_key=config.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    if as_json:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content

def _gemini_flash(s, u, j): return _call_gemini("gemini-2.5-flash", s, u, j)
def _gemini_pro(s, u, j):   return _call_gemini("gemini-2.5-pro",   s, u, j)
def _groq_llama70b(s, u, j): return _call_groq("llama-3.3-70b-versatile", s, u, j)
def _openrouter_deepseek(s, u, j):
    return _call_openrouter("deepseek/deepseek-r1:free", s, u, j)

_PROVIDER_FNS: dict[str, Callable[[str, str, bool], str]] = {
    "gemini-flash":         _gemini_flash,
    "gemini-pro":           _gemini_pro,
    "groq-llama70b":        _groq_llama70b,
    "openrouter-deepseek":  _openrouter_deepseek,
}

# ─── Public API ──────────────────────────────────────────────────────────────

def call_llm(agent: str, *, system: str, user: str, as_json: bool = False):
    if agent not in ROUTES:
        raise KeyError(f"no route configured for agent {agent}")
    route = ROUTES[agent]
    for tier in ("primary", "fallback"):
        provider = route[tier]
        fn = _PROVIDER_FNS[provider]
        try:
            log.info("[llm] %s → %s (%s)", agent, provider, tier)
            raw = fn(system, user, as_json)
            return json.loads(raw) if as_json else raw
        except Exception as e:
            log.warning("[llm] %s on %s failed: %s", agent, provider, e)
            if tier == "fallback":
                raise
    raise RuntimeError("unreachable")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd agents-v2 && pytest tests/test_llm_client.py -v`
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add agents-v2/src/config.py agents-v2/src/llm_client.py agents-v2/tests/test_llm_client.py
git commit -m "feat(agents-v2): unified llm client with provider routing + fallback"
```

---

## Task 6: Prompts — Technical, Sentiment, News

**Files:**
- Create: `agents-v2/src/prompts/__init__.py`
- Create: `agents-v2/src/prompts/technical.py`
- Create: `agents-v2/src/prompts/sentiment.py`
- Create: `agents-v2/src/prompts/news.py`
- Create: `agents-v2/tests/test_prompts.py`

- [ ] **Step 1: Write the failing test**

```python
# agents-v2/tests/test_prompts.py
from src.prompts.technical import build as build_tech
from src.prompts.sentiment import build as build_sent
from src.prompts.news import build as build_news
from src.schemas import Candidate

C = Candidate(coin="BTC", direction="buy", timeframe="1h", score=88,
              entry=70000, stop=68500, m1=71200, m2=72500, m3=74000,
              stop_pct=2.1, leverage=10,
              signals=["EMA200 bullish", "ADX 28", "BOS up"])

def test_technical_prompt_contains_candidate_fields():
    sys, user = build_tech(C)
    assert "BTC" in user
    assert "1h" in user
    assert "88" in user
    assert "EMA200 bullish" in user
    assert "JSON" in sys

def test_sentiment_prompt_includes_funding_field_request():
    sys, user = build_sent(C, fear_greed=72, funding_pct=0.04, oi_change_24h=15.0)
    assert "72" in user
    assert "0.04" in user
    assert "JSON" in sys

def test_news_prompt_demands_verification_section():
    sys, _ = build_news(C)
    assert "VERIFIED" in sys
    assert "MEDIUM" in sys
    assert "UNVERIFIED" in sys
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents-v2 && pytest tests/test_prompts.py -v`
Expected: FAIL — modules missing.

- [ ] **Step 3: Create `src/prompts/__init__.py`**

```python
"""Prompt builders for each agent. Each module exports build(...)
returning (system_prompt, user_prompt)."""
```

- [ ] **Step 4: Implement `src/prompts/technical.py`**

```python
from src.schemas import Candidate

SYSTEM = """You are a Technical Analyst on a crypto futures trading council.
You receive a candidate setup that has already been pre-scored by a deterministic
indicator engine. Your job: re-interpret the indicators in plain trading language
and produce a structured JSON verdict.

DO NOT recompute numbers. Trust the score and signals as given.
Focus on:
- regime classification (trending vs ranging vs volatile)
- which indicators truly confluence vs which are weak
- red flags the deterministic score might have missed
- multi-timeframe coherence

Output STRICTLY this JSON shape (no prose, no markdown fences):
{
  "regime": "trending_up|trending_down|ranging|volatile|unclear",
  "confluences": ["short string", ...],
  "red_flags": ["short string", ...],
  "confidence_0_100": 0-100,
  "tf_alignment": "aligned|mixed|conflicting"
}"""

def build(c: Candidate) -> tuple[str, str]:
    user = f"""Candidate setup:
- Coin: {c.coin}
- Direction: {c.direction.upper()}
- Timeframe: {c.timeframe}
- Deterministic score: {c.score}/100
- Entry: {c.entry}  Stop: {c.stop} ({c.stop_pct:.2f}%)
- Targets: M1={c.m1}  M2={c.m2}  M3={c.m3}
- Leverage: {c.leverage}x
- Triggered signals: {", ".join(c.signals) if c.signals else "(none provided)"}

Return your JSON verdict."""
    return SYSTEM, user
```

- [ ] **Step 5: Implement `src/prompts/sentiment.py`**

```python
from src.schemas import Candidate

SYSTEM = """You are a Sentiment Analyst on a crypto futures trading council.
You receive crowd-positioning and macro-sentiment data. Your job:
detect when the trade is fighting consensus (good — alpha) vs riding a
crowded trade (bad — squeeze risk).

Heuristics:
- Funding > +0.05%/8h with F&G > 75 → longs crowded → SHORT contrarian alert
- Funding < -0.05%/8h with F&G < 25 → shorts crowded → LONG contrarian alert
- OI rising fast + price flat → coiled spring (volatility incoming)

Output STRICTLY this JSON shape:
{
  "crowd_bias": "bull|bear|neutral",
  "funding_signal": "overheated_long|overheated_short|neutral|unknown",
  "sentiment_score": -100 to 100,
  "contrarian_alert": true|false,
  "notes": "one sentence"
}"""

def build(c: Candidate, *, fear_greed: int | None,
          funding_pct: float | None, oi_change_24h: float | None) -> tuple[str, str]:
    fg = fear_greed if fear_greed is not None else "unknown"
    fr = f"{funding_pct:.4f}%" if funding_pct is not None else "unknown"
    oi = f"{oi_change_24h:+.1f}%" if oi_change_24h is not None else "unknown"
    user = f"""Sentiment context for {c.coin} ({c.direction.upper()} on {c.timeframe}):
- Fear & Greed (market-wide): {fg}
- Funding rate (8h): {fr}
- Open Interest change 24h: {oi}
- Setup score: {c.score}/100

Return your JSON verdict."""
    return SYSTEM, user
```

- [ ] **Step 6: Implement `src/prompts/news.py`**

```python
from src.schemas import Candidate

SYSTEM = """You are a News & Macro Hunter on a crypto futures trading council.
Your job: surface RECENT (<48h) news for the coin AND macro context (BTC dominance,
upcoming CPI/FOMC, scheduled token unlocks, exchange listings/delistings).

VERIFICATION RULES — non-negotiable:
- Every specific number/date must be marked VERIFIED (≥2 sources),
  MEDIUM (1 reputable source), or UNVERIFIED.
- If the only evidence is social/X chatter, mark UNVERIFIED.
- A hard_block=true is ONLY justified by a VERIFIED catalyst in <24h
  (token unlock, hard fork, scheduled exchange action, FOMC same day).

Output STRICTLY this JSON shape:
{
  "news_bias": "bull|bear|neutral",
  "catalyst_window_hours": int or null,
  "hard_block": true|false,
  "block_reason": "string (empty if not blocked)",
  "items": [
    {"headline": "...", "confidence": "VERIFIED|MEDIUM|UNVERIFIED", "source_count": int}
  ]
}"""

def build(c: Candidate) -> tuple[str, str]:
    user = f"""Coin: {c.coin}
Direction: {c.direction.upper()}
Timeframe: {c.timeframe}

Search for news in the last 48h relevant to {c.coin} (price action drivers,
listings, unlocks, exploits) AND macro events that affect BTC/crypto broadly
in the next 24h. Return your JSON verdict."""
    return SYSTEM, user
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd agents-v2 && pytest tests/test_prompts.py -v`
Expected: 3 PASS.

- [ ] **Step 8: Commit**

```bash
git add agents-v2/src/prompts/ agents-v2/tests/test_prompts.py
git commit -m "feat(agents-v2): prompts for technical/sentiment/news agents"
```

---

## Task 7: Prompts — Bull, Bear, Trader, Risk Reviewer

**Files:**
- Create: `agents-v2/src/prompts/bull.py`
- Create: `agents-v2/src/prompts/bear.py`
- Create: `agents-v2/src/prompts/trader.py`
- Create: `agents-v2/src/prompts/risk_reviewer.py`
- Modify: `agents-v2/tests/test_prompts.py` — add 4 tests

- [ ] **Step 1: Add failing tests**

Append to `tests/test_prompts.py`:
```python
from src.prompts.bull import build as build_bull
from src.prompts.bear import build as build_bear
from src.prompts.trader import build as build_trader
from src.prompts.risk_reviewer import build as build_risk
from src.schemas import (
    TechnicalOutput, SentimentOutput, NewsOutput, ResearcherOutput,
)

T = TechnicalOutput(regime="trending_up", confluences=["ADX>25"], red_flags=[],
                    confidence_0_100=78, tf_alignment="aligned")
S = SentimentOutput(crowd_bias="neutral", funding_signal="neutral",
                    sentiment_score=10, contrarian_alert=False, notes="ok")
N = NewsOutput(news_bias="neutral", catalyst_window_hours=None, hard_block=False)

def test_bull_prompt_includes_other_agents():
    sys, user = build_bull(C, T, S, N)
    assert "trending_up" in user
    assert "ADX>25" in user
    assert "JSON" in sys

def test_bear_prompt_demands_invalidation():
    sys, _ = build_bear(C, T, S, N)
    assert "invalidat" in sys.lower()

def test_trader_prompt_includes_researchers():
    bull = ResearcherOutput(side="bull", thesis="t", evidence=["e1"],
                            counter_to_other_side="c", expected_rr=2.5)
    bear = ResearcherOutput(side="bear", thesis="t", evidence=["e1"],
                            counter_to_other_side="c", expected_rr=1.0)
    sys, user = build_trader(C, T, S, N, bull, bear)
    assert "OPEN" in sys and "SKIP" in sys
    assert "expected_rr" in user or "2.5" in user

def test_risk_prompt_lists_action_options():
    trade = {"id": "bk-1", "coin": "BTC", "direction": "buy",
             "entry": 70000, "current_stop": 69500, "m1": 71200,
             "status": "active", "score": 88}
    sys, user = build_risk(trade, current_price=70450)
    assert "HOLD" in sys and "EXIT" in sys and "TIGHTEN_STOP" in sys
    assert "70450" in user
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd agents-v2 && pytest tests/test_prompts.py -v`
Expected: 4 new FAIL — modules missing.

- [ ] **Step 3: Implement `src/prompts/bull.py`**

```python
from src.schemas import Candidate, TechnicalOutput, SentimentOutput, NewsOutput

SYSTEM = """You are the BULL Researcher on a crypto trading council.
Your job: build the strongest possible case FOR taking this trade
(if BUY candidate) or for HOLDING/scaling longs (if context allows).

Rules:
- Maximum 5 evidence bullets, each ≤ 20 words.
- Address the bear's likely strongest objection in counter_to_other_side.
- Be honest about expected R:R — do not inflate.
- If the setup is genuinely weak, say so (low expected_rr).

Output STRICTLY this JSON:
{
  "side": "bull",
  "thesis": "1-2 sentence summary",
  "evidence": ["...", "..."],
  "counter_to_other_side": "1 sentence",
  "expected_rr": float
}"""

def build(c: Candidate, t: TechnicalOutput, s: SentimentOutput, n: NewsOutput):
    user = f"""Setup: {c.coin} {c.direction.upper()} on {c.timeframe}, score {c.score}.
Entry={c.entry} Stop={c.stop} ({c.stop_pct:.2f}%) M1={c.m1} M2={c.m2} M3={c.m3}.

Technical view:
- regime={t.regime}, confidence={t.confidence_0_100}, tf={t.tf_alignment}
- confluences: {t.confluences}
- red_flags: {t.red_flags}

Sentiment view:
- crowd_bias={s.crowd_bias}, funding={s.funding_signal}, score={s.sentiment_score}
- contrarian_alert={s.contrarian_alert} ({s.notes})

News view:
- bias={n.news_bias}, hard_block={n.hard_block} ({n.block_reason})
- catalyst_window_hours={n.catalyst_window_hours}

Return your bull case as JSON."""
    return SYSTEM, user
```

- [ ] **Step 4: Implement `src/prompts/bear.py`**

```python
from src.schemas import Candidate, TechnicalOutput, SentimentOutput, NewsOutput

SYSTEM = """You are the BEAR Researcher on a crypto trading council.
Your job: build the strongest possible case AGAINST taking this trade,
focusing on invalidation paths and risk asymmetry.

Always run, even on BUY candidates — you are the institutional skeptic.

Rules:
- Maximum 5 evidence bullets, each ≤ 20 words.
- counter_to_other_side must rebut the bull's strongest argument.
- expected_rr here is the bear's estimate of the trade's actual R:R
  (often lower than the bull's if you see invalidation risk).

Output STRICTLY this JSON:
{
  "side": "bear",
  "thesis": "1-2 sentence summary of why this trade dies",
  "evidence": ["..."],
  "counter_to_other_side": "1 sentence",
  "expected_rr": float
}"""

def build(c: Candidate, t: TechnicalOutput, s: SentimentOutput, n: NewsOutput):
    user = f"""Setup: {c.coin} {c.direction.upper()} on {c.timeframe}, score {c.score}.
Entry={c.entry} Stop={c.stop} ({c.stop_pct:.2f}%) M1={c.m1} M2={c.m2} M3={c.m3}.

Technical: regime={t.regime}, conf={t.confidence_0_100}, tf={t.tf_alignment}
  confluences={t.confluences}  red_flags={t.red_flags}
Sentiment: bias={s.crowd_bias}, funding={s.funding_signal}, score={s.sentiment_score},
  contrarian_alert={s.contrarian_alert}
News: bias={n.news_bias}, hard_block={n.hard_block}, window_h={n.catalyst_window_hours}

Build the bear case. Return JSON."""
    return SYSTEM, user
```

- [ ] **Step 5: Implement `src/prompts/trader.py`**

```python
from src.schemas import (
    Candidate, TechnicalOutput, SentimentOutput, NewsOutput, ResearcherOutput,
)

SYSTEM = """You are the Research Manager / Trader — the final decision authority.
You read all 5 prior outputs and output ONE of: OPEN, SKIP, OPEN_REDUCED.

HARD GUARDRAILS — refuse to OPEN if any are violated:
- News hard_block=true → SKIP (block_reason must surface in your reason).
- Bear expected_rr > Bull expected_rr → SKIP (asymmetry inverted).
- Technical tf_alignment="conflicting" → SKIP.
- Candidate timeframe in {5m, 30m} → SKIP (council does not approve these TFs).

OPEN_REDUCED (size_multiplier 0.5) when:
- Technical confidence_0_100 < 70 but bull case is strong, OR
- Sentiment.contrarian_alert=true AND bull dominates anyway.

The payload MUST mirror the candidate exactly; you do NOT alter prices/stops.
Coin in payload MUST NOT have USDT suffix.

Output STRICTLY this JSON:
{
  "decision": "OPEN|SKIP|OPEN_REDUCED",
  "reason": "1-3 sentences citing the dominant factor",
  "size_multiplier": 1.0 (or 0.5 for OPEN_REDUCED, ignored for SKIP),
  "payload": null  OR  {
    "coin": "...", "direction": "buy|sell", "timeframe": "...",
    "score": int, "entry": float, "stop": float,
    "m1": float, "m2": float, "m3": float,
    "stop_pct": float, "leverage": int,
    "type": "scalp|day|swing", "signals": []
  }
}"""

def build(c: Candidate, t: TechnicalOutput, s: SentimentOutput, n: NewsOutput,
          bull: ResearcherOutput, bear: ResearcherOutput):
    user = f"""CANDIDATE
{c.model_dump_json(indent=2)}

TECHNICAL
{t.model_dump_json(indent=2)}

SENTIMENT
{s.model_dump_json(indent=2)}

NEWS
{n.model_dump_json(indent=2)}

BULL (expected_rr={bull.expected_rr})
{bull.model_dump_json(indent=2)}

BEAR (expected_rr={bear.expected_rr})
{bear.model_dump_json(indent=2)}

Decide. Return JSON."""
    return SYSTEM, user
```

- [ ] **Step 6: Implement `src/prompts/risk_reviewer.py`**

```python
SYSTEM = """You are the Risk Reviewer — runs hourly on each active trade
to decide HOLD, EXIT, or TIGHTEN_STOP.

Decision rules:
- HOLD: thesis still intact, price between current_stop and m1.
- EXIT: thesis broken (e.g., BUY but price closed below recent swing low),
  OR position has been open > 48h with no progress toward m1.
- TIGHTEN_STOP: price has moved meaningfully toward m1 (>50% of distance);
  raise stop to break-even or recent swing.
  - For BUY: new_stop must be GREATER than current_stop.
  - For SELL: new_stop must be LESS than current_stop.

Output STRICTLY this JSON:
{
  "trade_id": "string",
  "action": "HOLD|EXIT|TIGHTEN_STOP",
  "new_stop": float OR null (only for TIGHTEN_STOP),
  "reason": "1-2 sentences"
}"""

def build(trade: dict, *, current_price: float):
    user = f"""ACTIVE TRADE
- id: {trade["id"]}
- coin: {trade["coin"]}
- direction: {trade["direction"]}
- status: {trade["status"]}
- score at entry: {trade["score"]}
- entry: {trade["entry"]}
- current_stop: {trade["current_stop"]}
- m1: {trade["m1"]}
- current_price: {current_price}

Decide HOLD / EXIT / TIGHTEN_STOP. Return JSON."""
    return SYSTEM, user
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd agents-v2 && pytest tests/test_prompts.py -v`
Expected: 7 PASS total.

- [ ] **Step 8: Commit**

```bash
git add agents-v2/src/prompts/ agents-v2/tests/test_prompts.py
git commit -m "feat(agents-v2): bull/bear/trader/risk reviewer prompts"
```

---

## Task 8: Agent node implementations (analysts trio)

**Files:**
- Create: `agents-v2/src/agents/__init__.py`
- Create: `agents-v2/src/agents/technical.py`
- Create: `agents-v2/src/agents/sentiment.py`
- Create: `agents-v2/src/agents/news.py`
- Create: `agents-v2/tests/test_agents_analysts.py`

- [ ] **Step 1: Write the failing test**

```python
# agents-v2/tests/test_agents_analysts.py
from unittest.mock import patch
from src.schemas import Candidate, CouncilState
from src.agents.technical import run as run_tech
from src.agents.sentiment import run as run_sent
from src.agents.news import run as run_news

C = Candidate(coin="BTC", direction="buy", timeframe="1h", score=88,
              entry=70000, stop=68500, m1=71200, m2=72500, m3=74000,
              stop_pct=2.1, leverage=10, signals=[])

def test_technical_node_populates_state():
    state = CouncilState(candidate=C)
    fake_resp = {
        "regime": "trending_up", "confluences": ["x"], "red_flags": [],
        "confidence_0_100": 75, "tf_alignment": "aligned",
    }
    with patch("src.agents.technical.call_llm", return_value=fake_resp):
        out = run_tech(state.model_dump())
    assert out["technical"]["confidence_0_100"] == 75

def test_sentiment_node_handles_missing_funding():
    state = CouncilState(candidate=C)
    fake_resp = {
        "crowd_bias": "neutral", "funding_signal": "unknown",
        "sentiment_score": 0, "contrarian_alert": False, "notes": "no data",
    }
    with patch("src.agents.sentiment.call_llm", return_value=fake_resp), \
         patch("src.agents.sentiment._fetch_market_signals",
               return_value=(None, None, None)):
        out = run_sent(state.model_dump())
    assert out["sentiment"]["crowd_bias"] == "neutral"

def test_news_node_records_hard_block():
    state = CouncilState(candidate=C)
    fake_resp = {
        "news_bias": "bear", "catalyst_window_hours": 6, "hard_block": True,
        "block_reason": "FOMC in 6h", "items": [],
    }
    with patch("src.agents.news.call_llm", return_value=fake_resp):
        out = run_news(state.model_dump())
    assert out["news"]["hard_block"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents-v2 && pytest tests/test_agents_analysts.py -v`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `src/agents/__init__.py`**

```python
"""Agent nodes — pure functions: dict state → dict state delta."""
```

- [ ] **Step 4: Implement `src/agents/technical.py`**

```python
import logging
from src.llm_client import call_llm
from src.prompts.technical import build
from src.schemas import Candidate, TechnicalOutput

log = logging.getLogger(__name__)

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    sys, user = build(cand)
    try:
        raw = call_llm("technical", system=sys, user=user, as_json=True)
        out = TechnicalOutput(**raw)
        return {"technical": out.model_dump()}
    except Exception as e:
        log.error("technical agent failed: %s", e)
        return {"errors": state.get("errors", []) + [f"technical: {e}"]}
```

- [ ] **Step 5: Implement `src/agents/sentiment.py`**

```python
import logging
import httpx
from src.llm_client import call_llm
from src.prompts.sentiment import build
from src.schemas import Candidate, SentimentOutput

log = logging.getLogger(__name__)

def _fetch_market_signals(coin: str) -> tuple[int | None, float | None, float | None]:
    """Returns (fear_greed, funding_pct, oi_change_24h). All optional.
    Best-effort: any failure returns None for that field."""
    fg, funding, oi = None, None, None
    try:
        r = httpx.get("https://api.alternative.me/fng/?limit=1", timeout=5)
        fg = int(r.json()["data"][0]["value"])
    except Exception as e:
        log.debug("fear&greed fetch failed: %s", e)

    symbol = f"{coin}USDT"
    try:
        r = httpx.get(
            "https://api.bybit.com/v5/market/funding/history",
            params={"category": "linear", "symbol": symbol, "limit": 1},
            timeout=5,
        )
        rows = r.json()["result"]["list"]
        if rows:
            funding = float(rows[0]["fundingRate"]) * 100
    except Exception as e:
        log.debug("funding fetch failed: %s", e)

    try:
        r = httpx.get(
            "https://api.bybit.com/v5/market/open-interest",
            params={"category": "linear", "symbol": symbol,
                    "intervalTime": "1h", "limit": 25},
            timeout=5,
        )
        rows = r.json()["result"]["list"]
        if len(rows) >= 25:
            now = float(rows[0]["openInterest"])
            then = float(rows[-1]["openInterest"])
            oi = (now - then) / then * 100 if then else None
    except Exception as e:
        log.debug("oi fetch failed: %s", e)

    return fg, funding, oi

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    fg, funding, oi = _fetch_market_signals(cand.coin)
    sys, user = build(cand, fear_greed=fg, funding_pct=funding, oi_change_24h=oi)
    try:
        raw = call_llm("sentiment", system=sys, user=user, as_json=True)
        out = SentimentOutput(**raw)
        return {"sentiment": out.model_dump()}
    except Exception as e:
        log.error("sentiment agent failed: %s", e)
        return {"errors": state.get("errors", []) + [f"sentiment: {e}"]}
```

- [ ] **Step 6: Implement `src/agents/news.py`**

```python
import logging
from src.llm_client import call_llm
from src.prompts.news import build
from src.schemas import Candidate, NewsOutput

log = logging.getLogger(__name__)

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    sys, user = build(cand)
    try:
        raw = call_llm("news", system=sys, user=user, as_json=True)
        out = NewsOutput(**raw)
        return {"news": out.model_dump()}
    except Exception as e:
        log.error("news agent failed: %s", e)
        return {"errors": state.get("errors", []) + [f"news: {e}"]}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd agents-v2 && pytest tests/test_agents_analysts.py -v`
Expected: 3 PASS.

- [ ] **Step 8: Commit**

```bash
git add agents-v2/src/agents/ agents-v2/tests/test_agents_analysts.py
git commit -m "feat(agents-v2): technical/sentiment/news agent nodes"
```

---

## Task 9: Agent nodes — Bull, Bear, Trader, Risk Reviewer

**Files:**
- Create: `agents-v2/src/agents/bull.py`
- Create: `agents-v2/src/agents/bear.py`
- Create: `agents-v2/src/agents/trader.py`
- Create: `agents-v2/src/agents/risk_reviewer.py`
- Create: `agents-v2/tests/test_agents_decision.py`

- [ ] **Step 1: Write the failing test**

```python
# agents-v2/tests/test_agents_decision.py
from unittest.mock import patch
from src.schemas import (
    Candidate, CouncilState, TechnicalOutput, SentimentOutput, NewsOutput,
    ResearcherOutput,
)
from src.agents.bull import run as run_bull
from src.agents.bear import run as run_bear
from src.agents.trader import run as run_trader
from src.agents.risk_reviewer import run as run_risk

C = Candidate(coin="BTC", direction="buy", timeframe="1h", score=88,
              entry=70000, stop=68500, m1=71200, m2=72500, m3=74000,
              stop_pct=2.1, leverage=10, signals=["x"])
T = TechnicalOutput(regime="trending_up", confluences=["a"], red_flags=[],
                    confidence_0_100=78, tf_alignment="aligned")
S = SentimentOutput(crowd_bias="neutral", funding_signal="neutral",
                    sentiment_score=10, contrarian_alert=False, notes="ok")
N = NewsOutput(news_bias="neutral", hard_block=False)

def _state_with_analysts():
    return CouncilState(candidate=C, technical=T, sentiment=S, news=N).model_dump()

def test_bull_populates_state():
    fake = {"side": "bull", "thesis": "t", "evidence": ["e"],
            "counter_to_other_side": "c", "expected_rr": 2.5}
    with patch("src.agents.bull.call_llm", return_value=fake):
        out = run_bull(_state_with_analysts())
    assert out["bull"]["expected_rr"] == 2.5

def test_trader_skip_on_news_hard_block():
    state = _state_with_analysts()
    state["news"]["hard_block"] = True
    state["news"]["block_reason"] = "FOMC in 4h"
    state["bull"] = {"side": "bull", "thesis": "t", "evidence": ["e"],
                     "counter_to_other_side": "c", "expected_rr": 2.5}
    state["bear"] = {"side": "bear", "thesis": "t", "evidence": ["e"],
                     "counter_to_other_side": "c", "expected_rr": 1.0}
    # The model should be steered to SKIP — but we deterministic-override
    # for safety. Trader node MUST hard-block before LLM call.
    out = run_trader(state)
    assert out["trader"]["decision"] == "SKIP"
    assert "FOMC" in out["trader"]["reason"] or "block" in out["trader"]["reason"].lower()

def test_trader_skip_on_5m_timeframe():
    cand_5m = C.model_copy(update={"timeframe": "5m"})
    state = CouncilState(candidate=cand_5m, technical=T, sentiment=S, news=N,
        bull=ResearcherOutput(side="bull", thesis="t", evidence=["e"],
                              counter_to_other_side="c", expected_rr=3.0),
        bear=ResearcherOutput(side="bear", thesis="t", evidence=["e"],
                              counter_to_other_side="c", expected_rr=1.0),
    ).model_dump()
    out = run_trader(state)
    assert out["trader"]["decision"] == "SKIP"
    assert "5m" in out["trader"]["reason"] or "timeframe" in out["trader"]["reason"].lower()

def test_risk_reviewer_returns_action():
    trade = {"id": "bk-1", "coin": "BTC", "direction": "buy", "status": "active",
             "score": 88, "entry": 70000, "current_stop": 69500, "m1": 71200}
    fake = {"trade_id": "bk-1", "action": "HOLD", "new_stop": None,
            "reason": "thesis intact"}
    with patch("src.agents.risk_reviewer.call_llm", return_value=fake):
        out = run_risk(trade, current_price=70450)
    assert out["action"] == "HOLD"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents-v2 && pytest tests/test_agents_decision.py -v`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `src/agents/bull.py`**

```python
import logging
from src.llm_client import call_llm
from src.prompts.bull import build
from src.schemas import (
    Candidate, TechnicalOutput, SentimentOutput, NewsOutput, ResearcherOutput,
)

log = logging.getLogger(__name__)

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    t = TechnicalOutput(**state["technical"])
    s = SentimentOutput(**state["sentiment"])
    n = NewsOutput(**state["news"])
    sys, user = build(cand, t, s, n)
    try:
        raw = call_llm("bull", system=sys, user=user, as_json=True)
        raw["side"] = "bull"
        out = ResearcherOutput(**raw)
        return {"bull": out.model_dump()}
    except Exception as e:
        log.error("bull agent failed: %s", e)
        return {"errors": state.get("errors", []) + [f"bull: {e}"]}
```

- [ ] **Step 4: Implement `src/agents/bear.py`**

```python
import logging
from src.llm_client import call_llm
from src.prompts.bear import build
from src.schemas import (
    Candidate, TechnicalOutput, SentimentOutput, NewsOutput, ResearcherOutput,
)

log = logging.getLogger(__name__)

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    t = TechnicalOutput(**state["technical"])
    s = SentimentOutput(**state["sentiment"])
    n = NewsOutput(**state["news"])
    sys, user = build(cand, t, s, n)
    try:
        raw = call_llm("bear", system=sys, user=user, as_json=True)
        raw["side"] = "bear"
        out = ResearcherOutput(**raw)
        return {"bear": out.model_dump()}
    except Exception as e:
        log.error("bear agent failed: %s", e)
        return {"errors": state.get("errors", []) + [f"bear: {e}"]}
```

- [ ] **Step 5: Implement `src/agents/trader.py`**

```python
"""Trader node — final decision. Applies deterministic guardrails BEFORE LLM."""
import logging
from src.llm_client import call_llm
from src.prompts.trader import build
from src.schemas import (
    Candidate, TechnicalOutput, SentimentOutput, NewsOutput,
    ResearcherOutput, TraderOutput,
)

log = logging.getLogger(__name__)

BANNED_TFS = {"5m", "30m"}

def _hard_skip(reason: str) -> dict:
    return {"trader": {
        "decision": "SKIP", "reason": reason,
        "size_multiplier": 0.0, "payload": None,
    }}

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    t = TechnicalOutput(**state["technical"])
    s = SentimentOutput(**state["sentiment"])
    n = NewsOutput(**state["news"])
    bull = ResearcherOutput(**state["bull"])
    bear = ResearcherOutput(**state["bear"])

    # ─── Deterministic guardrails (before spending Pro tokens) ──────────
    if cand.timeframe in BANNED_TFS:
        return _hard_skip(f"timeframe {cand.timeframe} not approved by council")
    if n.hard_block:
        return _hard_skip(f"news hard_block: {n.block_reason}")
    if bear.expected_rr > bull.expected_rr:
        return _hard_skip(
            f"asymmetry inverted: bear_rr={bear.expected_rr} > bull_rr={bull.expected_rr}"
        )
    if t.tf_alignment == "conflicting":
        return _hard_skip("technical timeframes conflicting")

    # ─── LLM final call ─────────────────────────────────────────────────
    sys, user = build(cand, t, s, n, bull, bear)
    try:
        raw = call_llm("trader", system=sys, user=user, as_json=True)
        out = TraderOutput(**raw)
        return {"trader": out.model_dump()}
    except Exception as e:
        log.error("trader agent failed: %s — defaulting to SKIP", e)
        return _hard_skip(f"trader llm error: {e}")
```

- [ ] **Step 6: Implement `src/agents/risk_reviewer.py`**

```python
"""Standalone agent — does NOT use CouncilState. Called per active trade."""
import logging
from src.llm_client import call_llm
from src.prompts.risk_reviewer import build
from src.schemas import RiskReviewerOutput

log = logging.getLogger(__name__)

def run(trade: dict, *, current_price: float) -> dict:
    sys, user = build(trade, current_price=current_price)
    try:
        raw = call_llm("risk_reviewer", system=sys, user=user, as_json=True)
        raw["trade_id"] = trade["id"]
        out = RiskReviewerOutput(**raw)
        return out.model_dump()
    except Exception as e:
        log.error("risk reviewer failed for %s: %s", trade["id"], e)
        return {"trade_id": trade["id"], "action": "HOLD",
                "new_stop": None, "reason": f"reviewer error: {e}"}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd agents-v2 && pytest tests/test_agents_decision.py -v`
Expected: 4 PASS.

- [ ] **Step 8: Commit**

```bash
git add agents-v2/src/agents/ agents-v2/tests/test_agents_decision.py
git commit -m "feat(agents-v2): bull/bear/trader/risk_reviewer nodes with hard guardrails"
```

---

## Task 10: LangGraph wiring

**Files:**
- Create: `agents-v2/src/graph.py`
- Create: `agents-v2/tests/test_graph_smoke.py`

- [ ] **Step 1: Write the failing test**

```python
# agents-v2/tests/test_graph_smoke.py
from unittest.mock import patch
from src.schemas import Candidate
from src.graph import run_council

C = Candidate(coin="BTC", direction="buy", timeframe="1h", score=88,
              entry=70000, stop=68500, m1=71200, m2=72500, m3=74000,
              stop_pct=2.1, leverage=10, signals=["x"])

def test_full_pipeline_open_decision():
    fake_tech = {"regime": "trending_up", "confluences": ["a"], "red_flags": [],
                 "confidence_0_100": 80, "tf_alignment": "aligned"}
    fake_sent = {"crowd_bias": "neutral", "funding_signal": "neutral",
                 "sentiment_score": 10, "contrarian_alert": False, "notes": "ok"}
    fake_news = {"news_bias": "neutral", "hard_block": False}
    fake_bull = {"side": "bull", "thesis": "t", "evidence": ["e"],
                 "counter_to_other_side": "c", "expected_rr": 2.5}
    fake_bear = {"side": "bear", "thesis": "t", "evidence": ["e"],
                 "counter_to_other_side": "c", "expected_rr": 1.0}
    fake_trader = {
        "decision": "OPEN", "reason": "bull dominant", "size_multiplier": 1.0,
        "payload": {
            "coin": "BTC", "direction": "buy", "timeframe": "1h", "score": 88,
            "entry": 70000, "stop": 68500, "m1": 71200, "m2": 72500, "m3": 74000,
            "stop_pct": 2.1, "leverage": 10, "type": "day", "signals": [],
        },
    }
    with patch("src.agents.technical.call_llm", return_value=fake_tech), \
         patch("src.agents.sentiment.call_llm", return_value=fake_sent), \
         patch("src.agents.sentiment._fetch_market_signals",
               return_value=(50, 0.01, 5.0)), \
         patch("src.agents.news.call_llm", return_value=fake_news), \
         patch("src.agents.bull.call_llm", return_value=fake_bull), \
         patch("src.agents.bear.call_llm", return_value=fake_bear), \
         patch("src.agents.trader.call_llm", return_value=fake_trader):
        final = run_council(C)
    assert final["trader"]["decision"] == "OPEN"
    assert final["trader"]["payload"]["coin"] == "BTC"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents-v2 && pytest tests/test_graph_smoke.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/graph.py`**

```python
"""LangGraph orchestration for the council."""
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END

from src.schemas import Candidate
from src.agents.technical import run as run_technical
from src.agents.sentiment import run as run_sentiment
from src.agents.news import run as run_news
from src.agents.bull import run as run_bull
from src.agents.bear import run as run_bear
from src.agents.trader import run as run_trader

class State(TypedDict, total=False):
    candidate: dict
    technical: Optional[dict]
    sentiment: Optional[dict]
    news: Optional[dict]
    bull: Optional[dict]
    bear: Optional[dict]
    trader: Optional[dict]
    errors: list[str]

def _join_analysts(state: State) -> State:
    """No-op join node — exists so we can fan-in cleanly before bull/bear."""
    return {}

def build_graph():
    g = StateGraph(State)
    g.add_node("technical", run_technical)
    g.add_node("sentiment", run_sentiment)
    g.add_node("news", run_news)
    g.add_node("join_analysts", _join_analysts)
    g.add_node("bull", run_bull)
    g.add_node("bear", run_bear)
    g.add_node("trader", run_trader)

    # Fan-out from start to the 3 analysts
    g.set_entry_point("technical")
    g.add_edge("technical", "join_analysts")
    g.add_edge("sentiment", "join_analysts")
    g.add_edge("news", "join_analysts")
    # Also start sentiment + news (LangGraph parallel)
    g.add_edge("__start__", "sentiment")
    g.add_edge("__start__", "news")

    # Bull + bear after analysts join
    g.add_edge("join_analysts", "bull")
    g.add_edge("join_analysts", "bear")

    # Trader joins bull + bear
    g.add_node("join_research", _join_analysts)
    g.add_edge("bull", "join_research")
    g.add_edge("bear", "join_research")
    g.add_edge("join_research", "trader")
    g.add_edge("trader", END)

    return g.compile()

_GRAPH = None
def _get():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    return _GRAPH

def run_council(candidate: Candidate) -> dict:
    initial: State = {"candidate": candidate.model_dump(), "errors": []}
    return _get().invoke(initial)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents-v2 && pytest tests/test_graph_smoke.py -v`
Expected: 1 PASS.

> If LangGraph rejects the multiple `__start__` edges (depends on version), simplify to sequential `technical → sentiment → news → bull → bear → trader` for v0 — performance loss is ~3-5s per candidate, acceptable.

- [ ] **Step 5: Commit**

```bash
git add agents-v2/src/graph.py agents-v2/tests/test_graph_smoke.py
git commit -m "feat(agents-v2): langgraph orchestration + smoke test"
```

---

## Task 11: Council runner CLI

**Files:**
- Create: `agents-v2/run_council.py`

- [ ] **Step 1: Implement `run_council.py`**

```python
"""Entry point: fetch latest scan candidates and run the council on each.

Usage:
    python run_council.py            # uses .env, lives by COUNCIL_DRY_RUN
    python run_council.py --dry-run  # never opens trades regardless of env
    python run_council.py --live     # forces live mode (still paper trade)
"""
import argparse
import logging
import sys

from src import config
from src.db import ensure_table, insert_decision
from src.backend_client import get_latest_scan_candidates, open_trade
from src.schemas import Candidate
from src.graph import run_council

def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--live", action="store_true")
    args = parser.parse_args(argv)

    _setup_logging(config.LOG_LEVEL)
    log = logging.getLogger("run_council")

    dry = True if args.dry_run else (False if args.live else config.DRY_RUN)
    log.info("council starting (dry_run=%s, min_score=%s)", dry, config.MIN_SCORE)

    ensure_table()
    scan_id, raw_candidates = get_latest_scan_candidates()
    log.info("scan_id=%s, %d raw candidates", scan_id, len(raw_candidates))

    eligible = [c for c in raw_candidates if int(c.get("score", 0)) >= config.MIN_SCORE]
    log.info("%d candidates pass min_score=%s", len(eligible), config.MIN_SCORE)

    for c in eligible:
        try:
            candidate = Candidate(**c, scan_id=scan_id)
        except Exception as e:
            log.warning("skip malformed candidate %s: %s", c.get("coin"), e)
            continue

        log.info("→ council on %s %s %s (score=%d)",
                 candidate.coin, candidate.direction, candidate.timeframe, candidate.score)
        final = run_council(candidate)
        trader = final.get("trader") or {}
        decision = trader.get("decision", "ERROR")
        reason = trader.get("reason", "no trader output")

        trade_id = None
        if decision in ("OPEN", "OPEN_REDUCED") and not dry:
            payload = trader["payload"]
            res = open_trade(__import__("src.schemas", fromlist=["OpenPayload"])
                             .OpenPayload(**payload))
            if res.get("blocked"):
                decision = "BLOCKED"
                reason = f"{reason} | backend blocked: {res['reason']}"
            else:
                trade_id = res.get("id")

        agent_outputs = {
            k: final.get(k) for k in
            ("technical", "sentiment", "news", "bull", "bear", "trader")
        }
        insert_decision(
            scan_id=scan_id, candidate_coin=candidate.coin,
            candidate_tf=candidate.timeframe, candidate_score=candidate.score,
            candidate_dir=candidate.direction, agent_outputs=agent_outputs,
            final_decision=decision, final_reason=reason, trade_id=trade_id,
        )
        log.info("  decision=%s trade_id=%s", decision, trade_id)

    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 2: Smoke-run with backend OFFLINE (should fail gracefully)**

Run: `cd agents-v2 && python run_council.py --dry-run`
Expected: connection error logged, exit 1 OR clean exit with 0 candidates. Either is acceptable; we just confirm the script loads.

- [ ] **Step 3: Commit**

```bash
git add agents-v2/run_council.py
git commit -m "feat(agents-v2): run_council CLI entry point"
```

---

## Task 12: Risk reviewer runner

**Files:**
- Create: `agents-v2/run_risk_review.py`

- [ ] **Step 1: Implement `run_risk_review.py`**

```python
"""Cron-driven: review every active trade once and act.

Usage:
    python run_risk_review.py            # respects COUNCIL_DRY_RUN
    python run_risk_review.py --dry-run
    python run_risk_review.py --live
"""
import argparse
import logging
import sys
import httpx

from src import config
from src.backend_client import (
    get_active_trades, tighten_stop, close_trade,
)
from src.agents.risk_reviewer import run as run_reviewer

def _current_price(coin: str) -> float | None:
    try:
        r = httpx.get(
            "https://api.bybit.com/v5/market/tickers",
            params={"category": "linear", "symbol": f"{coin}USDT"},
            timeout=5,
        )
        return float(r.json()["result"]["list"][0]["lastPrice"])
    except Exception:
        return None

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--live", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=config.LOG_LEVEL,
                        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    log = logging.getLogger("run_risk_review")

    dry = True if args.dry_run else (False if args.live else config.DRY_RUN)

    trades = get_active_trades()
    log.info("reviewing %d active trades (dry_run=%s)", len(trades), dry)

    for t in trades:
        price = _current_price(t["coin"])
        if price is None:
            log.warning("no price for %s, skipping", t["coin"])
            continue
        verdict = run_reviewer(t, current_price=price)
        log.info("trade %s (%s): %s — %s",
                 t["id"], t["coin"], verdict["action"], verdict["reason"])
        if dry:
            continue
        if verdict["action"] == "EXIT":
            close_trade(t["id"])
        elif verdict["action"] == "TIGHTEN_STOP" and verdict.get("new_stop"):
            res = tighten_stop(t["id"], float(verdict["new_stop"]))
            if res.get("blocked"):
                log.warning("  tighten rejected: %s", res["reason"])

    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 2: Commit**

```bash
git add agents-v2/run_risk_review.py
git commit -m "feat(agents-v2): risk reviewer cron runner"
```

---

## Task 13: Backtest replay harness (validation Phase 1)

**Files:**
- Create: `agents-v2/run_backtest_replay.py`
- Create: `agents-v2/tests/test_replay.py`

- [ ] **Step 1: Write the failing test**

```python
# agents-v2/tests/test_replay.py
from unittest.mock import patch
from src.schemas import Candidate
from run_backtest_replay import score_replay

def test_replay_scoring_open_win():
    cand = Candidate(coin="BTC", direction="buy", timeframe="1h", score=88,
                     entry=100, stop=95, m1=105, m2=110, m3=115,
                     stop_pct=5, leverage=10, signals=[])
    # Outcome: hit M1 (win)
    outcome = {"hit": "m1", "pnl_pct": 5.0}
    fake_decision = {"decision": "OPEN"}
    rec = score_replay(cand, fake_decision, outcome)
    assert rec["correct"] is True
    assert rec["pnl_attributed"] == 5.0

def test_replay_scoring_skip_avoid_loss():
    cand = Candidate(coin="BTC", direction="buy", timeframe="1h", score=82,
                     entry=100, stop=95, m1=105, m2=110, m3=115,
                     stop_pct=5, leverage=10, signals=[])
    outcome = {"hit": "stop", "pnl_pct": -5.0}
    fake_decision = {"decision": "SKIP"}
    rec = score_replay(cand, fake_decision, outcome)
    assert rec["correct"] is True
    assert rec["pnl_attributed"] == 5.0  # avoided loss
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents-v2 && pytest tests/test_replay.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement `run_backtest_replay.py`**

```python
"""Replay agents against historical candidates from scan_log.

Reads `scan_log.candidates_json` rows, runs the council on each (with LIVE LLM
calls — this WILL consume tokens), and joins against subsequent trades to
score whether each decision was correct.

A "correct" decision is:
- OPEN  + outcome ∈ {m1, m2, m3} → win counted
- SKIP  + outcome == stop        → loss avoided
- OPEN  + outcome == stop        → wrong (loss)
- SKIP  + outcome ∈ {m1,m2,m3}   → opportunity cost

Usage:
    python run_backtest_replay.py --since 2026-04-15 --limit 50
"""
import argparse
import json
import logging
import sqlite3
import sys
from pathlib import Path
from src.schemas import Candidate
from src.db import _path
from src.graph import run_council

def fetch_candidate_outcome_pairs(since: str, limit: int) -> list[tuple[dict, dict]]:
    """Pair each historical candidate with the outcome of its corresponding
    trade (if a trade was opened) or with the simulated outcome based on
    later price movement (if not). For v0, only score candidates that have
    a matching trade — simpler and still informative."""
    pairs = []
    with sqlite3.connect(str(_path())) as c:
        c.row_factory = sqlite3.Row
        rows = c.execute("""
            SELECT id, candidates_json
            FROM scan_log
            WHERE ran_at >= ? AND candidates_json IS NOT NULL
            ORDER BY ran_at DESC LIMIT ?
        """, (since, limit)).fetchall()
        for r in rows:
            try:
                cands = json.loads(r["candidates_json"])
            except Exception:
                continue
            for cand in cands:
                t = c.execute("""
                    SELECT status, pnl FROM trades
                    WHERE coin = ? AND timeframe = ? AND direction = ?
                          AND ABS(score - ?) <= 2
                    ORDER BY found_at DESC LIMIT 1
                """, (cand.get("coin", "").replace("USDT", ""),
                      cand.get("timeframe"), cand.get("direction"),
                      cand.get("score", 0))).fetchone()
                if t:
                    outcome = {
                        "hit": t["status"] if t["status"] in ("m1","m2","m3","stop") else "unknown",
                        "pnl_pct": float(t["pnl"]) if t["pnl"] else 0.0,
                    }
                    pairs.append((cand, outcome))
    return pairs

def score_replay(cand: Candidate, decision: dict, outcome: dict) -> dict:
    d = decision["decision"]
    hit = outcome["hit"]
    pnl = float(outcome["pnl_pct"])
    if d in ("OPEN", "OPEN_REDUCED"):
        if hit in ("m1", "m2", "m3"):
            correct, attributed = True, pnl
        elif hit == "stop":
            correct, attributed = False, pnl  # negative
        else:
            correct, attributed = None, 0.0
    elif d == "SKIP":
        if hit == "stop":
            correct, attributed = True, abs(pnl)  # avoided loss
        elif hit in ("m1", "m2", "m3"):
            correct, attributed = False, -pnl  # opportunity cost
        else:
            correct, attributed = None, 0.0
    else:
        correct, attributed = None, 0.0
    return {
        "coin": cand.coin, "tf": cand.timeframe, "dir": cand.direction,
        "score": cand.score, "decision": d, "outcome": hit,
        "actual_pnl": pnl, "correct": correct, "pnl_attributed": attributed,
    }

def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--since", default="2026-04-01")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--out", default="agents-v2/replay_results.json")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("replay")

    pairs = fetch_candidate_outcome_pairs(args.since, args.limit)
    log.info("scoring %d candidate-outcome pairs", len(pairs))

    results = []
    for cand_dict, outcome in pairs:
        try:
            cand = Candidate(**cand_dict)
        except Exception as e:
            log.warning("skip %s: %s", cand_dict.get("coin"), e)
            continue
        final = run_council(cand)
        trader = final.get("trader") or {"decision": "ERROR"}
        results.append(score_replay(cand, trader, outcome))

    Path(args.out).write_text(json.dumps(results, indent=2))

    n = len(results)
    correct = sum(1 for r in results if r["correct"] is True)
    wrong   = sum(1 for r in results if r["correct"] is False)
    total_pnl = sum(r["pnl_attributed"] for r in results)
    log.info("=== REPLAY SUMMARY ===")
    log.info("scored: %d  correct: %d  wrong: %d  accuracy: %.1f%%",
             n, correct, wrong, 100*correct/(correct+wrong) if correct+wrong else 0)
    log.info("attributed P&L sum: %+.2f%%", total_pnl)
    log.info("written: %s", args.out)
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run unit test for scoring**

Run: `cd agents-v2 && pytest tests/test_replay.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add agents-v2/run_backtest_replay.py agents-v2/tests/test_replay.py
git commit -m "feat(agents-v2): backtest replay harness for validation phase 1"
```

---

## Task 14: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append a new section to `CLAUDE.md` (root) before "## Development"**

Add after the "## Agent Council" section:

```markdown
## Agents v0.2 — Free Council (Python)

**Localização:** `agents-v2/` (dir Python isolado, não toca no Council Claude v0.1).

**Stack:** LangGraph + Gemini 2.5 Flash/Pro (Google AI Studio free) + Groq Llama 3.3 70B + OpenRouter DeepSeek R1.

**6 agentes + 1 reviewer:**
- `technical` (Gemini Flash) — re-interpreta indicadores do scanner
- `sentiment` (Gemini Flash) — F&G, funding, OI; flags de crowded trade
- `news`      (Gemini Flash) — Verification Section obrigatória; pode hard-block
- `bull`      (Groq Llama 70B) — case pró-trade
- `bear`      (Groq Llama 70B) — sempre roda, case anti-trade
- `trader`    (Gemini Pro) — decisão final OPEN/SKIP/OPEN_REDUCED + payload pronto
- `risk_reviewer` (OpenRouter DeepSeek R1) — cron horário, HOLD/EXIT/TIGHTEN_STOP

**Guardrails determinísticos no `trader.py` (antes do LLM):**
- timeframe ∈ {5m, 30m} → SKIP
- news.hard_block → SKIP
- bear.expected_rr > bull.expected_rr → SKIP
- technical.tf_alignment == "conflicting" → SKIP

**Tabela nova:** `agent_decisions` (em `data/scanner.db`). Migration espelhada em `backend/db.js`.

**Como rodar:**
```bash
cd agents-v2 && python run_council.py --dry-run
cd agents-v2 && python run_risk_review.py --dry-run
cd agents-v2 && python run_backtest_replay.py --since 2026-04-15
```

**Pitfalls:**
- Free tier Gemini usa prompts para treinamento. Não enviar dados sensíveis.
- `OpenPayload.coin` strip USDT automático (espelha pitfall do paper-trader).
- Gemini Pro tem ~50 RPD; reservar para o `trader` final apenas.
- LangGraph parallel branching pode requerer simplificação para sequencial em versões antigas.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE.md): document agents-v2 free council"
```

---

## Self-Review Checklist (executed)

**Spec coverage:**
- [x] 6 agents + Risk Reviewer → tasks 6-9
- [x] LangGraph orchestration → task 10
- [x] Free LLM stack (Gemini/Groq/OpenRouter) → task 5
- [x] Backend integration via HTTP, no changes to existing files → task 4
- [x] Decision audit log → task 2
- [x] Backtest replay validation (Phase 1) → task 13
- [x] Paper trade live (Phase 2) → covered by `run_council.py --live` (task 11)
- [x] Preserves Claude Council intact → no edit to `.claude/agents/`, `scanner.js`, `paper-trader.js`
- [x] CLAUDE.md updated → task 14

**Placeholder scan:** none found.

**Type consistency:** `OpenPayload`, `Candidate`, `TraderOutput`, `ResearcherOutput` used identically across tasks 3, 4, 7, 8, 9, 10, 11.

**Known acceptable risk:** LangGraph parallel branching syntax (`__start__` → multiple nodes) varies by version — task 10 includes a fallback note for sequential ordering.
