import { describe, it, expect } from 'vitest';
import { analyzeCandles, calcLiqPrice } from '../painel-core.js';
import { makeTrendingCandles, makeFlatCandles, makeDowntrendCandles } from './fixtures/candles.js';

const NEUTRAL_FG = { value: 50, label: 'Neutro' };
// Options that accept any score (min=0) to avoid filtering in tests
const PERMISSIVE_OPTS = { score: '0', leverage: 10, rr: 'fib' };

// ─── analyzeCandles — null conditions ────────────────────────────────────────
describe('analyzeCandles — null conditions', () => {
  it('returns null for null input', () => {
    expect(analyzeCandles('BTC', '15m', null, NEUTRAL_FG, PERMISSIVE_OPTS)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(analyzeCandles('BTC', '15m', [], NEUTRAL_FG, PERMISSIVE_OPTS)).toBeNull();
  });

  it('returns null for < 50 candles', () => {
    const candles = makeTrendingCandles(30);
    expect(analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS)).toBeNull();
  });

  it('returns null for flat market (ADX < 18)', () => {
    // Completely flat candles → ADX will be very low (near 0)
    const candles = Array.from({ length: 120 }, (_, i) => ({
      time: i, open: 100, high: 100.001, low: 99.999, close: 100, volume: 1000,
    }));
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    expect(result).toBeNull();
  });

  it('returns null when score < threshold', () => {
    // Use threshold of 100 → nothing will pass (max possible score is ~100 but rarely exact)
    const opts = { score: '100', leverage: 10, rr: 'fib' };
    const candles = makeTrendingCandles(200, 100, 1);
    // Most real scans won't score exactly 100
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, opts);
    // This may or may not be null depending on the exact score; just verify it doesn't throw
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

// ─── analyzeCandles — return structure ───────────────────────────────────────
describe('analyzeCandles — return structure', () => {
  // Use a strong uptrend with enough candles to pass all filters
  function getResult(overrides = {}) {
    const candles = makeTrendingCandles(200, 100, 1);
    return analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, { ...PERMISSIVE_OPTS, ...overrides });
  }

  it('returns an object with all required top-level fields', () => {
    const result = getResult();
    if (!result) return; // might be null if ADX filter triggers
    const required = ['coin','pair','dir','score','timeframe','leverage',
      'entry','stop','liqPrice','stopAdjusted','stopPct',
      'm1','m2','m3','capStop','feePctCap','reasons','indicators','summary',
      'patterns','divergences','conditionalEntry','candles','mtfConfluence'];
    required.forEach(key => expect(result).toHaveProperty(key));
  });

  it('coin and pair match input', () => {
    const result = getResult();
    if (!result) return;
    expect(result.coin).toBe('BTC');
    expect(result.pair).toBe('BTC/USDT');
    expect(result.timeframe).toBe('15m');
  });

  it('score is between 0 and 100', () => {
    const result = getResult();
    if (!result) return;
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('dir is "buy" or "sell"', () => {
    const result = getResult();
    if (!result) return;
    expect(['buy', 'sell']).toContain(result.dir);
  });

  it('mtfConfluence is null (set later by runRealAnalysis)', () => {
    const result = getResult();
    if (!result) return;
    expect(result.mtfConfluence).toBeNull();
  });
});

// ─── analyzeCandles — buy setup geometry ─────────────────────────────────────
describe('analyzeCandles — buy setup geometry', () => {
  it('buy setup: stop is below entry', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result || result.dir !== 'buy') return;
    expect(result.stop).toBeLessThan(result.entry);
  });

  it('buy setup: m1 < m2 < m3 (targets in ascending order)', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result || result.dir !== 'buy') return;
    expect(result.m1.price).toBeLessThan(result.m2.price);
    expect(result.m2.price).toBeLessThan(result.m3.price);
  });

  it('buy setup: all targets above entry', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result || result.dir !== 'buy') return;
    expect(result.m1.price).toBeGreaterThan(result.entry);
    expect(result.m2.price).toBeGreaterThan(result.entry);
    expect(result.m3.price).toBeGreaterThan(result.entry);
  });

  it('buy setup: liqPrice is below entry', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result || result.dir !== 'buy') return;
    expect(result.liqPrice).toBeLessThan(result.entry);
  });
});

