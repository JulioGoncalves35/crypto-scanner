# Graph Report - .  (2026-04-27)

## Corpus Check
- 22 files · ~61,039 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 206 nodes · 303 edges · 27 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 42 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend Analysis Engine|Frontend Analysis Engine]]
- [[_COMMUNITY_Core Analysis Functions|Core Analysis Functions]]
- [[_COMMUNITY_Backend Trading System|Backend Trading System]]
- [[_COMMUNITY_Account & Database Layer|Account & Database Layer]]
- [[_COMMUNITY_Position Lifecycle & Pricing|Position Lifecycle & Pricing]]
- [[_COMMUNITY_Scan Engine & API Fetch|Scan Engine & API Fetch]]
- [[_COMMUNITY_Test Candle Fixtures|Test Candle Fixtures]]
- [[_COMMUNITY_API Test Helpers|API Test Helpers]]
- [[_COMMUNITY_Pattern Test Fixtures|Pattern Test Fixtures]]
- [[_COMMUNITY_Journal & Trade Log|Journal & Trade Log]]
- [[_COMMUNITY_Scanner Filter Tests|Scanner Filter Tests]]
- [[_COMMUNITY_Trades Route|Trades Route]]
- [[_COMMUNITY_Indicator Tests|Indicator Tests]]
- [[_COMMUNITY_Journal Tests|Journal Tests]]
- [[_COMMUNITY_MTF Tests|MTF Tests]]
- [[_COMMUNITY_Scoring Tests|Scoring Tests]]
- [[_COMMUNITY_Express Server|Express Server]]
- [[_COMMUNITY_Account Route|Account Route]]
- [[_COMMUNITY_Scan Route|Scan Route]]
- [[_COMMUNITY_Risk Tests|Risk Tests]]
- [[_COMMUNITY_deleteEntry()|deleteEntry()]]
- [[_COMMUNITY_initCoins()|initCoins()]]
- [[_COMMUNITY_isWeekendWarning()|isWeekendWarning()]]
- [[_COMMUNITY_paper-trader module|paper-trader module]]
- [[_COMMUNITY_closeManualAt()|closeManualAt()]]
- [[_COMMUNITY_getAccount()|getAccount()]]
- [[_COMMUNITY_getTrades()|getTrades()]]

## God Nodes (most connected - your core abstractions)
1. `_calcTechIndicators()` - 27 edges
2. `_calcTechIndicators()` - 16 edges
3. `getDb()` - 15 edges
4. `_computeScore()` - 13 edges
5. `runScan()` - 12 edges
6. `getAccount()` - 9 edges
7. `runRealAnalysis()` - 9 edges
8. `calcEMA()` - 8 edges
9. `analyzeCandles()` - 8 edges
10. `backend/server.js â€” Express Server` - 8 edges

## Surprising Connections (you probably didn't know these)
- `analyzeCandles()` --semantically_similar_to--> `analyzeCandles() in painel-core.js`  [INFERRED] [semantically similar]
  painel.html → painel-core.js
- `fetchCandles()` --semantically_similar_to--> `fetchCandles() in painel-core.js`  [INFERRED] [semantically similar]
  painel.html → painel-core.js
- `MTF Scoring Logic (inline in runRealAnalysis)` --semantically_similar_to--> `applyMTFScoring() â€” exported`  [EXTRACTED] [semantically similar]
  painel.html → painel-core.js
- `detectTrend()` --calls--> `calcEMA()`  [INFERRED]
  tests\scanner-filters.test.js → painel-core.js
- `min_score Bump Recommendation (80 -> 88+)` --references--> `backend/db.js â€” SQLite Database Layer`  [EXTRACTED]
  docs/agent-council-next-steps.md → backend/db.js

## Communities

### Community 0 - "Frontend Analysis Engine"
Cohesion: 0.07
Nodes (25): NV1/NV2/NV3 Confidence Level Badge, ConfluÃªncia Multi-Categoria Bonus, CORS Proxy Fallback Chain, Fear & Greed Index API (alternative.me), analyzeCandles(), calcATR(), calcBollinger() â€” Bollinger Bands, calcCVD() â€” Cumulative Volume Delta (+17 more)

### Community 1 - "Core Analysis Functions"
Cohesion: 0.12
Nodes (32): analyzeCandles(), avgVol(), calcADX(), calcAnchoredVWAP(), calcATR(), calcBollinger(), calcCVD(), calcEMA() (+24 more)

### Community 2 - "Backend Trading System"
Cohesion: 0.16
Nodes (26): countActivePositions(), getAccount(), getActiveCoins(), getActiveTrades(), getDb(), getStats(), getTrade(), getTrades() (+18 more)

