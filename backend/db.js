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
      max_positions INTEGER NOT NULL DEFAULT 5,
      min_score INTEGER NOT NULL DEFAULT 70,
      leverage INTEGER NOT NULL DEFAULT 10,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scan_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ran_at TEXT NOT NULL,
      duration_ms INTEGER,
      opportunities INTEGER NOT NULL DEFAULT 0,
      skipped_active INTEGER NOT NULL DEFAULT 0,
      errors TEXT
    );
  `);

  // Migration: add analysis_json column if not present (existing DBs)
  try { db.exec('ALTER TABLE trades ADD COLUMN analysis_json TEXT'); } catch (_) {}

  // Seed default account row if not present
  const existing = db.prepare('SELECT id FROM paper_account WHERE id = 1').get();
  if (!existing) {
    db.prepare(
      'INSERT INTO paper_account (id, initial_capital, current_capital, updated_at) VALUES (?, ?, ?, ?)'
    ).run(1, 1000, 1000, new Date().toISOString());
  }
}

// ─── Account ─────────────────────────────────────────────────────────────────

export function getAccount() {
  return getDb().prepare('SELECT * FROM paper_account WHERE id = 1').get();
}

export function updateAccount(fields) {
  const keys = Object.keys(fields);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(fields), new Date().toISOString()];
  getDb().prepare(`UPDATE paper_account SET ${sets}, updated_at = ? WHERE id = 1`).run(...values);
  return getAccount();
}

export function setupAccount({ initial_capital, alloc_pct, max_positions, min_score, leverage }) {
  getDb().prepare(`
    UPDATE paper_account
    SET initial_capital = ?, current_capital = ?, alloc_pct = ?,
        max_positions = ?, min_score = ?, leverage = ?, updated_at = ?
    WHERE id = 1
  `).run(initial_capital, initial_capital, alloc_pct, max_positions, min_score, leverage, new Date().toISOString());
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
      (id, coin, direction, timeframe, type, score, entry, stop, current_stop,
       m1, m2, m3, stop_pct, leverage, found_at, status, capital_allocated, signals, analysis_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    trade.id, trade.coin, trade.direction, trade.timeframe, trade.type,
    trade.score, trade.entry, trade.stop, trade.current_stop,
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

export function insertScanLog({ ran_at, duration_ms, opportunities, skipped_active, errors }) {
  getDb().prepare(`
    INSERT INTO scan_log (ran_at, duration_ms, opportunities, skipped_active, errors)
    VALUES (?, ?, ?, ?, ?)
  `).run(ran_at, duration_ms, opportunities, skipped_active, errors ?? null);
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
