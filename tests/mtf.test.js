import { describe, it, expect } from 'vitest';
import { applyMTFScoring, getMTFWeight } from '../painel-core.js';

// ─── Setup factory ───────────────────────────────────────────────────────────
let _idSeq = 1;
function makeSetup(overrides = {}) {
  const score = overrides.score ?? 60;
  const dir   = overrides.dir   ?? 'buy';
  const coin  = overrides.coin  ?? 'BTC';
  const tf    = overrides.timeframe ?? '15m';

  // Minimal cap structure needed for sort and financial checks
  const capNetPct = overrides._capNetPct ?? '50.00';
  const setup = {
    coin,
    pair: `${coin}/USDT`,
    dir,
    score,
    timeframe: tf,
    entry: 100,
    stop:  dir === 'buy' ? 95 : 105,
    liqPrice: dir === 'buy' ? 80 : 120,
    stopAdjusted: false,
    stopPct: '-5.00%',
    m1: { price: 110, cap: { netPct: '15.00', grossPct: '16.10', feePct: '1.10', isProfit: true } },
    m2: { price: 125, cap: { netPct: '30.00', grossPct: '31.10', feePct: '1.10', isProfit: true } },
    m3: { price: 150, cap: { netPct: capNetPct, grossPct: String(parseFloat(capNetPct)+1.10), feePct: '1.10', isProfit: true } },
    capStop: { netPct: '-5.00' },
    feePctCap: '1.10',
    reasons: [],
    indicators: [],
    summary: `${coin} ${dir === 'buy' ? 'LONG' : 'SHORT'}`,
    patterns: [],
    divergences: [],
    conditionalEntry: null,
    candles: [],
    mtfConfluence: null,
    leverage: 10,
    _id: _idSeq++,
    ...overrides,
  };
  return setup;
}

// ─── getMTFWeight ─────────────────────────────────────────────────────────────
describe('getMTFWeight', () => {
  it('5m+4h returns 14', () => {
    expect(getMTFWeight('5m', '4h')).toBe(14);
  });

  it('15m+1h returns 8', () => {
    expect(getMTFWeight('15m', '1h')).toBe(8);
  });

  it('4h+1D returns 10', () => {
    expect(getMTFWeight('4h', '1D')).toBe(10);
  });

  it('5m+1D returns 16', () => {
    expect(getMTFWeight('5m', '1D')).toBe(16);
  });

  it('unknown pair returns 6 (fallback)', () => {
    expect(getMTFWeight('unknown', 'tf')).toBe(6);
    expect(getMTFWeight('30m', '1D')).toBe(6); // not in table
  });

  it('is symmetric (tf1+tf2 == tf2+tf1)', () => {
    expect(getMTFWeight('5m', '1h')).toBe(getMTFWeight('1h', '5m'));
    expect(getMTFWeight('15m', '4h')).toBe(getMTFWeight('4h', '15m'));
  });
});

