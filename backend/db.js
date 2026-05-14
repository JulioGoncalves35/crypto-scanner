/**
 * db.js — SQLite database layer using Node.js built-in node:sqlite (Node 22.5+)
 * No native compilation required.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'scanner.db');

let db;

export function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      coin TEXT NOT NULL,
      direction TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'day',
      score INTEGER NOT NULL,
      entry REAL NOT NULL,
      stop REAL NOT NULL,
      current_stop REAL NOT NULL,
      m1 REAL NOT NULL,
      m2 REAL NOT NULL,
      m3 REAL NOT NULL,
      stop_pct REAL,
      leverage INTEGER NOT NULL DEFAULT 10,
      found_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      result_at TEXT,
      capital_allocated REAL NOT NULL DEFAULT 0,
      capital_returned REAL NOT NULL DEFAULT 0,
      pnl REAL NOT NULL DEFAULT 0,
      signals TEXT,
      last_checked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS paper_account (
      id INTEGER PRIMARY KEY DEFAULT 1,
      initial_capital REAL NOT NULL DEFAULT 1000,
      current_capital REAL NOT NULL DEFAULT 1000,
      alloc_pct REAL NOT NULL DEFAULT 2,
      max_positions INTEGER NOT NULL DEFAULT 10,
      min_score INTEGER NOT NULL DEFAULT 30,
      leverage INTEGER NOT NULL DEFAULT 10,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scan_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ran_at TEXT NOT NULL,
      duration_ms INTEGER,
      opportunities INTEGER NOT NULL DEFAULT 0,
      skipped_active INTEGER NOT NULL DEFAULT 0,
      errors TEXT,
      candidates_json TEXT
    );

    CREATE TABLE IF NOT EXISTS trade_reflections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id TEXT NOT NULL,
      reflection_text TEXT NOT NULL,
      lesson_tag TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (trade_id) REFERENCES trades(id)
    );

    CREATE INDEX IF NOT EXISTS idx_reflections_created ON trade_reflections(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reflections_trade   ON trade_reflections(trade_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER,
      candidate_coin TEXT NOT NULL,
      candidate_tf TEXT NOT NULL,
      candidate_score INTEGER NOT NULL,
      candidate_dir TEXT NOT NULL,
      agent_outputs_json TEXT NOT NULL,
      final_decision TEXT NOT NULL,
      final_reason TEXT,
      trade_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_decisions_scan    ON agent_decisions(scan_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_created ON agent_decisions(created_at DESC);
  `);

  // Migration: add analysis_json column if not present (existing DBs)
  const tradeCols = db.prepare('PRAGMA table_info(trades)').all().map(c => c.name);
  if (!tradeCols.includes('analysis_json')) {
    db.exec('ALTER TABLE trades ADD COLUMN analysis_json TEXT');
    console.log('[db] migration: added trades.analysis_json');
  }
  if (!tradeCols.includes('regime_score')) {
    db.exec('ALTER TABLE trades ADD COLUMN regime_score INTEGER');
    console.log('[db] migration: added trades.regime_score');
  }
  if (!tradeCols.includes('entry_score')) {
    db.exec('ALTER TABLE trades ADD COLUMN entry_score INTEGER');
    console.log('[db] migration: added trades.entry_score');
  }

  // Migration: add candidates_json column to scan_log if not present
  const scanCols = db.prepare('PRAGMA table_info(scan_log)').all().map(c => c.name);
  if (!scanCols.includes('candidates_json')) {
    db.exec('ALTER TABLE scan_log ADD COLUMN candidates_json TEXT');
    console.log('[db] migration: added scan_log.candidates_json');
  }

  // Migration: add coins column to paper_account if not present
  const accCols = db.prepare('PRAGMA table_info(paper_account)').all().map(c => c.name);
  if (!accCols.includes('coins')) {
    db.exec('ALTER TABLE paper_account ADD COLUMN coins TEXT');
    // Seed existing account with default 41-coin list
    const defaultCoins = JSON.stringify([
      'BTC','ETH','SOL','BNB','XRP','ADA','AVAX',
      'DOGE','DOT','LINK','POL','LTC','ATOM','UNI',
      'INJ','ARB','WLD','SEI','TIA','SUI','APT',
      'OP','IMX','JUP','ONDO','STRK','BLUR','MANTA',
      'ORDI','BOME','WIF','ENA','ETHFI','PENDLE',
      '1000PEPE','HBAR','NEAR','RENDER','TRX','FIL','HYPE',
    ]);
    db.prepare('UPDATE paper_account SET coins = ? WHERE id = 1').run(defaultCoins);
    console.log('[db] migration: added paper_account.coins (seeded 41 coins)');
  }

  // Migration: bump max_positions default from 5 to 10 for existing accounts
  try {
    const acc = db.prepare('SELECT max_positions FROM paper_account WHERE id = 1').get();
    if (acc && acc.max_positions === 5) {
      db.prepare('UPDATE paper_account SET max_positions = 10 WHERE id = 1').run();
    }
  } catch (_) {}

  // Migration: bump min_score to 30 for any account below threshold (entry-only score recalibration)
  try {
    const acc = db.prepare('SELECT min_score FROM paper_account WHERE id = 1').get();
    if (acc && acc.min_score < 30) {
      const old = acc.min_score;
      db.prepare('UPDATE paper_account SET min_score = 30 WHERE id = 1').run();
      console.log(`[db] migrated min_score ${old} → 30`);
    }
  } catch (_) {}

  // Migration: account at min_score=85 (old combined-score threshold) → 30
  // The guard above (< 30) does not catch accounts at 85. Without this, the scanner
  // finds 0 candidates permanently after the entry-score cleanup.
  try {
    const acc85 = db.prepare('SELECT min_score FROM paper_account WHERE id = 1').get();
    if (acc85 && acc85.min_score === 85) {
      db.prepare('UPDATE paper_account SET min_score = 30 WHERE id = 1').run();
      console.log('[db] migration: min_score 85 → 30 (entry-only score recalibration)');
    }
  } catch (_) {}

  // Seed default account row if not present
  const existing = db.prepare('SELECT id FROM paper_account WHERE id = 1').get();
  if (!existing) {
    const defaultCoins = JSON.stringify([
      'BTC','ETH','SOL','BNB','XRP','ADA','AVAX',
      'DOGE','DOT','LINK','POL','LTC','ATOM','UNI',
      'INJ','ARB','WLD','SEI','TIA','SUI','APT',
      'OP','IMX','JUP','ONDO','STRK','BLUR','MANTA',
      'ORDI','BOME','WIF','ENA','ETHFI','PENDLE',
      '1000PEPE','HBAR','NEAR','RENDER','TRX','FIL','HYPE',
    ]);
    db.prepare(
      'INSERT INTO paper_account (id, initial_capital, current_capital, coins, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(1, 1000, 1000, defaultCoins, new Date().toISOString());
  }
}

// ─── Transaction helper ──────────────────────────────────────────────────────

export function runInTransaction(fn) {
  const database = getDb();
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (e) {
    database.exec('ROLLBACK');
    throw e;
  }
}

// ─── Account ─────────────────────────────────────────────────────────────────

export function getAccount() {
  return getDb().prepare('SELECT * FROM paper_account WHERE id = 1').get();
}

export function getScanCoins() {
  const acc = getDb().prepare('SELECT coins FROM paper_account WHERE id = 1').get();
  if (acc?.coins) {
    try { return JSON.parse(acc.coins); } catch (_) {}
  }
  return null;
}

export function updateAccount(fields) {
  const keys = Object.keys(fields);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(fields), new Date().toISOString()];
  getDb().prepare(`UPDATE paper_account SET ${sets}, updated_at = ? WHERE id = 1`).run(...values);
  return getAccount();
}

export function setupAccount({ initial_capital, alloc_pct, max_positions, min_score, leverage }) {
  // Only updates settings — does NOT touch current_capital to avoid wiping accumulated P&L.
  getDb().prepare(`
    UPDATE paper_account
    SET initial_capital = ?, alloc_pct = ?,
        max_positions = ?, min_score = ?, leverage = ?, updated_at = ?
    WHERE id = 1
  `).run(initial_capital, alloc_pct, max_positions, min_score, leverage, new Date().toISOString());
  return getAccount();
}

// Reset capital to initial_capital. If full=true, also deletes all trades.
export function resetAccount(full = false) {
  const acc = getAccount();
  getDb().prepare(
    `UPDATE paper_account SET current_capital = ?, updated_at = ? WHERE id = 1`
  ).run(acc.initial_capital, new Date().toISOString());
  if (full) {
    getDb().prepare('DELETE FROM trades').run();
    getDb().prepare('DELETE FROM scan_log').run();
  }
  return getAccount();
}

// ─── Trades ──────────────────────────────────────────────────────────────────

export function getTrade(id) {
  return getDb().prepare('SELECT * FROM trades WHERE id = ?').get(id);
}

export function getActiveTrades() {
  return getDb().prepare(
    `SELECT * FROM trades WHERE status IN ('active', 'm1', 'm2') ORDER BY found_at DESC`
  ).all();
}

export function getActiveCoins() {
  const rows = getDb().prepare(
    `SELECT coin FROM trades WHERE status IN ('active', 'm1', 'm2')`
  ).all();
  return new Set(rows.map(r => r.coin));
}

export function countActivePositions() {
  const row = getDb().prepare(
    `SELECT COUNT(*) as n FROM trades WHERE status IN ('active', 'm1', 'm2')`
  ).get();
  return row.n;
}

export function getTrades({ status, limit = 100, offset = 0 } = {}) {
  if (status) {
    return getDb().prepare(
      'SELECT * FROM trades WHERE status = ? ORDER BY found_at DESC LIMIT ? OFFSET ?'
    ).all(status, limit, offset);
  }
  return getDb().prepare(
    'SELECT * FROM trades ORDER BY found_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
}

export function insertTrade(trade) {
  getDb().prepare(`
    INSERT INTO trades
      (id, coin, direction, timeframe, type, score, regime_score, entry_score,
       entry, stop, current_stop,
       m1, m2, m3, stop_pct, leverage, found_at, status, capital_allocated, signals, analysis_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    trade.id, trade.coin, trade.direction, trade.timeframe, trade.type,
    trade.score, trade.regime_score ?? null, trade.entry_score ?? null,
    trade.entry, trade.stop, trade.current_stop,
    trade.m1, trade.m2, trade.m3, trade.stop_pct, trade.leverage,
    trade.found_at, trade.capital_allocated, trade.signals, trade.analysis_json ?? null
  );
}

export function updateTrade(id, fields) {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(fields), id];
  getDb().prepare(`UPDATE trades SET ${sets} WHERE id = ?`).run(...values);
}

// ─── Scan Log ─────────────────────────────────────────────────────────────────

export function insertScanLog({ ran_at, duration_ms, opportunities, skipped_active, errors, candidates_json }) {
  getDb().prepare(`
    INSERT INTO scan_log (ran_at, duration_ms, opportunities, skipped_active, errors, candidates_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ran_at, duration_ms, opportunities, skipped_active, errors ?? null, candidates_json ?? null);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getStats() {
  const closed = getDb().prepare(
    `SELECT * FROM trades WHERE status NOT IN ('active', 'm1', 'm2')`
  ).all();

  const wins   = closed.filter(t => ['m1', 'm2', 'm3'].includes(t.status));
  const losses = closed.filter(t => t.status === 'stop' || t.status === 'stopped_at_entry');
  const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);

  return {
    total_trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    expired: closed.filter(t => t.status === 'expired').length,
    win_rate: closed.length > 0 ? parseFloat(((wins.length / closed.length) * 100).toFixed(1)) : null,
    total_pnl: parseFloat(totalPnl.toFixed(2)),
    avg_pnl: closed.length > 0 ? parseFloat((totalPnl / closed.length).toFixed(2)) : null,
  };
}

// ─── Reflections ──────────────────────────────────────────────────────────────

export function insertReflection({ trade_id, reflection_text, lesson_tag }) {
  const result = getDb().prepare(`
    INSERT INTO trade_reflections (trade_id, reflection_text, lesson_tag)
    VALUES (?, ?, ?)
  `).run(trade_id, reflection_text, lesson_tag ?? null);
  return result.lastInsertRowid;
}

export function getRecentReflections(limit = 20) {
  return getDb().prepare(
    `SELECT id, trade_id, reflection_text, lesson_tag, created_at
     FROM trade_reflections
     ORDER BY created_at DESC
     LIMIT ?`
  ).all(limit);
}
