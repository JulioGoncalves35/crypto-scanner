# CLAUDE.md — Crypto Scanner

This file documents the codebase structure, development conventions, and workflows for AI assistants working on this repository.

---

## Project Overview

**Crypto Scanner** is a single-page cryptocurrency futures trading dashboard built with vanilla HTML/CSS/JavaScript. It scans a configurable list of coins across multiple timeframes, applies a suite of technical indicators and pattern detectors, scores each setup, and helps traders identify high-probability entry points with pre-calculated risk/reward ratios.

UI language: **Portuguese (pt-BR)**.

---

## Repository Structure

```
crypto-scanner/
├── painel-core.js   ← Analysis logic (1,100+ lines): fetch, indicators, score, analyzeCandles
├── painel.html      ← Structural HTML, full CSS, UI rendering, state, initialization
├── tests/           ← Vitest test suite (8 files, 251 tests)
│   ├── indicators.test.js
│   ├── scoring.test.js
│   ├── patterns.test.js
│   ├── api.test.js
│   ├── mtf.test.js
│   ├── integration.test.js
│   ├── journal.test.js
│   ├── risk.test.js
│   └── fixtures/candles.js
└── package.json     ← Scripts: npm test (vitest run)
```

`painel.html` loads `painel-core.js` via `<script src="painel-core.js"></script>`. There is no build system; everything runs in the browser.

---

## External Dependencies (CDN only)

| Library | Version | Purpose |
|---|---|---|
| `lightweight-charts` | 4.1.1 | Candlestick chart rendering |
| Google Fonts | — | Space Mono, Syne typefaces |
| CoinCap / jsDelivr | — | Cryptocurrency icon images |

All dependencies are loaded via `<script src="...">` or `<link href="...">` CDN tags inside `painel.html`. No npm, no bundler, no local `node_modules`.

---

## Architecture

### Application State

A single `state` object holds all runtime data:

```javascript
const state = {
  mode: 'day',       // Trading mode: 'scalp' | 'day' | 'swing' | 'both'
  rr: 'fib',        // Risk/Reward mode: 'fib' | 'max' | '2' | '3'
  score: '70',      // Minimum score filter: '50' | '60' | '70'
  dir: 'both',      // Direction: 'both' | 'buy' | 'sell'
  coins: Set,       // Currently selected coin symbols
  cards: [],        // Current scan results
  leverage: 10,     // Futures leverage: 5 | 10 | 20 | 50
};
```

### Core Configuration Constants

```javascript
const BYBIT_TAKER    = 0.00055;   // 0.055% per side
const ROUND_TRIP_FEE = 0.0011;    // 0.11% total fee

const FIB_NORMAL = { m1: 1.618, m2: 2.618, m3: 4.236 };
const FIB_MAX    = { m1: 2.618, m2: 4.236, m3: 6.854 };
const FIB_FIXED2 = { m1: 2.0,   m2: 3.0,   m3: 4.0 };
const FIB_FIXED3 = { m1: 3.0,   m2: 4.5,   m3: 6.0 };

const TIMEFRAMES_BY_MODE = {
  scalp: ['5m', '15m', '30m'],
  day:   ['5m', '15m', '1h'],
  swing: ['4h', '1D'],
  both:  ['5m', '15m', '30m', '1h', '4h', '1D']
};
```

---

## Functional Modules

Code sections are separated by `// ─────────────────────` divider comments.

Modules 1–6 live in **`painel-core.js`**; modules 7–8 live in **`painel.html`**.

### 1. Coin Management
- `initCoins()` — populates the coin selection grid on page load
- `createCoinIcon(symbol)` — builds a coin tile with logo and checkbox
- `addCustomCoin()` — adds a user-specified coin symbol
- `selectAllCoins()` / `deselectAllCoins()` — bulk selection helpers

### 2. API Integration
- `fetchCandles(symbol, interval, limit)` — fetches OHLCV data from Bybit Futures API v5
- `fetchFearGreed()` — fetches Fear & Greed index from alternative.me
- `fetchFundingRate(coin, signal)` — fetches latest funding rate from Bybit (cached per coin in `runRealAnalysis`)
- `fetchOpenInterest(coin, signal)` — fetches 24 h open interest from Bybit (cached per coin in `runRealAnalysis`)
- `fetchJSON(url)` — base fetch with CORS proxy fallback chain
- `fetchWithFallback(url)` — iterates through `CORS_PROXIES` on failure

**CORS proxy chain** (in order): direct → corsproxy.io → allorigins → thingproxy

### 3. Technical Indicators
| Function | Indicator |
|---|---|
| `calcEMA(data, period)` | Exponential Moving Average |
| `calcRSI(data, period)` | Relative Strength Index |
| `calcMACD(data)` | MACD line, signal, histogram |
| `calcADX(candles, period)` | Average Directional Index |
| `calcBollingerBands(data)` | Bollinger Bands (upper/mid/lower) |
| `calcVWAP(candles)` | Volume-Weighted Average Price |
| `calcOBV(candles)` | On-Balance Volume |
| `calcATR(candles, period)` | Average True Range |
| `calcStochRSI(data)` | Stochastic RSI |
| `_calcTechIndicators(candles)` | Orchestrates all indicator calculations |

