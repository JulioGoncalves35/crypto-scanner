# CLAUDE.md — Crypto Scanner

> **Instrução para o assistente:** Este arquivo é lido automaticamente no início de cada sessão. Ao final de qualquer implementação que altere comportamentos, funções, filtros ou arquitetura do projeto, **atualize este arquivo** para refletir o que mudou — antes de fazer o commit final.

This file documents the codebase structure, development conventions, and workflows for AI assistants working on this repository.

---

## Project Overview

**Crypto Scanner** is a single-page cryptocurrency futures trading dashboard built with vanilla HTML/CSS/JavaScript. It scans a configurable list of coins across multiple timeframes, applies a suite of technical indicators and pattern detectors, scores each setup, and helps traders identify high-probability entry points with pre-calculated risk/reward ratios.

UI language: **Portuguese (pt-BR)**.

---

## Repository Structure

```
crypto-scanner/
└── painel.html      ← Entire application (3,000+ lines): HTML + embedded CSS + embedded JS
```

This is a **monolithic single-file application**. There is no build system, no package.json, and no external tooling required. Everything runs in the browser.

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

## Functional Modules (all inside `painel.html`)

Code sections are separated by `// ─────────────────────` divider comments.

### 9. Backtest System
- **Location:** `painel.html` only (not in `painel-core.js`)
- `fetchCandlesBacktest(symbol, tf, limit, signal)` — fetches up to 1000 candles for backtest
- `simulateOutcome(setup, futureCandles)` — walks future candles checking stop/m3/m2/m1 (highest target first); returns `{ result, mfePct, maePct, closePrice? }`. If horizon exhausted without resolution, returns `result='timeout'` with `closePrice` = last candle close
- `calcBacktestPnL(setup, result, leverage, closePrice)` — P&L % calculation; handles `'timeout'` using `closePrice` vs entry for real P&L. **Stop-loss exits incluem 0.05% de slippage fixo** (`+SLIPPAGE=0.0005`) sobre a distância do stop para simular execução realista a mercado
- `runBacktest(signal, minScore, selectedTFs, selectedCoins, selectedLeverage, horizon)` — sliding window orchestrator (WINDOW=200, STEP=10, LIMIT=1000)
- `calcPatternHitRates(trades)` — per-indicator win rate from closed trades (min 3 occurrences, excludes open/timeout trades)
- `buildInsightsHtml(...)` — renders 3 insight sections: pattern hit rate table, LONG/SHORT breakdown, P&L distribution bars
- `renderBacktestResults(trades, periods, rejStats, leverage)` — full results renderer
- **Trade results:** `m1` / `m2` / `m3` (target hit) · `stop` (stop-loss hit) · `timeout` (horizon exhausted, exit at close price) · `open` (never resolved — should not appear with normal/short horizons)
- **Trade object extra fields:** `stopDist` (% entry→stop) · `m1Dist/m2Dist/m3Dist` (% entry→target) · `maePressure` (% of stop distance the price reached, 0–100+; ≥70 = near-miss)
- **Pressure card:** "Pressão nos Stops" shows % of trades with maePressure ≥ 70 and distribution across 4 bands (0–25 / 25–50 / 50–75 / 75+)
- **Table columns:** Data/Hora · Par · Dir · **Stop · M1** (% distances) · Resultado · P&L · MFE/MAE (with pressure % in parentheses)
- **`calcPatternHitRates`:** includes timeouts — timeout with pnl > 0 = win, pnl < 0 = loss
- **Controls:** score mínimo, alavancagem (5x/10x/20x/50x), horizonte (curto/normal/longo), moedas (BTC/ETH/SOL/BNB/XRP/ADA/AVAX, multi-select), timeframes
- **Default coins:** BTC + ETH (pre-checked); other 5 coins opt-in
- **Horizon — future window per TF:**
  - Curto:  5m=60 (5h) · 15m=48 (12h) · 1h=36 (36h) · 4h=21 (3.5d)
  - Normal: 5m=120 (10h) · 15m=96 (24h) · 1h=60 (2.5d) · 4h=42 (7d)  ← padrão
  - Longo:  5m=288 (24h) · 15m=192 (48h) · 1h=120 (5d) · 4h=84 (14d)

### 1. Coin Management
- `initCoins()` — populates the coin selection grid on page load
- `createCoinIcon(symbol)` — builds a coin tile with logo and checkbox
- `addCustomCoin()` — adds a user-specified coin symbol
- `selectAllCoins()` / `deselectAllCoins()` — bulk selection helpers

