/**
 * paper-trader.js
 * Capital allocation, position state machine, and P&L calculation.
 *
 * Exit strategy: 33% at M1, 33% at M2, 34% at M3.
 * When M1 is hit → move current_stop to entry (breakeven).
 * Fees: ROUND_TRIP_FEE = 0.11% applied on full position at open + each partial close.
 */

import { ROUND_TRIP_FEE } from '../painel-core.js';
import {
  getAccount,
  countActivePositions,
  insertTrade,
  updateTrade,
  updateAccount,
} from './db.js';

// Fraction of position closed at each target
const CLOSE_AT_M1 = 0.33;
const CLOSE_AT_M2 = 0.33;
const CLOSE_AT_M3 = 0.34;

// ─── Open position ───────────────────────────────────────────────────────────

/**
 * Try to open a paper position for a given setup.
 * Returns the inserted trade object or null if blocked (capital/positions limit).
 */
export async function openPosition(setup) {
  const account = getAccount();
  const { current_capital, alloc_pct, max_positions, leverage } = account;

  // Check limits
  if (countActivePositions() >= max_positions) return null;

  const capital_allocated = parseFloat(((alloc_pct / 100) * current_capital).toFixed(2));
  if (capital_allocated <= 0 || current_capital < capital_allocated) return null;

  const id = `${Date.now()}-${setup.coin}-${setup.timeframe}`;
  const now = new Date().toISOString();

  // TF → type classification
  const TF_TYPE = {
    '5m': 'scalp', '15m': 'scalp', '30m': 'scalp',
    '1h': 'day',
    '4h': 'swing', '1D': 'swing',
  };

  const entry = parseFloat(setup.entry);
  const stop  = parseFloat(setup.stop);
  const m1    = parseFloat(setup.m1.price);
  const m2    = parseFloat(setup.m2.price);
  const m3    = parseFloat(setup.m3.price);

  const stop_pct = Math.abs((stop - entry) / entry) * 100;

  const trade = {
    id,
    coin:               `${setup.coin}USDT`,
    direction:          setup.dir,
    timeframe:          setup.timeframe,
    type:               setup._rawType || TF_TYPE[setup.timeframe] || 'day',
    score:              setup.score,
    entry,
    stop,
    current_stop:       stop,
    m1,
    m2,
    m3,
    stop_pct,
    leverage,
    found_at:           now,
    capital_allocated,
    signals:            JSON.stringify(setup.reasons || []),
    analysis_json:      JSON.stringify({
      reasons:        setup.reasons       || [],
      indicators:     setup.indicators    || [],
      summary:        setup.summary       || '',
      liq_price:      setup.liqPrice      ?? null,
      stop_adjusted:  setup.stopAdjusted  || false,
      stop_pct_str:   setup.stopPct       || '',
      m1_cap:         setup.m1?.cap       ?? null,
      m2_cap:         setup.m2?.cap       ?? null,
      m3_cap:         setup.m3?.cap       ?? null,
      m1_pct:         setup.m1?.pct       || '',
      m2_pct:         setup.m2?.pct       || '',
      m3_pct:         setup.m3?.pct       || '',
      mtf_confluence: setup.mtfConfluence ?? null,
    }),
  };

  insertTrade(trade);

  // Debit capital from account
  updateAccount({ current_capital: parseFloat((current_capital - capital_allocated).toFixed(2)) });

  console.log(`[paper-trader] opened ${trade.direction.toUpperCase()} ${trade.coin} @ ${entry} | score=${setup.score} | alloc=$${capital_allocated}`);
  return trade;
}

// ─── Close position (full or partial) ───────────────────────────────────────

/**
 * Process a price event for a trade.
 * Determines if any target or stop was hit and applies the state machine.
 * @param {object} trade - trade row from DB
 * @param {number} currentPrice - latest market price
 */
