/**
 * scanner.js
 * Auto-scan engine for the backend server.
 * Reuses painel-core.js analysis engine directly.
 */

import {
  TIMEFRAMES_BY_MODE,
  analyzeCandles,
  applyMTFScoring,
  fetchWithFallback,
  fetchCandles,
  calcEMA,
} from '../painel-core.js';

import {
  getAccount,
  getActiveCoins,
  countActivePositions,
  insertTrade,
  insertScanLog,
} from './db.js';

import { openPosition } from './paper-trader.js';

// TF → trade type classification
const TF_TYPE = {
  '5m': 'scalp', '15m': 'scalp', '30m': 'scalp',
  '1h': 'day',
  '4h': 'swing', '1D': 'swing',
};

// Default 39 coins
const DEFAULT_COINS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','AVAX',
  'DOGE','DOT','LINK','LTC','ATOM','UNI',
  'INJ','ARB','WLD','SEI','TIA','APT',
  'OP','NEAR','FIL','AAVE','MKR','SNX',
  'CRV','LDO','GMX','PENDLE',
  'WIF','1000PEPE','JTO','PYTH','STRK',
];

// ─── Macro trend filter ───────────────────────────────────────────────────────

/**
 * Determines the macro market trend by comparing BTC's current price to its
 * 4h EMA200. Returns 'bull', 'bear', or null (fail-open when data unavailable).
 *
 * Used to block counter-trend trades:
 *   - LONG setups are skipped when macro is 'bear'
 *   - SHORT setups are skipped when macro is 'bull'
 */
async function fetchMacroBtcTrend() {
  try {
    const candles = await fetchCandles('BTCUSDT', '4h', null);
    if (!candles || candles.length < 200) return null; // fail-open: insufficient data
    const closes = candles.map(c => c.close);
    const ema200 = calcEMA(closes, 200);
    const currentEma = ema200[ema200.length - 1];
    const currentPrice = closes[closes.length - 1];
    const trend = currentPrice > currentEma ? 'bull' : 'bear';
    console.log(`[scanner] macro BTC trend: ${trend} (price=${currentPrice.toFixed(0)}, EMA200=${currentEma.toFixed(0)})`);
    return trend;
  } catch (_) {
    console.warn('[scanner] macro trend fetch failed — skipping direction filter');
    return null; // fail-open: allow all directions if unable to determine
  }
}

// ─── Auxiliary fetches (same as runRealAnalysis in painel.html) ──────────────

async function fetchFearGreed() {
  try {
    const j = await fetchWithFallback('https://api.alternative.me/fng/?limit=1', null);
    if (j?.data?.[0]) return { value: parseInt(j.data[0].value), label: j.data[0].value_classification };
  } catch (_) {}
  return { value: 50, label: 'Neutral' };
}

async function fetchFundingRate(symbol) {
  try {
    const url = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}USDT&limit=1`;
    const j = await fetchWithFallback(url, null);
    if (j?.retCode === 0 && j.result?.list?.[0]) return parseFloat(j.result.list[0].fundingRate);
  } catch (_) {}
  return null;
}

async function fetchOpenInterest(symbol) {
  try {
    const url = `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}USDT&intervalTime=1h&limit=24`;
    const j = await fetchWithFallback(url, null);
    if (j?.retCode === 0 && j.result?.list?.length >= 2) {
      const list = j.result.list;
      const latest = parseFloat(list[0].openInterest);
      const oldest = parseFloat(list[list.length - 1].openInterest);
      const change24h = oldest > 0 ? ((latest - oldest) / oldest) * 100 : 0;
      return { latest, change24h };
    }
  } catch (_) {}
  return null;
}

// ─── Main scan function ──────────────────────────────────────────────────────

/**
 * Run a full scan across all coins in "both" mode (all TFs).
 * Applies MTF scoring, deduplicates, and opens paper positions for top setups.
 * @returns {object} scan summary
 */
export async function runScan() {
  const startTime = Date.now();
  const account = getAccount();
  const { min_score, leverage } = account;

  const activeCoins = getActiveCoins();
  const tfs = TIMEFRAMES_BY_MODE.both; // ['5m','15m','30m','1h','4h','1D']

  const fg = await fetchFearGreed();
  const macroTrend = await fetchMacroBtcTrend();

  let opportunities = 0;
  let skippedActive = 0;
  const errors = [];

  for (const coin of DEFAULT_COINS) {
    const symbol = coin === '1000PEPE' ? '1000PEPE' : coin; // fetchCandles adds USDT

    // Skip if this coin already has an active trade
    if (activeCoins.has(`${symbol}USDT`)) {
      skippedActive++;
      continue;
    }

    let fundingRate = null;
    let openInterest = null;

    try {
      fundingRate = await fetchFundingRate(symbol);
    } catch (_) {}

    try {
      openInterest = await fetchOpenInterest(symbol);
    } catch (_) {}

    const hardResults = [];
    const softResults = [];

    for (const tf of tfs) {
      try {
        const candles = await fetchCandles(`${symbol}USDT`, tf, null);
        if (!candles) continue;

        // analyzeCandles with score='0' to collect ALL setups (we filter manually below)
        const setup = analyzeCandles(
          symbol, tf, candles, fg, fundingRate, openInterest,
          { score: '0', leverage, rr: 'fib' }
        );
        if (!setup) continue;

        if (setup.score >= parseInt(min_score)) {
          setup._rawType = TF_TYPE[tf] || 'day';
          hardResults.push(setup);
        } else if (setup.score >= parseInt(min_score) - 15) {
          // soft result for MTF confluence calculation
          setup._rawType = TF_TYPE[tf] || 'day';
          softResults.push(setup);
        }
      } catch (err) {
        errors.push(`${symbol}/${tf}: ${err.message}`);
      }
    }

    if (hardResults.length === 0) continue;

    // Apply MTF scoring (confluence bonus + conflict penalty)
    const dedupedSetups = applyMTFScoring(hardResults, softResults);

    for (const setup of dedupedSetups) {
      // Re-check score after MTF adjustments
      if (setup.score < parseInt(min_score)) continue;

      // Macro trend filter: skip trades that go counter to BTC's 4h EMA200 trend
      if (macroTrend === 'bear' && setup.dir === 'buy') {
        console.log(`[scanner] SKIP ${symbol} LONG — macro BTC bearish (price < EMA200 4h)`);
        continue;
      }
      if (macroTrend === 'bull' && setup.dir === 'sell') {
        console.log(`[scanner] SKIP ${symbol} SHORT — macro BTC bullish (price > EMA200 4h)`);
        continue;
      }

      try {
        const trade = await openPosition(setup);
        if (trade) {
          opportunities++;
          // After opening, mark coin as active so we don't open another TF of same coin
          activeCoins.add(`${symbol}USDT`);
          break; // only 1 trade per coin per scan
        }
      } catch (err) {
        errors.push(`open position ${symbol}: ${err.message}`);
      }
    }
  }

  const duration_ms = Date.now() - startTime;

  insertScanLog({
    ran_at: new Date().toISOString(),
    duration_ms,
    opportunities,
    skipped_active: skippedActive,
    errors: errors.length > 0 ? JSON.stringify(errors) : null,
  });

  console.log(`[scanner] scan complete — ${opportunities} opportunities, ${skippedActive} skipped, ${duration_ms}ms`);
  return { opportunities, skipped_active: skippedActive, duration_ms, errors };
}
