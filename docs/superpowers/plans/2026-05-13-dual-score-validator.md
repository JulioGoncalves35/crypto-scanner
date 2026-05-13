# Dual-Score + Validator Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single capped score (0–100) with two uncapped signed scores (Regime Score + Entry Score), then add a Validator agent that gates the council with deterministic pre-checks + Cerebras LLM verification before any tokens are spent on bull/bear/trader.

**Architecture:** Two sequential sub-projects. SP1 changes the scoring engine (`painel-core.js` mirrored to `painel.html`) and propagates the new fields through `agents-v2` schemas + pre-filter. SP2 adds a new LangGraph node (`validator`) that early-exits REJECTed candidates before analysts run, saving ~4.5k tokens per skipped run.

**Tech Stack:** Vanilla JS (browser + Node 22.5+), Python 3.14+, Pydantic, LangGraph, Cerebras Qwen3 235B (OpenAI SDK base_url), httpx, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-05-13-dual-score-validator-design.md`

---

## File Structure

### SP1 — Dual-Score Foundation

**Modify:**
- `painel-core.js` — split `_computeScore` into `_computeRegimeScore` + `_computeEntryScore`; update `analyzeCandles` to call both, resolve direction, emit `regimeScore`/`entryScore`, drop `score`. Update `applyMTFScoring` to bonus only `entryScore`.
- `painel.html` — mirror the same scoring logic (the file has its own copies of `_computeScore` / `analyzeCandles` / MTF inline). Update card rendering to show two badges. NV1/NV2/NV3 thresholds recalculated from Entry Score.
- `backend/scanner.js` — filter using `entry_score` (positional rename of `min_score`). Add a regime gate.
- `agents-v2/src/schemas.py` — `Candidate.score` → `regime_score: int` + `entry_score: int` (signed). `OpenPayload` mirrors. Add `signed` int (no `ge=0` constraint).
- `agents-v2/src/backend_client.py` — `_normalize_candidate` maps `regimeScore`/`entryScore`.
- `agents-v2/run_council.py` — new pre-filter using `COUNCIL_MIN_REGIME`, `COUNCIL_MIN_ENTRY`, `COUNCIL_4H_MIN_ENTRY`.
- `agents-v2/src/config.py` — three new env-driven thresholds.
- `backend/routes/trades.js` — accept `regime_score`/`entry_score` from Leader payload; persist alongside trade row.
- `backend/db.js` — migration: ALTER TABLE `trades` add `regime_score INTEGER`, `entry_score INTEGER`.

**Tests modified:**
- `tests/scoring.test.js` — replace assertions on capped score with regime/entry split.
- `tests/scanner-filters.test.js` — exercise the new gates.
- `tests/mtf.test.js` — confluence bonus only on entry.
- `tests/fixtures/candles.js` — no change.
- `agents-v2/tests/test_backend_client.py` — _normalize_candidate maps new fields.
- `agents-v2/tests/test_schemas.py` — Candidate accepts signed ints, rejects `score` if sent.

**CLAUDE.md:** add the SP1 milestone block; bump min_score documentation.

### SP2 — Validator Agent

**Create:**
- `agents-v2/src/agents/validator.py` — deterministic pre-checks + Cerebras LLM call.
- `agents-v2/src/prompts/validator.py` — prompt builder.
- `agents-v2/tests/test_agents_validator.py` — unit tests for pre-checks + parsing.

**Modify:**
- `agents-v2/src/schemas.py` — `ValidatorOutput` model; `CouncilState.validator` field.
- `agents-v2/src/graph.py` — node `validator` + conditional edge to `early_exit` or analyst fan-out.
- `agents-v2/src/llm_client.py` — `ROUTES["validator"] = {"primary": "cerebras-qwen235b", "fallback": "groq-llama70b"}`.
- `agents-v2/run_council.py` — log validator verdict + chronic/saturation context.
- `agents-v2/src/db.py` — extend `agent_decisions` row with `validator_verdict TEXT` column (migration).
- `CLAUDE.md` — document validator + pitfalls.

**Tests created:**
- `agents-v2/tests/test_agents_validator.py` — covers VALIDATE/DOWNGRADE/REJECT parsing, fallback shape, chronic detection, saturation_percentile math.

---

# SP1 — Dual-Score Backend Foundation

### Task 1: Add `_computeRegimeScore` to painel-core.js (TDD)

**Files:**
- Modify: `C:\Users\julio\Documents\github\crypto-scanner\painel-core.js`
- Test: `C:\Users\julio\Documents\github\crypto-scanner\tests\scoring.test.js`

- [ ] **Step 1: Write failing test for regime-only indicators**

Append to `tests/scoring.test.js`:

```javascript
import { _computeRegimeScore } from '../painel-core.js';

