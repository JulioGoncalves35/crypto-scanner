# CLAUDE.md — Crypto Scanner

> **Instrução para o assistente:** Ao final de qualquer implementação que altere comportamentos, funções, filtros ou arquitetura, **atualize este arquivo** antes do commit final.

**Crypto Scanner** — dashboard de futuros de criptomoedas (vanilla HTML/CSS/JS). Escaneia coins em múltiplos timeframes, aplica indicadores técnicos, pontua setups e calcula R:R. UI em **pt-BR**.

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
│   ├── stop-validator.js ← Pure helper: isStopTighter (direction-aware)
│   └── routes/
│       ├── trades.js       ← GET /api/trades, /api/trades/active, POST /open, /:id/close, /:id/tighten-stop
│       ├── account.js      ← GET/POST /api/account
│       ├── scan.js         ← POST /api/scan/preview, /api/scan/manual
│       └── reflections.js  ← POST/GET /api/reflections (Leader memory)
├── data/
│   └── scanner.db       ← SQLite database (gitignored)
├── .claude/
│   └── agents/
│       ├── news-hunter.md
│       ├── pattern-validator.md
│       └── leader.md
└── tests/               ← Vitest test suite (351 tests)
```

**Frontend (`painel.html`) funciona standalone** sem backend. **Backend requer Node.js 22.5+**: `npm run server`

---

## Architecture

```javascript
const state = {
  mode: 'day',    // 'scalp' | 'day' | 'swing' | 'both'
  rr: 'fib',     // 'fib' | 'max' | '2' | '3'
  score: '70',   // minimum score filter
  dir: 'both',   // 'both' | 'buy' | 'sell'
  coins: Set,
  cards: [],
  leverage: 10,
};

const BYBIT_TAKER    = 0.00055;
const ROUND_TRIP_FEE = 0.0011;

const TIMEFRAMES_BY_MODE = {
  scalp: ['5m', '15m', '30m'],
  day:   ['5m', '15m', '1h'],
  swing: ['4h', '1D'],
  both:  ['5m', '15m', '30m', '1h', '4h', '1D']
};
```

**Data flow:**
```
runRealAnalysis() → fetchFearGreed() → per coin: fetchFunding + fetchOI
  → per timeframe: fetchCandles → _calcTechIndicators → detect* → _computeScore → analyzeCandles()
  → MTF scoring → deduplication (best per coin) → sort by M3 return → renderCards()
```

---

## Scoring Engine (`_computeScore`)

- **ADX hard filter (TF-aware):** `TF_ADX_MIN = { '5m': 23, '15m': 22, '30m': 20, '1h': 18, '4h': 18, '1D': 18 }`
- **ADX scoring:** >30 → ±10 · >25 → ±6 · 20–25 → -3 · <20 → -8
- **MTF:** confluence bonus +6–12 (2+ TFs same dir) · conflict penalty -20 (lower TF opposes highest TF)
- **BOS/CHoCH:** Break of Structure ±12 · Change of Character ±22
- **Squeeze Momentum:** released ±15 · post-squeeze momentum ±6
- **Order Block:** ±14 quando price dentro da zona (99%–101%)
- **Trendline Break:** LTB break (bullish) +10 · LTA break (bearish) -10
- **Ichimoku:** capped ±20 (price above/below cloud ±10, TK cross ±8, Chikou ±4) — requer ≥78 candles
- **Anchored VWAP:** >0.2% above → +8 · >0.2% below → -8
- **Volume Profile:** above POC +6 · below POC -6 · below VAL +5 · above VAH -5
- **CVD:** ±7 por trend crescente/decrescente
- **Combo penalty:** RSI oversold + F&G <25 em SHORT → `score += 20` (short squeeze risk). Simétrico para LONG.
- **Confluência multi-categoria:** 2 categorias alinhadas ±5 · 3 → ±10 · 4 → ±15. Só aplica quando `score !== 0`.

**Stop mínimo por TF:** `TF_MIN_STOP = { 5m: 0.8%, 15m: 1.2%, 30m: 1.5%, 1h: 2%, 4h: 3%, 1D: 5% }`

**Nível de confiança (exibição apenas):** score 60–72 → NV1 · 73–84 → NV2 · 85+ → NV3

---

## Backend Server

Roda em `http://localhost:3001`. Cron de **15min** escaneia todos os 41 coins — desde 2026-04-29 **NÃO abre trades automaticamente**, apenas acumula candidatos em `scan_log.candidates_json`. Trade opening é exclusivo de `POST /api/trades/open` (Leader).

