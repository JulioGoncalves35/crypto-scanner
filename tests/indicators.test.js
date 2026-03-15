import { describe, it, expect } from 'vitest';
import {
  calcEMA, calcRSI, calcMACD, calcBollinger,
  calcATR, calcADX, avgVol, calcVWAP, calcOBVTrend, calcStochRSI,
} from '../painel-core.js';
import { makeTrendingCandles, makeFlatCandles, makeDowntrendCandles } from './fixtures/candles.js';

// ─── calcEMA ─────────────────────────────────────────────────────────────────
describe('calcEMA', () => {
  it('returns all nulls when input is shorter than period', () => {
    const result = calcEMA([10, 20], 5);
    expect(result).toEqual([null, null]);
  });

  it('returns array of same length as input', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
    const ema = calcEMA(closes, 9);
    expect(ema).toHaveLength(50);
  });

  it('first (period-1) values are null, rest are numbers', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const ema = calcEMA(closes, 5);
    for (let i = 0; i < 4; i++) expect(ema[i]).toBeNull();
    for (let i = 4; i < 20; i++) expect(typeof ema[i]).toBe('number');
  });

  it('seed value equals SMA of first period elements', () => {
    const closes = [10, 20, 30, 40, 50, 60];
    const ema = calcEMA(closes, 3);
    // SMA of [10, 20, 30] = 20
    expect(ema[2]).toBeCloseTo(20, 5);
  });

  it('EMA tracks upward trend (last value > first non-null value)', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
    const ema = calcEMA(closes, 9);
    const first = ema.find(v => v !== null);
    expect(ema[ema.length - 1]).toBeGreaterThan(first);
  });

  it('EMA on flat series equals that constant price', () => {
    const closes = Array(30).fill(100);
    const ema = calcEMA(closes, 9);
    ema.filter(v => v !== null).forEach(v => expect(v).toBeCloseTo(100, 5));
  });
});

// ─── calcRSI ─────────────────────────────────────────────────────────────────
describe('calcRSI', () => {
  it('returns array same length as input', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    expect(calcRSI(closes)).toHaveLength(30);
  });

  it('first element is always null', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(calcRSI(closes)[0]).toBeNull();
  });

  it('RSI stays within [0, 100]', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.5) * 20);
    calcRSI(closes).filter(v => v !== null).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it('all-upward series produces RSI close to 100', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const rsi = calcRSI(closes);
    const last = rsi[rsi.length - 1];
    expect(last).toBeGreaterThan(90);
  });

  it('all-downward series produces RSI close to 0', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
    const rsi = calcRSI(closes);
    const last = rsi[rsi.length - 1];
    expect(last).toBeLessThan(10);
  });

  it('flat series produces RSI = 100 (no losses)', () => {
    const closes = Array(30).fill(100);
    const rsi = calcRSI(closes);
    const last = rsi[rsi.length - 1];
    expect(last).toBe(100);
  });
});

// ─── calcMACD ─────────────────────────────────────────────────────────────────
describe('calcMACD', () => {
  it('returns macdLine, signal, and hist arrays', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const { macdLine, signal, hist } = calcMACD(closes);
    expect(Array.isArray(macdLine)).toBe(true);
    expect(Array.isArray(signal)).toBe(true);
    expect(Array.isArray(hist)).toBe(true);
  });

  it('hist = macdLine - signal element-wise', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i * 0.3) * 10);
    const { macdLine, signal, hist } = calcMACD(closes);
    hist.forEach((h, i) => {
      if (h !== null && macdLine[i] !== null && signal[i] !== null) {
        expect(h).toBeCloseTo(macdLine[i] - signal[i], 8);
      }
    });
  });

  it('requires at least 35 candles to produce non-null signal', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const { signal } = calcMACD(closes);
    const nonNull = signal.filter(v => v !== null);
    expect(nonNull.length).toBeGreaterThan(0);
  });
});

// ─── calcBollinger ────────────────────────────────────────────────────────────
describe('calcBollinger', () => {
  it('returns objects with upper, mid, lower', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const bands = calcBollinger(closes);
    expect(bands.length).toBeGreaterThan(0);
    bands.forEach(b => {
      expect(b).toHaveProperty('upper');
      expect(b).toHaveProperty('mid');
      expect(b).toHaveProperty('lower');
    });
  });

  it('upper > mid > lower', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    calcBollinger(closes).forEach(b => {
      expect(b.upper).toBeGreaterThan(b.mid);
      expect(b.mid).toBeGreaterThan(b.lower);
    });
  });

  it('flat prices produce zero-width bands (upper = lower = mid)', () => {
    const closes = Array(30).fill(100);
    calcBollinger(closes).forEach(b => {
      expect(b.upper).toBeCloseTo(100, 5);
      expect(b.lower).toBeCloseTo(100, 5);
      expect(b.mid).toBeCloseTo(100, 5);
    });
  });
});

