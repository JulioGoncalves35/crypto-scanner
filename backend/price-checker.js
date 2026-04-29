/**
 * price-checker.js
 * Periodically fetches current prices and checks stop/target conditions
 * for all active paper trades.
 */

import { fetchWithFallback } from '../painel-core.js';
import { getActiveTrades, updateTrade } from './db.js';
import { processPriceUpdate } from './paper-trader.js';

// Horizon expiry in hours per timeframe
const HORIZON_HOURS = {
  '5m':  24,
  '15m': 48,
  '30m': 48,
  '1h':  120,  // 5 days
  '4h':  336,  // 14 days
  '1D':  720,  // 30 days
};

// ─── Fetch current price ──────────────────────────────────────────────────────

async function fetchCurrentPrice(coin) {
  try {
    const url = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${coin}`;
    const j = await fetchWithFallback(url, null);
    if (j?.retCode === 0 && j.result?.list?.[0]) {
      return parseFloat(j.result.list[0].lastPrice);
    }
  } catch (_) {}
  return null;
}

// Fetches 1m klines covering the window since `sinceMs` and aggregates the
// lowest low / highest high across them. This catches intra-bar wicks that
// the per-5-min ticker poll misses (e.g. a stop hit between two polls).
// Returns { lastPrice, lowSinceCheck, highSinceCheck } or null on failure.
export async function fetchRecentPriceWindow(coin, sinceMs) {
  try {
    const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}&interval=1&limit=20`;
    const j = await fetchWithFallback(url, null);
    if (j?.retCode !== 0 || !j.result?.list?.length) return null;

    // Bybit returns newest first; reverse to oldest-first.
    const candles = j.result.list.slice().reverse().map(k => ({
      time:  parseInt(k[0]),
      high:  parseFloat(k[2]),
      low:   parseFloat(k[3]),
      close: parseFloat(k[4]),
    }));

    // Keep candles whose 1-minute period overlaps [sinceMs, now].
    // A candle starting at `time` covers [time, time + 60000).
    const relevant = candles.filter(c => c.time + 60000 >= sinceMs);
    if (!relevant.length) return null;

    let lowSinceCheck  =  Infinity;
    let highSinceCheck = -Infinity;
    for (const c of relevant) {
      if (c.low  < lowSinceCheck)  lowSinceCheck  = c.low;
      if (c.high > highSinceCheck) highSinceCheck = c.high;
    }
    const lastPrice = relevant[relevant.length - 1].close;
    return { lastPrice, lowSinceCheck, highSinceCheck };
  } catch (_) {
    return null;
  }
}

// ─── Check expiry ─────────────────────────────────────────────────────────────

function isExpired(trade) {
  const horizonHrs = HORIZON_HOURS[trade.timeframe] ?? 48;
  const foundAt = new Date(trade.found_at).getTime();
  const expiresAt = foundAt + horizonHrs * 60 * 60 * 1000;
  return Date.now() > expiresAt;
}

// ─── Main check function ──────────────────────────────────────────────────────

export async function checkActiveTrades() {
  const activeTrades = getActiveTrades();
  if (activeTrades.length === 0) return;

  console.log(`[price-checker] checking ${activeTrades.length} active trade(s)`);

  for (const trade of activeTrades) {
    try {
      // Check expiry first
      if (isExpired(trade)) {
        const price = await fetchCurrentPrice(trade.coin);
        const closePrice = price ?? trade.entry; // fallback to entry for 0% PnL

        // Import processPriceUpdate-compatible: close at current price via direct DB update
        const { processPriceUpdate: processUpdate } = await import('./paper-trader.js');
        // Force close at expiry using a synthetic price that triggers no target/stop
        // We call a dedicated expiry handler instead
        await expireTrade(trade, closePrice);
        continue;
      }

      // Use 1m kline wicks since the last poll to catch intra-bar stop/target
      // hits the 5-min ticker poll would miss. Falls back to ticker lastPrice
      // if klines are unavailable.
      const sinceMs = trade.last_checked_at
        ? new Date(trade.last_checked_at).getTime()
        : new Date(trade.found_at).getTime();
      const window = await fetchRecentPriceWindow(trade.coin, sinceMs);

      if (!window) {
        const price = await fetchCurrentPrice(trade.coin);
        if (!price) {
          console.warn(`[price-checker] could not fetch price for ${trade.coin}`);
          continue;
        }
        updateTrade(trade.id, { last_checked_at: new Date().toISOString() });
        const result = processPriceUpdate(trade, price);
        if (result) console.log(`[price-checker] ${trade.coin} → ${result.status} @ $${price}`);
        continue;
      }

      updateTrade(trade.id, { last_checked_at: new Date().toISOString() });

      const isBuy = trade.direction === 'buy';
      const adverseWick   = isBuy ? window.lowSinceCheck  : window.highSinceCheck;
      const favorableWick = isBuy ? window.highSinceCheck : window.lowSinceCheck;

      // Conservative ordering: when both sides were touched in the same window
      // we can't know intra-bar order, so check stop first (worst-case for trader).
      const stopResult = processPriceUpdate(trade, adverseWick);
      if (stopResult && (stopResult.status === 'stop' || stopResult.status === 'stopped_at_entry')) {
        console.log(`[price-checker] ${trade.coin} → ${stopResult.status} via wick @ $${adverseWick} (lastPrice=$${window.lastPrice})`);
        continue;
      }

      const targetResult = processPriceUpdate(trade, favorableWick);
      if (targetResult) {
        console.log(`[price-checker] ${trade.coin} → ${targetResult.status} via wick @ $${favorableWick} (lastPrice=$${window.lastPrice})`);
      }
    } catch (err) {
      console.error(`[price-checker] error checking ${trade.coin}: ${err.message}`);
    }
  }
}

// ─── Expiry close ─────────────────────────────────────────────────────────────

import { getAccount, updateAccount } from './db.js';
import { ROUND_TRIP_FEE } from '../painel-core.js';

async function expireTrade(trade, closePrice) {
  const isBuy = trade.direction === 'buy';
  const alreadyClosedFraction = _alreadyClosedFraction(trade.status);
  const remaining = 1 - alreadyClosedFraction;

  const movePct = isBuy
    ? (closePrice - trade.entry) / trade.entry
    : (trade.entry - closePrice) / trade.entry;

  const positionValue = trade.capital_allocated * trade.leverage;
  const sliceValue    = positionValue * remaining;
  const grossPnl      = sliceValue * movePct;
  const feeCost       = sliceValue * ROUND_TRIP_FEE;
  const slicePnl      = parseFloat((grossPnl - feeCost).toFixed(2));

  const newPnl             = parseFloat((trade.pnl + slicePnl).toFixed(2));
  const capitalFraction    = trade.capital_allocated * remaining;
  const newCapitalReturned = parseFloat((trade.capital_returned + capitalFraction + slicePnl).toFixed(2));

  updateTrade(trade.id, {
    status: 'expired',
    pnl: newPnl,
    capital_returned: newCapitalReturned,
    result_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
  });

  const account = getAccount();
  const newAccountCapital = parseFloat((account.current_capital + capitalFraction + slicePnl).toFixed(2));
  updateAccount({ current_capital: newAccountCapital });

  console.log(`[price-checker] EXPIRED ${trade.direction.toUpperCase()} ${trade.coin} @ $${closePrice} | pnl=$${newPnl}`);
}

function _alreadyClosedFraction(status) {
  if (status === 'active') return 0;
  if (status === 'm1')     return 0.33;
  if (status === 'm2')     return 0.66;
  return 0;
}
