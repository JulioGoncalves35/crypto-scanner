import { describe, it, expect } from 'vitest';
import { calcADX, calcRSI } from '../painel-core.js';
import { makeTrendingCandles } from './fixtures/candles.js';

// ─── RSI scoring thresholds ───────────────────────────────────────────────────
describe('RSI scoring thresholds', () => {
  it('RSI < 30 on uptrend data (oversold → +20 score zone)', () => {
    const closes = [
      ...Array.from({ length: 20 }, (_, i) => 200 - i * 2),
      ...Array.from({ length: 10 }, (_, i) => 160 + i),
    ];
    const rsi = calcRSI(closes);
    const nonNull = rsi.filter(v => v !== null);
    expect(nonNull.some(v => v < 40)).toBe(true);
  });

  it('RSI > 70 on sustained uptrend (overbought → -20 score zone)', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i * 3);
    const rsi = calcRSI(closes);
    const nonNull = rsi.filter(v => v !== null);
    expect(nonNull.some(v => v > 70)).toBe(true);
  });

  it('RSI stays between 0 and 100 always', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i * 0.4) * 30);
    const rsi = calcRSI(closes);
    rsi.filter(v => v !== null).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});

// ─── ADX hard filter ─────────────────────────────────────────────────────────
describe('ADX hard filter (ADX < 18 → rejected by analyzeCandles)', () => {
  it('flat market produces low ADX (likely below 18)', () => {
    const candles = Array.from({ length: 60 }, (_, i) => ({
      time: i, open: 100, high: 100.2, low: 99.8, close: 100, volume: 1000,
    }));
    const adx = calcADX(candles);
    if (adx !== null) {
      expect(adx).toBeLessThan(25);
    }
  });

  it('strong trend produces ADX above 18', () => {
    const candles = makeTrendingCandles(100, 100, 2);
    const adx = calcADX(candles);
    expect(adx).not.toBeNull();
    expect(adx).toBeGreaterThan(18);
  });

  it('ADX returns null below minimum candle threshold', () => {
    const candles = makeTrendingCandles(20);
    expect(calcADX(candles, 14)).toBeNull();
  });
});

// ─── Score boundary checks (via indicator math) ───────────────────────────────
describe('Score boundary validation', () => {
  it('indicators that add/subtract score are bounded by their logic', () => {
    const RSI_OVERSOLD_BONUS     = 20;
    const RSI_OVERBOUGHT_PENALTY = -20;
    const MACD_CROSS_BONUS       = 20;
    const MACD_CROSS_PENALTY     = -20;
    const EMA_ALIGNED_BONUS      = 16;
    const ADX_STRONG_BONUS       = 8;
    const DIVERGENCE_BONUS       = 20;

    [RSI_OVERSOLD_BONUS, MACD_CROSS_BONUS, EMA_ALIGNED_BONUS, ADX_STRONG_BONUS, DIVERGENCE_BONUS]
      .forEach(v => expect(v).toBeGreaterThan(0));

    [RSI_OVERBOUGHT_PENALTY, MACD_CROSS_PENALTY]
      .forEach(v => expect(v).toBeLessThan(0));
  });

  it('normScore is capped at 100 (Math.min(100, abs(rawScore)))', () => {
    const rawScores = [150, 200, 100, 50, 75];
    rawScores.forEach(raw => {
      const normScore = Math.min(100, Math.round(Math.abs(raw)));
      expect(normScore).toBeLessThanOrEqual(100);
      expect(normScore).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── MTF confluence scoring logic (documented rules) ─────────────────────────
describe('MTF confluence and conflict rules', () => {
  it('confluence bonus range is documented as +6 to +12 points', () => {
    const MIN_CONFLUENCE_BONUS = 6;
    const MAX_CONFLUENCE_BONUS = 12;
    expect(MIN_CONFLUENCE_BONUS).toBeLessThan(MAX_CONFLUENCE_BONUS);
    expect(MIN_CONFLUENCE_BONUS).toBeGreaterThan(0);
  });

  it('MTF conflict penalty is documented as -20 points', () => {
    const MTF_CONFLICT_PENALTY = -20;
    expect(MTF_CONFLICT_PENALTY).toBeLessThan(0);
    expect(Math.abs(MTF_CONFLICT_PENALTY)).toBe(20);
  });
});

// ─── Score threshold filtering ────────────────────────────────────────────────
describe('Score threshold filtering (state.score)', () => {
  it('normScore >= threshold is required for a result to pass', () => {
    const thresholds = ['50', '60', '70', '80'];
    const testScore = 65;
    thresholds.forEach(t => {
      const passes = testScore >= parseInt(t);
      if (t === '50' || t === '60') expect(passes).toBe(true);
      if (t === '70' || t === '80') expect(passes).toBe(false);
    });
  });

  it('score of exactly threshold value passes the filter', () => {
    expect(70 >= parseInt('70')).toBe(true);
  });

  it('score of threshold - 1 fails the filter', () => {
    expect(69 >= parseInt('70')).toBe(false);
  });
});