### 4. Pattern Detection
| Function | Pattern |
|---|---|
| `detectCandlePatterns(candles)` | Hammer, Engulfing, Doji, Morning/Evening Star, etc. |
| `detectDivergences(candles, rsi)` | Bullish/Bearish RSI divergences |
| `detectEMACross(ema9, ema21)` | Golden Cross / Death Cross |
| `detectMarketStructure(candles)` | Higher highs/lows vs lower highs/lows |
| `detectTriangle(candles)` | Ascending/Descending/Symmetrical triangles |
| `detectDoubleTopBottom(candles)` | Double Top / Double Bottom patterns |

### 5. Scoring Engine
- `_computeScore(price, ind, fg, fundingRate=null, openInterest=null)` — returns 0–100 score
- ADX hard filter: setups with ADX < 18 are rejected (sideways market filter)
- MTF confluence bonus: +6–12 points if same direction on 2+ timeframes
- MTF conflict penalty: -20 points if lower TF opposes highest TF
- Funding Rate bonus/penalty: +6 / +12 pts (aligned) or −6 / −12 pts (opposed) based on magnitude
- Open Interest bonus/penalty: +8 pts (rising OI confirms direction) or −6 pts (falling OI diverges)

### 6. Analysis Pipeline
- `analyzeCandles(coin, tf, candles, fg, fundingRate=null, openInterest=null, options)` — full analysis for one coin/timeframe
- `runRealAnalysis(signal)` — orchestrates the full scan across all selected coins/timeframes
  - Uses `AbortController` for cancellable scans
  - Fetches `fundingRate` and `openInterest` once per coin (cached) before the timeframe loop
  - Deduplicates: shows only the best setup per coin after MTF processing
  - Results sorted by capital return on M3 target

### 7. UI Rendering *(painel.html)*
- `renderCards(cards)` — displays scan result cards in the grid
- `renderGroupCard(group)` — renders a single result card with MTF badges
- Modal with candlestick chart (lightweight-charts) + indicator breakdown

### 8. Notifications *(painel.html)*
- `toggleNotifications()` — enables/disables alerts via the Web Notifications API
- `notifySetup(result)` — fires a browser notification for setups with score ≥ 80

### 9. Scan History *(painel.html)*
- `saveToHistory(results, mode)` — persists the top-5 setups after each scan (max 50 entries)
- `renderHistory()` — renders the saved scan list
- `clearHistory()` / `updateHistoryCount()` — history management helpers

### 10. Journal System *(painel.html)*
- Backed by `localStorage` key: `cryptoscanner_journal_v2` *(must not be renamed)*
- `saveToJournal(setup)` — persists a setup
- `loadJournal()` — retrieves all saved setups
- `renderJournal()` / `renderJournalStats()` — renders trade log and performance stats
- `updateResult(id, result)` — marks trade outcome: `'active' | 'stop' | 'm1' | 'm2' | 'm3'`

---

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| JS variables/functions | camelCase | `fetchCandles`, `analyzeCandles` |
| CSS classes | kebab-case | `.group-card`, `.coin-icon-ring` |
| JS constants | UPPER_SNAKE_CASE | `BYBIT_TAKER`, `TIMEFRAMES_BY_MODE` |
| HTML element IDs | lowercase-hyphen | `#scanBtn`, `#coinGrid`, `#progressWrap` |

---

## Data Flow

```
User clicks "Scan"
  → runRealAnalysis()                              [painel.html]
      → fetchFearGreed()
      → for each coin:
          → fetchFundingRate(coin)                 [Bybit API v5 — once per coin]
          → fetchOpenInterest(coin)                [Bybit API v5 — once per coin]
          → for each timeframe:
              → fetchCandles(symbol, interval)
              → _calcTechIndicators(candles)       [painel-core.js]
              → detectCandlePatterns / detectDivergences / etc.
              → _computeScore(price, ind, fg, fundingRate, openInterest)
              → analyzeCandles() → setup object
      → MTF confluence/conflict adjustments
      → deduplication (best setup per coin)
      → sort by M3 capital return
      → saveToHistory(results, mode)
      → renderCards(results)
```

---

## API Details

**Bybit Futures (Kline) endpoint:**
```
GET https://api.bybit.com/v5/market/kline
  ?category=linear
  &symbol=BTCUSDT
  &interval=15
  &limit=200
```

**Fear & Greed:**
```
GET https://api.alternative.me/fng/?limit=1
```

**Bybit Funding Rate endpoint:**
```
GET https://api.bybit.com/v5/market/funding/history
  ?category=linear
  &symbol=BTCUSDT
  &limit=1
```

**Bybit Open Interest endpoint:**
```
GET https://api.bybit.com/v5/market/open-interest
  ?category=linear
  &symbol=BTCUSDT
  &intervalTime=1h
  &limit=24
```

The application handles CORS automatically via the proxy fallback chain. No API keys are required.

