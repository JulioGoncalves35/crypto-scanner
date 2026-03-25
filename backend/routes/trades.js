import { Router } from 'express';
import { getTrades, getActiveTrades, getTrade, getStats } from '../db.js';

const router = Router();

// GET /api/trades — all trades with optional ?status=active|stop|m1|m2|m3|expired
router.get('/', (req, res) => {
  const { status, limit = 100, offset = 0 } = req.query;
  const trades = getTrades({ status, limit: parseInt(limit), offset: parseInt(offset) });
  res.json(trades);
});

// GET /api/trades/active
router.get('/active', (_req, res) => {
  res.json(getActiveTrades());
});

// GET /api/trades/:id
router.get('/:id', (req, res) => {
  const trade = getTrade(req.params.id);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  res.json(trade);
});

// GET /api/trades/stats — win rate, avg PnL, totals
router.get('/meta/stats', (_req, res) => {
  res.json(getStats());
});

export default router;
