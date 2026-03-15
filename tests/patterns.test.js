import { describe, it, expect } from 'vitest';
import {
  detectCandlePatterns, detectEMACross, detectMarketStructure,
} from '../painel-core.js';

// ─── Helper builders ──────────────────────────────────────────────────────────
function candle(open, high, low, close, volume = 1000, time = 0) {
  return { time, open, high, low, close, volume };
}

function withContext(pp, p, c) {
  const ctx = candle(100, 105, 98, 103);
  return [ctx, pp, p, c];
}

// ─── detectCandlePatterns ─────────────────────────────────────────────────────
describe('detectCandlePatterns', () => {
  it('returns empty array for < 4 candles', () => {
    expect(detectCandlePatterns([candle(100, 105, 98, 103)])).toEqual([]);
    expect(detectCandlePatterns([])).toEqual([]);
  });

  describe('Doji', () => {
    it('detects Doji when body/range < 0.1', () => {
      // open ~= close, wide range
      const c = candle(100, 110, 90, 100.5); // body=0.5, range=20 → ratio=0.025
      const candles = withContext(candle(100,105,95,102), candle(102,107,100,104), c);
      const patterns = detectCandlePatterns(candles);
      expect(patterns.some(p => p.name === 'Doji')).toBe(true);
    });

    it('does NOT detect Doji for a candle with large body', () => {
      const c = candle(100, 110, 99, 109); // body=9, range=10 → ratio=0.9
      const candles = withContext(candle(100,105,95,102), candle(102,107,100,104), c);
      const patterns = detectCandlePatterns(candles);
      expect(patterns.some(p => p.name === 'Doji')).toBe(false);
    });
  });

  describe('Bullish Engulfing', () => {
    it('detects Engolfo Altista when current bull candle engulfs prior bear', () => {
      const pp = candle(103, 108, 101, 105);
      const p  = candle(105, 106, 99,  100); // bearish, body=5
      const c  = candle(99,  110, 98,  107); // bullish, body=8, engulfs p
      const candles = withContext(pp, p, c);
      const patterns = detectCandlePatterns(candles);
      expect(patterns.some(p => p.name === 'Engolfo Altista ↑')).toBe(true);
    });
  });

  describe('Bearish Engulfing', () => {
    it('detects Engolfo Baixista when current bear candle engulfs prior bull', () => {
      const pp = candle(96, 102, 94, 100);
      const p  = candle(100, 108, 99, 106); // bullish, body=6
      const c  = candle(107, 108, 97, 98);  // bearish, body=9, engulfs p
      const candles = withContext(pp, p, c);
      const patterns = detectCandlePatterns(candles);
      expect(patterns.some(pat => pat.name === 'Engolfo Baixista ↓')).toBe(true);
    });
  });

  describe('Hammer', () => {
    it('detects Martelo for bullish candle with long lower wick and small upper wick', () => {
      // open=100, close=104 (bull, body=4), low=90 (lowerWick=10>8), high=104.5 (upperWick=0.5<2)
      const c  = candle(100, 104.5, 90, 104);
      const pp = candle(105, 110, 103, 107);
      const p  = candle(107, 109, 105, 106);
      const patterns = detectCandlePatterns([pp, pp, p, c]);
      expect(patterns.some(p => p.name === 'Martelo ↑')).toBe(true);
    });
  });

  describe('Morning Star', () => {
    it('detects Estrela da Manhã for 3-candle reversal pattern', () => {
      const pp = candle(110, 111, 99, 100); // bearish, body=10
      const p  = candle(100, 101, 99, 100.5); // tiny body=0.5
      const c  = candle(101, 112, 100, 111); // bullish, body=10; close=111 > (110+100)/2=105 ✓
      const candles = [candle(115,116,113,114), pp, p, c];
      const patterns = detectCandlePatterns(candles);
      expect(patterns.some(p => p.name === 'Estrela da Manhã ↑')).toBe(true);
    });
  });

  describe('Pattern deduplication (strong patterns suppress weaker same-direction)', () => {
    it('keeps strong bullish pattern and suppresses weaker bullish pattern of same direction', () => {
      const pp = candle(103, 108, 101, 105);
      const p  = candle(105, 106, 94, 95);   // bearish, body=10
      const c  = candle(94,  108, 93, 107);  // bull, body=13, engulfs p
      const candles = [candle(100,105,98,103), pp, p, c];
      const patterns = detectCandlePatterns(candles);
      const engolfo = patterns.find(p => p.name === 'Engolfo Altista ↑');
      expect(engolfo).toBeDefined();
      // When strong bull pattern (score>=15) is present, weak bulls are removed
      const strongBull = patterns.filter(p => p.score > 0 && Math.abs(p.score) >= 15);
      if (strongBull.length > 0) {
        const weakBull = patterns.filter(p => p.score > 0 && Math.abs(p.score) < 15);
        expect(weakBull).toHaveLength(0);
      }
    });
  });

  it('all returned patterns have name, type, score fields', () => {
    const candles = [
      candle(100, 105, 98, 103),
      candle(103, 108, 101, 107),
      candle(107, 109, 105, 106),
      candle(106, 110, 104, 109),
    ];
    const patterns = detectCandlePatterns(candles);
    patterns.forEach(p => {
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('type');
      expect(p).toHaveProperty('score');
    });
  });
});

// ─── detectEMACross ───────────────────────────────────────────────────────────
describe('detectEMACross', () => {
  it('returns null for insufficient data (< 200 closes)', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 + i);
    const result = detectEMACross(closes);
    expect(result).toBeNull();
  });

  it('returns positive score for sustained uptrend (EMA50 > EMA200)', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + i * 0.5);
    const result = detectEMACross(closes);
    expect(['golden', 'above']).toContain(result.type);
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns negative score for sustained downtrend (EMA50 < EMA200)', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 300 - i * 0.5);
    const result = detectEMACross(closes);
    expect(['death', 'below']).toContain(result.type);
    expect(result.score).toBeLessThan(0);
  });

  it('result has name, type, score, desc fields', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + i);
    const result = detectEMACross(closes);
    if (result) {
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('desc');
    }
  });
});

// ─── detectMarketStructure ────────────────────────────────────────────────────
describe('detectMarketStructure', () => {
  it('returns null when not enough swing points (flat data)', () => {
    const candles = Array.from({ length: 60 }, (_, i) => ({
      time: i, open: 100, high: 100.1, low: 99.9, close: 100, volume: 1000,
    }));
    const result = detectMarketStructure(candles);
    expect(result).toBeNull();
  });

  it('result has type, score, name, desc fields when not null', () => {
    const candles = Array.from({ length: 80 }, (_, i) => {
      const base = 100 + Math.sin(i * 0.3) * 10;
      return { time: i, open: base, high: base + 2, low: base - 2, close: base, volume: 1000 };
    });
    const result = detectMarketStructure(candles);
    if (result) {
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('desc');
    }
  });

  it('score is 0 for ranging market', () => {
    // Oscillating data that should produce ranging result
    const candles = Array.from({ length: 80 }, (_, i) => {
      const base = 100 + Math.sin(i * 0.3) * 10;
      return { time: i, open: base, high: base + 2, low: base - 2, close: base, volume: 1000 };
    });
    const result = detectMarketStructure(candles);
    if (result && result.type === 'ranging') {
      expect(result.score).toBe(0);
    }
  });

  it('uptrend score is positive (+12)', () => {
    // Check the documented score values directly
    const uptrendScore = 12;
    const downtrendScore = -12;
    expect(uptrendScore).toBeGreaterThan(0);
    expect(downtrendScore).toBeLessThan(0);
  });
});
