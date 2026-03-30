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
├── painel.html          ← Frontend SPA (~4,034 lines): HTML + CSS + JS (standalone)
├── painel-core.js       ← Pure analysis engine (shared by browser + backend)
├── backend/
│   ├── server.js        ← Express server (port 3001), cron jobs
│   ├── db.js            ← SQLite via node:sqlite (Node 22.5+ built-in)
│   ├── scanner.js       ← Auto-scan engine (imports painel-core.js)
│   ├── paper-trader.js  ← Capital allocation + position state machine
│   ├── price-checker.js ← Cron: checks stop/targets every 5 min
│   └── routes/
│       ├── trades.js    ← GET /api/trades, /api/trades/active
│       ├── account.js   ← GET/POST /api/account
│       └── scan.js      ← POST /api/scan/manual
├── data/
│   └── scanner.db       ← SQLite database (gitignored)
└── tests/               ← Vitest test suite (268 tests)
```

**The frontend (`painel.html`) works fully standalone** even when the backend is offline. The backend adds automated scanning, paper trading, and persistent history.

**Backend requires Node.js 22.5+** (uses built-in `node:sqlite`). Start with: `npm run server`

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

### 9. Backend Server

**Location:** `backend/` folder. Runs on `http://localhost:3001`.

**Auto-scan:** Every 15 minutes via `node-cron`. Scans all 39 default coins in "both" mode (all TFs). Skips coins with an active trade. Applies MTF confluence identically to the frontend.

**Paper trading:** Opens positions when `score >= min_score` AND `active_positions < max_positions` AND `current_capital >= alloc_pct%`. Default: 2% per trade, max 10 positions.

**Exit strategy (33/33/34):** Closes 33% at M1 (moves stop to entry), 33% at M2, 34% at M3. Also handles `expired` (horizon exhausted) and `stopped_at_entry` (stop hit after M1 at breakeven).

**Price checker:** Every 5 minutes, fetches current price via `GET /v5/market/tickers` and runs state machine for each active trade.

**Trade statuses:** `active` → `m1` → `m2` → `m3` | `stop` | `stopped_at_entry` | `expired` | `manual`

**SQLite tables:** `trades`, `paper_account`, `scan_log`. Uses Node.js built-in `node:sqlite` (no compilation needed).

**REST API endpoints:**
- `GET /api/health` — server status
- `GET /api/account` — capital + stats
- `POST /api/account/setup` — configure account
- `GET /api/trades`, `/api/trades/active` — trade list
- `POST /api/trades/:id/close` — close active trade manually at current Bybit price
- `POST /api/scan/manual` — trigger immediate scan
- `GET /api/scan/status` — scan running?

**painel.html integration:** Checks backend on load with 2s timeout. Shows "Backend" tab with online/offline indicator, account stats, active trades table, history table, manual scan button, and account config form. Falls back gracefully when offline.

**Active trades table features:**
- "📊" button per row: fetches live candles and renders a collapsible lightweight-charts candlestick chart with horizontal price lines (Entrada/Stop/M1/M2/M3). Multiple charts can be open simultaneously. Chart row uses class `bk-chart-row`.
- "✕ Fechar" button per row: confirms, POSTs to `/api/trades/:id/close`, shows P&L, refreshes table.
- Row click still expands signals (class `bk-sig-row`). Signal row inserts after chart-row if one is open.
- "↺ Atualizar" button shows loading state and "Atualizado às HH:MM" timestamp on completion.
- Chart instances stored in `_bkChartInstances` map; destroyed on row collapse to avoid memory leaks.

**Journal — backend entries pitfall:**
- Backend trades saved to journal have string IDs like `"bk-1712345678900-BTCUSDT-15m"`, while manual saves use numeric timestamp IDs (`Date.now()`).
- All inline event handlers in `renderEntryHTML` (updateResult, deleteEntry, checkSetupNow, updateNotes) must quote the id: `'${e.id}'` — without quotes, string IDs produce invalid JS.
- All `find(x => x.id === id)` / `filter(x => x.id !== id)` comparisons use `String(x.id) === String(id)` to handle both types correctly.

### 10. Backtest System — REMOVED (replaced by backend live history)

The backtest tab and all JS functions were removed (~650 lines). The backend's accumulated trade history serves as real-data replacement. The following functions no longer exist in `painel.html`:

- **Location:** `painel.html` only (not in `painel-core.js`) — REMOVED
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
| `calcAnchoredVWAP(candles, lookback=100)` | VWAP anchored to highest-volume swing point |
| `calcIchimoku(candles)` | Ichimoku Cloud (Tenkan/Kijun/Senkou A+B/Chikou) |
| `calcSqueezeMomentum(candles)` | LazyBear Squeeze Momentum (BB inside Keltner) |
| `_calcTechIndicators(candles)` | Orchestrates all indicator calculations |

