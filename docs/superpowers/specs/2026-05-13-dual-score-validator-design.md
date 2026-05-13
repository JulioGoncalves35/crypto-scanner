# Dual-Score + Validator Agent Design
**Date:** 2026-05-13  
**Status:** Approved  
**Scope:** painel-core.js + agents-v2

---

## Problem Statement

The scanner's single score (0–100) has two critical failures:

1. **Score inflation:** 60% of 1h+4h candidates hit score=100 in bull market because regime indicators (VWAP, EMA, Ichimoku) all align for every coin. The `Math.min(100, rawScore)` cap destroys discriminative information.

2. **Wrong WR correlation:** score=88–94 has 64.7% WR; score=100 has 11.2% WR. Higher score = worse performance, because score=100 just means "bull market is happening", not "this is a good entry now."

3. **TF disparity:** 1h WR=47.9% (48 pairs), 4h WR=6.0% (184 pairs). Both treated equally today.

**Root cause:** The scoring system mixes two types of signals — market regime (stable, applies to all coins) and entry timing (event-based, specific to a moment). In a trending market, regime signals saturate the score cap and mask entry quality.

---

## Solution: Dual-Score System

### Indicator Classification

**Regime Score** — "Are we on the right side of the market?"  
Stable over many candles. Changes slowly.

| Indicator | Points |
|---|---|
| EMA 9/21/200 aligned | ±16 |
| Ichimoku cloud position | ±20 (internal cap) |
| OBV trend | ±6 |
| CVD trend | ±7 |
| ADX strength | ±10 |
| VWAP above/below | ±7 |
| Anchored VWAP | ±8 |
| Funding rate bias | ±12 |
| Open Interest direction | ±8 |
| Fear & Greed | ±10 |
| MACD position (above/below signal line) | ±7 |

**Entry Score** — "Is NOW the right moment to enter?"  
Event-based. Fresh signal degrades with each candle.

| Indicator | Points |
|---|---|
| RSI extremes (<30 / >70) | ±20 |
| StochRSI extremes | ±8 |
| MACD crossover (event only) | ±20 |
| Bollinger band touch | ±10 |
| BOS (Break of Structure) | ±12 |
| CHoCH (Change of Character) | ±22 |
| Order Block (price in zone) | ±14 |
| Squeeze Momentum released | ±15 |
| Trendline Break | ±10 |
| Volume spike (>1.5x avg) | ±7 |
| Divergences (RSI/MACD) | varies |
| EMA Cross event (9/21) | varies |
| Multi-category confluence bonus | up to ±15 |
| Combo penalty (squeeze risk) | ±20 |

**Key reclassification:**
- MACD *position* → Regime. MACD *crossover event* → Entry.
- Multi-category confluence → Entry (quality of timing, not regime).

### Score Calculation

```javascript
// painel-core.js
function _computeRegimeScore(ind, fg, fundingRate, oi) {
  let score = 0;
  // EMA, Ichimoku, OBV, CVD, ADX, VWAP, AVWAP, Funding, OI, F&G, MACD position
  return score; // signed int, NO cap
}

function _computeEntryScore(price, ind, patterns, divergences) {
  let score = 0;
  // RSI, StochRSI, MACD crossover, BB, BOS, CHoCH, OB, Squeeze, Trendline,
  // Volume spike, Divergences, EMA cross event, confluence bonus, combo penalty
  return score; // signed int, NO cap
}
```

Both return signed integers with **no cap**. Positive = bullish, negative = bearish.

### Direction Logic

```javascript
const regimeDir = regimeRaw >= 0 ? 'buy' : 'sell';
const entryDir  = entryRaw  >= 0 ? 'buy' : 'sell';
if (regimeDir !== entryDir) return null; // conflict = discard
const dir = regimeDir;
```

Conflicting signals are discarded before reaching the council.

### ADX Hard Filter

Unchanged — prerequisite gate before any score calculation.  
`TF_ADX_MIN = { 5m: 23, 15m: 22, 30m: 20, 1h: 18, 4h: 18, 1D: 18 }`

### MTF Confluence

Becomes `mtfAligned: int` (count of TFs in same direction, 0–3).  
Bonus points applied to **Entry Score** only (cross-TF timing conviction).  
Passed explicitly to the council as a separate field.

### UI Changes (painel.html) — Option A

Single score removed. UI shows:
- **Regime** badge with raw value + color (green/red by threshold)
- **Entry** badge with raw value + color
- NV1/NV2/NV3 levels recalculated from Entry Score
- `min_score` filter in UI maps to Entry Score minimum

### API Response

```javascript
// analyzeCandles return object
{
  coin, timeframe, dir,
  regimeScore: 72,   // signed, uncapped
  entryScore: 48,    // signed, uncapped
  // score field removed
  entry, stop, m1, m2, m3, ...
}
```

---

## TF Policy

| TF | Policy | Reason |
|---|---|---|
| 5m, 15m, 30m | Hard ban (unchanged) | 0–1.3% WR |
| 1h | Normal thresholds | 47.9% WR — only TF with positive edge |
| 4h | Higher entry threshold | 6.0% WR — needs strong conviction |
| 1D | Normal thresholds | Insufficient data |

4h is not banned because it may have edge in specific conditions, but `COUNCIL_4H_MIN_ENTRY = 50` vs standard `COUNCIL_MIN_ENTRY = 30`.

---

## Validator Agent (agents-v2)

### Architecture

