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
├── backtest/            ← Walk-forward backtest em Python (independente do Node)
│   ├── run.py           ← Entry point: `python run.py [--quick] [--coins ...] [--tfs ...]`
│   ├── quick_test.py    ← Teste rápido: BTC+ETH+SOL 1h, 2 meses
│   ├── requirements.txt ← vectorbt, ccxt, pandas, numpy
│   └── src/
│       ├── fetcher.py   ← Download + cache CSV via ccxt (Bybit)
│       ├── indicators.py ← Port fiel do painel-core.js (Python)
│       ├── scorer.py    ← Port de _computeScore + analyzeCandles (Python)
│       ├── engine.py    ← Walk-forward engine (train 180d / val 60d / step 60d)
│       └── report.py    ← CSV de trades + summary go/no-go
└── tests/               ← Vitest test suite (354 tests)
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

## Agents v0.2 — Free Council (Python)

**Localização:** `agents-v2/` (dir Python isolado, não toca no Council Claude v0.1).

**Stack (2026-05-11):** LangGraph + **Cerebras Qwen3 235B** (primary technical/sentiment, ~14.4k TPM free) + **Groq Llama 3.3 70B** (primary bull/bear, 100k TPD free) + **Mistral Large** (primary trader + risk_reviewer, ~1B tokens/mes free) + Gemini 2.5 Flash (primary news, 20 RPD) + OpenRouter Qwen3-Next (fallback geral). Cadencia alvo: **1 run a cada 2 horas** via Windows Task Scheduler (`agents-v2/scripts/run_council_scheduled.ps1`). Pre-filter no `run_council.py` descarta TFs 5m/15m/30m e candidatos com score < 88 antes do LLM.

**6 agentes + 1 reviewer:**
- `technical` (Cerebras Qwen3 235B, fallback Groq) — re-interpreta indicadores do scanner
- `sentiment` (Cerebras Qwen3 235B, fallback Groq) — F&G, funding, OI; flags de crowded trade
- `news`      (Gemini Flash, fallback OpenRouter) — Verification Section obrigatória; pode hard-block
- `bull`      (Groq Llama 70B, fallback Cerebras) — case pró-trade
- `bear`      (Groq Llama 70B, fallback Cerebras) — sempre roda, case anti-trade
- `trader`    (Mistral Large, fallback Groq) — decisão final OPEN/SKIP/OPEN_REDUCED + payload pronto
- `risk_reviewer` (Mistral Large, fallback Groq) — roda manualmente ou 1×/hora, HOLD/EXIT/TIGHTEN_STOP. Migrado de OpenRouter em 2026-05-11 (429s excessivos)

**Guardrails determinísticos no `trader.py` (antes do LLM):**
- timeframe ∈ {5m, 30m} → SKIP
- news.hard_block → SKIP
- bear.expected_rr > bull.expected_rr → SKIP
- technical.tf_alignment == "conflicting" → SKIP

**Tabela nova:** `agent_decisions` (em `data/scanner.db`). Migration espelhada em `backend/db.js`.

**Como rodar:**
```bash
cd agents-v2 && python run_council.py --dry-run
cd agents-v2 && python run_risk_review.py --dry-run
cd agents-v2 && python run_backtest_replay.py --since 2026-04-15
```

