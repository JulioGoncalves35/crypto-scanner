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
from src.backend_client import _normalize_candidate


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
                # scan_log stores raw backend shape (dir, stopPct, coin without USDT)
                # trades table stores coin with USDT suffix and direction as 'buy'/'sell'
                coin_with_usdt = cand.get("coin", "") + "USDT"
                direction = cand.get("dir")
                t = c.execute("""
                    SELECT status, pnl FROM trades
                    WHERE coin = ? AND timeframe = ? AND direction = ?
                          AND ABS(score - ?) <= 2
                    ORDER BY found_at DESC LIMIT 1
                """, (coin_with_usdt,
                      cand.get("timeframe"), direction,
                      cand.get("score", 0))).fetchone()
                if t:
                    outcome = {
                        "hit": t["status"] if t["status"] in ("m1","m2","m3","stop","stopped_at_entry") else "unknown",
                        "pnl_pct": float(t["pnl"]) if t["pnl"] else 0.0,
                    }
                    # normalize to Candidate schema shape before returning
                    pairs.append((_normalize_candidate(cand), outcome))
    return pairs

def score_replay(cand: Candidate, decision: dict, outcome: dict) -> dict:
    d = decision["decision"]
    hit = outcome["hit"]
    pnl = float(outcome["pnl_pct"])
    if d in ("OPEN", "OPEN_REDUCED"):
        if hit in ("m1", "m2", "m3"):
            correct, attributed = True, pnl
        elif hit == "stop":
            correct, attributed = False, pnl
        else:
            correct, attributed = None, 0.0
    elif d == "SKIP":
        if hit == "stop":
            correct, attributed = True, abs(pnl)
        elif hit in ("m1", "m2", "m3"):
            correct, attributed = False, -pnl
        else:
            correct, attributed = None, 0.0
    else:
        correct, attributed = None, 0.0
    return {
        "coin": cand.coin, "tf": cand.timeframe, "dir": cand.direction,
        "regime_score": cand.regime_score, "entry_score": cand.entry_score, "decision": d, "outcome": hit,
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
        log.info("running council on %s %s %s score=%s outcome=%s",
                 cand.coin, cand.timeframe, cand.direction, cand.score, outcome["hit"])
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