### 2. API Integration
- `fetchCandles(symbol, interval, limit)` — fetches OHLCV data from Bybit Futures API v5
- `fetchFearGreed()` — fetches Fear & Greed index from alternative.me
- `fetchJSON(url)` — base fetch with per-request 10s timeout and external signal support
- `fetchWithFallback(url, signal)` — iterates through `CORS_PROXIES` on failure; only propagates `AbortError` if `signal.aborted` is true (i.e. user-initiated cancellation), not on internal timeouts

**CORS proxy chain** (in order): direct → corsproxy.io → allorigins → thingproxy

**Per-coin auxiliary fetches** (fetched once per coin before the timeframe loop):
- Funding rate: `GET https://api.bybit.com/v5/market/funding/history?category=linear&symbol=...&limit=1`
- Open interest: `GET https://api.bybit.com/v5/market/open-interest?category=linear&symbol=...&intervalTime=1h&limit=24`

Both are optional — if they fail, `null` is passed to `analyzeCandles` and the scan continues.

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
| `calcVolumeProfile(candles, bins=50)` | Volume Profile — POC, VAH, VAL |
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
- `_computeScore(indicators, patterns, direction)` — returns 0–100 score
- ADX hard filter: setups with ADX < 18 are rejected (sideways market filter)
- MTF confluence bonus: +6–12 points if same direction on 2+ timeframes
- MTF conflict penalty: -20 points if lower TF opposes highest TF
- **Combo penalty — short squeeze risk:** when score < 0 AND RSI < 40 AND F&G < 25 → `score += 20` (reduces SHORT magnitude). Symmetric for LONGs (RSI > 60 AND F&G > 75 → `score -= 20`). Displayed as `"RISCO: ... — Short squeeze iminente"` in reasons.
- **CVD:** `calcCVD(candles, period=30)` — Cumulative Volume Delta; `±7` pts for rising/falling trend
- **BOS/CHoCH:** `detectBOSCHoCH(candles, lookback=60)` — Break of Structure (+12/-12) and Change of Character (+22/-22)
- **Volume Profile:** `calcVolumeProfile(candles, bins=50)` — distributes volume by price level (50 bins). Returns `{ poc, vah, val, rangeHigh, rangeLow }`. Scoring: price above POC `+6` / below POC `-6`; price below VAL adds `+5` (potential mean-reversion); price above VAH adds `-5`. Guard uses `!= null` (handles both `null` and `undefined`). Displayed as a visual bar in the modal (Value Area band + POC line + current price marker). Backtest: VP reasons appear automatically in `calcPatternHitRates` hit-rate table via the `reasons` array — no extra code needed.

### 6. Analysis Pipeline
- `analyzeCandles(symbol, tf, candles, fg, fundingRate, openInterest, news)` — full analysis for one coin/timeframe
- `runRealAnalysis(signal)` — orchestrates the full scan across all selected coins/timeframes
  - Uses `AbortController` for cancellable scans (user-initiated only — timeouts do not cancel the scan)
  - Fetches funding rate and open interest once per coin before the timeframe loop
  - Deduplicates: shows only the best setup per coin after MTF processing
  - Results sorted by capital return on M3 target

### 7. UI Rendering
- `renderCards(cards)` — displays scan result cards in the grid
- `renderGroupCard(group)` — renders a single result card with MTF badges
- Modal with candlestick chart (lightweight-charts) + indicator breakdown

### 8. Journal System
- Backed by `localStorage` key: `cryptoscanner_journal_v2`
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
  → runRealAnalysis()
      → fetchFearGreed()                          [alternative.me]
      → for each coin:
          → fetchWithFallback(fundingHistory)      [Bybit API v5, optional]
          → fetchWithFallback(openInterest)        [Bybit API v5, optional]
          → for each timeframe:
              → fetchCandles(symbol, interval)     [Bybit API v5]
              → _calcTechIndicators(candles)
              → detectCandlePatterns / detectDivergences / etc.
              → _computeScore(indicators, patterns, direction)
              → analyzeCandles() → setup object
      → MTF confluence/conflict adjustments
      → deduplication (best setup per coin)
      → sort by M3 capital return
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

**Funding Rate (per coin):**
```
GET https://api.bybit.com/v5/market/funding/history
  ?category=linear&symbol=BTCUSDT&limit=1
```

**Open Interest (per coin):**
```
GET https://api.bybit.com/v5/market/open-interest
  ?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=24
```

The application handles CORS automatically via the proxy fallback chain. No API keys are required.

> **Note:** Do not add third-party news APIs (e.g. CryptoPanic) without a valid API key. These endpoints fail for all proxies and cause N×4 sequential timeouts per scan, making the scanner extremely slow.

---

## Default Coins (39 total)

