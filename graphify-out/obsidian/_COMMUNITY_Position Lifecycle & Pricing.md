---
type: community
cohesion: 0.15
members: 14
---

# Position Lifecycle & Pricing

**Cohesion:** 0.15 - loosely connected
**Members:** 14 nodes

## Members
- [[Agent Council Design (Leader + 3 sub-agents)]] - document - docs/agent-council-next-steps.md
- [[Bybit Futures API v5]] - document - CLAUDE.md
- [[Devil's Advocate Sub-Agent]] - document - docs/agent-council-next-steps.md
- [[Exit Strategy 333334 (M1M2M3 partial close)]] - document - CLAUDE.md
- [[In-Progress Candle False Positive Bug Fix]] - document - docs/agent-council-next-steps.md
- [[News Hunter Sub-Agent]] - document - docs/agent-council-next-steps.md
- [[Pattern Validator Sub-Agent]] - document - docs/agent-council-next-steps.md
- [[Stop Integrity Gap â€” price-checker polling vs OHLC]] - document - docs/agent-council-next-steps.md
- [[TF_INTERVAL_MS Constant (in-progress candle drop)]] - code - painel-core.js
- [[backendprice-checker.js â€” Price Polling Cron]] - code - backend/price-checker.js
- [[checkActiveTrades()_1]] - code - backend/price-checker.js
- [[fetchCandles()_1]] - code - painel.html
- [[fetchCandles() in painel-core.js]] - code - painel-core.js
- [[processPriceUpdate()_1]] - code - backend/paper-trader.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Position_Lifecycle_&_Pricing
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Account & Database Layer]]
- 1 edge to [[_COMMUNITY_Frontend Analysis Engine]]

## Top bridge nodes
- [[fetchCandles()_1]] - degree 4, connects to 1 community
- [[checkActiveTrades()_1]] - degree 3, connects to 1 community
- [[fetchCandles() in painel-core.js]] - degree 3, connects to 1 community