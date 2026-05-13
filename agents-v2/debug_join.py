"""Debug why the join produces zero pairs."""
import sqlite3, json, sys
sys.path.insert(0, '.')
from src.db import _path

db = sqlite3.connect(str(_path()))
db.row_factory = sqlite3.Row

# Sample a few candidates to see real values
rows = db.execute(
    "SELECT candidates_json, ran_at FROM scan_log WHERE candidates_json IS NOT NULL ORDER BY ran_at DESC LIMIT 5"
).fetchall()

print("=== SAMPLE CANDIDATES FROM scan_log ===")
for r in rows:
    cands = json.loads(r["candidates_json"])
    print(f"\nran_at={r['ran_at']} ({len(cands)} candidates)")
    for c in cands[:3]:
        print(f"  keys: {list(c.keys())}")
        print(f"  coin={c.get('coin')!r} tf={c.get('timeframe')!r} dir={c.get('direction')!r} score={c.get('score')!r}")

# Sample trades
print("\n=== SAMPLE TRADES ===")
trades = db.execute(
    "SELECT coin, timeframe, direction, score, status, found_at FROM trades WHERE found_at >= '2026-04-15' ORDER BY found_at DESC LIMIT 10"
).fetchall()
for t in trades:
    print(f"  coin={t['coin']!r} tf={t['timeframe']!r} dir={t['direction']!r} score={t['score']!r} status={t['status']!r}")
