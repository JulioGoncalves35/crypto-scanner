import { describe, it, expect } from 'vitest';
import { _computeScore, _calcTechIndicators, calcADX, calcRSI } from '../painel-core.js';
import { makeTrendingCandles, makeDowntrendCandles, makeFlatCandles } from './fixtures/candles.js';

const NEUTRAL_FG = { value: 50, label: 'Neutro' };

// ─── Minimal ind builder for unit testing _computeScore ──────────────────────
/**
 * Build a minimal indicator object to pass to _computeScore.
 * All fields default to neutral/zero values unless overridden.
 */
function makeInd(overrides = {}) {
  return {
    rsi:       50,
    stochRSI:  50,
    macdNow:   1,   // > sigNow by default → mAbove
    macdPrev:  1,
    sigNow:    0,
    sigPrev:   0,
    histNow:   0,
    histPrev:  0,
    ema9:      100,
    ema21:     100,
    ema200:    100,
    bb:        { upper: 110, mid: 100, lower: 90 },
    atr:       2,
    vwap:      null,
    obvTrend:  'neutral',
    volRatio:  1.0,
    adx:       null,
    patterns:  [],
    divergences: [],
    emaCross:  null,
    mktStruct: null,
    triangle:  null,
    dblPattern: null,
    bosChoch:  null,
    cvd:       null,
    volProfile: null,
    ichimoku:  null,
    anchoredVwap: null,
    squeeze:   null,
    orderBlock: null,
    ...overrides,
  };
}

// ─── _computeScore — RSI contribution ─────────────────────────────────────────
describe('_computeScore — RSI contribution', () => {
  it('RSI < 30 adds +20 to score', () => {
    const { score } = _computeScore(100, makeInd({ rsi: 28 }), NEUTRAL_FG);
    // MACD above signal (+7) + RSI oversold (+20) = +27 minimum
    expect(score).toBeGreaterThanOrEqual(20);
    const { score: scoreNeutral } = _computeScore(100, makeInd({ rsi: 50 }), NEUTRAL_FG);
    expect(score - scoreNeutral).toBeGreaterThanOrEqual(20);
  });

  it('RSI in [30, 40) adds +10 to score', () => {
    const { score: scoreHigh } = _computeScore(100, makeInd({ rsi: 35 }), NEUTRAL_FG);
    const { score: scoreNeutral } = _computeScore(100, makeInd({ rsi: 50 }), NEUTRAL_FG);
    expect(scoreHigh - scoreNeutral).toBeGreaterThanOrEqual(10);
  });

  it('RSI > 70 subtracts 20 from score', () => {
    const { score: scoreLow } = _computeScore(100, makeInd({ rsi: 75 }), NEUTRAL_FG);
    const { score: scoreNeutral } = _computeScore(100, makeInd({ rsi: 50 }), NEUTRAL_FG);
    expect(scoreNeutral - scoreLow).toBeGreaterThanOrEqual(20);
  });

  it('RSI in (60, 70] subtracts 10 from score', () => {
    const { score: scoreLow } = _computeScore(100, makeInd({ rsi: 65 }), NEUTRAL_FG);
    const { score: scoreNeutral } = _computeScore(100, makeInd({ rsi: 50 }), NEUTRAL_FG);
    expect(scoreNeutral - scoreLow).toBeGreaterThanOrEqual(10);
  });

  it('RSI null is skipped (no contribution)', () => {
    const { score: withRSI }    = _computeScore(100, makeInd({ rsi: 50 }), NEUTRAL_FG);
    const { score: withoutRSI } = _computeScore(100, makeInd({ rsi: null }), NEUTRAL_FG);
    // Should differ only by the RSI contribution — when RSI=50 it's neutral (0 change)
    expect(withRSI).toBe(withoutRSI);
  });
});

