"""Check how many candidate-outcome pairs the replay would actually find."""
import sqlite3, json, sys
sys.path.insert(0, '.')
from src.db import _path

db = sqlite3.connect(str(_path()))
db.row_factory = sqlite3.Row

since = "2026-04-15"
limit = 500

rows = db.execute(
    "SELECT id, ran_at, candidates_json FROM scan_log WHERE ran_at >= ? AND candidates_json IS NOT NULL ORDER BY ran_at DESC LIMIT ?",
    (since, limit)
).fetchall()

pairs = []
skipped_no_trade = 0
skipped_bad_outcome = 0

for r in rows:
    try:
        cands = json.loads(r["candidates_json"])
    except Exception:
        continue
    for cand in cands:
        coin = cand.get("coin", "").replace("USDT", "")
        tf = cand.get("timeframe")
        direction = cand.get("direction")
        score = cand.get("score", 0)

        t = db.execute(
            """SELECT status, pnl, found_at FROM trades
               WHERE coin = ? AND timeframe = ? AND direction = ?
                     AND ABS(score - ?) <= 2
               ORDER BY found_at DESC LIMIT 1""",
            (coin, tf, direction, score)
        ).fetchone()

        if not t:
            skipped_no_trade += 1
            continue

        outcome_status = t["status"]
        if outcome_status not in ("m1", "m2", "m3", "stop", "stopped_at_entry"):
            skipped_bad_outcome += 1
            continue

        pairs.append({
            "coin": coin, "tf": tf, "dir": direction, "score": score,
            "ran_at": r["ran_at"],
            "outcome": outcome_status,
            "pnl": t["pnl"],
            "trade_found_at": t["found_at"],
        })

print(f"Pairs found: {len(pairs)}")
print(f"Skipped (no matching trade): {skipped_no_trade}")
print(f"Skipped (outcome not scoreable): {skipped_bad_outcome}")

if pairs:
    # Show outcome distribution
    from collections import Counter
    outcomes = Counter(p["outcome"] for p in pairs)
    print(f"\nOutcome distribution: {dict(outcomes)}")

    wins = sum(1 for p in pairs if p["outcome"] in ("m1","m2","m3"))
    losses = sum(1 for p in pairs if p["outcome"] in ("stop","stopped_at_entry"))
    print(f"Wins (m1/m2/m3): {wins}  Losses (stop/stopped_at_entry): {losses}")
    if wins + losses > 0:
        print(f"Baseline WR (without agent filter): {100*wins/(wins+losses):.1f}%")

    # Show TF breakdown
    tfs = Counter(p["tf"] for p in pairs)
    print(f"\nTimeframe breakdown: {dict(tfs)}")

    # Show some samples
    print(f"\nSample pairs:")
    for p in pairs[:5]:
        print(f"  {p['coin']} {p['tf']} {p['dir']} score={p['score']} → {p['outcome']} pnl={p['pnl']}")