// ─── Confluence bonus ────────────────────────────────────────────────────────
describe('applyMTFScoring — confluence bonus', () => {
  it('single setup per coin gets no bonus', () => {
    const setups = [makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' })];
    const result = applyMTFScoring(setups);
    expect(result[0].score).toBe(60);
    expect(result[0].mtfConfluence).toBeNull();
  });

  it('2 TFs same direction → weighted bonus (15m+1h = 8 pts)', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'buy', score: 65, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    // Best score is 65 → 65+8=73
    expect(result[0].score).toBe(73);
  });

  it('3 TFs same direction → sum of all pairs with cap 25 (5m+15m+1h = 6+10+8=24)', () => {
    const setups = [
      makeSetup({ coin: 'ETH', dir: 'buy', score: 60, timeframe: '5m' }),
      makeSetup({ coin: 'ETH', dir: 'buy', score: 65, timeframe: '15m' }),
      makeSetup({ coin: 'ETH', dir: 'buy', score: 70, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    // getMTFWeight(5m,15m)=6, getMTFWeight(5m,1h)=10, getMTFWeight(15m,1h)=8 → total=24, capped at 25 → 24
    // best score = 70+24=94
    expect(result[0].score).toBe(94);
  });

  it('4+ TFs same direction caps bonus at 25 (5m+15m+1h+4h pairs sum >> 25)', () => {
    const setups = [
      makeSetup({ coin: 'SOL', dir: 'sell', score: 60, timeframe: '5m' }),
      makeSetup({ coin: 'SOL', dir: 'sell', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'SOL', dir: 'sell', score: 60, timeframe: '1h' }),
      makeSetup({ coin: 'SOL', dir: 'sell', score: 60, timeframe: '4h' }),
    ];
    const result = applyMTFScoring(setups);
    // pairs: 5m+15m=6, 5m+1h=10, 5m+4h=14, 15m+1h=8, 15m+4h=12, 1h+4h=10 → total=60, cap=25
    // 60+25=85
    expect(result[0].score).toBe(85);
  });

  it('score is capped at 100 after bonus', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 96, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'buy', score: 97, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    expect(result[0].score).toBe(100);
  });

  it('mtfConfluence has hardTFs, softTFs, bonus, dir, count, tfs', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'buy', score: 70, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    const mtf = result[0].mtfConfluence;
    expect(mtf).not.toBeNull();
    expect(mtf.dir).toBe('buy');
    expect(mtf.count).toBe(2);
    expect(mtf.hardTFs).toContain('15m');
    expect(mtf.hardTFs).toContain('1h');
    expect(mtf.softTFs).toEqual([]);
    expect(mtf.bonus).toBe(8); // getMTFWeight(15m,1h)=8
    expect(mtf.tfs).toContain('15m');
    expect(mtf.tfs).toContain('1h');
  });

  it('confluence reason is prepended to reasons array', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'sell', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'sell', score: 70, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    const confluenceReason = result[0].reasons.find(r => r.text.includes('Confluência'));
    expect(confluenceReason).toBeDefined();
    expect(confluenceReason.isMTF).toBe(true);
  });

  it('buy and sell setups for same coin do not cross-influence each other', () => {
    // 1 buy and 1 sell — neither group has 2+ same direction
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy',  score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'sell', score: 70, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    // No confluence bonus since each direction has only 1 setup
    // Only 1 survives dedup (highest score = sell at 70, minus potential conflict penalty)
    // Conflict: buy on 15m vs sell on 1h — buy is lower TF opposing higher TF sell → penalty
    // sell wins dedup anyway
    expect(result).toHaveLength(1);
  });

  it('soft confirms contribute to bonus but appear in softTFs not hardTFs', () => {
    const hardSetups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 70, timeframe: '15m' }),
    ];
    const softSetups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(hardSetups, softSetups);
    const mtf = result[0].mtfConfluence;
    expect(mtf).not.toBeNull();
    expect(mtf.hardTFs).toEqual(['15m']);
    expect(mtf.softTFs).toEqual(['1h']);
    expect(mtf.bonus).toBe(8); // getMTFWeight(15m,1h)=8
    // score: 70 + 8 = 78
    expect(result[0].score).toBe(78);
  });

  it('soft confirms for wrong coin are ignored', () => {
    const hardSetups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 70, timeframe: '15m' }),
    ];
    const softSetups = [
      makeSetup({ coin: 'ETH', dir: 'buy', score: 60, timeframe: '1h' }), // different coin
    ];
    const result = applyMTFScoring(hardSetups, softSetups);
    expect(result[0].mtfConfluence).toBeNull(); // no confluence — no matching coin soft confirm
  });
});