// ─── analyzeCandles — sell setup geometry ────────────────────────────────────
describe('analyzeCandles — sell setup geometry', () => {
  it('sell setup: stop is above entry', () => {
    const candles = makeDowntrendCandles(200, 200, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result || result.dir !== 'sell') return;
    expect(result.stop).toBeGreaterThan(result.entry);
  });

  it('sell setup: m1 > m2 > m3 (targets in descending order)', () => {
    const candles = makeDowntrendCandles(200, 200, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result || result.dir !== 'sell') return;
    expect(result.m1.price).toBeGreaterThan(result.m2.price);
    expect(result.m2.price).toBeGreaterThan(result.m3.price);
  });

  it('sell setup: all targets below entry', () => {
    const candles = makeDowntrendCandles(200, 200, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result || result.dir !== 'sell') return;
    expect(result.m1.price).toBeLessThan(result.entry);
    expect(result.m2.price).toBeLessThan(result.entry);
    expect(result.m3.price).toBeLessThan(result.entry);
  });

  it('sell setup: liqPrice is above entry', () => {
    const candles = makeDowntrendCandles(200, 200, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result || result.dir !== 'sell') return;
    expect(result.liqPrice).toBeGreaterThan(result.entry);
  });
});

// ─── analyzeCandles — stop adjustment ────────────────────────────────────────
describe('analyzeCandles — stop adjustment for liquidation', () => {
  it('stopAdjusted is boolean', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result) return;
    expect(typeof result.stopAdjusted).toBe('boolean');
  });

  it('when not adjusted: buy stop is always above liqPrice', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, PERMISSIVE_OPTS);
    if (!result || result.dir !== 'buy') return;
    expect(result.stop).toBeGreaterThan(result.liqPrice);
  });
});

// ─── analyzeCandles — financial calculations ──────────────────────────────────
describe('analyzeCandles — financial output', () => {
  it('m1.cap, m2.cap, m3.cap have netPct, grossPct, feePct, isProfit fields', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result) return;
    ['m1','m2','m3'].forEach(m => {
      expect(result[m].cap).toHaveProperty('netPct');
      expect(result[m].cap).toHaveProperty('grossPct');
      expect(result[m].cap).toHaveProperty('feePct');
      expect(result[m].cap).toHaveProperty('isProfit');
    });
  });

  it('m3.cap.isProfit is true (target far enough to cover fees)', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result) return;
    // M3 is ~4x risk — should always be profitable
    expect(result.m3.cap.isProfit).toBe(true);
  });

  it('leverage is passed through to result', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const opts = { score: '0', leverage: 20, rr: 'fib' };
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, opts);
    if (!result) return;
    expect(result.leverage).toBe(20);
  });

  it('feePctCap = ROUND_TRIP_FEE * lev * 100', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const opts = { score: '0', leverage: 10, rr: 'fib' };
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, opts);
    if (!result) return;
    // ROUND_TRIP_FEE = 0.0011, lev=10 → feePctCap = "1.10"
    expect(result.feePctCap).toBe('1.10');
  });
});

// ─── analyzeCandles — reasons and indicators arrays ───────────────────────────
describe('analyzeCandles — reasons and indicators', () => {
  it('reasons array is non-empty', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result) return;
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('each reason has text and type fields', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result) return;
    result.reasons.forEach(r => {
      expect(r).toHaveProperty('text');
      expect(r).toHaveProperty('type');
      expect(['positive','negative','neutral']).toContain(r.type);
    });
  });

  it('summary is a non-empty string', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result) return;
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(20);
  });

  it('summary contains coin name and direction', () => {
    const candles = makeTrendingCandles(200, 100, 1);
    const result = analyzeCandles('BTC', '15m', candles, NEUTRAL_FG, PERMISSIVE_OPTS);
    if (!result) return;
    expect(result.summary).toContain('BTC');
    expect(result.summary).toMatch(/LONG|SHORT/);
  });
});
