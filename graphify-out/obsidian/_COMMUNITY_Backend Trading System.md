---
type: community
cohesion: 0.14
members: 34
---

# Backend Trading System

**Cohesion:** 0.14 - loosely connected
**Members:** 34 nodes

## Members
- [[Log()]] - code - run-leader.ps1
- [[_alreadyClosedFraction()]] - code - backend\paper-trader.js
- [[_alreadyClosedFraction()_1]] - code - backend\price-checker.js
- [[_closePartial()]] - code - backend\paper-trader.js
- [[_stopStatus()]] - code - backend\paper-trader.js
- [[checkActiveTrades()]] - code - backend\price-checker.js
- [[closeManualAt()]] - code - backend\paper-trader.js
- [[countActivePositions()]] - code - backend\db.js
- [[db.js]] - code - backend\db.js
- [[expireTrade()]] - code - backend\price-checker.js
- [[fetchCurrentPrice()]] - code - backend\price-checker.js
- [[fetchRecentPriceWindow()]] - code - backend\price-checker.js
- [[getAccount()]] - code - backend\db.js
- [[getActiveCoins()]] - code - backend\db.js
- [[getActiveTrades()]] - code - backend\db.js
- [[getDb()]] - code - backend\db.js
- [[getRecentReflections()]] - code - backend\db.js
- [[getStats()]] - code - backend\db.js
- [[getTrade()]] - code - backend\db.js
- [[getTrades()]] - code - backend\db.js
- [[initSchema()]] - code - backend\db.js
- [[insertReflection()]] - code - backend\db.js
- [[insertScanLog()]] - code - backend\db.js
- [[insertTrade()]] - code - backend\db.js
- [[isExpired()]] - code - backend\price-checker.js
- [[openPosition()]] - code - backend\paper-trader.js
- [[paper-trader.js]] - code - backend\paper-trader.js
- [[price-checker.js]] - code - backend\price-checker.js
- [[processPriceUpdate()]] - code - backend\paper-trader.js
- [[resetAccount()]] - code - backend\db.js
- [[run-leader.ps1]] - code - run-leader.ps1
- [[setupAccount()]] - code - backend\db.js
- [[updateAccount()]] - code - backend\db.js
- [[updateTrade()]] - code - backend\db.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Backend_Trading_System
SORT file.name ASC
```

## Connections to other communities
- 7 edges to [[_COMMUNITY_Scan Engine & API Fetch]]

## Top bridge nodes
- [[getAccount()]] - degree 9, connects to 1 community
- [[Log()]] - degree 8, connects to 1 community
- [[openPosition()]] - degree 7, connects to 1 community
- [[getActiveCoins()]] - degree 3, connects to 1 community
- [[insertScanLog()]] - degree 3, connects to 1 community