import sqlite3, json, sys
sys.path.insert(0, '.')
from src.db import _path

db = sqlite3.connect(str(_path()))
db.row_factory = sqlite3.Row

r = db.execute("SELECT COUNT(*) as cnt FROM scan_log WHERE ran_at >= '2026-04-15' AND candidates_json IS NOT NULL").fetchone()
print(f"scan_log rows with candidates since 2026-04-15: {r['cnt']}")

rows = db.execute("SELECT candidates_json FROM scan_log WHERE ran_at >= '2026-04-15' AND candidates_json IS NOT NULL").fetchall()
total = 0
for row in rows:
    try:
        total += len(json.loads(row['candidates_json']))
    except:
        pass
print(f"total candidates in those rows: {total}")

t = db.execute("SELECT COUNT(*) as cnt FROM trades WHERE status IN ('m1','m2','m3','stop') AND found_at >= '2026-04-15'").fetchone()
print(f"closed trades since 2026-04-15: {t['cnt']}")

statuses = db.execute("SELECT status, COUNT(*) as cnt FROM trades GROUP BY status ORDER BY cnt DESC").fetchall()
print("all trade statuses:")
for s in statuses:
    print(f"  {s['status']}: {s['cnt']}")

# Sample a few candidates to see their structure
sample = db.execute("SELECT candidates_json FROM scan_log WHERE ran_at >= '2026-04-15' AND candidates_json IS NOT NULL ORDER BY ran_at DESC LIMIT 1").fetchone()
if sample:
    cands = json.loads(sample['candidates_json'])
    print(f"\nSample candidates from latest scan ({len(cands)} total):")
    for c in cands[:3]:
        print(f"  {c.get('coin')} {c.get('timeframe')} {c.get('direction')} score={c.get('score')}")