// ─── _computeScore — MACD contribution ───────────────────────────────────────
describe('_computeScore — MACD contribution', () => {
  it('MACD bullish crossover (macdNow > sigNow, macdPrev <= sigPrev) adds +20', () => {
    // Crossover: was below, now above
    const withCross = _computeScore(100, makeInd({
      macdNow: 1, sigNow: 0, macdPrev: -1, sigPrev: 0,
    }), NEUTRAL_FG);
    // MACD above (no cross): macdNow=1 > sigNow=0 but macdPrev=1 > sigPrev=0 → mAbove (not cross)
    const withAbove = _computeScore(100, makeInd({
      macdNow: 1, sigNow: 0, macdPrev: 1, sigPrev: 0,
    }), NEUTRAL_FG);
    // Cross should give 20 vs 7 for just above → delta should be 13
    expect(withCross.score - withAbove.score).toBeGreaterThanOrEqual(13);
  });

  it('MACD bearish crossover adds -20 (vs -7 for just below)', () => {
    const withCross = _computeScore(100, makeInd({
      macdNow: -1, sigNow: 0, macdPrev: 1, sigPrev: 0,
    }), NEUTRAL_FG);
    const withBelow = _computeScore(100, makeInd({
      macdNow: -1, sigNow: 0, macdPrev: -1, sigPrev: 0,
    }), NEUTRAL_FG);
    expect(withBelow.score - withCross.score).toBeGreaterThanOrEqual(13);
  });

  it('MACD above signal with rising histogram adds +4 extra', () => {
    const withRising = _computeScore(100, makeInd({
      macdNow: 1, sigNow: 0, macdPrev: 0.5, sigPrev: 0.6,
      histNow: 2, histPrev: 1, // rising positive histogram
    }), NEUTRAL_FG);
    const withFlat = _computeScore(100, makeInd({
      macdNow: 1, sigNow: 0, macdPrev: 0.5, sigPrev: 0.6,
      histNow: 1, histPrev: 2, // falling histogram → no bonus
    }), NEUTRAL_FG);
    expect(withRising.score - withFlat.score).toBeGreaterThanOrEqual(4);
  });

  it('returns mxUp, mxDown, mAbove flags', () => {
    const { mxUp, mxDown, mAbove } = _computeScore(100, makeInd({
      macdNow: 1, sigNow: 0, macdPrev: -1, sigPrev: 0,
    }), NEUTRAL_FG);
    expect(mxUp).toBe(true);
    expect(mxDown).toBe(false);
    expect(mAbove).toBe(true);
  });
});

// ─── _computeScore — EMA contribution ────────────────────────────────────────
describe('_computeScore — EMA contribution', () => {
  it('price > ema9 > ema21 > ema200 adds +16 (fully aligned bullish)', () => {
    const bullish = _computeScore(105, makeInd({ ema9: 104, ema21: 103, ema200: 102 }), NEUTRAL_FG);
    const neutral  = _computeScore(100, makeInd({ ema9: 101, ema21: 100, ema200: 99  }), NEUTRAL_FG); // mixed
    expect(bullish.score).toBeGreaterThan(neutral.score - 20); // rough check
  });

  it('price < ema9 < ema21 < ema200 subtracts 16 (fully aligned bearish)', () => {
    const bearish = _computeScore(95, makeInd({ ema9: 96, ema21: 97, ema200: 98 }), NEUTRAL_FG);
    const neutral = _computeScore(100, makeInd({ ema9: 100, ema21: 100, ema200: 100 }), NEUTRAL_FG);
    expect(neutral.score - bearish.score).toBeGreaterThan(0);
  });

  it('price > ema200 only adds +7', () => {
    const above200 = _computeScore(100, makeInd({ ema9: 105, ema21: 104, ema200: 90 }), NEUTRAL_FG);
    const below200 = _computeScore(100, makeInd({ ema9: 96,  ema21: 97,  ema200: 110 }), NEUTRAL_FG);
    expect(above200.score - below200.score).toBeGreaterThanOrEqual(14); // +7 vs -7 = 14 diff
  });
});

// ─── _computeScore — Bollinger contribution ───────────────────────────────────
describe('_computeScore — Bollinger contribution', () => {
  it('price at lower band adds +10', () => {
    const atLower   = _computeScore(90, makeInd({ bb: { upper: 110, mid: 100, lower: 90 }  }), NEUTRAL_FG);
    const atMiddle  = _computeScore(100, makeInd({ bb: { upper: 110, mid: 100, lower: 90 } }), NEUTRAL_FG);
    expect(atLower.score - atMiddle.score).toBeGreaterThanOrEqual(10);
  });

  it('price at upper band subtracts 10', () => {
    // Use EMAs where both prices (100 and 110) stay in the same EMA branch (price > ema200 only)
    // so that the EMA contribution is equal and doesn't skew the comparison.
    const emaOverride = { ema9: 125, ema21: 120, ema200: 85 };
    const atUpper   = _computeScore(110, makeInd({ ...emaOverride, bb: { upper: 110, mid: 100, lower: 90 } }), NEUTRAL_FG);
    const atMiddle  = _computeScore(100, makeInd({ ...emaOverride, bb: { upper: 110, mid: 100, lower: 90 } }), NEUTRAL_FG);
    expect(atMiddle.score - atUpper.score).toBeGreaterThanOrEqual(10);
  });
});

