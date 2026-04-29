---
type: community
cohesion: 0.10
members: 25
---

# Account & Database Layer

**Cohesion:** 0.10 - loosely connected
**Members:** 25 nodes

## Members
- [[Agent Council Next Steps]] - document - docs/agent-council-next-steps.md
- [[Backtest System (removed, replaced by live history)]] - document - CLAUDE.md
- [[Crypto Scanner Project Documentation]] - document - CLAUDE.md
- [[MAX_STOP_RISK_MULTIPLIER=50 Cap]] - code - backend/paper-trader.js
- [[MTF Scoring Logic (inline in runRealAnalysis)]] - code - painel.html
- [[Macro BTC EMA200 Filter (fail-open)]] - code - backend/scanner.js
- [[analyzeCandles() in painel-core.js]] - code - painel-core.js
- [[applyMTFScoring() â€” exported]] - code - painel-core.js
- [[backenddb.js â€” SQLite Database Layer]] - code - backend/db.js
- [[backendroutesaccount.js]] - code - backend/routes/account.js
- [[backendroutesscan.js]] - code - backend/routes/scan.js
- [[backendroutestrades.js]] - code - backend/routes/trades.js
- [[backendscanner.js â€” Auto-Scan Engine]] - code - backend/scanner.js
- [[backendserver.js â€” Express Server]] - code - backend/server.js
- [[calcEMA() in painel-core.js]] - code - painel-core.js
- [[fetchMacroBtcTrend() â€” BTC EMA200 macro filter]] - code - backend/scanner.js
- [[fetchWithFallback() in painel-core.js]] - code - painel-core.js
- [[lightweight-charts 4.1.1]] - code - painel.html
- [[min_score Bump Recommendation (80 - 88+)]] - document - docs/agent-council-next-steps.md
- [[openPosition()_1]] - code - backend/paper-trader.js
- [[painel-core.js â€” Pure Analysis Engine]] - code - painel-core.js
- [[painel.html â€” Frontend SPA]] - code - painel.html
- [[resetAccount()_1]] - code - backend/db.js
- [[runScan()_1]] - code - backend/scanner.js
- [[setupAccount()_1]] - code - backend/db.js

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Account_&_Database_Layer
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Frontend Analysis Engine]]
- 2 edges to [[_COMMUNITY_Position Lifecycle & Pricing]]

## Top bridge nodes
- [[backendscanner.js â€” Auto-Scan Engine]] - degree 8, connects to 1 community
- [[backendserver.js â€” Express Server]] - degree 8, connects to 1 community
- [[MTF Scoring Logic (inline in runRealAnalysis)]] - degree 2, connects to 1 community
- [[analyzeCandles() in painel-core.js]] - degree 2, connects to 1 community