Hybrid: deterministic pre-checks (Python) + LLM qualitative validation (Cerebras).

```
[Deterministic pre-checks]
  - chronic_candidate: coin+TF seen in last 10 scans without opening
  - saturation_percentile: regime score percentile within current scan
        ↓ adds to context
[Validator LLM — Cerebras Qwen3 235B]
  - receives: candles summary + regime_score + entry_score
              + regimeReasons + entryReasons + pre-checks
  - verifies: signals are real? TF coherent with higher TF? freshness ok?
  - outputs: VALIDATE / DOWNGRADE / REJECT + reason
        ↓
REJECT  → early_exit (SKIP, saves bull+bear+trader tokens)
DOWNGRADE → council runs with flag in state (trader weights skepticism)
VALIDATE → full council
```

### ValidatorOutput Schema

```python
class ValidatorOutput(BaseModel):
    verdict: Literal["VALIDATE", "DOWNGRADE", "REJECT"]
    confidence: int  # 0-100
    key_concern: str
    tf_coherent: bool
    signals_verified: bool
    chronic_candidate: bool
    saturation_percentile: float  # 0-1
```

### LangGraph Integration

New node added before analyst nodes:

```
candidate → [validator_node]
                ↓ REJECT → [early_exit_node]
                ↓ VALIDATE/DOWNGRADE → [analyst_technical]
                                        → [analyst_sentiment]
                                        → [analyst_news]
                                        → [researcher_bull]
                                        → [researcher_bear]
                                        → [decision_trader]
```

### agents-v2 Schema Changes

```python
# schemas.py
class Candidate(BaseModel):
    coin: str
    direction: Direction
    timeframe: Timeframe
    regime_score: int      # new
    entry_score: int       # new
    # score: removed
    entry: float
    stop: float
    m1: float
    m2: float
    m3: float
    stop_pct: float
    leverage: int
    signals: list[str] = []
    scan_id: Optional[int] = None

class CouncilState(BaseModel):
    candidate: Candidate
    validator: Optional[ValidatorOutput] = None   # new
    technical: Optional[TechnicalOutput] = None
    sentiment: Optional[SentimentOutput] = None
    news: Optional[NewsOutput] = None
    bull: Optional[ResearcherOutput] = None
    bear: Optional[ResearcherOutput] = None
    trader: Optional[TraderOutput] = None
    errors: list[str] = []
```

### Pre-filter in run_council.py

```python
COUNCIL_MIN_REGIME  = 45   # to calibrate against historical pairs
COUNCIL_MIN_ENTRY   = 30   # to calibrate
COUNCIL_4H_MIN_ENTRY = 50  # 4h needs stronger entry conviction

def passes_prefilter(c: Candidate) -> bool:
    if c.timeframe in BANNED_TFS:
        return False
    min_entry = COUNCIL_4H_MIN_ENTRY if c.timeframe == "4h" else COUNCIL_MIN_ENTRY
    return abs(c.regime_score) >= COUNCIL_MIN_REGIME and abs(c.entry_score) >= min_entry
```

### Token Economics

- Validator input: ~800 tokens, output: ~300 tokens
- If validator REJECTs: saves ~4,500 tokens (technical + sentiment + news + bull + bear + trader)
- Break-even: validator pays for itself if it rejects >18% of candidates that would have run the full council
- Model: Cerebras Qwen3 235B (free tier, fast, already in stack)

---

## Implementation Plan — Two Sequential Sub-Projects

### SP1: Dual-Score in Backend (Foundation)

**Files changed:**
- `painel-core.js` — split `_computeScore` into `_computeRegimeScore` + `_computeEntryScore`
- `painel.html` — mirror the scoring change + update UI (dual badges, remove single score)
- `agents-v2/src/schemas.py` — add `regime_score`, `entry_score`, remove `score`
- `agents-v2/src/backend_client.py` — update `_normalize_candidate`
- `agents-v2/run_council.py` — update pre-filter to use dual thresholds
- `tests/` — update scoring tests

**Milestone:** candidates from `/api/scan/preview` carry `regimeScore` + `entryScore`. UI shows both. Pre-filter uses both.

### SP2: Validator Agent (Depends on SP1)

**Files changed:**
- `agents-v2/src/agents/validator.py` — new (deterministic checks + Cerebras LLM)
- `agents-v2/src/graph.py` — add validator node + conditional routing
- `agents-v2/src/schemas.py` — add `ValidatorOutput`, update `CouncilState`
- `agents-v2/src/llm_client.py` — add validator route (Cerebras primary)
- `CLAUDE.md` — document new agent and pitfalls

**Milestone:** council pipeline has early-exit path. Chronic/saturated/stale candidates blocked before consuming bull+bear+trader tokens.

---

## Calibration (Post-Implementation)

After SP1 ships, run `analyze_pairs.py` with the new dual-score fields to find optimal thresholds:
- Plot WR by `regime_score` bucket and `entry_score` bucket independently
- Find the knee in each curve
- Set `COUNCIL_MIN_REGIME` and `COUNCIL_MIN_ENTRY` at the knee

After SP2, run `run_backtest_replay.py` (fixed join) to measure validator accuracy on historical pairs.

---

## Stack (Unchanged)

LangGraph (local, free) + Cerebras Qwen3 235B + Groq Llama 70B + Mistral Large + Gemini Flash (20 RPD, preserve). Windows Task Scheduler, cadence 1 run/2h.