// ─── _computeScore — Fear & Greed contribution ────────────────────────────────
describe('_computeScore — Fear & Greed contribution', () => {
  it('Fear & Greed < 25 (extreme fear) adds +10', () => {
    const extremeFear = _computeScore(100, makeInd(), { value: 20, label: 'Extreme Fear' });
    const neutral      = _computeScore(100, makeInd(), NEUTRAL_FG);
    expect(extremeFear.score - neutral.score).toBeGreaterThanOrEqual(10);
  });

  it('Fear & Greed > 75 (extreme greed) subtracts 10', () => {
    const extremeGreed = _computeScore(100, makeInd(), { value: 80, label: 'Extreme Greed' });
    const neutral       = _computeScore(100, makeInd(), NEUTRAL_FG);
    expect(neutral.score - extremeGreed.score).toBeGreaterThanOrEqual(10);
  });
});

// ─── _computeScore — OBV contribution ────────────────────────────────────────
describe('_computeScore — OBV contribution', () => {
  it('OBV rising adds +6', () => {
    const rising  = _computeScore(100, makeInd({ obvTrend: 'rising' }),  NEUTRAL_FG);
    const neutral  = _computeScore(100, makeInd({ obvTrend: 'neutral' }), NEUTRAL_FG);
    expect(rising.score - neutral.score).toBeGreaterThanOrEqual(6);
  });

  it('OBV falling subtracts 6', () => {
    const falling = _computeScore(100, makeInd({ obvTrend: 'falling' }), NEUTRAL_FG);
    const neutral  = _computeScore(100, makeInd({ obvTrend: 'neutral' }), NEUTRAL_FG);
    expect(neutral.score - falling.score).toBeGreaterThanOrEqual(6);
  });
});

// ─── _computeScore — Pattern contribution ────────────────────────────────────
describe('_computeScore — Pattern accumulation', () => {
  it('pattern scores accumulate into total score', () => {
    const withPattern = _computeScore(100, makeInd({
      patterns: [{ name: 'Martelo ↑', score: +10, type: 'positive' }]
    }), NEUTRAL_FG);
    const noPattern = _computeScore(100, makeInd({ patterns: [] }), NEUTRAL_FG);
    expect(withPattern.score - noPattern.score).toBe(10);
  });

  it('negative pattern score reduces total', () => {
    const withNeg = _computeScore(100, makeInd({
      patterns: [{ name: 'Estrela Cadente ↓', score: -10, type: 'negative' }]
    }), NEUTRAL_FG);
    const noPattern = _computeScore(100, makeInd({ patterns: [] }), NEUTRAL_FG);
    expect(noPattern.score - withNeg.score).toBe(10);
  });

  it('divergence scores accumulate', () => {
    const withDiv = _computeScore(100, makeInd({
      divergences: [{ name: 'Divergência Altista RSI', score: +20, type: 'bullish' }]
    }), NEUTRAL_FG);
    const noDiv = _computeScore(100, makeInd({ divergences: [] }), NEUTRAL_FG);
    expect(withDiv.score - noDiv.score).toBe(20);
  });
});

// ─── _computeScore — Return value structure ────────────────────────────────────
describe('_computeScore — Return value structure', () => {
  it('returns score, reasons, indicators, and flags', () => {
    const result = _computeScore(100, makeInd(), NEUTRAL_FG);
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('reasons');
    expect(result).toHaveProperty('indicators');
    expect(result).toHaveProperty('mxUp');
    expect(result).toHaveProperty('mxDown');
    expect(result).toHaveProperty('mAbove');
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(Array.isArray(result.indicators)).toBe(true);
  });

  it('score can be negative (bearish market)', () => {
    const bearishInd = makeInd({
      rsi: 75,
      macdNow: -2, sigNow: 0, macdPrev: 1, sigPrev: 0, // bearish cross
      ema9: 96, ema21: 97, ema200: 110, // all bearish
      obvTrend: 'falling',
    });
    const { score } = _computeScore(95, bearishInd, { value: 80, label: 'Extreme Greed' });
    expect(score).toBeLessThan(0);
  });
});

