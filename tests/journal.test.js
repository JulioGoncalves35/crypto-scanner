import { describe, it, expect } from 'vitest';
import {
  buildJournalEntry, isDuplicateEntry, computeJournalStats,
  JOURNAL_KEY,
} from '../painel-core.js';

// ─── Sample setup object ──────────────────────────────────────────────────────
function makeMockSetup(overrides = {}) {
  return {
    coin:      'BTC',
    dir:       'buy',
    timeframe: '15m',
    leverage:  10,
    entry:     50000,
    stop:      49000,
    stopPct:   '-2.00%',
    liqPrice:  45500,
    stopAdjusted: false,
    score:     75,
    m1: { price: 51618, cap: { netPct: '13.5' } },
    m2: { price: 53090, cap: { netPct: '22.0' } },
    m3: { price: 55180, cap: { netPct: '35.5' } },
    reasons: [
      { text: 'RSI 28.5 — Sobrevendido', type: 'positive' },
      { text: 'MACD Cruzamento ↑',       type: 'positive' },
      { text: 'RSI 55.0 — Neutro',       type: 'neutral'  },
    ],
    ...overrides,
  };
}

// ─── buildJournalEntry ────────────────────────────────────────────────────────
describe('buildJournalEntry', () => {
  it('returns null for null/undefined input', () => {
    expect(buildJournalEntry(null)).toBeNull();
    expect(buildJournalEntry(undefined)).toBeNull();
  });

  it('returns an object with all required fields', () => {
    const entry = buildJournalEntry(makeMockSetup());
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('savedAt');
    expect(entry).toHaveProperty('coin');
    expect(entry).toHaveProperty('dir');
    expect(entry).toHaveProperty('timeframe');
    expect(entry).toHaveProperty('leverage');
    expect(entry).toHaveProperty('entry');
    expect(entry).toHaveProperty('stop');
    expect(entry).toHaveProperty('liqPrice');
    expect(entry).toHaveProperty('m1p');
    expect(entry).toHaveProperty('m1cap');
    expect(entry).toHaveProperty('m2p');
    expect(entry).toHaveProperty('m2cap');
    expect(entry).toHaveProperty('m3p');
    expect(entry).toHaveProperty('m3cap');
    expect(entry).toHaveProperty('score');
    expect(entry).toHaveProperty('signals');
    expect(entry).toHaveProperty('notes');
    expect(entry).toHaveProperty('result');
  });

  it('result defaults to "active"', () => {
    const entry = buildJournalEntry(makeMockSetup());
    expect(entry.result).toBe('active');
  });

  it('notes defaults to empty string', () => {
    const entry = buildJournalEntry(makeMockSetup());
    expect(entry.notes).toBe('');
  });

  it('buy direction: m1cap starts with "+"', () => {
    const entry = buildJournalEntry(makeMockSetup({ dir: 'buy' }));
    expect(entry.m1cap.startsWith('+')).toBe(true);
  });

  it('sell direction: m1cap starts with "-"', () => {
    const entry = buildJournalEntry(makeMockSetup({ dir: 'sell' }));
    expect(entry.m1cap.startsWith('-')).toBe(true);
  });

  it('filters out neutral signals (non-MTF)', () => {
    const entry = buildJournalEntry(makeMockSetup());
    const hasNeutral = entry.signals.some(s => s.type === 'neutral' && !s.isMTF);
    expect(hasNeutral).toBe(false);
  });

  it('keeps positive and negative signals', () => {
    const entry = buildJournalEntry(makeMockSetup());
    expect(entry.signals.some(s => s.type === 'positive')).toBe(true);
  });

  it('savedAt is a valid ISO date string', () => {
    const entry = buildJournalEntry(makeMockSetup());
    expect(() => new Date(entry.savedAt)).not.toThrow();
    expect(new Date(entry.savedAt).toISOString()).toBe(entry.savedAt);
  });

  it('id is a number (timestamp)', () => {
    const entry = buildJournalEntry(makeMockSetup());
    expect(typeof entry.id).toBe('number');
    expect(entry.id).toBeGreaterThan(0);
  });

  it('liqPrice is formatted as string (not "—") for valid liqPrice', () => {
    const entry = buildJournalEntry(makeMockSetup({ liqPrice: 45500 }));
    expect(entry.liqPrice).not.toBe('—');
  });

  it('liqPrice is "—" when liqPrice is falsy', () => {
    const entry = buildJournalEntry(makeMockSetup({ liqPrice: null }));
    expect(entry.liqPrice).toBe('—');
  });

  it('entry price is formatted correctly for large prices (>= 1000 → toFixed(0))', () => {
    const entry = buildJournalEntry(makeMockSetup({ entry: 50000 }));
    expect(entry.entry).toBe('50000');
  });

  it('entry price is formatted correctly for small prices (< 1 → toFixed(5))', () => {
    const entry = buildJournalEntry(makeMockSetup({ entry: 0.00045 }));
    expect(entry.entry).toBe('0.00045');
  });

  it('entry price is formatted correctly for mid-range prices (>= 1 → toFixed(3))', () => {
    const entry = buildJournalEntry(makeMockSetup({ entry: 2.567 }));
    expect(entry.entry).toBe('2.567');
  });
});

