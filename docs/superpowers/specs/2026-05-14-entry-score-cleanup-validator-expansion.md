# Entry Score Cleanup + Validator Market Phase Expansion

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** painel-core.js · painel.html · agents-v2  
**Supersedes:** Entry Score table in `2026-05-13-dual-score-validator-design.md`

---

## Problem Statement

The 2026-05-13 dual-score design placed RSI extremes, StochRSI, MACD crossover, and BB touch inside `_computeEntryScore`. In practice these indicators produce false direction conflicts:

- BTC/1h: `regimeScore = +62` (Ichimoku + VWAP bullish) · `entryScore = −38` (RSI=70 → −10, StochRSI>80 → −8, MACD crossdown → −20)
- Conflict guard fires → `analyzeCandles` returns `null`
- Result: scanner finds 0 candidates across all 41 coins for the entire day

Root cause: RSI at 70 in a trending bull market is normal momentum, not a bearish entry signal. Hardcoding `score -= 10` treats overbought as direction, which conflicts with structural regime every time the market trends.

**Goal:** Entry score reflects only event-based triggers. Momentum context (RSI, MACD cross, BB) moves to the validator, which can reason about it in context rather than applying blind penalties.

---

## Changes

### 1 — `_computeEntryScore`: remove four indicator blocks

Remove from both `painel-core.js` and `painel.html` (files must stay in sync):

| Block removed | Points lost | Where it goes |
|---|---|---|
| RSI extremes (`rsi < 30 → +20`, `rsi > 70 → −20`, etc.) | ±10/20 | `momentumCtx` field (read by validator) |
| StochRSI extremes (`< 20 → +8`, `> 80 → −8`) | ±8 | `momentumCtx` |
| MACD crossover (`mxUp → +20`, `mxDown → −20`, histogram ±4) | ±24 | `momentumCtx.macdCross` |
| BB touch (`price ≤ lower → +10`, `price ≥ upper → −10`) | ±10 | `momentumCtx.bbPos` |

**What stays in `_computeEntryScore`:**

- `bosChoch.score` (±12 BOS · ±22 CHoCH)
- Squeeze (`releasedBull +15` · `releasedBear −15` · momentum trend ±6)
- Order Block (`orderBlock.priceInZone → ±14`)
- Trendline Break (`trendlineBreak.score ±10`)
- Pattern signals (`pats.forEach`, `divs.forEach`)
- Derived signals (`emaCross`, `mktStruct`, `triangle`, `dblPattern`)
- Volume spike (see fix below)
- Multi-category confluence bonus (±5/10/15)
- Combo penalty — **kept**: `score > 0 && rsi > 60 && fg.value > 75 → −20`. This requires two extremes simultaneously and is a valid guard against euphoric entries, not a directional signal.

`mxUp` / `mxDown` are still computed inside `_computeEntryScore` (needed for `momentumCtx`) but no longer added to score.

### 2 — Volume spike fix

Current code snapshots `entryDir = score >= 0 ? 1 : −1` before any trigger has run. With RSI/MACD/BB removed, `score = 0` at snapshot time → `entryDir = +1` by default → spurious `+7` on every candle with volume spike.

Fix: move the volume block to **after** bosChoch/squeeze/OB/trendline/patterns, and gate it:

```javascript
// Volume spike — only applies when a trigger has already established direction
if (score !== 0 && volRatio > 1.5) score += (score > 0 ? 1 : -1) * 7;
```

### 3 — `momentumCtx` added to setup output

`analyzeCandles` adds one field to the returned setup object. Values come from `ind` (already computed) and `entryOut.mxUp / mxDown` (already returned by `_computeEntryScore`):

```javascript
const momentumCtx = {
  rsi:       ind.rsi,          // float | null
  stochRSI:  ind.stochRSI,     // float | null
  macdCross: entryOut.mxUp ? 'up' : entryOut.mxDown ? 'down' : null,
  bbPos: ind.bb
    ? (price >= ind.bb.upper ? 'upper' : price <= ind.bb.lower ? 'lower' : 'inside')
    : null
};

// included in setup return object alongside regimeScore, entryScore, etc.
```

