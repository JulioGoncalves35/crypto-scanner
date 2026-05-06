---
type: community
cohesion: 0.29
members: 12
---

# Scan Engine & API Fetch

**Cohesion:** 0.29 - loosely connected
**Members:** 12 nodes

## Members
- [[_runOnce()]] - code - backend\routes\scan.js
- [[applyMTFScoring()]] - code - painel-core.js
- [[fetchCandles()]] - code - painel-core.js
- [[fetchFearGreed()]] - code - backend\scanner.js
- [[fetchFundingRate()]] - code - backend\scanner.js
- [[fetchJSON()]] - code - painel-core.js
- [[fetchMacroBtcTrend()]] - code - backend\scanner.js
- [[fetchOpenInterest()]] - code - backend\scanner.js
- [[fetchWithFallback()]] - code - painel-core.js
- [[runScan()]] - code - backend\scanner.js
- [[scan.js]] - code - backend\routes\scan.js
- [[scanner.js]] - code - backend\scanner.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Scan_Engine_&_API_Fetch
SORT file.name ASC
```

## Connections to other communities
- 7 edges to [[_COMMUNITY_Backend Trading System]]
- 6 edges to [[_COMMUNITY_Core Analysis Functions]]

## Top bridge nodes
- [[runScan()]] - degree 14, connects to 2 communities
- [[fetchWithFallback()]] - degree 7, connects to 2 communities
- [[fetchMacroBtcTrend()]] - degree 5, connects to 2 communities
- [[fetchCandles()]] - degree 4, connects to 1 community
- [[applyMTFScoring()]] - degree 2, connects to 1 community