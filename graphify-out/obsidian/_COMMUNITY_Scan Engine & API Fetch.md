---
type: community
cohesion: 0.38
members: 10
---

# Scan Engine & API Fetch

**Cohesion:** 0.38 - loosely connected
**Members:** 10 nodes

## Members
- [[applyMTFScoring()]] - code - painel-core.js
- [[fetchCandles()]] - code - painel-core.js
- [[fetchFearGreed()]] - code - backend\scanner.js
- [[fetchFundingRate()]] - code - backend\scanner.js
- [[fetchJSON()]] - code - painel-core.js
- [[fetchMacroBtcTrend()]] - code - backend\scanner.js
- [[fetchOpenInterest()]] - code - backend\scanner.js
- [[fetchWithFallback()]] - code - painel-core.js
- [[runScan()]] - code - backend\scanner.js
- [[scanner.js]] - code - backend\scanner.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Scan_Engine_&_API_Fetch
SORT file.name ASC
```

## Connections to other communities
- 6 edges to [[_COMMUNITY_Core Analysis Functions]]
- 5 edges to [[_COMMUNITY_Backend Trading System]]

## Top bridge nodes
- [[runScan()]] - degree 12, connects to 2 communities
- [[fetchWithFallback()]] - degree 7, connects to 2 communities
- [[fetchCandles()]] - degree 4, connects to 1 community
- [[fetchMacroBtcTrend()]] - degree 4, connects to 1 community
- [[applyMTFScoring()]] - degree 2, connects to 1 community