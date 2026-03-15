import { describe, it, expect } from 'vitest';
import {
  calcLiqPrice, capReturn, getFibSet, calcMetas,
  BYBIT_MMR, ROUND_TRIP_FEE,
  FIB_NORMAL, FIB_MAX, FIB_FIXED2, FIB_FIXED3,
} from '../painel-core.js';

// ─── calcLiqPrice ─────────────────────────────────────────────────────────────
describe('calcLiqPrice', () => {
  it('long liq price is below entry', () => {
    const liq = calcLiqPrice(100, 'buy', 10);
    expect(liq).toBeLessThan(100);
  });

  it('short liq price is above entry', () => {
    const liq = calcLiqPrice(100, 'sell', 10);
    expect(liq).toBeGreaterThan(100);
  });

  it('long formula: entry * (1 - 1/lev + MMR)', () => {
    const entry = 100, lev = 10;
    const expected = entry * (1 - 1/lev + BYBIT_MMR);
    expect(calcLiqPrice(entry, 'buy', lev)).toBeCloseTo(expected, 10);
  });

  it('short formula: entry * (1 + 1/lev - MMR)', () => {
    const entry = 100, lev = 10;
    const expected = entry * (1 + 1/lev - BYBIT_MMR);
    expect(calcLiqPrice(entry, 'sell', lev)).toBeCloseTo(expected, 10);
  });

  it('higher leverage → liquidation price closer to entry (long)', () => {
    const liq10 = calcLiqPrice(100, 'buy', 10);
    const liq50 = calcLiqPrice(100, 'buy', 50);
    expect(liq50).toBeGreaterThan(liq10);
  });

  it('higher leverage → liquidation price closer to entry (short)', () => {
    const liq10 = calcLiqPrice(100, 'sell', 10);
    const liq50 = calcLiqPrice(100, 'sell', 50);
    expect(liq50).toBeLessThan(liq10);
  });

  it('1x leverage long: liq = entry * (1 - 1 + MMR) = entry * MMR', () => {
    const liq = calcLiqPrice(1000, 'buy', 1);
    expect(liq).toBeCloseTo(1000 * BYBIT_MMR, 5);
  });

  it('works with fractional prices (altcoins)', () => {
    const liq = calcLiqPrice(0.00045, 'buy', 20);
    expect(liq).toBeGreaterThan(0);
    expect(liq).toBeLessThan(0.00045);
  });
});

// ─── capReturn ────────────────────────────────────────────────────────────────
describe('capReturn', () => {
  it('returns an object with pricePct, grossPct, feePct, netPct, isProfit', () => {
    const result = capReturn(100, 110, 'buy', 10);
    expect(result).toHaveProperty('pricePct');
    expect(result).toHaveProperty('grossPct');
    expect(result).toHaveProperty('feePct');
    expect(result).toHaveProperty('netPct');
    expect(result).toHaveProperty('isProfit');
  });

  it('10% price move at 10x leverage = 100% gross', () => {
    const result = capReturn(100, 110, 'buy', 10);
    expect(parseFloat(result.grossPct)).toBeCloseTo(100, 1);
  });

  it('fee = ROUND_TRIP_FEE * leverage * 100 (as %)', () => {
    const lev = 10;
    const result = capReturn(100, 110, 'buy', lev);
    const expectedFee = (ROUND_TRIP_FEE * lev * 100).toFixed(2);
    expect(result.feePct).toBe(expectedFee);
  });

  it('netPct = grossPct - feePct', () => {
    const result = capReturn(100, 110, 'buy', 10);
    const net = parseFloat(result.grossPct) - parseFloat(result.feePct);
    expect(parseFloat(result.netPct)).toBeCloseTo(net, 1);
  });

  it('isProfit is true when net > 0', () => {
    const result = capReturn(100, 200, 'buy', 10);
    expect(result.isProfit).toBe(true);
  });

  it('isProfit is false when target very close to entry (fee exceeds gain)', () => {
    // 0.01% price move at 1x leverage — fees (0.11%) eat the return
    const result = capReturn(100, 100.01, 'buy', 1);
    expect(result.isProfit).toBe(false);
  });

  it('symmetric: buy and sell with same distance produce same pricePct', () => {
    const buy  = capReturn(100, 110, 'buy',  10);
    const sell = capReturn(100, 90,  'sell', 10);
    expect(buy.pricePct).toBe(sell.pricePct);
  });

  it('invalid/zero leverage defaults to 1x', () => {
    const result = capReturn(100, 110, 'buy', 0);
    expect(parseFloat(result.grossPct)).toBeCloseTo(10, 1);
  });

  it('pricePct is always positive regardless of direction', () => {
    const buy  = capReturn(100, 90,  'buy',  10);
    const sell = capReturn(100, 110, 'sell', 10);
    expect(parseFloat(buy.pricePct)).toBeGreaterThan(0);
    expect(parseFloat(sell.pricePct)).toBeGreaterThan(0);
  });
});