export function processPriceUpdate(trade, currentPrice) {
  const isBuy = trade.direction === 'buy';

  // Helper: price moved in favorable direction for this trade
  const hitTarget = (target) => isBuy ? currentPrice >= target : currentPrice <= target;
  const hitStop   = () => isBuy ? currentPrice <= trade.current_stop : currentPrice >= trade.current_stop;

  // Determine fraction already closed and position fraction remaining
  const alreadyClosed = _alreadyClosedFraction(trade.status);
  const remaining = 1 - alreadyClosed;

  if (remaining <= 0) return null; // fully closed (shouldn't happen but guard)

  // ── Check in priority order: stop first, then highest unvisited target ──

  if (hitStop()) {
    return _closePartial(trade, currentPrice, remaining, _stopStatus(trade.status));
  }

  if (hitTarget(trade.m3) && trade.status === 'm2') {
    return _closePartial(trade, currentPrice, CLOSE_AT_M3, 'm3');
  }

  if (hitTarget(trade.m2) && trade.status === 'm1') {
    return _closePartial(trade, currentPrice, CLOSE_AT_M2, 'm2');
  }

  if (hitTarget(trade.m1) && trade.status === 'active') {
    return _closePartial(trade, currentPrice, CLOSE_AT_M1, 'm1');
  }

  return null; // no event
}

function _stopStatus(currentStatus) {
  if (currentStatus === 'active') return 'stop';
  // If stop was moved to entry after M1, closing at "entry" is breakeven
  return 'stopped_at_entry';
}

function _alreadyClosedFraction(status) {
  if (status === 'active') return 0;
  if (status === 'm1')     return CLOSE_AT_M1;
  if (status === 'm2')     return CLOSE_AT_M1 + CLOSE_AT_M2;
  return 0;
}

/**
 * Apply a partial or full close event to a trade and persist to DB.
 * Returns updated trade fields.
 */
function _closePartial(trade, closePrice, fraction, newStatus) {
  const isBuy = trade.direction === 'buy';
  const entry  = trade.entry;

  // Price move % from entry to close price (signed)
  const movePct = isBuy
    ? (closePrice - entry) / entry
    : (entry - closePrice) / entry;

  // P&L for this slice: capital_allocated * fraction * movePct * leverage - fee
  const positionValue = trade.capital_allocated * trade.leverage;
  const sliceValue    = positionValue * fraction;
  const grossPnl      = sliceValue * movePct;

  // Fee on this slice (taker fee both sides, proportional)
  const feeCost = sliceValue * ROUND_TRIP_FEE;

  const slicePnl = parseFloat((grossPnl - feeCost).toFixed(2));

  const newPnl             = parseFloat((trade.pnl + slicePnl).toFixed(2));
  const capitalFraction    = trade.capital_allocated * fraction;
  const newCapitalReturned = parseFloat((trade.capital_returned + capitalFraction + slicePnl).toFixed(2));

  const isFinalClose = ['stop', 'm3', 'stopped_at_entry', 'expired'].includes(newStatus)
    || (newStatus === 'm3'); // m3 always final

  const updates = {
    status: newStatus,
    pnl: newPnl,
    capital_returned: newCapitalReturned,
    last_checked_at: new Date().toISOString(),
  };

  if (isFinalClose) {
    updates.result_at = new Date().toISOString();
  }

  // Move stop to entry when M1 is hit
  if (newStatus === 'm1') {
    updates.current_stop = entry;
  }

  updateTrade(trade.id, updates);

  // Return capital to account
  const account = getAccount();
  const newAccountCapital = parseFloat((account.current_capital + capitalFraction + slicePnl).toFixed(2));
  updateAccount({ current_capital: newAccountCapital });

  const action = isFinalClose ? 'CLOSED' : 'PARTIAL';
  console.log(`[paper-trader] ${action} ${trade.direction.toUpperCase()} ${trade.coin} → ${newStatus} | slice pnl=$${slicePnl} | total pnl=$${newPnl}`);

  return { ...trade, ...updates };
}
