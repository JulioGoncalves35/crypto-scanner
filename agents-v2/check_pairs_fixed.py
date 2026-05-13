"""Check pairs after join fixes."""
import sqlite3, json, sys
sys.path.insert(0, '.')
from src.db import _path

db = sqlite3.connect(str(_path()))
db.row_factory = sqlite3.Row

since = "2026-04-15"
limit = 1000

rows = db.execute(
    "SELECT candidates_json, ran_at FROM scan_log WHERE ran_at >= ? AND candidates_json IS NOT NULL ORDER BY ran_at DESC LIMIT ?",
    (since, limit)
).fetchall()

pairs = []
for r in rows:
    try:
        cands = json.loads(r["candidates_json"])
    except Exception:
        continue
    for cand in cands:
        coin_with_usdt = cand.get("coin", "") + "USDT"
        direction = cand.get("dir")
        score = cand.get("score", 0)
        tf = cand.get("timeframe")

        t = db.execute(
            """SELECT status, pnl, found_at FROM trades
               WHERE coin = ? AND timeframe = ? AND direction = ?
                     AND ABS(score - ?) <= 2
               ORDER BY found_at DESC LIMIT 1""",
            (coin_with_usdt, tf, direction, score)
        ).fetchone()

        if t and t["status"] in ("m1","m2","m3","stop","stopped_at_entry"):
            pairs.append({
                "coin": cand.get("coin"), "tf": tf, "dir": direction, "score": score,
                "outcome": t["status"], "pnl": t["pnl"],
            })

print(f"Pairs found: {len(pairs)}")
if pairs:
    from collections import Counter
    outcomes = Counter(p["outcome"] for p in pairs)
    print(f"Outcomes: {dict(outcomes)}")
    tfs = Counter(p["tf"] for p in pairs)
    print(f"TFs: {dict(tfs)}")
    wins = sum(1 for p in pairs if p["outcome"] in ("m1","m2","m3"))
    losses = sum(1 for p in pairs if p["outcome"] in ("stop","stopped_at_entry"))
    print(f"Baseline WR (no agent filter): {100*wins/(wins+losses):.1f}%  ({wins}W/{losses}L)")
    print(f"\nSample pairs:")
    for p in pairs[:8]:
        print(f"  {p['coin']} {p['tf']} {p['dir']} score={p['score']} → {p['outcome']} pnl={p['pnl']}")
