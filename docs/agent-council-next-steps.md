# Agent Council — Next Steps & Pending Findings

> Resume document — saved 2026-04-27. Captures the state of the agent-council exploration so you can pick up later without re-deriving context.

## TL;DR — what we did this session

1. **Brainstormed an agent-council design** — Leader + 3 sub-agents (News Hunter, Pattern Validator, Devil's Advocate). Decision: validate via Claude Code subagents BEFORE paying for production agents.
2. **Ran the council on two active trades** (AVAX 15m, AAVE 4h). Both runs surfaced concrete, actionable findings the scanner alone couldn't.
3. **Fixed one bug** (in-progress candle false positive). 4 other findings are still pending — see below.

---

## Pending action items (priority order)

### 🔴 1. Investigate stop-integrity gap in `price-checker.js`

**Finding:** AAVE 4h candle at 16:00Z made a low of **95.10**, which is **18 cents below the stop at 95.28**. The stop should have triggered intra-bar but didn't, because the price-checker cron polls current price every 5 min via `/v5/market/tickers` (not OHLC). If the dip happened between polls, it was missed.

**To verify:**
- Read `backend/price-checker.js` to confirm the polling model.
- Decide if the cron should also fetch the latest 5m kline each cycle and check `low <= stop` against the wick — not just current price.

**Why it matters:** With 10x leverage, a stop bypass means trades stay open well past their risk budget. This may explain part of the 3.6% WR.

---

### 🟠 2. Bump `min_score` from 80 → 88+

**Finding:** Account is configured with `min_score = 80`. Per CLAUDE.md, the 80–84 band has ~9% backtest win rate; the migration `db.js:84-91` was supposed to bump this to 85, but only fires when value === 70. Yours is 80 (set manually at some point), so the migration left it alone.

**Account state:** 138 trades · 5W / 73L / 50 expired · WR 3.6% · P&L -$39.39 · capital $862.83.

**Action (single API call, does NOT touch current_capital):**
```bash
curl -X POST http://localhost:3001/api/account/setup \
  -H "Content-Type: application/json" \
  -d '{"initial_capital":1000,"alloc_pct":2,"max_positions":10,"min_score":88,"leverage":10}'
```

Adjust `min_score` to 85, 88, or 90 based on appetite.

---

### 🟢 3. Commit the in-progress candle fix

**What was changed:**
- `painel-core.js` — added `TF_INTERVAL_MS` constant (line ~1155) and dropped in-progress candle in `fetchCandles` (line ~1198+).
- `painel.html` — same change mirrored (lines ~1099, ~1147+).

**Tests:** all 335/335 Vitest tests pass.

**Suggested commit message:**
```
fix(scanner): drop in-progress candle from fetchCandles to prevent false-positive patterns

Bybit's kline endpoint returns the in-progress candle as the most recent
element. Pattern detectors that test shape ratios (Marubozu body/range >= 95%,
Doji body/range < 10%, etc.) trigger spuriously on partial candles where
body ≈ range due to limited tick history. This caused at least one observed
false-positive Marubozu Altista that fed into a counter-trend long.

Drops `candles[n-1]` if its close-time is still in the future. Mirrored across
painel-core.js and painel.html per project convention.

Tests: 335/335 passing.
```

---

### ✅ 4. Vitest test for the in-progress candle drop — DONE

Added 7 dedicated tests in `tests/api.test.js` under `describe('fetchCandles — in-progress candle drop')`. Uses `vi.useFakeTimers()` + `vi.setSystemTime()` to make `Date.now()` deterministic. Coverage:

- 15m partial candle is dropped (mid-window)
- All candles kept when newest is already closed (>1 interval old)
- Boundary: candle whose close-time equals `Date.now()` exactly is kept (strict `>` semantics)
- 5m and 1D variants — confirms `TF_INTERVAL_MS` lookup works across all supported TFs
- 4h almost-closed (3h59m in) is still dropped
- Edge case: lone in-progress candle returns `[]` (documents current behavior)

Suite: 342/342 passing.

---

### 🔵 5. Refine the agent prompts for production (when ready)

Two refinements were proven empirically across the two runs:

**A. News Hunter — keep the Verification Section.**
The AVAX run hallucinated "$15.6M token unlock on Apr 25" (fabricated). The AAVE run, with an explicit "Verification Section: list ≥2 sources for any specific number/date with confidence labels" instruction, properly verified KelpDAO ($292M, 3 sources), AAVE TVL drop ($6B+, 2 sources), and flagged "$161M bailout" as medium confidence (single source). The fix works — bake it into the production prompt.

**B. Pattern Validator — require score-vs-coherence reconciliation.**
In both runs, the Validator independently said "score X is wrong, should be Y" without being asked. Make this an explicit required output: `[SCORE RECALIBRATION] — given the contradictions, what should the score be?` This catches "100/100 on counter-trend setup" cases the deterministic scoring misses.

---

## Council design — what proved valuable

| Sub-agent | Highest-value contribution |
|---|---|
| **News Hunter** | Adds an entire layer the scanner lacks. Best on macro/sector context (KelpDAO contagion, BTC dominance rotation, USDC liquidity crisis). Caveat: needs strict citation guardrails. |
| **Pattern Validator** | Caught the in-progress candle bug independently. Caught false-positive Marubozu independently. Score recalibration is its killer feature. |
| **Devil's Advocate** | Caught the stop-integrity issue independently. Best at translating abstract risk into concrete invalidation triggers. Time-based exit recommendations are uniquely actionable. |
| **Leader (synthesis)** | Currently played by main thread. In production, this is either a model with explicit weighting rules OR deterministic logic combining the three confidences. |

## Open design questions for production

- **Cost throttle:** only invoke the council when `score >= 85`? Or include scores 70+ to learn from rejected setups?
- **Aggregation rule:** veto (any "no" blocks)? majority vote? weighted Leader synthesis with confidence numbers?
- **Async vs sync:** dispatch in parallel always (latency-optimized) or sequential (each agent sees prior agent's output)?
- **Active-trade vs entry mode:** for active trades, council recommends HOLD/EXIT/TIGHTEN. For entry, council is GATE/ALLOW. Same prompt or two prompt sets?
- **Caching:** hash the signal stack so identical setups don't re-run. Saves ~30-60% of cost in volatile periods.
- **Model selection:** Sonnet 4.6 for sub-agents (cheap, fast), Opus for Leader synthesis only? Or all on Sonnet?

---

## Pointers to original raw data (still in current trades / DB)

- AVAX trade ID: `1777311024668-AVAX-15m`
- AAVE trade ID: `1777301161877-AAVE-4h`
- Both currently active in `paper_account` — outcomes will be in DB once they resolve.
- Backend running on `:3001`; check active trades: `GET /api/trades/active`.

## Files touched this session

- `painel-core.js` — bug fix (lines ~1155, ~1198–1210)
- `painel.html` — bug fix mirrored (lines ~1099, ~1147+)
- `docs/agent-council-next-steps.md` — this file
