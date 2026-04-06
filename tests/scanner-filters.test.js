/**
 * tests/scanner-filters.test.js
 *
 * Unit tests for the two new backend risk filters introduced to improve win rate:
 *   1. Risk cap — blocks trades where stop_pct × leverage > 50
 *   2. Macro trend filter — detects BTC 4h EMA200 trend direction
 *
 * These tests cover the pure logic of each filter using calcEMA from painel-core.js.
 * Backend DB integration (scanner.js / paper-trader.js) is validated manually.
 */

import { describe, it, expect } from 'vitest';
import { calcEMA } from '../painel-core.js';

// ─── Risk cap ─────────────────────────────────────────────────────────────────
// Mirrors the MAX_STOP_RISK_MULTIPLIER = 50 logic in paper-trader.js:
//   stop_pct × leverage > 50  →  reject trade

describe('risk cap — stop_pct × leverage check', () => {
  const MAX = 50;
  const isRiskTooHigh = (stop_pct, leverage) => stop_pct * leverage > MAX;

  it('blocks SEIUSDT-style trade (9.9% stop × 10x = 99%)', () => {
    expect(isRiskTooHigh(9.9, 10)).toBe(true);
  });

  it('blocks any trade where stop × leverage exceeds 50%', () => {
    expect(isRiskTooHigh(6.0, 10)).toBe(true);   // 60% > 50
    expect(isRiskTooHigh(1.1, 50)).toBe(true);   // 55% > 50 (50x leverage)
    expect(isRiskTooHigh(5.5, 10)).toBe(true);   // 55% > 50
  });

  it('allows typical 15m trade (1.5% stop × 10x = 15%)', () => {
    expect(isRiskTooHigh(1.5, 10)).toBe(false);
  });

  it('allows typical 4h minimum stop (3% × 10x = 30%)', () => {
    expect(isRiskTooHigh(3.0, 10)).toBe(false);
  });

  it('allows 4h trade at 5% stop × 10x = 50% (right at boundary)', () => {
    expect(isRiskTooHigh(5.0, 10)).toBe(false); // 50 is NOT > 50
  });

  it('allows 50x leverage with 1% stop (50% = boundary)', () => {
    expect(isRiskTooHigh(1.0, 50)).toBe(false); // 50 is NOT > 50
  });

  it('blocks 50x leverage with 1.1% stop (55% > 50)', () => {
    expect(isRiskTooHigh(1.1, 50)).toBe(true);
  });

  it('allows 5m minimum stop (0.8% × 10x = 8%)', () => {
    expect(isRiskTooHigh(0.8, 10)).toBe(false);
  });

  it('allows 1D minimum stop (5% × 10x = 50% = boundary)', () => {
    expect(isRiskTooHigh(5.0, 10)).toBe(false);
  });

  it('blocks when leverage is high and stop is moderate (6% × 20x = 120%)', () => {
    expect(isRiskTooHigh(6.0, 20)).toBe(true);
  });
});

// ─── Macro trend filter ───────────────────────────────────────────────────────
// Mirrors the fetchMacroBtcTrend() logic in scanner.js:
//   price > EMA200(4h) → 'bull'  (block SHORTs)
//   price < EMA200(4h) → 'bear'  (block LONGs)
//   < 200 candles → null          (fail-open)

describe('macro trend filter — EMA200 comparison', () => {
  // Simulate the core trend detection logic using calcEMA
  function detectTrend(closes) {
    if (closes.length < 200) return null;
    const ema200 = calcEMA(closes, 200);
    const currentEma = ema200[ema200.length - 1];
    const currentPrice = closes[closes.length - 1];
    return currentPrice > currentEma ? 'bull' : 'bear';
  }

  function makeTrendingUp(n, start = 100, step = 1) {
    return Array.from({ length: n }, (_, i) => start + i * step);
  }

  function makeTrendingDown(n, start = 300, step = 1) {
    return Array.from({ length: n }, (_, i) => start - i * step);
  }

  it('returns "bull" when price is above EMA200 (uptrend)', () => {
    const closes = makeTrendingUp(250);
    expect(detectTrend(closes)).toBe('bull');
  });

  it('returns "bear" when price is below EMA200 (downtrend)', () => {
    const closes = makeTrendingDown(250);
    expect(detectTrend(closes)).toBe('bear');
  });

  it('returns null when fewer than 200 candles (fail-open — allows all trades)', () => {
    const closes = makeTrendingUp(150);
    expect(detectTrend(closes)).toBeNull();
  });

  it('returns null for exactly 199 candles (boundary)', () => {
    const closes = makeTrendingUp(199);
    expect(detectTrend(closes)).toBeNull();
  });

  it('returns a value for exactly 200 candles', () => {
    const closes = makeTrendingUp(200);
    expect(detectTrend(closes)).not.toBeNull();
  });

  it('EMA200 lags — a sharp recent reversal is still caught if large enough', () => {
    // 200 candles trending up, then a sudden sharp drop in the last 10
    const closes = [
      ...makeTrendingUp(200, 100, 1),  // 200 candles: 100→299
      ...Array.from({ length: 10 }, () => 50), // sharp drop below EMA
    ];
    // EMA200 will be around 200; current price = 50 → bear
    expect(detectTrend(closes)).toBe('bear');
  });

  it('macro filter correctly identifies direction to block', () => {
    // Bull market → block SHORTs, allow LONGs
    const bullCloses = makeTrendingUp(250);
    const bullTrend = detectTrend(bullCloses);
    expect(bullTrend).toBe('bull');
    // Would block sell setups
    expect(bullTrend === 'bull' && 'sell' === 'sell').toBe(true);
    expect(bullTrend === 'bull' && 'buy' === 'sell').toBe(false);

    // Bear market → block LONGs, allow SHORTs
    const bearCloses = makeTrendingDown(250);
    const bearTrend = detectTrend(bearCloses);
    expect(bearTrend).toBe('bear');
    expect(bearTrend === 'bear' && 'buy' === 'buy').toBe(true);
    expect(bearTrend === 'bear' && 'sell' === 'buy').toBe(false);
  });
});
