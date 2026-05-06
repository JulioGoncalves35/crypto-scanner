# Graph Report - .  (2026-05-03)

## Corpus Check
- 30 files · ~71,063 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 266 nodes · 344 edges · 58 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.82)
- Token cost: 69,281 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend Analysis Engine|Frontend Analysis Engine]]
- [[_COMMUNITY_Core Analysis Functions|Core Analysis Functions]]
- [[_COMMUNITY_Backend Trading System|Backend Trading System]]
- [[_COMMUNITY_Account & Position Management|Account & Position Management]]
- [[_COMMUNITY_Agent Council Design|Agent Council Design]]
- [[_COMMUNITY_Position Lifecycle & Pricing|Position Lifecycle & Pricing]]
- [[_COMMUNITY_Scan Engine & API Fetch|Scan Engine & API Fetch]]
- [[_COMMUNITY_API Test Helpers|API Test Helpers]]
- [[_COMMUNITY_Test Candle Fixtures|Test Candle Fixtures]]
- [[_COMMUNITY_Pattern Test Fixtures|Pattern Test Fixtures]]
- [[_COMMUNITY_Journal & Trade Log|Journal & Trade Log]]
- [[_COMMUNITY_Scanner Filter Tests|Scanner Filter Tests]]
- [[_COMMUNITY_Leader Agent Architecture|Leader Agent Architecture]]
- [[_COMMUNITY_Trades Route|Trades Route]]
- [[_COMMUNITY_Indicator Tests|Indicator Tests]]
- [[_COMMUNITY_Journal Tests|Journal Tests]]
- [[_COMMUNITY_MTF Tests|MTF Tests]]
- [[_COMMUNITY_Scoring Tests|Scoring Tests]]
- [[_COMMUNITY_Stop Validator|Stop Validator]]
- [[_COMMUNITY_Frontend Scoring Flow|Frontend Scoring Flow]]
- [[_COMMUNITY_Stop Validator Planning|Stop Validator Planning]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]

## God Nodes (most connected - your core abstractions)
1. `_calcTechIndicators()` - 27 edges
2. `getDb()` - 17 edges
3. `_calcTechIndicators()` - 16 edges
4. `runScan()` - 14 edges
5. `_computeScore()` - 13 edges
6. `getAccount()` - 9 edges
7. `checkActiveTrades()` - 9 edges
8. `runRealAnalysis()` - 9 edges
9. `calcEMA()` - 8 edges
10. `analyzeCandles()` - 8 edges

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
Cohesion: 0.14
Nodes (30): countActivePositions(), getAccount(), getActiveCoins(), getActiveTrades(), getDb(), getRecentReflections(), getStats(), getTrade() (+22 more)

### Community 3 - "Account & Position Management"
Cohesion: 0.1
Nodes (24): backend/routes/account.js, backend/db.js â€” SQLite Database Layer, setupAccount(), openPosition(), backend/scanner.js â€” Auto-Scan Engine, fetchMacroBtcTrend() â€” BTC EMA200 macro filter, runScan(), backend/routes/scan.js (+16 more)

### Community 4 - "Agent Council Design"
Cohesion: 0.16
Nodes (15): Agent Council — Multi-agent Pipeline, .claude/agents/leader.md — Leader Agent Prompt, .claude/agents/news-hunter.md — News Hunter Sub-agent, .claude/agents/pattern-validator.md — Pattern Validator Sub-agent, Devil s Advocate Sub-agent (Council), In-progress Candle Drop Fix, News Hunter Sub-agent (Council), Agent Council Next Steps Document (+7 more)

### Community 5 - "Position Lifecycle & Pricing"
Cohesion: 0.15
Nodes (14): processPriceUpdate(), backend/price-checker.js â€” Price Polling Cron, checkActiveTrades(), TF_INTERVAL_MS Constant (in-progress candle drop), Agent Council Design (Leader + 3 sub-agents), Devil's Advocate Sub-Agent, Exit Strategy 33/33/34 (M1/M2/M3 partial close), In-Progress Candle False Positive Bug Fix (+6 more)

### Community 6 - "Scan Engine & API Fetch"
Cohesion: 0.29
Nodes (10): applyMTFScoring(), fetchCandles(), fetchJSON(), fetchWithFallback(), _runOnce(), fetchFearGreed(), fetchFundingRate(), fetchMacroBtcTrend() (+2 more)

### Community 7 - "API Test Helpers"
Cohesion: 0.29
Nodes (0): 

### Community 8 - "Test Candle Fixtures"
Cohesion: 0.29
Nodes (2): makeTrendingCandles(), getResult()

### Community 9 - "Pattern Test Fixtures"
Cohesion: 0.47
Nodes (3): candle(), makeBear(), withContext()

### Community 10 - "Journal & Trade Log"
Cohesion: 0.33
Nodes (3): localStorage Journal (cryptoscanner_journal_v2), loadJournal(), renderJournal()

### Community 11 - "Scanner Filter Tests"
Cohesion: 0.4
Nodes (1): detectTrend()