**Pitfalls:**
- Free tier Gemini usa prompts para treinamento. Não enviar dados sensíveis.
- **Gemini Free Tier real (2026-05): Pro = 0 RPD, Flash = 20 RPD** — comentários antigos mencionando 1500 RPD / 50 RPD estavam errados. `llm_client.ROUTES` usa Groq como primary em quase tudo; Gemini Flash só sobra como primary do `news` e fallback de `technical`/`sentiment`.
- **OpenRouter exige `openai` SDK** — `_call_openrouter` faz `from openai import OpenAI`. Sem `pip install openai`, fallback OpenRouter falha silenciosamente com `No module named 'openai'`. `requirements.txt` lista mas dependências precisam ser instaladas (`pip install -r requirements.txt`).
- `OpenPayload.coin` strip USDT automático (espelha pitfall do paper-trader).
- Gemini Pro tem ~50 RPD; reservar para o `trader` final apenas.
- LangGraph parallel branching pode requerer simplificação para sequencial em versões antigas.
- **Analistas (technical/sentiment/news/bull/bear) sempre devolvem fallback em erro** — em vez de só appendar em `errors` (que deixava `state["technical"]` ausente e crashava bull/bear/trader com `KeyError`), cada agente devolve um objeto válido neutro/conservador. Bear fallback usa `expected_rr=999.0` para forçar SKIP no guardrail do trader. `tf_alignment` aceita `"unclear"` (Gemini ocasionalmente retorna isso).
- **Backend devolve `stopPct` formatado** (string `"-2.62%"`, não float). `_normalize_candidate` em `agents-v2/src/backend_client.py` normaliza via helper `_pct()` antes do Pydantic — sem isso, todos os candidatos são descartados como `malformed candidate` no `run_council`. Mantém o sinal (negativo para BUY, positivo para SELL).
- Node names do graph não podem colidir com chaves do TypedDict State; em `graph.py` usamos `analyst_*`/`researcher_*`/`decision_trader` como nomes de nó.
- **Cadência sustentável free tier (2026-05-08):** budget alvo ~252k tokens/dia para 12 runs/dia (1×/2h) × 4 candidatos × ~5.3k tokens. Stack distribui carga entre Cerebras (technical/sentiment) + Groq (bull/bear) + Mistral (trader) — nenhum provider sozinho aguenta 24/7. Trader em Mistral Large pelo reasoning superior na síntese final. Quotas free tier mudam sem aviso → revisar trimestralmente.
- **Pre-filter no `run_council.py`:** TFs 5m/15m/30m são descartados antes do LLM (já seriam SKIP determinístico no trader por `BANNED_TFS`). `COUNCIL_MIN_SCORE` default subiu de 80 para 88 (alinhado com WR observado: 80-84 = 9% WR, 88+ = 18% WR).
- **Mistral SDK 2.x não é OpenAI-compatible:** `_call_mistral` em `llm_client.py` usa `from mistralai.client.sdk import Mistral` (top-level `from mistralai import Mistral` falha — `Mistral` mora em `mistralai.client.sdk` no pacote 2.4.5). Chamada é `client.chat.complete()` (sem `s`, sem `chat.completions.create`). Não confundir com OpenRouter/Cerebras que usam `from openai import OpenAI`.
- **Cerebras model ID:** `qwen-3-235b-a22b-instruct-2507` (free tier do Cerebras Cloud em 2026-05-08 não tem Llama 3.3 70B — modelos disponíveis: `qwen-3-235b-a22b-instruct-2507`, `gpt-oss-120b`, `zai-glm-4.7`, `llama3.1-8b`). Compatível com OpenAI SDK via `base_url="https://api.cerebras.ai/v1"`. Verificar lista atual com `client.models.list()` se mudar.
- **`POST /api/trades/open` — campo `dir` não `direction`:** backend `trades.js` valida `setup.dir`. `OpenPayload` tem campo `direction`; `backend_client.py` faz `body["dir"] = body.pop("direction")` antes do POST. Não remover essa linha — sem ela todo trade retorna 400.
- **`paper-trader.js` — m1/m2/m3 aceitam float ou objeto:** `openPosition` usa `setup.m1?.price ?? setup.m1`. Frontend passa `{price, cap, pct}`; agents-v2 passa float puro. Não reverter para `setup.m1.price` — quebra o council com 500.
- **`run_risk_review.py` — coin já vem com USDT do banco:** `trade.coin` é `"ATOMUSDT"`. `_current_price` não deve concatenar `+ USDT` — usa `coin if coin.endswith("USDT") else f"{coin}USDT"`. Antes gerava `ATOMUSDTUSDT` e Bybit retornava price vazio → todos os trades pulados.
- **Logs em arquivo — council e risk_review:** ambos os entry points gravam em `agents-v2/logs/council_YYYY-MM-DD.log` e `risk_review_YYYY-MM-DD.log`. Log duplo: arquivo + console. Não precisa redirecionar `*>>` manualmente.
- **Gemini RPD counter:** `llm_client.py` incrementa `agents-v2/logs/gemini_rpd.json` a cada chamada bem-sucedida ao `gemini-flash`. Log: `[gemini-rpd] today=N/20 remaining=M`. WARNING automático quando remaining ≤ 5.
- **Council log — SKIP reason:** `run_council.py` linha 99 logava só `decision` e `trade_id`, omitindo `reason`. Corrigido em 2026-05-13 — agora loga `decision=SKIP trade_id=None reason=<motivo>`. Motivos comuns dos guardrails: `bear_rr > bull_rr`, `tf_alignment == "conflicting"`, `news hard_block`.
- **Task Scheduler + log PermissionError:** Se uma instância do council travar com o FileHandler aberto, a próxima instância falha com `PermissionError` no `_setup_logging` (antes de qualquer lógica de negócio) — o processo aborta inteiro. Sintoma: `=== run @ ... ===` seguido de traceback no início do log, runs acumulando sem candidatos processados. Fix temporário: renomear/deletar o arquivo de log do dia travado.

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
- **min_score padrão = 85:** `db.js` migra automaticamente contas com `min_score < 85` para 85 na inicialização (desde 2026-05-06 — antes pegava apenas `=== 70`).
- **`_calcTechIndicators` recebe `tf`:** terceiro parâmetro obrigatório desde 2026-05-05. Qualquer novo call site deve passar o timeframe — usado para `FIND_LEVELS_LB` (lookback TF-aware: 5m=100, 15m=80, 30m/1h=60, 4h/1D=50).
- **`calcRSI` — primeiro RSI válido em `p`:** seed de Wilder emite no índice `p` (não `p+1`). `rsi[p-1]` é sempre `null`; `rsi[p]` é o primeiro valor real.
- **`calcOBVTrend` — guard de tamanho:** retorna `'neutral'` quando `emaOBV.length < 5` (janela insuficiente para slope confiável). Não usar `?? emaOBV[0]` — fallback para `null` causa comparações silenciosamente erradas.
- **`db.js` migrations — PRAGMA table_info:** migrações de colunas usam `PRAGMA table_info(...)` + `.includes()` em vez de `try/catch ALTER TABLE`. Erros reais não são mais engolidos; log `[db] migration: added ...` aparece apenas na primeira vez.
- **`setupAccount` não altera `current_capital`:** para zerar capital use `resetAccount`. Fórmula de recuperação: `initial_capital + total_pnl_closed - capital_in_use`.
- **Servidor Node em Windows:** `npm run server` não propaga sinais. Para reiniciar: `Get-NetTCPConnection -LocalPort 3001 -State Listen | Stop-Process -Id $_.OwningProcess -Force` via PowerShell.
- **Journal — IDs mistos:** backend trades têm IDs string (`"bk-..."`) e manuais têm IDs numéricos. Usar `String(x.id) === String(id)` em comparações; citar o id em event handlers inline: `'${e.id}'`.
- **Candle in-progress drop:** `fetchCandles` remove o último candle se `time + TF_INTERVAL_MS[tf] > Date.now()`. Edge case: array vazio se o único candle for in-progress.
- **Ichimoku requer ≥78 candles:** retorna null silenciosamente com menos.
- **calcAnchoredVWAP retorna null sem swings:** dados monotônicos não têm swing points.
- **Confluência não aplica em score=0:** guard `if (score !== 0)` é intencional.
- **Price-checker — cascading de targets:** desde 2026-05-06 o loop em `price-checker.js` re-processa o trade (até 3×) quando um target é batido na mesma janela, permitindo active→m1→m2→m3 sem esperar o próximo poll.
- **Reflexões são append-only:** não há endpoint de update/delete em `trade_reflections`. FK em `trade_id` — reflexões com trade inexistente são rejeitadas.
- **Symbol mismatches:** Bybit usa `1000PEPEUSDT`, `1000BONKUSDT` etc. Verificar na API ao adicionar coins.
- **`scoreDir` snapshot (Volume/ADX/OI):** em `_computeScore`, os bônus de Volume, ADX e OI usam `const scoreDir = score >= 0 ? 1 : -1` calculado **antes** dos três bônus. Não revert para `score >= 0 ? N : -N` inline — isso reintroduz order-dependency entre os indicadores.
- **`runInTransaction(fn)` em `db.js`:** helper para operações atômicas via `BEGIN IMMEDIATE`. Usar em qualquer read-check-write crítico (ex: `openPosition`). `fn` deve ser síncrono.
- **`fetchCurrentPrice` em `price-checker.js`:** exportada e usada pelo manual close route. Já tem proxy fallback + timeout — não substituir por `fetch` direto.
- **`getScanCoins()` em `db.js`:** retorna a lista de coins do campo `paper_account.coins` (JSON). Retorna `null` se não houver dado — scanner usa `DEFAULT_COINS` como fallback. Atualizar via `updateAccount({ coins: JSON.stringify([...]) })`.
- **Volume Profile scoring — mutually exclusive:** desde 2026-05-06 só um branch dispara por candle (VA abaixo/acima tem prioridade, depois POC). Não restaurar os dois `if` independentes — causava cancelamento net ±1 quando price estava fora da Value Area.
- **Backtest — paridade com scanner ao vivo:** desde 2026-05-07 `backtest/src/indicators.py` porta BOS/CHoCH (±12/22), Order Block (±14) e Trendline Break (±10). Scoring gap com o JS está fechado.
- **Backtest — cooldown engine:** engine usa `last_close_idx` por `(coin, tf)` — sem trades sobrepostos. Baseline bugado gerava 297k trades; correto gera ~700 no quick mode (3 janelas).
- **Backtest — regime filter BTC 4h:** `--btc-regime-filter` busca BTC 4h separadamente (cache em `BTC_4h.csv`) quando não está no dataset principal. Antes sempre fail-open por falta do par `("BTC", "4h")`.
- **Backtest — cache CSV:** `backtest/data/<COIN>_<TF>.csv`. Re-runs fazem append incremental. Se um CSV estiver corrompido, deletar e re-baixar. Não usar parquet sem instalar pyarrow (`pip install pyarrow`).
- **Backtest — Unicode no Windows:** PowerShell/cmd.exe em cp1252 quebra em `→`, `≥`, `≤`, `—`. Todos os prints do backtest usam ASCII puro. Se adicionar prints novos, evitar esses caracteres.