**Três filtros antes de abrir qualquer posição:**
1. `score >= min_score` (default 85 — WR=0% para 70-79, WR=9% para 80-84)
2. BTC EMA200 4h: BTC < EMA200 → bear → bloqueia LONGs; BTC > EMA200 → bull → bloqueia SHORTs. Falha retorna `null` (fail-open)
3. `MAX_STOP_RISK_MULTIPLIER = 50`: rejeita se `stop_pct × leverage > 50`

**Exit strategy (33/33/34):** fecha 33% no M1 (move stop para entry), 33% no M2, 34% no M3.

**Trade statuses:** `active` → `m1` → `m2` → `m3` | `stop` | `stopped_at_entry` | `expired` | `manual`

**Price checker:** a cada 5min busca os últimos 20 candles de 1m; agrega low/high da janela desde `last_checked_at`. Passa: adverse wick (stop) primeiro, depois favorable wick (target). Quando ambos tocados na mesma janela, stop ganha.

**SQLite tables:** `trades`, `paper_account`, `scan_log` (com `candidates_json`), `trade_reflections` (`trade_id` FK, `reflection_text`, `lesson_tag`, `created_at`)

**REST API:**
| Endpoint | Descrição |
|---|---|
| `GET /api/health` | server status |
| `GET /api/account` | capital + stats |
| `POST /api/account/setup` | update settings (não altera `current_capital`) |
| `POST /api/account/reset` | `{ mode: 'capital' }` zera capital · `{ mode: 'full' }` apaga trades + scan_log |
| `GET /api/trades` · `/api/trades/active` | trade list |
| `POST /api/trades/open` | Leader-driven entry; 409 quando bloqueado por max_positions/capital/risk cap |
| `POST /api/trades/:id/close` | fecha manualmente ao preço atual |
| `POST /api/trades/:id/tighten-stop` | move stop para mais perto (direction-aware); 400 se frouxar, 409 se inativo |
| `POST /api/scan/preview` | scan sem abrir trades — entry canônico do Leader |
| `POST /api/scan/manual` | alias de `/preview` (usado pelo painel.html) |
| `GET /api/scan/status` | scan em execução? |
| `POST /api/reflections` | Leader grava reflexão pós-trade |
| `GET /api/reflections?limit=N` | Leader lê reflexões recentes (default 20, max 200) |

---

## Agent Council

**Pipeline:** Cron escaneia → candidatos em `scan_log` → **sem abertura**. Usuário invoca Leader → `POST /api/scan/preview` → gate → `POST /api/trades/open`.

- **`leader.md`** (model: sonnet) — orquestrador. 3 fases: (1) reflexões pós-trade, (2) review de ativos (HOLD/EXIT/TIGHTEN como curl manual), (3) avaliação de candidatos via gate `pattern-validator → news-hunter`. Hard guardrails: NÃO aprova 5m/30m, NÃO ultrapassa max_positions=5, NÃO abre sem ambos sub-agentes completos, NÃO passa `coin` com sufixo USDT.
- **`pattern-validator.md`** (model: haiku) — auditoria técnica; sempre termina com `[SCORE RECALIBRATION]`. Veredicto: VALID / SUSPECT / REJECT.
- **`news-hunter.md`** (model: haiku) — macro/notícias; Verification Section obrigatória (`[VERIFIED]` / `[MEDIUM CONFIDENCE]` / `[UNVERIFIED]`).

---

## Important Constraints

1. **Single-file** — todo código em `painel.html`. Não dividir em arquivos separados.
2. **No build tooling** — sem webpack, vite, npm build system.
3. **Vanilla JS only** — sem React, Vue, etc.
4. **Portuguese UI** — todo texto de usuário em pt-BR.
5. **localStorage key** — `cryptoscanner_journal_v2` não pode ser renomeada.
6. **Bybit symbol format** — PEPE = `1000PEPEUSDT`, não `PEPEUSDT`.
7. **Fee constants** — não alterar sem verificação na Bybit.
8. **painel-core.js ↔ painel.html** — toda mudança no motor de análise deve ser espelhada nos dois arquivos.

---

## Common Pitfalls

