"""Analyze pairs without LLM calls to understand baseline and scope."""
import sqlite3, json, sys
sys.path.insert(0, '.')
from src.db import _path

db = sqlite3.connect(str(_path()))
db.row_factory = sqlite3.Row

since = "2026-04-15"
limit = 1000
BANNED_TFS = {"5m", "15m", "30m"}
COUNCIL_MIN_SCORE = 88

rows = db.execute(
    "SELECT candidates_json, ran_at FROM scan_log WHERE ran_at >= ? AND candidates_json IS NOT NULL ORDER BY ran_at DESC LIMIT ?",
    (since, limit)
).fetchall()

all_pairs = []
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
            all_pairs.append({
                "coin": cand.get("coin"), "tf": tf, "dir": direction, "score": score,
                "outcome": t["status"], "pnl": float(t["pnl"]) if t["pnl"] else 0.0,
            })

def wr(pairs):
    w = sum(1 for p in pairs if p["outcome"] in ("m1","m2","m3"))
    l = sum(1 for p in pairs if p["outcome"] in ("stop","stopped_at_entry"))
    return w, l, 100*w/(w+l) if w+l else 0

print("=== FULL DATASET ===")
w, l, rate = wr(all_pairs)
print(f"All TFs, all scores: {len(all_pairs)} pairs  WR={rate:.1f}%  ({w}W/{l}L)")

# Filter banned TFs
valid_tf = [p for p in all_pairs if p["tf"] not in BANNED_TFS]
w, l, rate = wr(valid_tf)
print(f"1h+4h only:           {len(valid_tf)} pairs  WR={rate:.1f}%  ({w}W/{l}L)")

# Filter by score
high_score = [p for p in valid_tf if p["score"] >= COUNCIL_MIN_SCORE]
w, l, rate = wr(high_score)
print(f"1h+4h, score>={COUNCIL_MIN_SCORE}:    {len(high_score)} pairs  WR={rate:.1f}%  ({w}W/{l}L)")

print("\n=== BREAKDOWN BY TF (all scores) ===")
from collections import Counter, defaultdict
by_tf = defaultdict(list)
for p in all_pairs:
    by_tf[p["tf"]].append(p)
for tf in sorted(by_tf):
    w, l, rate = wr(by_tf[tf])
    print(f"  {tf:4s}: {len(by_tf[tf]):3d} pairs  WR={rate:.1f}%  ({w}W/{l}L)")

print("\n=== BREAKDOWN BY SCORE BUCKET (1h+4h only) ===")
buckets = [(88, 94), (95, 99), (100, 100)]
for lo, hi in buckets:
    b = [p for p in valid_tf if lo <= p["score"] <= hi]
    if b:
        w, l, rate = wr(b)
        print(f"  score {lo}-{hi}: {len(b):3d} pairs  WR={rate:.1f}%  ({w}W/{l}L)")

print("\n=== COUNCIL-ELIGIBLE PAIRS (1h+4h, score>=88) ===")
for p in high_score[:10]:
    print(f"  {p['coin']:12s} {p['tf']:3s} {p['dir']:4s} score={p['score']:3d} -> {p['outcome']}")
print(f"  ... ({len(high_score)} total)")
print(f"\nToken cost estimate: ~{len(high_score) * 5300:,} tokens for {len(high_score)} council runs")