### 4. Pattern Detection
| Function | Pattern |
|---|---|
| `detectCandlePatterns(candles)` | Hammer, Engulfing, Doji, Morning/Evening Star, Marubozu, Three Inside Up/Down, Três Soldados/Corvos, etc. |
| `detectDivergences(candles, rsi)` | Bullish/Bearish RSI divergences |
| `detectEMACross(ema9, ema21)` | Golden Cross / Death Cross |
| `detectMarketStructure(candles)` | Higher highs/lows vs lower highs/lows |
| `detectTriangle(candles)` | Ascending/Descending/Symmetrical triangles |
| `detectDoubleTopBottom(candles)` | Double Top / Double Bottom patterns |
| `detectOrderBlocks(candles, lookback=100)` | Order Block — last opposing candle before a BOS event |

**New candle patterns (added to `detectCandlePatterns`):**
| Pattern | Score | Condition |
|---|---|---|
| Marubozu Altista ↑ | +12 | Bull candle body/range ≥ 95% (no wicks) |
| Marubozu Baixista ↓ | -12 | Bear candle body/range ≥ 95% |
| Three Inside Up ↑ | +14 | Large bear → harami (body 35–50% of pp) → bull closing above pp midpoint |
| Three Inside Down ↓ | -14 | Mirror of Three Inside Up |
| Três Soldados Brancos ↑ | +18 | 3 consecutive bull candles, each opening inside prior body, body/range ≥ 60%, closing higher |
| Três Corvos Negros ↓ | -18 | Mirror of Três Soldados Brancos |

### 5. Scoring Engine
- `_computeScore(indicators, patterns, direction)` — returns 0–100 score
- ADX hard filter (TF-aware): `TF_ADX_MIN = { '5m': 23, '15m': 22, '30m': 20, '1h': 18, '4h': 18, '1D': 18 }` — scalp TFs need stronger trend confirmation
- **ADX scoring (4 tiers):** >30 → ±10 (muito forte), >25 → ±6 (forte), 20–25 → -3 (fraca), <20 → -8 (lateral). ADX 20–25 now carries a mild penalty instead of being neutral.
- MTF confluence bonus: +6–12 points if same direction on 2+ timeframes
- MTF conflict penalty: -20 points if lower TF opposes highest TF
- **Combo penalty — short squeeze risk:** when score < 0 AND RSI < 40 AND F&G < 25 → `score += 20` (reduces SHORT magnitude). Symmetric for LONGs (RSI > 60 AND F&G > 75 → `score -= 20`). Displayed as `"RISCO: ... — Short squeeze iminente"` in reasons.
- **CVD:** `calcCVD(candles, period=30)` — Cumulative Volume Delta; `±7` pts for rising/falling trend
- **BOS/CHoCH:** `detectBOSCHoCH(candles, lookback=60)` — Break of Structure (+12/-12) and Change of Character (+22/-22)
- **Volume Profile:** `calcVolumeProfile(candles, bins=50)` — distributes volume by price level (50 bins). Returns `{ poc, vah, val, rangeHigh, rangeLow }`. Scoring: price above POC `+6` / below POC `-6`; price below VAL adds `+5` (potential mean-reversion); price above VAH adds `-5`. Guard uses `!= null` (handles both `null` and `undefined`). Displayed as a visual bar in the modal (Value Area band + POC line + current price marker). Backtest: VP reasons appear automatically in `calcPatternHitRates` hit-rate table via the `reasons` array — no extra code needed.
- **Ichimoku Cloud:** `calcIchimoku(candles)` — requires ≥78 candles. Returns null otherwise. Scoring (capped at ±20 total): price above/below cloud ±10, TK cross ±8, Chikou confirmation ±4. Displays neutral (0) when price is inside the cloud.
- **Anchored VWAP:** `calcAnchoredVWAP(candles, lookback=100)` — anchored to highest-volume swing point within lookback. Requires swing points to exist (returns null for monotonic/flat data). Scoring: price >0.2% above → +8, >0.2% below → -8, within 0.2% → 0.
- **Squeeze Momentum:** `calcSqueezeMomentum(candles)` — LazyBear style. BB (20,2.0) inside Keltner (EMA20 ± 1.5×ATR20) = squeeze active. Scoring: `releasedBull/releasedBear` ±15, post-squeeze rising/falling momentum ±6, active squeeze = 0 (display only).
- **Order Block:** `detectOrderBlocks(candles, lookback=100)` — last opposing candle before a BOS event. Scoring: ±14 only when price is inside the OB zone (99%–101% of ob range). Returns null when no BOS found. Does not overlap with BOS/CHoCH scoring (OB = reteste da zona, BOS = evento do break).
- **Confluência multi-categoria:** Applied at the end of `_computeScore` (before combo penalties). Checks 4 categories: momentum (RSI), trend (EMA200/mktStruct/Ichimoku), volume (OBV/CVD), pattern (candle patterns/divergences/Squeeze). Awards: 2 aligned → ±5, 3 aligned → ±10, 4 aligned → ±15. Guard: only fires when `score !== 0`.

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
- **ADX filter (TF-aware):** The ADX hard filter varies by timeframe: 5m=23, 15m=22, 30m=20, 1h/4h/1D=18. Scalp TFs require a stronger trend to avoid setups in ranging markets. If a coin never appears in scalp results, it likely has ADX below these thresholds.
- **MTF deduplication:** After scanning, only the highest-scored setup per coin is shown. Lower-scored timeframes for the same coin are intentionally hidden.
- **Journal version key:** The `_v2` suffix was introduced after a schema change. If the data shape changes again, bump to `_v3` and add a migration function.
- **AbortError vs timeout:** `fetchJSON` uses a local `AbortController` for per-request timeouts (10s). This produces an `AbortError` identical to a user-cancellation abort. **Always check `signal?.aborted` before re-throwing** in catch blocks — otherwise a single timed-out request will cancel the entire scan. The pattern is: `if (e.name === 'AbortError' && signal?.aborted) throw e;`
- **Stop mínimo por timeframe:** `analyzeCandles` rejeita setups onde o stop final (após ajuste de liquidação) for menor que `TF_MIN_STOP[tf]` (5m:0.8%, 15m:1.2%, 30m:1.5%, 1h:2%, 4h:3%, 1D:5%). Isso previne stop hunts em alavancagens altas (ex: 50x em 15M produz stop de 0.75% — inviável).
- **Combo short squeeze / bull trap:** O scoring penaliza combinações de RSI oversold + F&G Medo Extremo em setups SHORT (e vice-versa para LONGs). Essa combinação sozinha não aparece nos sinais individuais com força suficiente mas é um forte indicador de reversão de curto prazo.
- **painel-core.js vs painel.html:** Os dois arquivos contêm o mesmo motor de análise. Qualquer mudança no motor (scoring, indicadores, filtros) deve ser aplicada nos dois arquivos. **Diferenças intencionais de API** (não são bugs):
  - `analyzeCandles`: em `painel-core.js` o param 7 é `options={score,leverage,rr}` e param 8 é `news=[]`; em `painel.html` o param 7 é `news=[]` e param 8 é `scoreThreshold=null`. O frontend usa `state.*` (global), o core é stateless (options object).
  - `getFibSet`/`calcMetas`: em `painel-core.js` aceitam `rrMode` como parâmetro; em `painel.html` leem `state.rr` diretamente.
  - MTF scoring: em `painel-core.js` é a função exportada `applyMTFScoring()`; em `painel.html` é lógica inline em `runRealAnalysis()` — **lógica idêntica**, apenas localização diferente.
  - Soft pass threshold: ambos usam `parseInt(score) - 15` (frontend: `state.score`, backend: `min_score`).