`momentumCtx` is included in the setup returned by `analyzeCandles` and therefore stored in `scan_log.candidates_json` and returned by `/api/scan/preview`.

### 4 — Python: `Candidate` schema

`agents-v2/src/schemas.py`:

```python
class Candidate(BaseModel):
    # existing fields unchanged
    momentum_ctx: Optional[dict] = None   # new — from momentumCtx
```

`agents-v2/src/backend_client.py` — `_normalize_candidate`:

```python
"momentum_ctx": c.get("momentumCtx"),   # added; None if absent (old candidates)
```

### 5 — `ValidatorOutput`: two new fields

`agents-v2/src/schemas.py`:

```python
class ValidatorOutput(BaseModel):
    verdict:              Literal["VALIDATE", "DOWNGRADE", "REJECT"]
    confidence:           int = Field(ge=0, le=100)
    key_concern:          str
    tf_coherent:          bool
    signals_verified:     bool
    chronic_candidate:    bool = False
    saturation_percentile: float = Field(ge=0.0, le=1.0, default=0.0)
    market_phase:   Literal["trending", "choppy", "reversing"] = "choppy"   # new
    timing_quality: Literal["good", "neutral", "poor"] = "neutral"          # new
```

Defaults are conservative (`choppy` / `neutral`) so that missing data fails toward DOWNGRADE, not VALIDATE.

### 6 — Validator prompt expansion

A new section is appended to the existing validator prompt in `agents-v2/src/agents/validator.py`. The LLM receives:

```
MOMENTUM CONTEXT (these indicators were intentionally excluded from the entry score;
your job is to evaluate them in the context of the setup direction):

  RSI:        {rsi}
  StochRSI:   {stochRsi}
  MACD cross: {macdCross}   (up=bullish cross, down=bearish cross, null=no recent cross)
  BB position:{bbPos}       (upper=near upper band, lower=near lower band, inside=normal)

Setup direction: {direction}
Regime score:    {regimeScore}
Entry score (trigger magnitude): {entry_score}

Evaluate:

1. MARKET PHASE — what phase is this coin in?
   - "trending":  clear directional movement aligned with trade direction
   - "choppy":    consolidation or unclear direction, no strong trend
   - "reversing": short-term momentum (RSI, MACD) showing pressure AGAINST trade direction
                  (e.g., RSI=70 + MACD crossdown on a long setup = near-term bearish pressure)

2. TIMING QUALITY — given the triggers that fired, is this a good moment to enter?
   - "good":    momentum confirms triggers (RSI not overbought for longs, MACD aligned)
   - "neutral": mixed signals, triggers are real but timing is uncertain
   - "poor":    momentum clearly against entry direction (overbought long, MACD down on long)

Return market_phase and timing_quality in your JSON output.
```

### 7 — Validator decision table

These rules are applied **after** the existing VALIDATE/DOWNGRADE/REJECT logic. They can only downgrade, never upgrade:

| market_phase | timing_quality | Override |
|---|---|---|
| trending | good | none |
| trending | neutral | none |
| trending | poor | force DOWNGRADE |
| choppy | good | force DOWNGRADE |
| choppy | neutral | force REJECT |
| choppy | poor | force REJECT |
| reversing | good | force DOWNGRADE |
| reversing | neutral | force REJECT |
| reversing | poor | force REJECT |

Rationale:
- A setup in a trending market with poor timing is still worth the council's attention (pullback entry may be valid) → DOWNGRADE, not REJECT.
- Choppy market = no structural edge regardless of timing → REJECT.
- Reversing = near-term pressure against direction → REJECT unless timing is clean, in which case council decides.

**Fallback:** if `momentum_ctx` is `None` (old-format candidate or missing data) → `market_phase = "choppy"`, `timing_quality = "neutral"` → forced DOWNGRADE. Council runs with skepticism.

