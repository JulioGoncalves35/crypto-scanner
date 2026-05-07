import os
import tempfile
import gc
import pytest

from src.db import (
    ensure_table, insert_decision, get_decisions_for_scan,
)

@pytest.fixture
def tmp_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SCANNER_DB_PATH", path)
    ensure_table()
    yield path
    # Force garbage collection to release SQLite connections
    gc.collect()
    try:
        os.remove(path)
    except PermissionError:
        pass

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
