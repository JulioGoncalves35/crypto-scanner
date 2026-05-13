"""Check if dir is always None in candidates, and sample coin format."""
import sqlite3, json, sys
sys.path.insert(0, '.')
from src.db import _path

db = sqlite3.connect(str(_path()))
db.row_factory = sqlite3.Row

# Sample more rows to check dir distribution
rows = db.execute(
    "SELECT candidates_json, ran_at FROM scan_log WHERE candidates_json IS NOT NULL ORDER BY ran_at DESC LIMIT 50"
).fetchall()

dirs = {}
coins_sample = []
for r in rows:
    cands = json.loads(r["candidates_json"])
    for c in cands:
        d = c.get("dir")
        dirs[d] = dirs.get(d, 0) + 1
        if len(coins_sample) < 5:
            coins_sample.append(f"coin={c.get('coin')!r} dir={c.get('dir')!r} tf={c.get('timeframe')!r}")

print(f"dir value distribution across last 50 scans: {dirs}")
print(f"\nSample:")
for s in coins_sample:
    print(f"  {s}")

# Check older entries too
old_rows = db.execute(
    "SELECT candidates_json, ran_at FROM scan_log WHERE candidates_json IS NOT NULL ORDER BY ran_at ASC LIMIT 10"
).fetchall()
print(f"\nOldest entries:")
for r in old_rows[:3]:
    cands = json.loads(r["candidates_json"])
    for c in cands[:2]:
        print(f"  ran_at={r['ran_at']} coin={c.get('coin')!r} dir={c.get('dir')!r} score={c.get('score')}")

# Check trades coin format
print("\nTrades coin format:")
trades = db.execute("SELECT DISTINCT coin FROM trades LIMIT 10").fetchall()
for t in trades:
    print(f"  {t['coin']!r}")