### 8 — Threshold changes

**Scanner `min_score` (account setting):** 85 → 30

The value 85 was calibrated against the old combined score (regime + entry + momentum all summed). Entry-only score with pure triggers peaks at ~70 without patterns. Keeping 85 would produce 0 candidates permanently.

**`db.js` migration — must update three places:**

```javascript
// 1. Schema default
min_score INTEGER NOT NULL DEFAULT 30   // was 85

// 2. Auto-migration guard (line ~154) — change condition
if (acc && acc.min_score < 30) {        // was < 85
  db.prepare('UPDATE paper_account SET min_score = 30 WHERE id = 1').run();
  console.log('[db] migrated min_score → 30');
}

// 3. NEW migration — update existing account still at 85 (old combined-score threshold)
// Without this, an account at min_score=85 never triggers the guard above (85 is not < 30)
// and the scanner finds 0 candidates permanently after this change.
const acc85 = db.prepare('SELECT min_score FROM paper_account WHERE id = 1').get();
if (acc85 && acc85.min_score === 85) {
  db.prepare('UPDATE paper_account SET min_score = 30 WHERE id = 1').run();
  console.log('[db] migration: min_score 85 → 30 (entry-only score recalibration)');
}
```

Without fix #3, the account currently at `min_score=85` stays at 85 after restart (85 is not `< 30`, so the guard doesn't fire). The scanner would continue finding 0 candidates.

**Python thresholds (unchanged):**

```
COUNCIL_MIN_REGIME   = 45   # env var, unchanged
COUNCIL_MIN_ENTRY    = 30   # env var, unchanged — now aligned with new scanner threshold
COUNCIL_4H_MIN_ENTRY = 50   # env var, unchanged
```

---

## What Does NOT Change

- Conflict guard logic in `analyzeCandles` — still returns `null` when both scores are non-zero and signs differ. With momentum indicators removed from entry, this guard now fires only on genuine trigger conflicts (BOS up vs trendline break down), which is correct behavior.
- `_computeRegimeScore` — untouched. MACD position (+7) stays there.
- MTF scoring (`applyMTFScoring`) — confluence bonus still applies only to `entryScore`. Unchanged.
- `COUNCIL_MIN_REGIME = 45` — unchanged.
- `COUNCIL_4H_MIN_ENTRY = 50` — unchanged.
- LangGraph graph structure — validator remains first node (`gate_validator`). No new nodes.
- All other agent prompts (technical, sentiment, news, bull, bear, trader) — unchanged.
- `painel.html` UI — no visual changes needed. `momentumCtx` is an extra field the frontend ignores.

---

## Files Affected

| File | Change |
|---|---|
| `painel-core.js` | `_computeEntryScore`: remove 4 blocks, fix volume gate · `analyzeCandles`: add `momentumCtx` |
| `painel.html` | Mirror identical changes to `_computeEntryScore` and `analyzeCandles` |
| `backend/db.js` | Update schema DEFAULT and auto-migration guard for `min_score` |
| `agents-v2/src/schemas.py` | Add `momentum_ctx` to `Candidate` · Add `market_phase` + `timing_quality` to `ValidatorOutput` |
| `agents-v2/src/backend_client.py` | Map `momentumCtx` in `_normalize_candidate` |
| `agents-v2/src/agents/validator.py` | Expand prompt · Apply decision table override |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Scanner finds too many candidates (min_score too low) | `COUNCIL_MIN_REGIME=45` and `COUNCIL_MIN_ENTRY=30` in Python act as second filter; validator rejects choppy/reversing setups |
| Validator LLM inconsistent on phase classification | Prompt gives concrete definitions with examples for each phase; fallback defaults to DOWNGRADE |
| `painel.html` drift from `painel-core.js` | Both files edited in same commit; tests cover scoring parity |
| db.js migration resets min_score on restart | Migration guard updated in same PR |