// ─── Conflict penalty ────────────────────────────────────────────────────────
describe('applyMTFScoring — conflict penalty', () => {
  it('lower TF opposing higher TF with gap >= 2 gets -20 penalty (15m vs 1h, gap=2)', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy',  score: 60, timeframe: '15m' }), // lower TF, opposing
      makeSetup({ coin: 'BTC', dir: 'sell', score: 70, timeframe: '1h' }),  // higher TF
    ];
    applyMTFScoring(setups);
    // TF_ORDER: 15m=idx1, 1h=idx3, gap=2 → penalty=20
    // The buy/15m setup should have score reduced by 20 → 60-20=40
    expect(setups[0].score).toBe(40);
  });

  it('lower TF opposing adjacent TF (gap=1) gets -8 penalty (5m vs 15m)', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy',  score: 60, timeframe: '5m' }),  // lower TF, gap=1
      makeSetup({ coin: 'BTC', dir: 'sell', score: 70, timeframe: '15m' }), // higher TF
    ];
    applyMTFScoring(setups);
    // TF_ORDER: 5m=idx0, 15m=idx1, gap=1 → penalty=8
    expect(setups[0].score).toBe(52); // 60-8=52
  });

  it('higher TF does not get conflict penalty', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy',  score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'sell', score: 70, timeframe: '1h' }),
    ];
    applyMTFScoring(setups);
    // sell/1h is the highest TF — it should not receive the penalty
    expect(setups[1].score).toBe(70);
  });

  it('conflict penalty does not go below 0', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy',  score: 10, timeframe: '15m' }), // will be penalized -20
      makeSetup({ coin: 'BTC', dir: 'sell', score: 80, timeframe: '4h' }),
    ];
    applyMTFScoring(setups);
    expect(setups[0].score).toBe(0); // Math.max(0, 10-20)
  });

  it('conflict reason text includes "Conflito"', () => {
    const setups = [
      makeSetup({ coin: 'ETH', dir: 'buy',  score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'ETH', dir: 'sell', score: 70, timeframe: '1h' }),
    ];
    applyMTFScoring(setups);
    const reason = setups[0].reasons.find(r => r.text.includes('Conflito'));
    expect(reason).toBeDefined();
  });

  it('same direction on all TFs gets no conflict penalty', () => {
    const setups = [
      makeSetup({ coin: 'SOL', dir: 'buy', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'SOL', dir: 'buy', score: 70, timeframe: '1h' }),
    ];
    applyMTFScoring(setups);
    // buy/15m should NOT be penalized — same direction as buy/1h
    // 2 TFs same direction → getMTFWeight(15m,1h)=8 bonus
    expect(setups[0].score).toBe(68); // 60 + 8 bonus
  });
});

// ─── Deduplication ──────────────────────────────────────────────────────────
describe('applyMTFScoring — deduplication', () => {
  it('returns only one setup per coin', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'buy', score: 70, timeframe: '1h' }),
      makeSetup({ coin: 'BTC', dir: 'buy', score: 65, timeframe: '4h' }),
    ];
    const result = applyMTFScoring(setups);
    const btcResults = result.filter(r => r.coin === 'BTC');
    expect(btcResults).toHaveLength(1);
  });

  it('keeps the highest-scoring setup after bonus/penalty are applied', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'buy', score: 70, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    // Both get +8 (getMTFWeight(15m,1h)=8), so 1h setup (70+8=78) wins over 15m (60+8=68)
    expect(result[0].timeframe).toBe('1h');
    expect(result[0].score).toBe(78);
  });

  it('different coins are not deduplicated together', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'ETH', dir: 'buy', score: 70, timeframe: '15m' }),
    ];
    const result = applyMTFScoring(setups);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    const result = applyMTFScoring([]);
    expect(result).toEqual([]);
  });
});

// ─── Sorting ─────────────────────────────────────────────────────────────────
describe('applyMTFScoring — sorting', () => {
  it('results are sorted by m3.cap.netPct descending', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m', _capNetPct: '30.00' }),
      makeSetup({ coin: 'ETH', dir: 'buy', score: 70, timeframe: '15m', _capNetPct: '50.00' }),
      makeSetup({ coin: 'SOL', dir: 'buy', score: 65, timeframe: '15m', _capNetPct: '40.00' }),
    ];
    const result = applyMTFScoring(setups);
    expect(result[0].coin).toBe('ETH'); // highest m3 netPct
    expect(result[1].coin).toBe('SOL');
    expect(result[2].coin).toBe('BTC');
  });

  it('single result is returned as single-element array', () => {
    const setups = [makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' })];
    const result = applyMTFScoring(setups);
    expect(result).toHaveLength(1);
  });
});