- **Filtro de liquidez — extrapolação:** `analyzeCandles` usa os candles disponíveis para extrapolar volume diário (`(totalVol / sampleLen) * candlesPerDay`), sem exigir dias completos. Corrige bug onde backtest de 5m com WINDOW=200 (< 288 candles/dia) pulava o filtro inteiro (`daysToCheck=0`).
- **Fetches sequenciais em `runRealAnalysis`:** O scanner ao vivo usa `await` sequencial (não `Promise.all`) intencionalmente para não esgotar os proxies CORS por rate limit. Não converter para concorrência.
- **Aba Backtest removida:** O sistema de backtest foi completamente removido do `painel.html`. O histórico real acumulado pelo backend (SQLite) substitui esse papel.
- **OBV age como filtro implícito de SHORTs fracos:** OBV em ascensão adiciona +6 ao score independente de direção. Em setups SHORT (score < 0), esse +6 reduz a magnitude do score — SHORTs com OBV contraditório perdem força e podem não passar o threshold de score mínimo. **Nunca tornar o OBV direction-aware/neutro** — testes mostraram que neutralizar o OBV para SHORTs quebra esse mecanismo de filtragem, permitindo 30+ trades extras de baixa qualidade (39% WR) e piorando o P&L de +5% para -2%.
- **Ichimoku mínimo 78 candles:** `calcIchimoku` retorna null silenciosamente para menos de 78 candles (52 período + 26 shift). Em timeframes de 4h/1D o limite de 200 candles é suficiente. Em 5m/15m com `limit=200` também. Não reduzir o lookback.
- **calcAnchoredVWAP retorna null sem swings:** A função depende de swing highs/lows com ±2 vizinhos. Dados monotônicos ou planos (trending fixtures em testes) não têm swing points — a função retorna null. Testes devem usar candles com picos/vales explícitos.
- **Order Block vs BOS/CHoCH — sem sobreposição:** `detectOrderBlocks` pontua o reteste da zona de origem do BOS. `detectBOSCHoCH` pontua o próprio evento de break. São fases distintas e não há double-counting.
- **Confluência — não aplica em score=0:** O bônus de confluência usa `if (score !== 0)` para evitar computar direção em score perfeitamente neutro. Isso é intencional.
- **Three Inside Up/Down vs Morning/Evening Star:** Ambos usam `ppBear + harami + c confirmação`. Morning Star requer `pBody < ppBody * 0.35`; Three Inside Up requer `pBody < ppBody * 0.5`. Para candles com pBody entre 35%–50% de ppBody, apenas Three Inside Up é ativado. Abaixo de 35%, **ambos** podem ser ativados simultaneamente — porém Morning Star (score +18) é "strong" (≥15) e suprime Three Inside Up (+14) via filtro de força.
