/**
 * server.js — Crypto Scanner Backend
 *
 * Start: npm run server
 * Dev (auto-reload): npm run dev
 *
 * Endpoints:
 *   GET  /api/health
 *   GET  /api/account
 *   POST /api/account/setup
 *   GET  /api/trades
 *   GET  /api/trades/active
 *   GET  /api/trades/:id
 *   GET  /api/trades/meta/stats
 *   POST /api/scan/manual
 *   GET  /api/scan/status
 */

import express from 'express';
import cors from 'cors';
import cron from 'node-cron';

import { getDb } from './db.js';
import tradesRouter from './routes/trades.js';
import accountRouter from './routes/account.js';
import scanRouter from './routes/scan.js';
import { runScan } from './scanner.js';
import { checkActiveTrades } from './price-checker.js';

const app = express();
const PORT = process.env.PORT || 3001;
const startedAt = new Date();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({ origin: '*' })); // open CORS so painel.html (file://) can connect
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime_s: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    started_at: startedAt.toISOString(),
    version: '1.0.0',
  });
});

app.use('/api/trades',  tradesRouter);
app.use('/api/account', accountRouter);
app.use('/api/scan',    scanRouter);

// ─── Scheduled jobs ───────────────────────────────────────────────────────────

// Auto-scan every 15 minutes
let scanRunning = false;
cron.schedule('*/15 * * * *', async () => {
  if (scanRunning) {
    console.log('[cron] scan skipped — previous run still in progress');
    return;
  }
  scanRunning = true;
  try {
    console.log('[cron] starting auto-scan...');
    await runScan();
  } catch (err) {
    console.error('[cron] scan error:', err.message);
  } finally {
    scanRunning = false;
  }
});

// Price check every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    await checkActiveTrades();
  } catch (err) {
    console.error('[cron] price-check error:', err.message);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

// Initialize DB on startup
getDb();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Crypto Scanner Backend running at http://localhost:${PORT}`);
  console.log(`   Auto-scan: every 15 minutes`);
  console.log(`   Price check: every 5 minutes`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