// ─── getFibSet ────────────────────────────────────────────────────────────────
describe('getFibSet', () => {
  it('"fib" returns FIB_NORMAL', () => {
    expect(getFibSet('fib')).toEqual(FIB_NORMAL);
  });

  it('"max" returns FIB_MAX', () => {
    expect(getFibSet('max')).toEqual(FIB_MAX);
  });

  it('"2" returns FIB_FIXED2', () => {
    expect(getFibSet('2')).toEqual(FIB_FIXED2);
  });

  it('"3" returns FIB_FIXED3', () => {
    expect(getFibSet('3')).toEqual(FIB_FIXED3);
  });

  it('unknown mode defaults to FIB_NORMAL', () => {
    expect(getFibSet('unknown')).toEqual(FIB_NORMAL);
  });
});

// ─── calcMetas ────────────────────────────────────────────────────────────────
describe('calcMetas', () => {
  describe('buy direction', () => {
    it('targets are above entry', () => {
      const { m1, m2, m3 } = calcMetas('buy', 100, 95, 'fib');
      expect(m1).toBeGreaterThan(100);
      expect(m2).toBeGreaterThan(m1);
      expect(m3).toBeGreaterThan(m2);
    });

    it('m1 = entry + risk * FIB_NORMAL.m1', () => {
      const entry = 100, stop = 95;
      const { m1 } = calcMetas('buy', entry, stop, 'fib');
      expect(m1).toBeCloseTo(entry + 5 * FIB_NORMAL.m1, 5);
    });

    it('m2 = entry + risk * FIB_NORMAL.m2', () => {
      const entry = 100, stop = 95;
      const { m2 } = calcMetas('buy', entry, stop, 'fib');
      expect(m2).toBeCloseTo(entry + 5 * FIB_NORMAL.m2, 5);
    });

    it('m3 = entry + risk * FIB_NORMAL.m3', () => {
      const entry = 100, stop = 95;
      const { m3 } = calcMetas('buy', entry, stop, 'fib');
      expect(m3).toBeCloseTo(entry + 5 * FIB_NORMAL.m3, 5);
    });
  });

  describe('sell direction', () => {
    it('targets are below entry', () => {
      const { m1, m2, m3 } = calcMetas('sell', 100, 105, 'fib');
      expect(m1).toBeLessThan(100);
      expect(m2).toBeLessThan(m1);
      expect(m3).toBeLessThan(m2);
    });

    it('m1 = entry - risk * FIB_NORMAL.m1', () => {
      const entry = 100, stop = 105;
      const { m1 } = calcMetas('sell', entry, stop, 'fib');
      expect(m1).toBeCloseTo(entry - 5 * FIB_NORMAL.m1, 5);
    });
  });

  describe('RR modes', () => {
    it('"2" mode: m1 = entry + risk * FIB_FIXED2.m1', () => {
      const { m1 } = calcMetas('buy', 100, 90, '2');
      expect(m1).toBeCloseTo(100 + 10 * FIB_FIXED2.m1, 5);
    });

    it('"3" mode: m1 = entry + risk * FIB_FIXED3.m1', () => {
      const { m1 } = calcMetas('buy', 100, 90, '3');
      expect(m1).toBeCloseTo(100 + 10 * FIB_FIXED3.m1, 5);
    });

    it('"max" mode: m3 = entry + risk * FIB_MAX.m3', () => {
      const { m3 } = calcMetas('buy', 100, 90, 'max');
      expect(m3).toBeCloseTo(100 + 10 * FIB_MAX.m3, 5);
    });
  });

  it('risk is based on absolute distance (stop above or below)', () => {
    const r1 = calcMetas('buy', 100, 95, 'fib');
    const r2 = calcMetas('buy', 100, 105, 'fib');
    expect(r1).toEqual(r2);
  });
});