### Community 12 - "Leader Agent Architecture"
Cohesion: 0.4
Nodes (5): Leader Review 3-Phase Flow, Sequential Gate (pattern-validator first), Leader Agent Implementation Plan (2026-04-29), Leader Agent Design Spec (2026-04-29), Leader ADR Decisions Table

### Community 13 - "Trades Route"
Cohesion: 0.67
Nodes (2): buildJournalEntry(), fp()

### Community 14 - "Indicator Tests"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Journal Tests"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "MTF Tests"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Scoring Tests"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Stop Validator"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Frontend Scoring Flow"
Cohesion: 1.0
Nodes (2): _computeScore — Scoring Engine, runRealAnalysis() — Frontend Data Flow

### Community 20 - "Stop Validator Planning"
Cohesion: 1.0
Nodes (2): isStopTighter — Direction-aware Stop Validation, Task 4: isStopTighter Helper + Tests

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (1): backend/paper-trader.js â€” Capital Allocation

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (1): CLAUDE.md — Crypto Scanner

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): trade_reflections SQLite Table

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (1): scan_log SQLite Table

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (1): Exit Strategy 33/33/34

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (1): BTC EMA200 4h Macro Filter

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (1): MAX_STOP_RISK_MULTIPLIER (50x cap)

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (1): min_score Default = 85

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (1): Leader (Synthesis Role)

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (1): Stop Integrity Gap Finding (price-checker)

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (1): Task 1: trade_reflections Table + Helpers

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (1): Task 2: candidates_json Column in scan_log

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (1): Task 3: Reflections Route + Server Registration

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (1): Task 5: POST /api/trades/:id/tighten-stop Route

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (1): Task 6: runScan() Returns Candidates Without Opening

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (1): Task 7: POST /api/scan/preview Route

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): Task 8: POST /api/trades/open Route

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (1): Leader Review Data Flow Diagram

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (1): Leader Acceptance Criteria

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (1): Leader Risks and Mitigations Table

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (1): EXIT Justification Block Format

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): TIGHTEN Justification Block Format

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): HOLD Justification Block Format

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): Autonomy Success Criteria

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): Approval Aggregation Rule

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): Reflection Cursor (last_reflection_at)

## Knowledge Gaps
- **57 isolated node(s):** `fetchWithFallback() in painel-core.js`, `calcEMA() in painel-core.js`, `backend/paper-trader.js â€” Capital Allocation`, `backend/price-checker.js â€” Price Polling Cron`, `backend/routes/trades.js` (+52 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Indicator Tests`** (2 nodes): `makeSwingCandles()`, `indicators.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Journal Tests`** (2 nodes): `makeMockSetup()`, `journal.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `MTF Tests`** (2 nodes): `makeSetup()`, `mtf.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scoring Tests`** (2 nodes): `makeInd()`, `scoring.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Stop Validator`** (2 nodes): `stop-validator.js`, `isStopTighter()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Frontend Scoring Flow`** (2 nodes): `_computeScore — Scoring Engine`, `runRealAnalysis() — Frontend Data Flow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Stop Validator Planning`** (2 nodes): `isStopTighter — Direction-aware Stop Validation`, `Task 4: isStopTighter Helper + Tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `server.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `account.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `risk.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `deleteEntry()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `initCoins()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `isWeekendWarning()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `backend/paper-trader.js â€” Capital Allocation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `closeManualAt()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `getAccount()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `getTrades()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `reflections.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `stop-validator.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `CLAUDE.md — Crypto Scanner`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `trade_reflections SQLite Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `scan_log SQLite Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `Exit Strategy 33/33/34`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `BTC EMA200 4h Macro Filter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `MAX_STOP_RISK_MULTIPLIER (50x cap)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `min_score Default = 85`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `Leader (Synthesis Role)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `Stop Integrity Gap Finding (price-checker)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `Task 1: trade_reflections Table + Helpers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `Task 2: candidates_json Column in scan_log`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `Task 3: Reflections Route + Server Registration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `Task 5: POST /api/trades/:id/tighten-stop Route`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `Task 6: runScan() Returns Candidates Without Opening`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `Task 7: POST /api/scan/preview Route`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `Task 8: POST /api/trades/open Route`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `Leader Review Data Flow Diagram`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `Leader Acceptance Criteria`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `Leader Risks and Mitigations Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `EXIT Justification Block Format`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `TIGHTEN Justification Block Format`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `HOLD Justification Block Format`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `Autonomy Success Criteria`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `Approval Aggregation Rule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `Reflection Cursor (last_reflection_at)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runScan()` connect `Scan Engine & API Fetch` to `Core Analysis Functions`, `Backend Trading System`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `runRealAnalysis()` connect `Frontend Analysis Engine` to `Account & Position Management`, `Position Lifecycle & Pricing`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `analyzeCandles()` connect `Core Analysis Functions` to `Test Candle Fixtures`, `Scan Engine & API Fetch`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `runScan()` (e.g. with `fetchCandles()` and `analyzeCandles()`) actually correct?**
  _`runScan()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `_computeScore()` (e.g. with `detectEMACross()` and `detectMarketStructure()`) actually correct?**
  _`_computeScore()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fetchWithFallback() in painel-core.js`, `calcEMA() in painel-core.js`, `backend/paper-trader.js â€” Capital Allocation` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Analysis Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._