// ─── calcATR ─────────────────────────────────────────────────────────────────
describe('calcATR', () => {
  it('returns positive values', () => {
    const candles = makeTrendingCandles(30);
    calcATR(candles).forEach(v => expect(v).toBeGreaterThan(0));
  });

  it('flat candles produce near-zero ATR', () => {
    const candles = makeFlatCandles(30);
    const atrs = calcATR(candles);
    atrs.forEach(v => expect(v).toBeLessThan(0.5));
  });

  it('length is (inputLength - period)', () => {
    const candles = makeTrendingCandles(30);
    const atrs = calcATR(candles, 14);
    // trs has length 29, atr starts from index 14 → length = 29 - 14 + 1 = 16
    expect(atrs.length).toBe(16);
  });
});

// ─── calcADX ─────────────────────────────────────────────────────────────────
describe('calcADX', () => {
  it('returns null for too-short inputs', () => {
    const candles = makeTrendingCandles(10);
    expect(calcADX(candles)).toBeNull();
  });

  it('returns a number for sufficient trending data', () => {
    const candles = makeTrendingCandles(60);
    const adx = calcADX(candles);
    expect(typeof adx).toBe('number');
    expect(adx).toBeGreaterThanOrEqual(0);
  });

  it('strong trend produces ADX > 20', () => {
    const candles = makeTrendingCandles(100, 100, 2);
    const adx = calcADX(candles);
    expect(adx).toBeGreaterThan(20);
  });

  it('returns null when input has exactly period*2 candles (boundary)', () => {
    const candles = makeTrendingCandles(28);
    expect(calcADX(candles, 14)).toBeNull();
  });
});

// ─── avgVol ───────────────────────────────────────────────────────────────────
describe('avgVol', () => {
  it('returns average of last p candle volumes (excluding latest)', () => {
    const candles = Array.from({ length: 25 }, (_, i) => ({
      open: 100, high: 101, low: 99, close: 100, volume: i + 1, time: i,
    }));
    // volumes 1..25, last p=20 excluding latest → indices 4..23 → values 5..24
    const avg = avgVol(candles, 20);
    // sum(5..24) = (5+24)*20/2 = 290, /20 = 14.5
    expect(avg).toBeCloseTo(14.5, 5);
  });
});

// ─── calcVWAP ─────────────────────────────────────────────────────────────────
describe('calcVWAP', () => {
  it('returns a number for valid candles', () => {
    const candles = makeTrendingCandles(30);
    expect(typeof calcVWAP(candles)).toBe('number');
  });

  it('returns null for zero-volume candles', () => {
    const candles = makeFlatCandles(30).map(c => ({ ...c, volume: 0 }));
    expect(calcVWAP(candles)).toBeNull();
  });

  it('flat price VWAP equals that price', () => {
    const candles = Array(30).fill(null).map((_, i) => ({
      time: i, open: 100, high: 100, low: 100, close: 100, volume: 1000,
    }));
    expect(calcVWAP(candles)).toBeCloseTo(100, 5);
  });
});

// ─── calcOBVTrend ─────────────────────────────────────────────────────────────
describe('calcOBVTrend', () => {
  it('returns "rising" for strong uptrend', () => {
    const candles = makeTrendingCandles(50, 100, 1);
    const trend = calcOBVTrend(candles);
    expect(trend).toBe('rising');
  });

  it('returns "falling" for strong downtrend', () => {
    const candles = makeDowntrendCandles(50, 200, 1);
    const trend = calcOBVTrend(candles);
    expect(trend).toBe('falling');
  });

  it('returns "neutral" for insufficient data', () => {
    const candles = makeTrendingCandles(5);
    expect(calcOBVTrend(candles, 20)).toBe('neutral');
  });
});

// ─── calcStochRSI ─────────────────────────────────────────────────────────────
describe('calcStochRSI', () => {
  it('returns null when not enough valid RSI values', () => {
    const rsi = [null, null, null, null, null];
    expect(calcStochRSI(rsi)).toBeNull();
  });

  it('returns 50 when all RSI values are equal', () => {
    const rsi = Array(20).fill(50);
    expect(calcStochRSI(rsi)).toBe(50);
  });

  it('returns value between 0 and 100', () => {
    const rsi = Array.from({ length: 20 }, (_, i) => 30 + i * 2);
    const result = calcStochRSI(rsi);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('returns 100 when last RSI equals max', () => {
    const rsi = [40, 50, 55, 60, 70, 45, 80]; // 80 is max and last
    const result = calcStochRSI(rsi, 7);
    expect(result).toBeCloseTo(100, 5);
  });

  it('returns 0 when last RSI equals min', () => {
    const rsi = [80, 70, 60, 50, 40, 30, 20]; // 20 is min and last
    const result = calcStochRSI(rsi, 7);
    expect(result).toBeCloseTo(0, 5);
  });
});