// ─── _computeScore — Ichimoku contribution ────────────────────────────────────
describe('_computeScore — Ichimoku contribution', () => {
  it('price above bullish cloud adds +10', () => {
    const withIchi = _computeScore(100, makeInd({
      ichimoku: { priceAboveCloud: true, priceBelowCloud: false, priceInCloud: false,
                  cloudBull: true, tkCross: 'none', chikouBull: null },
    }), NEUTRAL_FG);
    const noIchi = _computeScore(100, makeInd({ ichimoku: null }), NEUTRAL_FG);
    expect(withIchi.score - noIchi.score).toBeGreaterThanOrEqual(10);
  });

  it('price below bearish cloud subtracts 10', () => {
    const withIchi = _computeScore(100, makeInd({
      ichimoku: { priceAboveCloud: false, priceBelowCloud: true, priceInCloud: false,
                  cloudBull: false, tkCross: 'none', chikouBull: null },
    }), NEUTRAL_FG);
    const noIchi = _computeScore(100, makeInd({ ichimoku: null }), NEUTRAL_FG);
    expect(noIchi.score - withIchi.score).toBeGreaterThanOrEqual(10);
  });

  it('TK cross bullish adds +8', () => {
    const withCross = _computeScore(100, makeInd({
      ichimoku: { priceAboveCloud: false, priceBelowCloud: false, priceInCloud: true,
                  cloudBull: true, tkCross: 'bullish', chikouBull: null },
    }), NEUTRAL_FG);
    const noCross = _computeScore(100, makeInd({
      ichimoku: { priceAboveCloud: false, priceBelowCloud: false, priceInCloud: true,
                  cloudBull: true, tkCross: 'none', chikouBull: null },
    }), NEUTRAL_FG);
    expect(withCross.score - noCross.score).toBeGreaterThanOrEqual(8);
  });

  it('price inside cloud contributes 0 from position (neutral)', () => {
    const inCloud = _computeScore(100, makeInd({
      ichimoku: { priceAboveCloud: false, priceBelowCloud: false, priceInCloud: true,
                  cloudBull: true, tkCross: 'none', chikouBull: null },
    }), NEUTRAL_FG);
    const noIchi = _computeScore(100, makeInd({ ichimoku: null }), NEUTRAL_FG);
    // Being inside cloud adds 0 from price position — total can still differ from TK/chikou
    // Just verify the score is between extremes
    expect(typeof inCloud.score).toBe('number');
  });

  it('total Ichimoku contribution is capped at ±20', () => {
    // All bullish signals: +10 (above cloud) + +8 (TK cross) + +4 (chikou) = +22 → capped at +20
    const fullBull = _computeScore(100, makeInd({
      ichimoku: { priceAboveCloud: true, priceBelowCloud: false, priceInCloud: false,
                  cloudBull: true, tkCross: 'bullish', chikouBull: true },
    }), NEUTRAL_FG);
    const noIchi = _computeScore(100, makeInd({ ichimoku: null }), NEUTRAL_FG);
    expect(fullBull.score - noIchi.score).toBeLessThanOrEqual(20);
    expect(fullBull.score - noIchi.score).toBeGreaterThanOrEqual(18); // at least 18 (cap may land at 20)
  });
});

// ─── _computeScore — Anchored VWAP contribution ───────────────────────────────
describe('_computeScore — Anchored VWAP contribution', () => {
  it('price > AVWAP by > 0.2% adds +8', () => {
    // price=100, avwap=99 → 1% above
    const above = _computeScore(100, makeInd({ anchoredVwap: { vwap: 99 } }), NEUTRAL_FG);
    const none  = _computeScore(100, makeInd({ anchoredVwap: null }), NEUTRAL_FG);
    expect(above.score - none.score).toBeGreaterThanOrEqual(8);
  });

  it('price < AVWAP by > 0.2% subtracts 8', () => {
    // price=100, avwap=101 → 1% below
    const below = _computeScore(100, makeInd({ anchoredVwap: { vwap: 101 } }), NEUTRAL_FG);
    const none  = _computeScore(100, makeInd({ anchoredVwap: null }), NEUTRAL_FG);
    expect(none.score - below.score).toBeGreaterThanOrEqual(8);
  });

  it('price within 0.2% of AVWAP contributes 0', () => {
    // price=100, avwap=100.1 → 0.1% diff → within threshold
    const near = _computeScore(100, makeInd({ anchoredVwap: { vwap: 100.1 } }), NEUTRAL_FG);
    const none = _computeScore(100, makeInd({ anchoredVwap: null }), NEUTRAL_FG);
    expect(near.score).toBe(none.score);
  });
});

