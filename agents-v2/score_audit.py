"""Audit score distribution and reasons breakdown."""
import sqlite3, json, sys
sys.path.insert(0, '.')
from src.db import _path
from collections import Counter

db = sqlite3.connect(str(_path()))
db.row_factory = sqlite3.Row

since = "2026-04-15"
BANNED_TFS = {"5m", "15m", "30m"}

rows = db.execute(
    "SELECT candidates_json FROM scan_log WHERE ran_at >= ? AND candidates_json IS NOT NULL ORDER BY ran_at DESC LIMIT 500",
    (since,)
).fetchall()

all_cands = []
for r in rows:
    try:
        cands = json.loads(r["candidates_json"])
        for c in cands:
            if c.get("timeframe") not in BANNED_TFS:
                all_cands.append(c)
    except:
        pass

print(f"Total 1h+4h candidates: {len(all_cands)}")

# Score distribution
scores = [c.get("score", 0) for c in all_cands]
score_dist = Counter(scores)
print("\nScore distribution (1h+4h only):")
for s in sorted(score_dist, reverse=True)[:15]:
    bar = "#" * (score_dist[s] // 5)
    print(f"  {s:3d}: {score_dist[s]:4d} {bar}")

# Calculate raw score from reasons for score=100 vs score=88-94 candidates
# by summing numeric scores from reasons (not available) but we CAN look at
# what text reasons appear most in score=100 vs score=88-94

def get_reason_texts(cand):
    reasons = cand.get("reasons", [])
    return [r.get("text", "") if isinstance(r, dict) else str(r) for r in reasons]

cands_100 = [c for c in all_cands if c.get("score") == 100]
cands_88_94 = [c for c in all_cands if 88 <= c.get("score", 0) <= 94]

print(f"\nScore=100 candidates: {len(cands_100)}")
print(f"Score 88-94 candidates: {len(cands_88_94)}")

# Count reasons
reasons_100 = Counter()
for c in cands_100:
    for t in get_reason_texts(c):
        # Shorten text to category
        key = t[:50]
        reasons_100[key] += 1

reasons_88_94 = Counter()
for c in cands_88_94:
    for t in get_reason_texts(c):
        key = t[:50]
        reasons_88_94[key] += 1

def safe(s):
    return s.encode('ascii', 'replace').decode('ascii')

print("\nTop 15 reasons in score=100 (count / candidates):")
for text, cnt in reasons_100.most_common(15):
    pct = 100 * cnt / len(cands_100) if cands_100 else 0
    print(f"  {pct:5.0f}%  {safe(text)}")

print("\nTop 15 reasons in score=88-94 (count / candidates):")
for text, cnt in reasons_88_94.most_common(15):
    pct = 100 * cnt / len(cands_88_94) if cands_88_94 else 0
    print(f"  {pct:5.0f}%  {safe(text)}")

# Count reasons per candidate (proxy for raw score magnitude)
print("\nAvg reason count (indicates how many indicators aligned):")
def avg_reasons(cands):
    if not cands: return 0
    return sum(len(get_reason_texts(c)) for c in cands) / len(cands)

for score_range, label in [(lambda c: c.get("score")==100, "score=100"),
                            (lambda c: 88<=c.get("score",0)<=94, "score 88-94"),
                            (lambda c: 80<=c.get("score",0)<=87, "score 80-87")]:
    filtered = [c for c in all_cands if score_range(c)]
    if filtered:
        print(f"  {label}: {avg_reasons(filtered):.1f} reasons avg  ({len(filtered)} candidates)")
