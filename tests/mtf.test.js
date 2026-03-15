import { describe, it, expect } from 'vitest';
import { applyMTFScoring } from '../painel-core.js';

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

// ─── Confluence bonus ────────────────────────────────────────────────────────
describe('applyMTFScoring — confluence bonus', () => {
  it('single setup per coin gets no bonus', () => {
    const setups = [makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' })];
    const result = applyMTFScoring(setups);
    expect(result[0].score).toBe(60);
    expect(result[0].mtfConfluence).toBeNull();
  });

  it('2 TFs same direction → +12 bonus (Math.min(12, 2*6))', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'buy', score: 65, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    // Deduplication keeps only the best; best score is 65 → 65+12=77
    expect(result[0].score).toBe(77);
  });

  it('3 TFs same direction → +12 bonus each (capped at 12)', () => {
    const setups = [
      makeSetup({ coin: 'ETH', dir: 'buy', score: 60, timeframe: '5m' }),
      makeSetup({ coin: 'ETH', dir: 'buy', score: 65, timeframe: '15m' }),
      makeSetup({ coin: 'ETH', dir: 'buy', score: 70, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    // 3 * 6 = 18 but capped at 12, best score = 70+12=82
    expect(result[0].score).toBe(82);
  });

  it('4+ TFs same direction still caps bonus at 12', () => {
    const setups = [
      makeSetup({ coin: 'SOL', dir: 'sell', score: 60, timeframe: '5m' }),
      makeSetup({ coin: 'SOL', dir: 'sell', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'SOL', dir: 'sell', score: 60, timeframe: '1h' }),
      makeSetup({ coin: 'SOL', dir: 'sell', score: 60, timeframe: '4h' }),
    ];
    const result = applyMTFScoring(setups);
    // 4 TFs → Math.min(12, 4*6)=12
    expect(result[0].score).toBe(72);
  });

  it('score is capped at 100 after bonus', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 96, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'buy', score: 97, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    expect(result[0].score).toBe(100);
  });

  it('mtfConfluence is set with correct dir, count, and tfs', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'BTC', dir: 'buy', score: 70, timeframe: '1h' }),
    ];
    const result = applyMTFScoring(setups);
    expect(result[0].mtfConfluence).not.toBeNull();
    expect(result[0].mtfConfluence.dir).toBe('buy');
    expect(result[0].mtfConfluence.count).toBe(2);
    expect(result[0].mtfConfluence.tfs).toContain('15m');
    expect(result[0].mtfConfluence.tfs).toContain('1h');
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
    // Conflict: buy on 15m vs sell on 1h — buy is lower TF opposing higher TF sell → -20 penalty
    // sell wins dedup anyway
    expect(result).toHaveLength(1);
  });
});

// ─── Conflict penalty ────────────────────────────────────────────────────────
describe('applyMTFScoring — conflict penalty', () => {
  it('lower TF opposing higher TF direction gets -20 penalty', () => {
    const setups = [
      makeSetup({ coin: 'BTC', dir: 'buy',  score: 60, timeframe: '15m' }), // lower TF, opposing
      makeSetup({ coin: 'BTC', dir: 'sell', score: 70, timeframe: '1h' }),  // higher TF
    ];
    applyMTFScoring(setups);
    // The buy/15m setup should have score reduced by 20 → 60-20=40
    // (We can't get this from result because dedup removes it — check the input objects which are mutated)
    expect(setups[0].score).toBe(40);
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
      makeSetup({ coin: 'BTC', dir: 'buy',  score: 10, timeframe: '15m' }), // will be penalized
      makeSetup({ coin: 'BTC', dir: 'sell', score: 80, timeframe: '4h' }),
    ];
    applyMTFScoring(setups);
    expect(setups[0].score).toBe(0); // Math.max(0, 10-20)
  });

  it('contra-tendência reason is prepended', () => {
    const setups = [
      makeSetup({ coin: 'ETH', dir: 'buy',  score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'ETH', dir: 'sell', score: 70, timeframe: '1h' }),
    ];
    applyMTFScoring(setups);
    const reason = setups[0].reasons.find(r => r.text.includes('Contra-tendência'));
    expect(reason).toBeDefined();
  });

  it('same direction on all TFs gets no conflict penalty', () => {
    const setups = [
      makeSetup({ coin: 'SOL', dir: 'buy', score: 60, timeframe: '15m' }),
      makeSetup({ coin: 'SOL', dir: 'buy', score: 70, timeframe: '1h' }),
    ];
    applyMTFScoring(setups);
    // buy/15m should NOT be penalized — same direction as buy/1h
    // 2 TFs same direction → Math.min(12, 2*6) = +12 bonus
    expect(setups[0].score).toBe(72); // 60 + 12 bonus
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
    // Both get +12 (2 TFs, Math.min(12,2*6)=12), so 1h setup (70+12=82) wins over 15m (60+12=72)
    expect(result[0].timeframe).toBe('1h');
    expect(result[0].score).toBe(82);
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
