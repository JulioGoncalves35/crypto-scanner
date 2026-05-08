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

def get_latest_scan_id() -> int:
    """Return the id of the most recent scan_log entry, or -1 if none."""
    with _conn() as c:
        row = c.execute("SELECT id FROM scan_log ORDER BY id DESC LIMIT 1").fetchone()
    return row["id"] if row else -1

def get_decisions_for_scan(scan_id: int) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM agent_decisions WHERE scan_id = ? ORDER BY id",
            (scan_id,),
        ).fetchall()
    return [dict(r) for r in rows]