---

## Default Coins (39 total)

BTC, ETH, SOL, BNB, ADA, AVAX, DOT, LINK, MATIC, UNI, ATOM, LTC, FIL, NEAR, APT, ARB, OP, INJ, WLD, SEI, TIA, BLUR, 1000PEPE, DOGE, XRP, ETC, AAVE, MKR, SNX, CRV, LDO, RPL, GMX, PENDLE, WIF, BONK, JTO, PYTH, STRK

> **Note:** PEPE trades as `1000PEPEUSDT` on Bybit's linear perpetuals market.

---

## Persistence

All trade journal and scan history data is stored client-side in `localStorage`:

```javascript
// Journal key
'cryptoscanner_journal_v2'

// Journal entry shape
{
  id: string,          // timestamp-based unique ID
  coin: string,        // e.g. "BTCUSDT"
  direction: string,   // "buy" | "sell"
  timeframe: string,   // e.g. "15m"
  leverage: number,
  entry: number,
  stop: number,
  targets: [m1, m2, m3],
  score: number,
  result: string,      // "active" | "stop" | "m1" | "m2" | "m3"
  savedAt: string      // ISO timestamp
}

// Scan History key
'scanHistory_v1'       // max 50 entries

// Scan history entry shape
{
  id: number,          // Date.now()
  timestamp: string,   // e.g. "17/03/2026, 14:30"
  mode: string,        // "scalp" | "day" | "swing" | "both"
  totalSetups: number,
  topSetups: [         // top 5 setups
    { coin, timeframe, dir, score, m3NetPct, entry }
  ]
}
```

---

## Development Workflow

### Running the app
Open `painel.html` directly in a browser — no server required.

For development with live reload, a simple static server works:
```bash
python3 -m http.server 8080
# then open http://localhost:8080/painel.html
```

### Making changes
- Analysis/fetch logic → edit **`painel-core.js`**
- HTML structure, CSS, UI rendering, state → edit **`painel.html`**
- Refresh the browser to see changes. No compilation step needed.

### Testing
```bash
npm test          # runs all 251 Vitest tests
npm test -- --watch   # watch mode for development
```

Manual testing steps:
- Open `painel.html` in a browser
- Select a few coins and click "Escanear" (Scan)
- Verify cards render with correct score/direction badges
- Open the modal for a card and verify chart and indicators display
- Save a setup to journal and verify it appears in the Journal tab
- Check the Histórico tab to confirm the scan was saved

### Git workflow
```bash
git add painel.html painel-core.js
git commit -m "descriptive message"
git push -u origin <branch>
```

---

## Important Constraints

1. **Two-file rule** — Analysis/fetch logic belongs in `painel-core.js`; HTML, CSS, and UI rendering belong in `painel.html`. Do not merge them back or split further unless explicitly requested.
2. **No build tooling** — Do not introduce webpack, vite, or any bundler unless explicitly requested. `package.json` is used only for Vitest.
3. **Vanilla JS only** — Do not add frameworks (React, Vue, etc.) unless explicitly requested.
4. **Portuguese UI** — All user-facing text should remain in Portuguese (pt-BR).
5. **localStorage keys** — `cryptoscanner_journal_v2` and `scanHistory_v1` must not be renamed; changing them would break existing saved data for users.
6. **Bybit symbol format** — PEPE must stay as `1000PEPEUSDT` (not `PEPEUSDT`).
7. **Fee constants** — `BYBIT_TAKER` and `ROUND_TRIP_FEE` reflect real Bybit fee rates; do not change without verification.
8. **Dual `_computeScore` / `analyzeCandles`** — Both functions exist in `painel-core.js` (tested by Vitest) and as inline copies in `painel.html` (used in the browser). Keep them in sync when modifying scoring logic.

---

## Common Pitfalls

- **CORS errors:** The app uses a proxy chain — if all proxies fail, the app shows mock data with a demo banner. This is expected behavior.
- **Symbol mismatches:** Bybit uses `1000PEPEUSDT`, `1000BONKUSDT`, etc. for low-price tokens. Verify against Bybit API when adding new coins.
- **ADX filter:** Setups with ADX < 18 are silently dropped. If a coin never appears in results, it likely has a flat ADX.
- **MTF deduplication:** After scanning, only the highest-scored setup per coin is shown. Lower-scored timeframes for the same coin are intentionally hidden.
- **Journal version key:** The `_v2` suffix was introduced after a schema change. If the data shape changes again, bump to `_v3` and add a migration function.
- **Funding/OI in unit tests:** `fundingRate` and `openInterest` default to `null` in unit tests. When writing scoring tests that exercise funding/OI logic, pass explicit values.
- **AbortError in funding/OI fetch:** Every `catch` inside `runRealAnalysis` must check `if (e.name === 'AbortError') throw e` before any fallback, so user-initiated scan cancellation propagates correctly.
- **Dual implementation sync:** `_computeScore` and `analyzeCandles` are duplicated between `painel-core.js` and `painel.html`. Always update both when changing scoring logic.