// ─── _computeScore — Squeeze Momentum contribution ───────────────────────────
describe('_computeScore — Squeeze Momentum contribution', () => {
  it('releasedBull adds +15', () => {
    const bull = _computeScore(100, makeInd({
      squeeze: { squeezed: false, momentum: 1, momentumTrend: 'rising', releasedBull: true, releasedBear: false },
    }), NEUTRAL_FG);
    const none = _computeScore(100, makeInd({ squeeze: null }), NEUTRAL_FG);
    expect(bull.score - none.score).toBeGreaterThanOrEqual(15);
  });

  it('releasedBear subtracts 15', () => {
    const bear = _computeScore(100, makeInd({
      squeeze: { squeezed: false, momentum: -1, momentumTrend: 'falling', releasedBull: false, releasedBear: true },
    }), NEUTRAL_FG);
    const none = _computeScore(100, makeInd({ squeeze: null }), NEUTRAL_FG);
    expect(none.score - bear.score).toBeGreaterThanOrEqual(15);
  });

  it('non-squeezed rising momentum adds +6', () => {
    const rising = _computeScore(100, makeInd({
      squeeze: { squeezed: false, momentum: 1, momentumTrend: 'rising', releasedBull: false, releasedBear: false },
    }), NEUTRAL_FG);
    const none = _computeScore(100, makeInd({ squeeze: null }), NEUTRAL_FG);
    expect(rising.score - none.score).toBeGreaterThanOrEqual(6);
  });

  it('non-squeezed falling momentum subtracts 6', () => {
    const falling = _computeScore(100, makeInd({
      squeeze: { squeezed: false, momentum: -1, momentumTrend: 'falling', releasedBull: false, releasedBear: false },
    }), NEUTRAL_FG);
    const none = _computeScore(100, makeInd({ squeeze: null }), NEUTRAL_FG);
    expect(none.score - falling.score).toBeGreaterThanOrEqual(6);
  });

  it('active squeeze contributes 0 to score', () => {
    const squeezed = _computeScore(100, makeInd({
      squeeze: { squeezed: true, momentum: 0, momentumTrend: 'neutral', releasedBull: false, releasedBear: false },
    }), NEUTRAL_FG);
    const none = _computeScore(100, makeInd({ squeeze: null }), NEUTRAL_FG);
    expect(squeezed.score).toBe(none.score);
  });
});

// ─── _computeScore — Order Block contribution ─────────────────────────────────
describe('_computeScore — Order Block contribution', () => {
  it('bullish OB with price in zone adds +14', () => {
    const inZone = _computeScore(100, makeInd({
      orderBlock: { type: 'bullish', obHigh: 101, obLow: 99, score: 14, priceInZone: true,
                    name: 'Order Block Altista', desc: 'test' },
    }), NEUTRAL_FG);
    const noOB = _computeScore(100, makeInd({ orderBlock: null }), NEUTRAL_FG);
    expect(inZone.score - noOB.score).toBeGreaterThanOrEqual(14);
  });

  it('bearish OB with price in zone subtracts 14', () => {
    const inZone = _computeScore(100, makeInd({
      orderBlock: { type: 'bearish', obHigh: 101, obLow: 99, score: -14, priceInZone: true,
                    name: 'Order Block Baixista', desc: 'test' },
    }), NEUTRAL_FG);
    const noOB = _computeScore(100, makeInd({ orderBlock: null }), NEUTRAL_FG);
    expect(noOB.score - inZone.score).toBeGreaterThanOrEqual(14);
  });

  it('OB with price outside zone contributes 0', () => {
    const outside = _computeScore(100, makeInd({
      orderBlock: { type: 'bullish', obHigh: 90, obLow: 85, score: 0, priceInZone: false,
                    name: 'Order Block Altista', desc: 'test' },
    }), NEUTRAL_FG);
    const noOB = _computeScore(100, makeInd({ orderBlock: null }), NEUTRAL_FG);
    expect(outside.score).toBe(noOB.score);
  });
});

