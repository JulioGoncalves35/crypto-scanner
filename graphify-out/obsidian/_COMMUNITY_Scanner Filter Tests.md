---
type: community
cohesion: 0.40
members: 5
---

# Scanner Filter Tests

**Cohesion:** 0.40 - moderately connected
**Members:** 5 nodes

## Members
- [[detectTrend()]] - code - tests\scanner-filters.test.js
- [[isRiskTooHigh()]] - code - tests\scanner-filters.test.js
- [[makeTrendingDown()]] - code - tests\scanner-filters.test.js
- [[makeTrendingUp()]] - code - tests\scanner-filters.test.js
- [[scanner-filters.test.js]] - code - tests\scanner-filters.test.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Scanner_Filter_Tests
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_Core Analysis Functions]]

## Top bridge nodes
- [[detectTrend()]] - degree 2, connects to 1 community