### Community 3 - "Account & Database Layer"
Cohesion: 0.1
Nodes (24): backend/routes/account.js, backend/db.js â€” SQLite Database Layer, setupAccount(), openPosition(), backend/scanner.js â€” Auto-Scan Engine, fetchMacroBtcTrend() â€” BTC EMA200 macro filter, runScan(), backend/routes/scan.js (+16 more)

### Community 4 - "Position Lifecycle & Pricing"
Cohesion: 0.15
Nodes (14): processPriceUpdate(), backend/price-checker.js â€” Price Polling Cron, checkActiveTrades(), TF_INTERVAL_MS Constant (in-progress candle drop), Agent Council Design (Leader + 3 sub-agents), Devil's Advocate Sub-Agent, Exit Strategy 33/33/34 (M1/M2/M3 partial close), In-Progress Candle False Positive Bug Fix (+6 more)

### Community 5 - "Scan Engine & API Fetch"
Cohesion: 0.38
Nodes (9): applyMTFScoring(), fetchCandles(), fetchJSON(), fetchWithFallback(), fetchFearGreed(), fetchFundingRate(), fetchMacroBtcTrend(), fetchOpenInterest() (+1 more)

### Community 6 - "Test Candle Fixtures"
Cohesion: 0.29
Nodes (2): makeTrendingCandles(), getResult()

### Community 7 - "API Test Helpers"
Cohesion: 0.33
Nodes (0): 

### Community 8 - "Pattern Test Fixtures"
Cohesion: 0.47
Nodes (3): candle(), makeBear(), withContext()

### Community 9 - "Journal & Trade Log"
Cohesion: 0.33
Nodes (3): localStorage Journal (cryptoscanner_journal_v2), loadJournal(), renderJournal()

### Community 10 - "Scanner Filter Tests"
Cohesion: 0.4
Nodes (1): detectTrend()

### Community 11 - "Trades Route"
Cohesion: 0.67
Nodes (2): buildJournalEntry(), fp()

### Community 12 - "Indicator Tests"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Journal Tests"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "MTF Tests"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Scoring Tests"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Express Server"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Account Route"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Scan Route"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Risk Tests"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "deleteEntry()"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "initCoins()"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "isWeekendWarning()"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "paper-trader module"
Cohesion: 1.0
Nodes (1): backend/paper-trader.js â€” Capital Allocation

### Community 24 - "closeManualAt()"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "getAccount()"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "getTrades()"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **17 isolated node(s):** `fetchWithFallback() in painel-core.js`, `calcEMA() in painel-core.js`, `backend/paper-trader.js â€” Capital Allocation`, `backend/price-checker.js â€” Price Polling Cron`, `backend/routes/trades.js` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Indicator Tests`** (2 nodes): `makeSwingCandles()`, `indicators.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Journal Tests`** (2 nodes): `makeMockSetup()`, `journal.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `MTF Tests`** (2 nodes): `makeSetup()`, `mtf.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scoring Tests`** (2 nodes): `makeInd()`, `scoring.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Express Server`** (1 nodes): `server.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Account Route`** (1 nodes): `account.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scan Route`** (1 nodes): `scan.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Risk Tests`** (1 nodes): `risk.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `deleteEntry()`** (1 nodes): `deleteEntry()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `initCoins()`** (1 nodes): `initCoins()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `isWeekendWarning()`** (1 nodes): `isWeekendWarning()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `paper-trader module`** (1 nodes): `backend/paper-trader.js â€” Capital Allocation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `closeManualAt()`** (1 nodes): `closeManualAt()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `getAccount()`** (1 nodes): `getAccount()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `getTrades()`** (1 nodes): `getTrades()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runScan()` connect `Scan Engine & API Fetch` to `Core Analysis Functions`, `Backend Trading System`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `runRealAnalysis()` connect `Frontend Analysis Engine` to `Account & Database Layer`, `Position Lifecycle & Pricing`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `backend/scanner.js â€” Auto-Scan Engine` connect `Account & Database Layer` to `Position Lifecycle & Pricing`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `_computeScore()` (e.g. with `detectEMACross()` and `detectMarketStructure()`) actually correct?**
  _`_computeScore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `runScan()` (e.g. with `getAccount()` and `getActiveCoins()`) actually correct?**
  _`runScan()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fetchWithFallback() in painel-core.js`, `calcEMA() in painel-core.js`, `backend/paper-trader.js â€” Capital Allocation` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Analysis Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._