describe('_computeRegimeScore', () => {
  it('returns positive when EMAs aligned bullish, price above', () => {
    const ind = makeInd({ ema9: 105, ema21: 102, ema200: 95 });
    const { regimeScore } = _computeRegimeScore(110, ind, NEUTRAL_FG, null, null);
    expect(regimeScore).toBeGreaterThan(0);
  });

  it('returns negative when EMAs aligned bearish, price below', () => {
    const ind = makeInd({ ema9: 95, ema21: 98, ema200: 105 });
    const { regimeScore } = _computeRegimeScore(90, ind, NEUTRAL_FG, null, null);
    expect(regimeScore).toBeLessThan(0);
  });

  it('ignores RSI extremes (entry-only indicator)', () => {
    const indNeutral = makeInd({ rsi: 50 });
    const indOversold = makeInd({ rsi: 15 });
    const r1 = _computeRegimeScore(100, indNeutral, NEUTRAL_FG, null, null);
    const r2 = _computeRegimeScore(100, indOversold, NEUTRAL_FG, null, null);
    expect(r1.regimeScore).toBe(r2.regimeScore);
  });

  it('is uncapped (can exceed 100)', () => {
    const ind = makeInd({
      ema9: 110, ema21: 105, ema200: 95,
      ichimoku: { priceAboveCloud: true, priceBelowCloud: false, tkCross: 'bullish', chikouBull: true },
      vwap: 100, anchoredVwap: { vwap: 100 },
      obvTrend: 'rising', cvd: { trend: 'rising' }, adx: 35,
      macdNow: 2, sigNow: 1, macdPrev: 1, sigPrev: 1,
    });
    const fg = { value: 20, label: 'Medo' };
    const { regimeScore } = _computeRegimeScore(110, ind, fg, -0.0006, { change24h: 6 });
    expect(regimeScore).toBeGreaterThan(80);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/scoring.test.js -t "_computeRegimeScore"`
Expected: FAIL — `_computeRegimeScore is not a function` (import error).

- [ ] **Step 3: Implement `_computeRegimeScore` in `painel-core.js`**

Insert above `function _computeScore(...)` (~line 1275). Body cherry-picks the regime indicators from `_computeScore`. No `Math.min(100, ...)` cap. Returns `{ regimeScore, reasons, indicators }`.

```javascript
function _computeRegimeScore(price, ind, fg, fundingRate = null, openInterest = null) {
  const { ema9, ema21, ema200, vwap, obvTrend, adx, cvd,
    ichimoku, anchoredVwap, macdNow, sigNow } = ind;

  let score = 0;
  const reasons = [], indicators = [];

  // EMA alignment
  if (ema9 != null && ema21 != null && ema200 != null) {
    if      (price > ema9 && ema9 > ema21 && ema21 > ema200) { score += 16; reasons.push({text:'EMAs alinhadas ↑',type:'positive'}); }
    else if (price < ema9 && ema9 < ema21 && ema21 < ema200) { score -= 16; reasons.push({text:'EMAs alinhadas ↓',type:'negative'}); }
    else if (price > ema200) { score += 7; reasons.push({text:'Acima da EMA200',type:'positive'}); }
    else                     { score -= 7; reasons.push({text:'Abaixo da EMA200',type:'negative'}); }
  }

  // Ichimoku cloud (capped internally at ±20)
  if (ichimoku != null) {
    let ichScore = 0;
    if (ichimoku.priceAboveCloud) ichScore += 10;
    else if (ichimoku.priceBelowCloud) ichScore -= 10;
    if (ichimoku.tkCross === 'bullish') ichScore += 8;
    else if (ichimoku.tkCross === 'bearish') ichScore -= 8;
    if (ichimoku.chikouBull === true) ichScore += 4;
    else if (ichimoku.chikouBull === false) ichScore -= 4;
    score += Math.max(-20, Math.min(20, ichScore));
  }

  // OBV
  if (obvTrend === 'rising')  { score += 6; reasons.push({text:'OBV ascensão',type:'positive'}); }
  if (obvTrend === 'falling') { score -= 6; reasons.push({text:'OBV queda',type:'negative'}); }

  // CVD
  if (cvd != null) {
    if (cvd.trend === 'rising')  score += 7;
    else if (cvd.trend === 'falling') score -= 7;
  }

  // VWAP
  if (vwap) {
    if      (price > vwap * 1.002) score += 7;
    else if (price < vwap * 0.998) score -= 7;
  }

  // Anchored VWAP
  if (anchoredVwap != null) {
    const av = anchoredVwap.vwap;
    if      (price > av * 1.002) score += 8;
    else if (price < av * 0.998) score -= 8;
  }

  // MACD POSITION (not crossover — crossover lives in entry score)
  if (macdNow != null && sigNow != null) {
    if (macdNow > sigNow) score += 7;
    else                  score -= 7;
  }

  // ADX strength (direction taken from running regime score)
  const regimeDir = score >= 0 ? 1 : -1;
  if (adx !== null) {
    if      (adx > 30) score += regimeDir * 10;
    else if (adx > 25) score += regimeDir * 6;
    else if (adx < 20) score -= 8;
    else               score -= 3;
  }

  // Funding rate
  if (fundingRate !== null) {
    if      (fundingRate <= -0.0005) score += 12;
    else if (fundingRate <= -0.0001) score += 6;
    else if (fundingRate >=  0.0005) score -= 12;
    else if (fundingRate >=  0.0001) score -= 6;
  }

  // Open Interest
  if (openInterest !== null) {
    const oiChg = openInterest.change24h;
    if      (oiChg >  5) score += regimeDir * 8;
    else if (oiChg < -5) score -= 6;
  }

  // Fear & Greed
  if      (fg.value < 25) score += 10;
  else if (fg.value > 75) score -= 10;

  return { regimeScore: score, reasons, indicators };
}
```

Also append `_computeRegimeScore` to the `export { ... }` block at the bottom of the file.

- [ ] **Step 4: Run tests — confirm pass**

Run: `npx vitest run tests/scoring.test.js -t "_computeRegimeScore"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add painel-core.js tests/scoring.test.js
git commit -m "feat(scoring): add _computeRegimeScore (regime-only indicators, uncapped)"
```

---

### Task 2: Add `_computeEntryScore` to painel-core.js (TDD)

**Files:**
- Modify: `painel-core.js`
- Test: `tests/scoring.test.js`

- [ ] **Step 1: Write failing test**

Append to `tests/scoring.test.js`:

```javascript
import { _computeEntryScore } from '../painel-core.js';

describe('_computeEntryScore', () => {
  it('returns positive on RSI oversold + MACD bullish cross', () => {
    const ind = makeInd({
      rsi: 22, stochRSI: 10,
      macdNow: 1, sigNow: 0, macdPrev: 0, sigPrev: 1, // cross up
    });
    const { entryScore } = _computeEntryScore(100, ind, NEUTRAL_FG, [], []);
    expect(entryScore).toBeGreaterThan(0);
  });

  it('returns negative on RSI overbought + MACD bearish cross', () => {
    const ind = makeInd({
      rsi: 85, stochRSI: 95,
      macdNow: 0, sigNow: 1, macdPrev: 1, sigPrev: 0, // cross down
    });
    const { entryScore } = _computeEntryScore(100, ind, NEUTRAL_FG, [], []);
    expect(entryScore).toBeLessThan(0);
  });

  it('ignores EMA alignment (regime-only)', () => {
    const flat   = makeInd({ ema9: 100, ema21: 100, ema200: 100 });
    const aligned = makeInd({ ema9: 110, ema21: 105, ema200: 95 });
    const r1 = _computeEntryScore(110, flat, NEUTRAL_FG, [], []);
    const r2 = _computeEntryScore(110, aligned, NEUTRAL_FG, [], []);
    expect(r1.entryScore).toBe(r2.entryScore);
  });

  it('is uncapped and applies confluence bonus', () => {
    const ind = makeInd({
      rsi: 18, stochRSI: 10,
      macdNow: 2, sigNow: 1, macdPrev: 0, sigPrev: 1,
      bb: { upper: 110, mid: 100, lower: 95 },
      bosChoch: { name: 'CHoCH alta', score: 22 },
      squeeze: { releasedBull: true, squeezed: false, momentumTrend: 'rising' },
    });
    const { entryScore } = _computeEntryScore(94, ind, NEUTRAL_FG, [], []);
    expect(entryScore).toBeGreaterThan(60);
  });
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `npx vitest run tests/scoring.test.js -t "_computeEntryScore"`
Expected: FAIL — `_computeEntryScore is not a function`.

- [ ] **Step 3: Implement `_computeEntryScore`**

Insert below `_computeRegimeScore`. Body covers RSI, StochRSI, MACD crossover (event only — `mxUp`/`mxDown`), Bollinger touch, BOS/CHoCH, Order Block, Squeeze, Trendline break, Volume spike, divergences, EMA cross event, multi-category confluence bonus, combo penalty.

```javascript
function _computeEntryScore(price, ind, fg, patterns = null, divergences = null) {
  const { rsi, stochRSI, macdNow, macdPrev, sigNow, sigPrev, histNow, histPrev,
    bb, volRatio, bosChoch, squeeze, orderBlock, trendlineBreak,
    emaCross, mktStruct, triangle, dblPattern } = ind;
  const pats = patterns ?? ind.patterns ?? [];
  const divs = divergences ?? ind.divergences ?? [];

  let score = 0;
  const reasons = [], indicators = [];

  // RSI extremes
  if (rsi !== null) {
    if      (rsi < 30) score += 20;
    else if (rsi < 40) score += 10;
    else if (rsi > 70) score -= 20;
    else if (rsi > 60) score -= 10;
  }

  // StochRSI extremes
  if (stochRSI !== null) {
    if      (stochRSI < 20) score += 8;
    else if (stochRSI > 80) score -= 8;
  }

  // MACD CROSSOVER ONLY (position lives in regime score)
  const mxUp   = macdNow > sigNow && macdPrev <= sigPrev;
  const mxDown = macdNow < sigNow && macdPrev >= sigPrev;
  if      (mxUp)   score += 20;
  else if (mxDown) score -= 20;
  if (histNow > histPrev && histNow > 0) score += 4;
  if (histNow < histPrev && histNow < 0) score -= 4;

  // Bollinger touch
  if (bb) {
    if      (price <= bb.lower) score += 10;
    else if (price >= bb.upper) score -= 10;
  }

  // Volume spike (snapshot direction before applying)
  const entryDir = score >= 0 ? 1 : -1;
  if (volRatio > 1.5) score += entryDir * 7;

  // Pattern signals
  pats.forEach(pat => { if (pat.score !== 0) score += pat.score; });
  divs.forEach(div => { score += div.score; });

  if (emaCross && emaCross.score !== 0) score += emaCross.score;
  if (mktStruct && mktStruct.score !== 0) score += mktStruct.score;
  if (triangle && triangle.score !== 0) score += triangle.score;
  if (dblPattern && dblPattern.score !== 0) score += dblPattern.score;
  if (bosChoch && bosChoch.score !== 0) score += bosChoch.score;
  if (trendlineBreak != null) score += trendlineBreak.score;

  // Squeeze
  if (squeeze != null) {
    if      (squeeze.releasedBull) score += 15;
    else if (squeeze.releasedBear) score -= 15;
    else if (!squeeze.squeezed && squeeze.momentumTrend === 'rising')  score += 6;
    else if (!squeeze.squeezed && squeeze.momentumTrend === 'falling') score -= 6;
  }

  // Order Block (only when price in zone)
  if (orderBlock != null && orderBlock.priceInZone) score += orderBlock.score;

  // Multi-category confluence (entry timing quality)
  if (score !== 0) {
    const isLong = score > 0;
    const momentumAligned = rsi !== null && ((isLong && rsi < 50) || (!isLong && rsi > 50));
    const patternAligned = pats.some(p => isLong ? p.score > 0 : p.score < 0) ||
                           divs.some(d => isLong ? d.score > 0 : d.score < 0) ||
                           (squeeze != null && ((isLong && (squeeze.releasedBull || squeeze.momentumTrend === 'rising')) ||
                                                 (!isLong && (squeeze.releasedBear || squeeze.momentumTrend === 'falling'))));
    const volumeAligned = volRatio > 1.5;
    const eventAligned  = mxUp || mxDown || (bosChoch && bosChoch.score !== 0) || (trendlineBreak != null && trendlineBreak.score !== 0);
    const alignedCount = [momentumAligned, patternAligned, volumeAligned, eventAligned].filter(Boolean).length;
    if (alignedCount >= 2) {
      const sign = isLong ? 1 : -1;
      const confBonus = alignedCount >= 4 ? 15 : alignedCount >= 3 ? 10 : 5;
      score += sign * confBonus;
    }
  }

  // Combo penalty: short squeeze risk
  if (score < 0 && rsi !== null && rsi < 40 && fg.value < 25) score += 20;
  if (score > 0 && rsi !== null && rsi > 60 && fg.value > 75) score -= 20;

  return { entryScore: score, reasons, indicators, mxUp, mxDown };
}
```

Append `_computeEntryScore` to the `export { ... }` block.

- [ ] **Step 4: Run tests — confirm pass**

Run: `npx vitest run tests/scoring.test.js -t "_computeEntryScore"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add painel-core.js tests/scoring.test.js
git commit -m "feat(scoring): add _computeEntryScore (event-based, uncapped)"
```

---

### Task 3: Wire dual-score into `analyzeCandles` (painel-core.js)

**Files:**
- Modify: `painel-core.js` (lines 1626–1740)
- Test: `tests/scoring.test.js`

- [ ] **Step 1: Write failing test for the new return shape**

Append to `tests/scoring.test.js`:

```javascript
import { analyzeCandles } from '../painel-core.js';
import { makeTrendingCandles } from './fixtures/candles.js';

describe('analyzeCandles dual-score', () => {
  it('returns regimeScore + entryScore (signed, uncapped) and no `score` field', () => {
    const candles = makeTrendingCandles(220, { direction: 'up' });
    const out = analyzeCandles('BTC', '1h', candles, NEUTRAL_FG, null, null,
      { score: '0', leverage: 10, rr: 'fib' });
    expect(out).not.toBeNull();
    expect(typeof out.regimeScore).toBe('number');
    expect(typeof out.entryScore).toBe('number');
    expect(out.score).toBeUndefined();
  });

  it('returns null when regime/entry directions conflict', () => {
    // Configure fixtures so regime bullish, entry bearish (RSI>70, MACD cross down)
    const candles = makeTrendingCandles(220, { direction: 'up', overbought: true });
    const out = analyzeCandles('BTC', '1h', candles, NEUTRAL_FG, null, null,
      { score: '0', leverage: 10, rr: 'fib' });
    // Either null (conflict) or both same dir — never opposite signs
    if (out) expect(Math.sign(out.regimeScore) * Math.sign(out.entryScore)).toBeGreaterThanOrEqual(0);
  });

  it('honours entry-score threshold in options.score', () => {
    const candles = makeTrendingCandles(220, { direction: 'up' });
    const lo = analyzeCandles('BTC', '1h', candles, NEUTRAL_FG, null, null,
      { score: '0', leverage: 10, rr: 'fib' });
    const hi = analyzeCandles('BTC', '1h', candles, NEUTRAL_FG, null, null,
      { score: '999', leverage: 10, rr: 'fib' });
    expect(lo).not.toBeNull();
    expect(hi).toBeNull();
  });
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `npx vitest run tests/scoring.test.js -t "analyzeCandles dual-score"`
Expected: FAIL — current `analyzeCandles` returns `score`, not `regimeScore`/`entryScore`.

- [ ] **Step 3: Update `analyzeCandles`**

In `painel-core.js`, replace the block from line 1652 (`const { score: rawScore, ... } = _computeScore(...)`) through line 1658 (`if (normScore < parseInt(options.score)) return null;`) with:

```javascript
  const regimeOut = _computeRegimeScore(price, ind, safeFg, fundingRate, openInterest);
  const entryOut  = _computeEntryScore(price, ind, safeFg, ind.patterns, ind.divergences);
  const regimeScore = regimeOut.regimeScore;
  const entryScore  = entryOut.entryScore;

  // Conflict: regime and entry disagree → discard
  if (regimeScore !== 0 && entryScore !== 0 &&
      Math.sign(regimeScore) !== Math.sign(entryScore)) {
    return null;
  }
  const dir = (regimeScore + entryScore) >= 0 ? 'buy' : 'sell';

  // options.score now filters by |entryScore|
  if (Math.abs(entryScore) < parseInt(options.score)) return null;

  const reasons    = [...regimeOut.reasons, ...entryOut.reasons];
  const indicators = [...regimeOut.indicators, ...entryOut.indicators];
  // mxUp/mxDown/etc still needed downstream for `summary` — pull from entryOut + recomputed
  const { mxUp, mxDown } = entryOut;
  const mAbove = ind.macdNow > ind.sigNow;
  // Pattern objects from indicators (still used in card)
  const { emaCross, mktStruct, triangle, dblPattern, bosChoch, cvd,
          ichimoku, squeeze, orderBlock, anchoredVwap } = ind;
```

In the return object at the bottom of `analyzeCandles`, replace `score: normScore,` with:

```javascript
    regimeScore, entryScore, timeframe: tf, leverage: lev,
```

(Remove the `score` field entirely.)

- [ ] **Step 4: Run scoring tests**

Run: `npx vitest run tests/scoring.test.js`
Expected: all new tests PASS. Pre-existing tests that asserted on `out.score` will FAIL — that is expected and gets fixed in Task 9.

- [ ] **Step 5: Commit**

```bash
git add painel-core.js tests/scoring.test.js
git commit -m "feat(scoring): analyzeCandles emits regimeScore+entryScore, drops capped score"
```

---

### Task 4: Update `applyMTFScoring` to bonus entry score only

**Files:**
- Modify: `painel-core.js` (lines 1754–1840)
- Test: `tests/mtf.test.js`

- [ ] **Step 1: Update failing test**

Open `tests/mtf.test.js`. Replace assertions that read `setup.score` with `setup.entryScore`. Add one new test:

```javascript
it('confluence bonus lifts entryScore but not regimeScore', () => {
  const setups = [
    { coin: 'BTC', dir: 'buy', timeframe: '1h', regimeScore: 40, entryScore: 30, reasons: [], m3:{cap:{netPct:'10'}} },
    { coin: 'BTC', dir: 'buy', timeframe: '4h', regimeScore: 60, entryScore: 35, reasons: [], m3:{cap:{netPct:'11'}} },
  ];
  const out = applyMTFScoring(setups);
  const best = out[0];
  expect(best.entryScore).toBeGreaterThan(35);
  expect(best.regimeScore).toBeLessThanOrEqual(60);
});
```

- [ ] **Step 2: Run — confirm fail**

Run: `npx vitest run tests/mtf.test.js`
Expected: FAIL.

- [ ] **Step 3: Update `applyMTFScoring`**

In `painel-core.js`, inside the `dirSetups.forEach(s => { ... })` loop (around line 1790), change:

```javascript
        s.score = Math.min(100, s.score + bonus);
```

to:

```javascript
        s.entryScore = s.entryScore + bonus;  // uncapped
```

And inside the conflict block (around line 1821):

```javascript
          s.score = Math.max(0, s.score - penalty);
```

to:

```javascript
          s.entryScore = s.entryScore - penalty;  // signed; allowed to go negative
```

Update the deduplication block at the bottom:

```javascript
  const bestByCoin = {};
  results.forEach(r => {
    if (!bestByCoin[r.coin] || Math.abs(r.entryScore) > Math.abs(bestByCoin[r.coin].entryScore))
      bestByCoin[r.coin] = r;
  });
```

- [ ] **Step 4: Run MTF tests**

Run: `npx vitest run tests/mtf.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add painel-core.js tests/mtf.test.js
git commit -m "feat(mtf): confluence bonus applies to entryScore only (regime unchanged)"
```

---

### Task 5: Mirror dual-score logic into `painel.html`

**Files:**
- Modify: `painel.html`

> `painel.html` keeps its own copies of `_computeScore` / `analyzeCandles` / MTF inline in `runRealAnalysis`. This task ports the Task 1–4 changes verbatim. There are no tests for `painel.html` — manual browser verification.

- [ ] **Step 1: Locate the in-file `_computeScore`**

Run: `grep -n "function _computeScore" painel.html` (use Grep tool).
Note the line number.

- [ ] **Step 2: Insert `_computeRegimeScore` + `_computeEntryScore`**

Insert the two new functions immediately above `_computeScore` inside `painel.html`. Use the **same bodies** from Task 1 step 3 and Task 2 step 3. Do not delete `_computeScore` yet — keep it dead-coded for one commit so the diff is reviewable.

- [ ] **Step 3: Replace usage inside `analyzeCandles` (HTML copy)**

Locate `analyzeCandles` in `painel.html` (`grep -n "function analyzeCandles" painel.html`). Apply the same return-shape change from Task 3 step 3 — emit `regimeScore`/`entryScore`, drop `score`, conflict guard, threshold against `Math.abs(entryScore)`.

- [ ] **Step 4: Update inline MTF block in `runRealAnalysis`**

`grep -n "runRealAnalysis" painel.html` → find the MTF inline block (mirrors `applyMTFScoring`). Apply the same swaps as Task 4 step 3.

- [ ] **Step 5: Delete the dead `_computeScore` function**

Remove the original `_computeScore` body from `painel.html`. No callers should remain.

- [ ] **Step 6: Manual sanity in browser**

Open `painel.html` in browser. Run a scan. DevTools console: ensure cards render (badges will look wrong until Task 6 — that's expected). Make sure there are no `ReferenceError: _computeScore is not defined` logs.

- [ ] **Step 7: Commit**

```bash
git add painel.html
git commit -m "feat(scoring): mirror dual-score split in painel.html"
```

---

### Task 6: Render Regime + Entry badges in `painel.html`

**Files:**
- Modify: `painel.html` (card render function + NV1/NV2/NV3 logic + UI filter)

- [ ] **Step 1: Locate card render code**

Run Grep: `pattern: "NV1|NV2|NV3"`, `path: painel.html`. The NV badge gets derived from `score` (60–72 → NV1, 73–84 → NV2, 85+ → NV3). Note the line.

- [ ] **Step 2: Add two CSS classes**

Inside the existing `<style>` block, append:

```css
.badge-regime { background: #1b3a4b; color: #67e8f9; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.badge-entry  { background: #3a1b4b; color: #d8b4fe; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.badge-entry.neg, .badge-regime.neg { background: #4b1b1b; color: #fca5a5; }
```

- [ ] **Step 3: Update card render — replace single-score line with two badges**

Find the snippet that renders the score chip on the card. Replace it with two spans:

```html
<span class="badge-regime ${setup.regimeScore < 0 ? 'neg' : ''}">R ${setup.regimeScore >= 0 ? '+' : ''}${setup.regimeScore}</span>
<span class="badge-entry  ${setup.entryScore  < 0 ? 'neg' : ''}">E ${setup.entryScore  >= 0 ? '+' : ''}${setup.entryScore}</span>
```

- [ ] **Step 4: Recalc NV1/NV2/NV3 from `|entryScore|`**

Replace the existing thresholds with:

```javascript
const absE = Math.abs(setup.entryScore);
const nv = absE >= 60 ? 'NV3' : absE >= 40 ? 'NV2' : absE >= 25 ? 'NV1' : null;
```

- [ ] **Step 5: Update UI min-score filter to map onto entry score**

Find the `state.score` filter usage (`grep -n "state.score" painel.html`). Comparisons should be against `Math.abs(setup.entryScore)`, not `setup.score`.

- [ ] **Step 6: Manual browser smoke**

Open `painel.html`, run a scan, confirm both badges visible, NV labels appear at the new thresholds.

- [ ] **Step 7: Commit**

```bash
git add painel.html
git commit -m "feat(ui): dual badges (R/E) + NV recalculated from entryScore"
```

---

### Task 7: `backend/scanner.js` — filter on entry score, regime gate

**Files:**
- Modify: `backend/scanner.js` (lines 111, 152–186)
- Modify: `backend/db.js` (add `regime_score`/`entry_score` migration)

- [ ] **Step 1: db.js migration — add columns to `trades`**

In `backend/db.js`, find the `trades` table migration block (it uses `PRAGMA table_info(trades)` pattern per CLAUDE.md). Add:

```javascript
const tradeCols = db.prepare(`PRAGMA table_info(trades)`).all().map(c => c.name);
if (!tradeCols.includes('regime_score')) {
  db.exec(`ALTER TABLE trades ADD COLUMN regime_score INTEGER`);
  console.log('[db] migration: added trades.regime_score');
}
if (!tradeCols.includes('entry_score')) {
  db.exec(`ALTER TABLE trades ADD COLUMN entry_score INTEGER`);
  console.log('[db] migration: added trades.entry_score');
}
```

- [ ] **Step 2: scanner.js — change filter from `score` to `Math.abs(entryScore)`**

Around line 152–186. Replace:

```javascript
if (setup.score >= parseInt(min_score)) {
  setup._rawType = TF_TYPE[tf] || 'day';
  ...
} else if (setup.score >= parseInt(min_score) - 15) { ... }
```

with:

```javascript
const absE = Math.abs(setup.entryScore);
const absR = Math.abs(setup.regimeScore);
// Regime gate: require minimum regime conviction (default 45)
if (absR < parseInt(account.min_regime ?? 45)) continue;

if (absE >= parseInt(min_score)) {
  setup._rawType = TF_TYPE[tf] || 'day';
  ...
} else if (absE >= parseInt(min_score) - 15) { ... }
```

The post-MTF re-check (line 179) also becomes `if (Math.abs(setup.entryScore) < parseInt(min_score)) continue;`.

The macro-trend block (line 182–186) is unchanged.

- [ ] **Step 3: Restart backend, manually trigger `/api/scan/preview`**

PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
npm run server
```

In another shell:

```powershell
curl -X POST http://localhost:3001/api/scan/preview
```

Expected: response candidates have `regimeScore` + `entryScore` fields.

- [ ] **Step 4: Commit**

```bash
git add backend/scanner.js backend/db.js
git commit -m "feat(backend): scanner filters by |entryScore|, regime gate, db migration"
```

---

### Task 8: agents-v2 `Candidate` + `OpenPayload` schemas accept signed scores

**Files:**
- Modify: `agents-v2/src/schemas.py`
- Test: `agents-v2/tests/test_schemas.py`

- [ ] **Step 1: Write failing test**

Append to `agents-v2/tests/test_schemas.py`:

```python
def test_candidate_accepts_signed_scores():
    from src.schemas import Candidate
    c = Candidate(
        coin="BTC", direction="buy", timeframe="1h",
        regime_score=72, entry_score=-15,  # signed allowed
        entry=100.0, stop=98.0, m1=102.0, m2=104.0, m3=106.0,
        stop_pct=-2.0, leverage=10,
    )
    assert c.regime_score == 72
    assert c.entry_score == -15

def test_candidate_rejects_legacy_score_field():
    from src.schemas import Candidate
    import pytest
    from pydantic import ValidationError
    # Missing required regime_score should fail
    with pytest.raises(ValidationError):
        Candidate(
            coin="BTC", direction="buy", timeframe="1h",
            entry=100.0, stop=98.0, m1=102.0, m2=104.0, m3=106.0,
            stop_pct=-2.0, leverage=10,
        )
```

- [ ] **Step 2: Run — confirm fail**

Run: `cd agents-v2; python -m pytest tests/test_schemas.py -v`
Expected: FAIL (Candidate still has `score: int`).

- [ ] **Step 3: Update `schemas.py`**

Replace `Candidate.score` with two fields, no `ge=0` constraint. Update `OpenPayload` to mirror.

```python
class Candidate(BaseModel):
    coin: str
    direction: Direction
    timeframe: Timeframe
    regime_score: int   # signed, uncapped
    entry_score: int    # signed, uncapped
    entry: float
    stop: float
    m1: float
    m2: float
    m3: float
    stop_pct: float
    leverage: int = Field(ge=1, le=125)
    signals: list[str] = Field(default_factory=list)
    scan_id: Optional[int] = None

    @field_validator("coin", mode="before")
    @classmethod
    def strip_usdt(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        s = v.upper()
        return s[:-4] if s.endswith("USDT") else s


class OpenPayload(BaseModel):
    coin: str
    direction: Direction
    timeframe: Timeframe
    regime_score: int   # new
    entry_score: int    # new
    entry: float
    stop: float
    m1: float
    m2: float
    m3: float
    stop_pct: float
    leverage: int
    type: Literal["scalp", "day", "swing"] = "day"
    signals: list[str] = Field(default_factory=list)

    @field_validator("coin", mode="before")
    @classmethod
    def no_usdt(cls, v: str) -> str:
        s = v.upper()
        return s[:-4] if s.endswith("USDT") else s
```

- [ ] **Step 4: Run — confirm pass**

Run: `cd agents-v2; python -m pytest tests/test_schemas.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents-v2/src/schemas.py agents-v2/tests/test_schemas.py
git commit -m "feat(agents-v2): Candidate/OpenPayload carry regime_score+entry_score (signed)"
```

---

### Task 9: `_normalize_candidate` maps dual-score fields

**Files:**
- Modify: `agents-v2/src/backend_client.py` (lines 50–73)
- Test: `agents-v2/tests/test_backend_client.py`

- [ ] **Step 1: Add failing test**

Append to `agents-v2/tests/test_backend_client.py`:

```python
def test_normalize_candidate_maps_dual_score():
    from src.backend_client import _normalize_candidate
    raw = {
        "coin": "BTC", "dir": "buy", "timeframe": "1h",
        "regimeScore": 55, "entryScore": -10,
        "entry": 100.0, "stop": 98.0,
        "m1": {"price": 102.0}, "m2": {"price": 104.0}, "m3": {"price": 106.0},
        "stopPct": "-2.00%", "leverage": 10, "reasons": [],
    }
    out = _normalize_candidate(raw)
    assert out["regime_score"] == 55
    assert out["entry_score"] == -10
    assert "score" not in out
```

- [ ] **Step 2: Run — confirm fail**

Run: `cd agents-v2; python -m pytest tests/test_backend_client.py::test_normalize_candidate_maps_dual_score -v`
Expected: FAIL.

- [ ] **Step 3: Update `_normalize_candidate`**

Replace `"score": c.get("score", 0),` with:

```python
        "regime_score": int(c.get("regimeScore", 0)),
        "entry_score":  int(c.get("entryScore", 0)),
```

- [ ] **Step 4: Run — confirm pass**

Run: `cd agents-v2; python -m pytest tests/test_backend_client.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents-v2/src/backend_client.py agents-v2/tests/test_backend_client.py
git commit -m "feat(agents-v2): _normalize_candidate maps regimeScore/entryScore"
```

---

### Task 10: `run_council.py` dual-threshold pre-filter

**Files:**
- Modify: `agents-v2/src/config.py`
- Modify: `agents-v2/run_council.py` (lines 56–62)

- [ ] **Step 1: Add config thresholds**

In `agents-v2/src/config.py`, add:

```python
COUNCIL_MIN_REGIME  = int(os.environ.get("COUNCIL_MIN_REGIME",  "45"))
COUNCIL_MIN_ENTRY   = int(os.environ.get("COUNCIL_MIN_ENTRY",   "30"))
COUNCIL_4H_MIN_ENTRY = int(os.environ.get("COUNCIL_4H_MIN_ENTRY", "50"))
```

Remove or keep `MIN_SCORE` for back-compat; it is no longer referenced after this task.

- [ ] **Step 2: Update `run_council.py`**

Replace the eligibility block (lines 56–62):

```python
SHORT_TFS = {"5m", "15m", "30m"}

def _passes(c: dict) -> bool:
    tf = c.get("timeframe")
    if tf in SHORT_TFS:
        return False
    regime = abs(int(c.get("regime_score", 0)))
    entry  = abs(int(c.get("entry_score", 0)))
    min_entry = config.COUNCIL_4H_MIN_ENTRY if tf == "4h" else config.COUNCIL_MIN_ENTRY
    return regime >= config.COUNCIL_MIN_REGIME and entry >= min_entry

eligible = [c for c in raw_candidates if _passes(c)]
log.info("%d candidates pass dual-threshold (regime>=%d, entry>=%d, 4h_entry>=%d)",
         len(eligible), config.COUNCIL_MIN_REGIME, config.COUNCIL_MIN_ENTRY, config.COUNCIL_4H_MIN_ENTRY)
```

Also update the log line at line 50 — replace `min_score=%s` with the three thresholds.

- [ ] **Step 3: Smoke test**

Run: `cd agents-v2; python run_council.py --dry-run`
Expected: logs show new threshold values, council runs (or 0 eligible — that is fine).

- [ ] **Step 4: Commit**

```bash
git add agents-v2/src/config.py agents-v2/run_council.py
git commit -m "feat(agents-v2): run_council pre-filter uses regime + entry thresholds"
```

---

### Task 11: Fix pre-existing scoring tests that asserted `out.score`

**Files:**
- Modify: `tests/scoring.test.js`, `tests/scanner-filters.test.js`, `tests/integration.test.js`, any others.

- [ ] **Step 1: Run full vitest suite to locate breakage**

Run: `npx vitest run`
Expected: failures of the form `expected ... received undefined` on fields named `score`.

- [ ] **Step 2: Rewrite assertions**

For each failing test, replace `expect(out.score)...` with the appropriate dual-score assertion. Heuristic:
- If the test checked `score > N` → `expect(Math.abs(out.entryScore)).toBeGreaterThan(N)`.
- If the test checked `score === 0` → `expect(out.entryScore).toBe(0)` and `expect(out.regimeScore).toBe(0)`.
- Tests that filtered by `min_score` → use the new `options.score` semantics (entry threshold).

- [ ] **Step 3: Run again, confirm green**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: update scoring/filter/integration tests for dual-score"
```

---

### Task 12: `backend/routes/trades.js` accepts dual-score on open

**Files:**
- Modify: `backend/routes/trades.js`
- Modify: `backend/paper-trader.js` (insert into trades row)

- [ ] **Step 1: trades.js — read regime/entry from payload**

`grep -n "setup.score\|setup.dir" backend/routes/trades.js` to find the open-trade handler. Add reads for `setup.regime_score` and `setup.entry_score`. Validate as integers (any sign). Pass into `openPosition`.

- [ ] **Step 2: paper-trader.js — persist new columns**

In `openPosition`, extend the INSERT statement to include the two new columns. Use `setup.regime_score ?? null` and `setup.entry_score ?? null`.

- [ ] **Step 3: Manual integration check**

Restart backend, run `python run_council.py --dry-run` against a live scan. No 400/500 in backend logs.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/trades.js backend/paper-trader.js
git commit -m "feat(backend): persist regime_score+entry_score on trade open"
```

---

### Task 13: SP1 — update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the dual-score system**

Replace the "Scoring Engine (`_computeScore`)" section with a new "Scoring Engine (dual-score)" section listing the two functions, indicator classification, direction conflict rule, and uncapped semantics. Bullet the new config knobs (`COUNCIL_MIN_REGIME`, `COUNCIL_MIN_ENTRY`, `COUNCIL_4H_MIN_ENTRY`).

Add to "Common Pitfalls":

- `analyzeCandles` returns `regimeScore`+`entryScore`, never `score`. Frontend, backend, and Python must read both.
- Conflict (sign mismatch) returns null — feature, not a bug.
- MTF confluence bonus only inflates entry score; regime stays untouched.
- `painel.html` mirrors the JS engine — both files change together.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE.md): dual-score engine + new agents-v2 thresholds"
```

---

# SP2 — Validator Agent

### Task 14: Add `ValidatorOutput` schema and `CouncilState.validator`

**Files:**
- Modify: `agents-v2/src/schemas.py`
- Test: `agents-v2/tests/test_schemas.py`

- [ ] **Step 1: Write failing test**

Append:

```python
def test_validator_output_shape():
    from src.schemas import ValidatorOutput
    v = ValidatorOutput(
        verdict="REJECT", confidence=80, key_concern="stale BOS signal",
        tf_coherent=True, signals_verified=False,
        chronic_candidate=True, saturation_percentile=0.92,
    )
    assert v.verdict == "REJECT"
    assert 0 <= v.saturation_percentile <= 1
```

- [ ] **Step 2: Run — confirm fail**

Run: `cd agents-v2; python -m pytest tests/test_schemas.py::test_validator_output_shape -v`

- [ ] **Step 3: Add schema**

In `agents-v2/src/schemas.py` after `NewsOutput`:

```python
class ValidatorOutput(BaseModel):
    verdict: Literal["VALIDATE", "DOWNGRADE", "REJECT"]
    confidence: int = Field(ge=0, le=100)
    key_concern: str
    tf_coherent: bool
    signals_verified: bool
    chronic_candidate: bool = False
    saturation_percentile: float = Field(ge=0.0, le=1.0, default=0.0)
```

Extend `CouncilState`:

```python
class CouncilState(BaseModel):
    candidate: Candidate
    validator: Optional[ValidatorOutput] = None
    technical: Optional[TechnicalOutput] = None
    ...
```

- [ ] **Step 4: Run — confirm pass**

Run: `cd agents-v2; python -m pytest tests/test_schemas.py -v`

- [ ] **Step 5: Commit**

```bash
git add agents-v2/src/schemas.py agents-v2/tests/test_schemas.py
git commit -m "feat(agents-v2): ValidatorOutput schema + CouncilState.validator field"
```

---

### Task 15: Deterministic pre-checks (chronic_candidate, saturation_percentile)

**Files:**
- Create: `agents-v2/src/agents/validator.py`
- Test: `agents-v2/tests/test_agents_validator.py`

- [ ] **Step 1: Write failing tests for the pure helpers**

Create `agents-v2/tests/test_agents_validator.py`:

```python
from src.agents.validator import is_chronic_candidate, saturation_percentile

def test_chronic_candidate_true_when_seen_repeatedly():
    history = [
        {"candidate_coin": "BTC", "candidate_tf": "1h", "final_decision": "SKIP"},
    ] * 8
    assert is_chronic_candidate("BTC", "1h", history) is True

def test_chronic_candidate_false_when_not_repeated():
    history = [
        {"candidate_coin": "ETH", "candidate_tf": "1h", "final_decision": "SKIP"},
    ] * 8
    assert is_chronic_candidate("BTC", "1h", history) is False

def test_saturation_percentile_top_of_batch():
    scan_regime_scores = [40, 50, 55, 60, 90]
    p = saturation_percentile(90, scan_regime_scores)
    assert p == 1.0

def test_saturation_percentile_middle():
    p = saturation_percentile(55, [40, 50, 55, 60, 90])
    assert 0.4 <= p <= 0.7
```

- [ ] **Step 2: Run — confirm fail**

Run: `cd agents-v2; python -m pytest tests/test_agents_validator.py -v`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement pure helpers**

Create `agents-v2/src/agents/validator.py`:

```python
"""Validator agent — deterministic pre-checks + LLM verification."""
import logging
from typing import Any

from src.llm_client import call_llm
from src.schemas import Candidate, ValidatorOutput

log = logging.getLogger(__name__)

CHRONIC_THRESHOLD = 6   # appearances out of last 10 scans
CHRONIC_LOOKBACK  = 10


def is_chronic_candidate(coin: str, tf: str, history: list[dict]) -> bool:
    """True if (coin, tf) has appeared in >=CHRONIC_THRESHOLD of the last
    CHRONIC_LOOKBACK scan decisions without ever opening."""
    recent = history[-CHRONIC_LOOKBACK:]
    hits = sum(
        1 for h in recent
        if h.get("candidate_coin") == coin
        and h.get("candidate_tf") == tf
        and h.get("final_decision") in ("SKIP", "BLOCKED")
    )
    return hits >= CHRONIC_THRESHOLD


def saturation_percentile(regime_score: int, batch_scores: list[int]) -> float:
    """Where does this regime score sit in the current scan batch?
    Higher = more saturated (everyone bullish at the same time)."""
    if not batch_scores:
        return 0.0
    below = sum(1 for s in batch_scores if abs(s) <= abs(regime_score))
    return below / len(batch_scores)
```

- [ ] **Step 4: Run — confirm helpers pass**

Run: `cd agents-v2; python -m pytest tests/test_agents_validator.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents-v2/src/agents/validator.py agents-v2/tests/test_agents_validator.py
git commit -m "feat(validator): deterministic pre-checks (chronic, saturation)"
```

---

### Task 16: Validator prompt builder

**Files:**
- Create: `agents-v2/src/prompts/validator.py`

- [ ] **Step 1: Write the prompt builder**

```python
"""Prompt builder for the validator agent."""
from src.schemas import Candidate


SYSTEM = """You are the validator gate before a 5-agent trading council reviews a candidate.

Your job: detect 3 failure modes before any tokens are spent:
1. Stale or fake signals (BOS/CHoCH/Squeeze from many candles ago, not a fresh event).
2. TF incoherence (1h says BUY but 4h structure says SELL → re-check).
3. Saturation (regime score is in top 10% of the batch — likely "bull market" noise, not edge).

Return STRICTLY this JSON shape:
{
  "verdict": "VALIDATE" | "DOWNGRADE" | "REJECT",
  "confidence": <int 0-100>,
  "key_concern": "<one sentence>",
  "tf_coherent": <bool>,
  "signals_verified": <bool>,
  "chronic_candidate": <bool — copy from input>,
  "saturation_percentile": <float — copy from input>
}

VALIDATE = let council run normally.
DOWNGRADE = let council run but flag skepticism (trader weights accordingly).
REJECT = early exit; do not run analysts.

Reject if: chronic_candidate=true AND saturation_percentile>0.8, OR signals_verified=false on the primary entry signal."""


def build(cand: Candidate, *, chronic: bool, saturation: float,
          signals: list[str]) -> tuple[str, str]:
    user = (
        f"Coin: {cand.coin}\n"
        f"Direction: {cand.direction}\n"
        f"Timeframe: {cand.timeframe}\n"
        f"Regime score: {cand.regime_score}\n"
        f"Entry score: {cand.entry_score}\n"
        f"Pre-checks:\n"
        f"  chronic_candidate: {chronic}\n"
        f"  saturation_percentile: {saturation:.2f}\n"
        f"Reported signals (top 8):\n  - "
        + "\n  - ".join(signals[:8])
        + "\n\nVerdict?"
    )
    return SYSTEM, user
```

- [ ] **Step 2: Commit**

```bash
git add agents-v2/src/prompts/validator.py
git commit -m "feat(validator): prompt builder for Cerebras Qwen3"
```

---

### Task 17: Validator agent LLM call + fallback

**Files:**
- Modify: `agents-v2/src/agents/validator.py`
- Modify: `agents-v2/src/llm_client.py`
- Test: `agents-v2/tests/test_agents_validator.py`

- [ ] **Step 1: Add validator route**

In `agents-v2/src/llm_client.py`, extend `ROUTES`:

```python
    "validator":     {"primary": "cerebras-qwen235b",   "fallback": "groq-llama70b"},
```

- [ ] **Step 2: Write failing test for the `run` function fallback**

Append to `tests/test_agents_validator.py`:

```python
def test_validator_run_fallback_on_llm_error(monkeypatch):
    from src.agents import validator
    from src.schemas import Candidate

    cand = Candidate(
        coin="BTC", direction="buy", timeframe="1h",
        regime_score=55, entry_score=35,
        entry=100.0, stop=98.0, m1=102.0, m2=104.0, m3=106.0,
        stop_pct=-2.0, leverage=10, signals=["RSI 22 — Sobrevendido"],
    )

    def boom(*a, **kw):
        raise RuntimeError("provider down")
    monkeypatch.setattr("src.agents.validator.call_llm", boom)

    state = {"candidate": cand.model_dump(),
             "scan_batch_regime_scores": [40, 50, 55, 60],
             "history": []}
    out = validator.run(state)
    assert out["validator"]["verdict"] == "DOWNGRADE"  # safe fallback
    assert "errors" in out
```

- [ ] **Step 3: Run — confirm fail**

Run: `cd agents-v2; python -m pytest tests/test_agents_validator.py::test_validator_run_fallback_on_llm_error -v`

- [ ] **Step 4: Implement `run` in `validator.py`**

Append to `agents-v2/src/agents/validator.py`:

```python
from src.prompts.validator import build as build_prompt


def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    batch = state.get("scan_batch_regime_scores", [])
    history = state.get("history", [])

    chronic = is_chronic_candidate(cand.coin, cand.timeframe, history)
    sat = saturation_percentile(cand.regime_score, batch)

    sys, user = build_prompt(cand, chronic=chronic, saturation=sat,
                             signals=cand.signals)
    try:
        raw = call_llm("validator", system=sys, user=user, as_json=True)
        # Force-overwrite the deterministic fields (LLM may hallucinate them)
        raw["chronic_candidate"] = chronic
        raw["saturation_percentile"] = sat
        out = ValidatorOutput(**raw)
        return {"validator": out.model_dump()}
    except Exception as e:
        log.error("validator failed: %s — DOWNGRADE fallback", e)
        fallback = ValidatorOutput(
            verdict="DOWNGRADE", confidence=0,
            key_concern=f"validator error: {e}",
            tf_coherent=True, signals_verified=False,
            chronic_candidate=chronic, saturation_percentile=sat,
        )
        return {
            "validator": fallback.model_dump(),
            "errors": [f"validator: {e}"],
        }
```

- [ ] **Step 5: Run — confirm pass**

Run: `cd agents-v2; python -m pytest tests/test_agents_validator.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents-v2/src/agents/validator.py agents-v2/src/llm_client.py agents-v2/tests/test_agents_validator.py
git commit -m "feat(validator): LLM call via Cerebras + safe DOWNGRADE fallback"
```

---

### Task 18: Wire validator into LangGraph with conditional routing

**Files:**
- Modify: `agents-v2/src/graph.py`
- Test: `agents-v2/tests/test_graph_smoke.py`

- [ ] **Step 1: Write failing smoke test**

Append to `agents-v2/tests/test_graph_smoke.py`:

```python
def test_graph_early_exits_on_reject(monkeypatch):
    from src.graph import run_council
    from src.schemas import Candidate

    # Force validator to REJECT
    def fake_validator_run(state):
        return {"validator": {
            "verdict": "REJECT", "confidence": 95, "key_concern": "test",
            "tf_coherent": True, "signals_verified": False,
            "chronic_candidate": True, "saturation_percentile": 0.95,
        }}
    monkeypatch.setattr("src.graph.run_validator", fake_validator_run)

    cand = Candidate(
        coin="BTC", direction="buy", timeframe="1h",
        regime_score=55, entry_score=35,
        entry=100.0, stop=98.0, m1=102.0, m2=104.0, m3=106.0,
        stop_pct=-2.0, leverage=10,
    )
    final = run_council(cand)
    assert final.get("technical") is None  # analysts did NOT run
    assert final.get("trader", {}).get("decision") == "SKIP"
```

- [ ] **Step 2: Run — confirm fail**

Run: `cd agents-v2; python -m pytest tests/test_graph_smoke.py::test_graph_early_exits_on_reject -v`

- [ ] **Step 3: Update `graph.py`**

Rewrite the graph build to add a `validator` entry node + conditional edges. Final shape:

```python
"""LangGraph orchestration for the council."""
import operator
from typing import TypedDict, Optional, Annotated
from langgraph.graph import StateGraph, END

from src.schemas import Candidate
from src.agents.technical import run as run_technical
from src.agents.sentiment import run as run_sentiment
from src.agents.news import run as run_news
from src.agents.bull import run as run_bull
from src.agents.bear import run as run_bear
from src.agents.trader import run as run_trader
from src.agents.validator import run as run_validator


class State(TypedDict, total=False):
    candidate: dict
    scan_batch_regime_scores: list[int]
    history: list[dict]
    validator: Optional[dict]
    technical: Optional[dict]
    sentiment: Optional[dict]
    news: Optional[dict]
    bull: Optional[dict]
    bear: Optional[dict]
    trader: Optional[dict]
    errors: Annotated[list[str], operator.add]


def _join_analysts(state: State) -> State:
    return {}


def _early_exit(state: State) -> State:
    """Emitted when validator REJECTs — synthesise SKIP trader output."""
    v = state.get("validator", {})
    return {"trader": {
        "decision": "SKIP",
        "reason": f"validator REJECT: {v.get('key_concern', 'n/a')}",
        "size_multiplier": 1.0,
        "payload": None,
    }}


def _route_after_validator(state: State) -> str:
    v = state.get("validator") or {}
    return "early_exit" if v.get("verdict") == "REJECT" else "analyst_technical"


def build_graph():
    g = StateGraph(State)
    g.add_node("validator", run_validator)
    g.add_node("early_exit", _early_exit)
    g.add_node("analyst_technical", run_technical)
    g.add_node("analyst_sentiment", run_sentiment)
    g.add_node("analyst_news", run_news)
    g.add_node("join_analysts", _join_analysts)
    g.add_node("researcher_bull", run_bull)
    g.add_node("researcher_bear", run_bear)
    g.add_node("decision_trader", run_trader)
    g.add_node("join_research", _join_analysts)

    g.set_entry_point("validator")
    g.add_conditional_edges("validator", _route_after_validator, {
        "early_exit": "early_exit",
        "analyst_technical": "analyst_technical",
    })
    g.add_edge("early_exit", END)

    # On VALIDATE/DOWNGRADE, run the 3 analysts (sentiment+news in parallel).
    g.add_edge("analyst_technical", "analyst_sentiment")
    g.add_edge("analyst_sentiment", "analyst_news")
    g.add_edge("analyst_news", "join_analysts")
    g.add_edge("join_analysts", "researcher_bull")
    g.add_edge("join_analysts", "researcher_bear")
    g.add_edge("researcher_bull", "join_research")
    g.add_edge("researcher_bear", "join_research")
    g.add_edge("join_research", "decision_trader")
    g.add_edge("decision_trader", END)
    return g.compile()


_GRAPH = None
def _get():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    return _GRAPH


def run_council(candidate: Candidate, *, batch_regime_scores: list[int] | None = None,
                history: list[dict] | None = None) -> dict:
    initial: State = {
        "candidate": candidate.model_dump(),
        "scan_batch_regime_scores": batch_regime_scores or [],
        "history": history or [],
        "errors": [],
    }
    return _get().invoke(initial)
```

Note: the old parallel fan-out from `__start__` to all three analysts is replaced by a serial chain `technical → sentiment → news → join`. This keeps the graph simple after the validator gate; if speed is an issue, re-parallelise sentiment+news with an explicit join later.

- [ ] **Step 4: Run smoke test — confirm pass**

Run: `cd agents-v2; python -m pytest tests/test_graph_smoke.py -v`

- [ ] **Step 5: Commit**

```bash
git add agents-v2/src/graph.py agents-v2/tests/test_graph_smoke.py
git commit -m "feat(validator): conditional graph routing — REJECT exits early"
```

---

### Task 19: `run_council.py` passes batch context to graph + logs validator

**Files:**
- Modify: `agents-v2/run_council.py`
- Modify: `agents-v2/src/db.py` (extend `agent_decisions` schema)

- [ ] **Step 1: db.js / db.py migration — add `validator_verdict` column**

In `agents-v2/src/db.py`, locate the `agent_decisions` `CREATE TABLE`. Add migration using `PRAGMA table_info(agent_decisions)`:

```python
cols = conn.execute("PRAGMA table_info(agent_decisions)").fetchall()
names = {c[1] for c in cols}
if "validator_verdict" not in names:
    conn.execute("ALTER TABLE agent_decisions ADD COLUMN validator_verdict TEXT")
```

Extend `insert_decision` signature to accept `validator_verdict: str | None = None` and persist it.

- [ ] **Step 2: Update `run_council.py`**

Replace the per-candidate loop body:

```python
    # Build batch context once (before the loop)
    batch_regime_scores = [int(c.get("regime_score", 0)) for c in eligible]
    from src.db import get_recent_decisions
    history = get_recent_decisions(limit=200)  # for chronic detection

    for c in eligible:
        try:
            candidate = Candidate(**c, scan_id=scan_id)
        except Exception as e:
            log.warning("skip malformed candidate %s: %s", c.get("coin"), e)
            continue

        log.info("→ council on %s %s %s (R=%d, E=%d)",
                 candidate.coin, candidate.direction, candidate.timeframe,
                 candidate.regime_score, candidate.entry_score)
        final = run_council_fn(candidate, batch_regime_scores=batch_regime_scores,
                               history=history)
        validator = final.get("validator") or {}
        v_verdict = validator.get("verdict", "MISSING")
        trader = final.get("trader") or {}
        decision = trader.get("decision", "ERROR")
        reason = trader.get("reason", "no trader output")
        log.info("  validator=%s decision=%s reason=%s", v_verdict, decision, reason)
        ...
        insert_decision(
            ..., validator_verdict=v_verdict, ...
        )
```

Where `run_council_fn` is the imported `run_council` from `src.graph` (rename the local symbol to avoid collision with the module name if needed).

Also add `get_recent_decisions(limit)` to `src/db.py` if it does not exist yet (returns rows from `agent_decisions` ordered by created_at DESC).

- [ ] **Step 3: Smoke test**

Run: `cd agents-v2; python run_council.py --dry-run`
Expected: logs show `validator=VALIDATE|DOWNGRADE|REJECT decision=...`.

- [ ] **Step 4: Commit**

```bash
git add agents-v2/run_council.py agents-v2/src/db.py
git commit -m "feat(validator): run_council passes batch context, logs+persists verdict"
```

---

### Task 20: SP2 — update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the validator**

Add to the "Agents v0.2 — Free Council (Python)" section:

```
- `validator` (Cerebras Qwen3 235B, fallback Groq) — first gate in the graph. Deterministic pre-checks (chronic_candidate, saturation_percentile) + LLM verification (signal freshness, TF coherence). VALIDATE → council. DOWNGRADE → council with skepticism. REJECT → early exit (saves ~4.5k tokens).
```

Add to Pitfalls:

- Validator REJECT path bypasses analysts — `final.technical/sentiment/news/bull/bear` will all be None. Downstream consumers must handle this.
- Validator overrides the LLM's `chronic_candidate` and `saturation_percentile` with the deterministic values before constructing `ValidatorOutput`. Never trust the LLM for those two fields.
- Validator fallback on LLM error is DOWNGRADE (not REJECT) — fail-open so a transient provider issue doesn't silence the whole council.
- `agent_decisions.validator_verdict` is added by migration; old rows have NULL.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE.md): validator agent + SP2 pitfalls"
```

---

## Post-Implementation Calibration (not part of this plan)

After this plan ships:
1. Run `agents-v2/analyze_pairs.py` against the new dual-score data → find optimal `COUNCIL_MIN_REGIME` / `COUNCIL_MIN_ENTRY` / `COUNCIL_4H_MIN_ENTRY`.
2. Run `agents-v2/run_backtest_replay.py --since 2026-04-15` to measure validator accuracy on historical pairs.

These are operational follow-ups, not engineering tasks.