---

## Development

```bash
# Frontend only
open painel.html   # ou python3 -m http.server 8080

# Backend
npm run server

# Tests
npx vitest run

# Backtest (Python — requer Python 3.14+, ccxt, pandas, numpy)
cd backtest
python run.py --quick --btc-regime-filter              # sanity check rapido (~5-10 min)
python run.py --btc-regime-filter --label regime_fix   # full 41 coins, 4 TFs, 3 anos (~1-2h)
python run.py --fetch-only                             # so baixa dados, sem rodar backtest
python run.py --coins BTC ETH --tfs 1h --btc-regime-filter  # subset
python -m pytest tests/ -v                             # 15 testes (engine + indicators)
```

**Git:** sempre adicionar `painel-core.js painel.html` juntos quando o motor mudar.

**Backtest:** `backtest/data/` e `backtest/results/` são gitignored. Cache em CSV por coin/tf (`BTC_1h.csv`). Re-runs atualizam só candles novos.

---

## Default Coins (41)

BTC, ETH, SOL, BNB, XRP, ADA, AVAX, DOGE, DOT, LINK, POL, LTC, ATOM, UNI,
INJ, ARB, WLD, SEI, TIA, SUI, APT, OP, IMX, JUP, ONDO, STRK, BLUR, MANTA,
ORDI, BOME, WIF, ENA, ETHFI, PENDLE, 1000PEPE, HBAR, NEAR, RENDER, TRX, FIL, HYPE

> PEPE = `1000PEPEUSDT` · POL = MATIC renomeado · HYPE = Hyperliquid (adicionado Mar/2026)