BTC, ETH, SOL, BNB, ADA, AVAX, DOT, LINK, MATIC, UNI, ATOM, LTC, FIL, NEAR, APT, ARB, OP, INJ, WLD, SEI, TIA, BLUR, 1000PEPE, DOGE, XRP, ETC, AAVE, MKR, SNX, CRV, LDO, RPL, GMX, PENDLE, WIF, BONK, JTO, PYTH, STRK

> **Note:** PEPE trades as `1000PEPEUSDT` on Bybit's linear perpetuals market.

---

## Persistence

All trade journal data is stored client-side in `localStorage`:

```javascript
// Key
'cryptoscanner_journal_v2'

// Entry shape
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
1. Edit `painel.html` directly (the only source file).
2. Refresh the browser to see changes.
3. No compilation or build step needed.

### Testing
Automated unit tests via Vitest (251 tests across 8 files):
```bash
npx vitest run
```

Manual testing steps:
- Open `painel.html` in a browser
- Select a few coins and click "Escanear" (Scan)
- Verify cards render with correct score/direction badges
- Open the modal for a card and verify chart and indicators display
- Save a setup to journal and verify it appears in the Journal tab

### Git workflow
```bash
git add painel-core.js painel.html
git commit -m "descriptive message"
git push -u origin <branch>
```

> **Note:** `painel-core.js` and `painel.html` share the same core logic (analysis engine, scoring, indicators). Changes to one **must be mirrored** in the other.

---

## Important Constraints

1. **Single-file constraint** — Keep all code in `painel.html`. Do not split into separate `.js` or `.css` files unless explicitly requested.
2. **No build tooling** — Do not introduce webpack, vite, npm, or any build system unless explicitly requested.
3. **Vanilla JS only** — Do not add frameworks (React, Vue, etc.) unless explicitly requested.
4. **Portuguese UI** — All user-facing text should remain in Portuguese (pt-BR).
5. **localStorage key** — The journal key `cryptoscanner_journal_v2` must not be renamed; changing it would break existing saved data for users.
6. **Bybit symbol format** — PEPE must stay as `1000PEPEUSDT` (not `PEPEUSDT`).
7. **Fee constants** — `BYBIT_TAKER` and `ROUND_TRIP_FEE` reflect real Bybit fee rates; do not change without verification.

---

## Common Pitfalls

- **CORS errors:** The app uses a proxy chain — if all proxies fail, the app shows mock data with a demo banner. This is expected behavior.
- **Symbol mismatches:** Bybit uses `1000PEPEUSDT`, `1000BONKUSDT`, etc. for low-price tokens. Verify against Bybit API when adding new coins.
- **ADX filter:** Setups with ADX < 18 are silently dropped. If a coin never appears in results, it likely has a flat ADX.
- **MTF deduplication:** After scanning, only the highest-scored setup per coin is shown. Lower-scored timeframes for the same coin are intentionally hidden.
- **Journal version key:** The `_v2` suffix was introduced after a schema change. If the data shape changes again, bump to `_v3` and add a migration function.
- **AbortError vs timeout:** `fetchJSON` uses a local `AbortController` for per-request timeouts (10s). This produces an `AbortError` identical to a user-cancellation abort. **Always check `signal?.aborted` before re-throwing** in catch blocks — otherwise a single timed-out request will cancel the entire scan. The pattern is: `if (e.name === 'AbortError' && signal?.aborted) throw e;`
- **Stop mínimo por timeframe:** `analyzeCandles` rejeita setups onde o stop final (após ajuste de liquidação) for menor que `TF_MIN_STOP[tf]` (5m:0.8%, 15m:1.2%, 30m:1.5%, 1h:2%, 4h:3%, 1D:5%). Isso previne stop hunts em alavancagens altas (ex: 50x em 15M produz stop de 0.75% — inviável).
- **Combo short squeeze / bull trap:** O scoring penaliza combinações de RSI oversold + F&G Medo Extremo em setups SHORT (e vice-versa para LONGs). Essa combinação sozinha não aparece nos sinais individuais com força suficiente mas é um forte indicador de reversão de curto prazo.
- **painel-core.js vs painel.html:** Os dois arquivos contêm o mesmo motor de análise. Qualquer mudança no motor (scoring, indicadores, filtros) deve ser aplicada nos dois arquivos.
- **Filtro de liquidez — extrapolação:** `analyzeCandles` usa os candles disponíveis para extrapolar volume diário (`(totalVol / sampleLen) * candlesPerDay`), sem exigir dias completos. Corrige bug onde backtest de 5m com WINDOW=200 (< 288 candles/dia) pulava o filtro inteiro (`daysToCheck=0`).
- **Fetches sequenciais em `runRealAnalysis`:** O scanner ao vivo usa `await` sequencial (não `Promise.all`) intencionalmente para não esgotar os proxies CORS por rate limit. Não converter para concorrência.