- **AbortError vs timeout:** `fetchJSON` usa `AbortController` local para timeout de 10s — idêntico ao AbortError de cancelamento do usuário. Sempre verificar `signal?.aborted` antes de re-throw: `if (e.name === 'AbortError' && signal?.aborted) throw e;`
- **Fetches sequenciais em `runRealAnalysis`:** usa `await` sequencial (não `Promise.all`) para não esgotar os proxies CORS por rate limit. Não converter para concorrência.
- **painel-core.js vs painel.html — diferenças intencionais de API:**
  - `analyzeCandles`: core param 7 = `options={score,leverage,rr}`, param 8 = `news=[]`; frontend param 7 = `news=[]`, param 8 = `scoreThreshold=null`
  - `getFibSet`/`calcMetas`: core aceita `rrMode` como parâmetro; frontend lê `state.rr` diretamente
  - MTF scoring: core tem `applyMTFScoring()` exportada; frontend tem lógica inline em `runRealAnalysis()`
- **OBV — nunca tornar direction-aware:** OBV em ascensão adiciona +6 independente de direção, filtrando implicitamente SHORTs fracos. Neutralizar o OBV para SHORTs permite 30+ trades de baixa qualidade (39% WR) e piora P&L de +5% para -2%.
- **`runScan` não abre trades (Leader era):** Não reintroduzir `openPosition` no scanner — abertura é exclusiva de `POST /api/trades/open`.
- **`paper-trader` appenda USDT:** `openPosition` faz `coin.replace(/USDT$/i,'') + USDT`. Passar `"XRPUSDT"` gera `"XRPUSDTUSDT"`. Sempre passar símbolo base (`"XRP"`, `"1000PEPE"`).
- **Gate do Leader é obrigatório:** nunca chamar `/api/trades/open` sem ambos os sub-agentes completados com sucesso.
- **Tighten-stop direction-aware:** BUY: novo stop precisa ser maior; SELL: menor. Igualdade = false. Usa `isStopTighter` de `backend/stop-validator.js`.
- **min_score padrão = 85:** `db.js` migra automaticamente contas com `min_score = 70` para 85 na inicialização. Contas com outros valores não são tocadas.
- **`setupAccount` não altera `current_capital`:** para zerar capital use `resetAccount`. Fórmula de recuperação: `initial_capital + total_pnl_closed - capital_in_use`.
- **Servidor Node em Windows:** `npm run server` não propaga sinais. Para reiniciar: `Get-NetTCPConnection -LocalPort 3001 -State Listen | Stop-Process -Id $_.OwningProcess -Force` via PowerShell.
- **Journal — IDs mistos:** backend trades têm IDs string (`"bk-..."`) e manuais têm IDs numéricos. Usar `String(x.id) === String(id)` em comparações; citar o id em event handlers inline: `'${e.id}'`.
- **Candle in-progress drop:** `fetchCandles` remove o último candle se `time + TF_INTERVAL_MS[tf] > Date.now()`. Edge case: array vazio se o único candle for in-progress.
- **Ichimoku requer ≥78 candles:** retorna null silenciosamente com menos.
- **calcAnchoredVWAP retorna null sem swings:** dados monotônicos não têm swing points.
- **Confluência não aplica em score=0:** guard `if (score !== 0)` é intencional.
- **Price-checker — cascading de targets:** m1→m2→m3 em uma única janela fica para o próximo poll (limitação do `processPriceUpdate`).
- **Reflexões são append-only:** não há endpoint de update/delete em `trade_reflections`. FK em `trade_id` — reflexões com trade inexistente são rejeitadas.
- **Symbol mismatches:** Bybit usa `1000PEPEUSDT`, `1000BONKUSDT` etc. Verificar na API ao adicionar coins.

---

## Development

```bash
# Frontend only
open painel.html   # ou python3 -m http.server 8080

# Backend
npm run server

# Tests
npx vitest run
```

**Git:** sempre adicionar `painel-core.js painel.html` juntos quando o motor mudar.

---

## Default Coins (41)

BTC, ETH, SOL, BNB, XRP, ADA, AVAX, DOGE, DOT, LINK, POL, LTC, ATOM, UNI,
INJ, ARB, WLD, SEI, TIA, SUI, APT, OP, IMX, JUP, ONDO, STRK, BLUR, MANTA,
ORDI, BOME, WIF, ENA, ETHFI, PENDLE, 1000PEPE, HBAR, NEAR, RENDER, TRX, FIL, HYPE

> PEPE = `1000PEPEUSDT` · POL = MATIC renomeado · HYPE = Hyperliquid (adicionado Mar/2026)