// ─── isDuplicateEntry ─────────────────────────────────────────────────────────
describe('isDuplicateEntry', () => {
  it('returns false for empty journal', () => {
    expect(isDuplicateEntry([], makeMockSetup())).toBe(false);
  });

  it('returns true when coin, timeframe, and entry price match', () => {
    const entries = [buildJournalEntry(makeMockSetup())];
    const dup = makeMockSetup({ entry: 50000 });
    expect(isDuplicateEntry(entries, dup)).toBe(true);
  });

  it('returns false when coin differs', () => {
    const entries = [buildJournalEntry(makeMockSetup({ coin: 'ETH' }))];
    const setup = makeMockSetup({ coin: 'BTC', entry: 50000 });
    expect(isDuplicateEntry(entries, setup)).toBe(false);
  });

  it('returns false when timeframe differs', () => {
    const entries = [buildJournalEntry(makeMockSetup({ timeframe: '1h' }))];
    const setup = makeMockSetup({ timeframe: '15m', entry: 50000 });
    expect(isDuplicateEntry(entries, setup)).toBe(false);
  });

  it('returns false when entry price differs by more than 0.001', () => {
    const entries = [buildJournalEntry(makeMockSetup({ entry: 50000 }))];
    const setup = makeMockSetup({ entry: 50005 });
    expect(isDuplicateEntry(entries, setup)).toBe(false);
  });

  it('returns true when entry price differs by less than 0.001 (tolerance)', () => {
    const entries = [buildJournalEntry(makeMockSetup({ entry: 50000 }))];
    const setup = makeMockSetup({ entry: 50000.0005 });
    expect(isDuplicateEntry(entries, setup)).toBe(true);
  });
});

// ─── computeJournalStats ──────────────────────────────────────────────────────
describe('computeJournalStats', () => {
  it('returns zeros for empty journal', () => {
    const stats = computeJournalStats([]);
    expect(stats.total).toBe(0);
    expect(stats.longs).toBe(0);
    expect(stats.shorts).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.winRate).toBeNull();
    expect(stats.avgReturn).toBeNull();
  });

  it('counts longs and shorts correctly', () => {
    const entries = [
      { dir: 'buy',  result: 'active' },
      { dir: 'buy',  result: 'active' },
      { dir: 'sell', result: 'active' },
    ];
    const stats = computeJournalStats(entries);
    expect(stats.longs).toBe(2);
    expect(stats.shorts).toBe(1);
    expect(stats.total).toBe(3);
  });

  it('active entries are not counted in withResult', () => {
    const entries = [{ dir: 'buy', result: 'active' }];
    const stats = computeJournalStats(entries);
    expect(stats.withResult).toBe(0);
    expect(stats.winRate).toBeNull();
  });

  it('m1/m2/m3 results are counted as wins', () => {
    const entries = [
      { dir: 'buy', result: 'm1', m1cap: '+13.5', m2cap: '+22.0', m3cap: '+35.5' },
      { dir: 'buy', result: 'm2', m1cap: '+13.5', m2cap: '+22.0', m3cap: '+35.5' },
      { dir: 'buy', result: 'm3', m1cap: '+13.5', m2cap: '+22.0', m3cap: '+35.5' },
    ];
    const stats = computeJournalStats(entries);
    expect(stats.wins).toBe(3);
    expect(stats.losses).toBe(0);
  });

  it('stop results are counted as losses', () => {
    const entries = [
      { dir: 'buy',  result: 'stop' },
      { dir: 'sell', result: 'stop' },
    ];
    const stats = computeJournalStats(entries);
    expect(stats.losses).toBe(2);
    expect(stats.wins).toBe(0);
  });

  it('winRate = 50 for 1 win and 1 loss', () => {
    const entries = [
      { dir: 'buy', result: 'm1', m1cap: '+13.5', m2cap: '+22.0', m3cap: '+35.5' },
      { dir: 'buy', result: 'stop' },
    ];
    const stats = computeJournalStats(entries);
    expect(stats.winRate).toBe(50);
  });

  it('winRate = 100 for all wins', () => {
    const entries = [
      { dir: 'buy',  result: 'm3', m1cap: '+13.5', m2cap: '+22.0', m3cap: '+35.5' },
      { dir: 'sell', result: 'm2', m1cap: '-13.5', m2cap: '-22.0', m3cap: '-35.5' },
    ];
    const stats = computeJournalStats(entries);
    expect(stats.winRate).toBe(100);
  });

  it('avgReturn computes correctly from m1cap/m2cap/m3cap', () => {
    const entries = [
      { dir: 'buy', result: 'm1', m1cap: '+10.0', m2cap: '+20.0', m3cap: '+30.0' },
      { dir: 'buy', result: 'm3', m1cap: '+10.0', m2cap: '+20.0', m3cap: '+30.0' },
    ];
    const stats = computeJournalStats(entries);
    // Win 1: m1cap=10.0, Win 2: m3cap=30.0 → avg = (10+30)/2 = 20
    expect(parseFloat(stats.avgReturn)).toBeCloseTo(20, 1);
  });

  it('JOURNAL_KEY constant equals the expected localStorage key', () => {
    expect(JOURNAL_KEY).toBe('cryptoscanner_journal_v2');
  });
});