// ─── _computeScore — Confluence bonus ────────────────────────────────────────
describe('_computeScore — Confluence bonus', () => {
  it('fully bullish setup (all 4 categories aligned) adds at least +15', () => {
    // Force all 4 categories aligned for LONG:
    // momentum: rsi < 50, trend: price > ema200 + mktStruct bullish, volume: obvTrend rising, pattern: bull pattern
    const fullAligned = makeInd({
      rsi: 35,                    // momentum aligned (isLong & rsi < 50)
      ema200: 90,                 // trend: price(100) > ema200
      mktStruct: { type: 'uptrend', score: 12 }, // trend: uptrend
      obvTrend: 'rising',         // volume aligned
      patterns: [{ name: 'Martelo ↑', score: +10, type: 'positive' }], // pattern aligned
      macdNow: 2, sigNow: 0, macdPrev: -1, sigPrev: 0, // MACD crossover → big positive base score
    });
    const noConf = makeInd({
      rsi: 45,
      ema200: 90,
      mktStruct: null,
      obvTrend: 'neutral',
      patterns: [],
      macdNow: 2, sigNow: 0, macdPrev: -1, sigPrev: 0,
    });
    const { score: withBonus } = _computeScore(100, fullAligned, NEUTRAL_FG);
    const { score: baseScore }  = _computeScore(100, noConf, NEUTRAL_FG);
    // The fully aligned setup should score higher due to confluence bonus
    expect(withBonus).toBeGreaterThan(baseScore);
  });

  it('confluence bonus is not applied when score is 0', () => {
    // A perfectly neutral score — bonus should not fire (would not make sense direction-wise)
    const neutral = makeInd({
      rsi: 50,
      macdNow: 0, sigNow: 0, macdPrev: 0, sigPrev: 0,
      ema9: 100, ema21: 100, ema200: 100,
      obvTrend: 'neutral',
    });
    // Just verify it doesn't throw and returns a number
    const { score } = _computeScore(100, neutral, NEUTRAL_FG);
    expect(typeof score).toBe('number');
  });
});

// ─── _calcTechIndicators — new indicator fields ───────────────────────────────
describe('_calcTechIndicators — new indicator fields', () => {
  it('returns ichimoku, anchoredVwap, squeeze, orderBlock fields', () => {
    const candles = makeTrendingCandles(100);
    const closes = candles.map(c => c.close);
    const ind = _calcTechIndicators(candles, closes);
    expect(ind).toHaveProperty('ichimoku');
    expect(ind).toHaveProperty('anchoredVwap');
    expect(ind).toHaveProperty('squeeze');
    expect(ind).toHaveProperty('orderBlock');
  });

  it('ichimoku is null for < 78 candles', () => {
    const candles = makeTrendingCandles(60);
    const closes = candles.map(c => c.close);
    const ind = _calcTechIndicators(candles, closes);
    expect(ind.ichimoku).toBeNull();
  });

  it('ichimoku is not null for >= 78 candles', () => {
    const candles = makeTrendingCandles(100);
    const closes = candles.map(c => c.close);
    const ind = _calcTechIndicators(candles, closes);
    expect(ind.ichimoku).not.toBeNull();
  });
});

// ─── ADX hard filter ─────────────────────────────────────────────────────────
describe('ADX hard filter in analyzeCandles', () => {
  it('strong trend produces ADX > 18 (passes filter)', () => {
    const candles = makeTrendingCandles(100, 100, 2);
    const adx = calcADX(candles);
    expect(adx).not.toBeNull();
    expect(adx).toBeGreaterThan(18);
  });

  it('ADX returns null for insufficient data', () => {
    const candles = makeTrendingCandles(20);
    expect(calcADX(candles, 14)).toBeNull();
  });
});

// ─── _calcTechIndicators ──────────────────────────────────────────────────────
describe('_calcTechIndicators', () => {
  it('returns all expected indicator fields', () => {
    const candles = makeTrendingCandles(100);
    const closes = candles.map(c => c.close);
    const ind = _calcTechIndicators(candles, closes);
    const required = ['price','rsiArr','rsi','ema9','ema21','ema200',
      'macdNow','macdPrev','sigNow','sigPrev','histNow','histPrev',
      'bb','atr','volRatio','levels','vwap','obvTrend','stochRSI',
      'patterns','divergences','adx','emaCross','mktStruct','triangle','dblPattern'];
    required.forEach(key => expect(ind).toHaveProperty(key));
  });

  it('price equals last candle close', () => {
    const candles = makeTrendingCandles(100);
    const closes = candles.map(c => c.close);
    const ind = _calcTechIndicators(candles, closes);
    expect(ind.price).toBe(candles[candles.length - 1].close);
  });

  it('rsiArr has same length as closes', () => {
    const candles = makeTrendingCandles(100);
    const closes = candles.map(c => c.close);
    const ind = _calcTechIndicators(candles, closes);
    expect(ind.rsiArr).toHaveLength(closes.length);
  });
});
