---
type: community
cohesion: 0.29
members: 7
---

# Test Candle Fixtures

**Cohesion:** 0.29 - loosely connected
**Members:** 7 nodes

## Members
- [[candles.js]] - code - tests\fixtures\candles.js
- [[getResult()]] - code - tests\integration.test.js
- [[integration.test.js]] - code - tests\integration.test.js
- [[makeDowntrendCandles()]] - code - tests\fixtures\candles.js
- [[makeFlatCandles()]] - code - tests\fixtures\candles.js
- [[makePatternCandles()]] - code - tests\fixtures\candles.js
- [[makeTrendingCandles()]] - code - tests\fixtures\candles.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Test_Candle_Fixtures
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_Core Analysis Functions]]

## Top bridge nodes
- [[getResult()]] - degree 3, connects to 1 community