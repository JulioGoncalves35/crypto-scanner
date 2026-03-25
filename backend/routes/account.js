import { Router } from 'express';
import { getAccount, setupAccount, getStats, getTrades } from '../db.js';

const router = Router();

// GET /api/account — current account state + stats
router.get('/', (_req, res) => {
  const account = getAccount();
  const stats = getStats();
  const activeTrades = getTrades({ status: 'active' });
  const m1Trades = getTrades({ status: 'm1' });
  const m2Trades = getTrades({ status: 'm2' });

  // Capital currently locked in open positions
  const capitalInUse = [...activeTrades, ...m1Trades, ...m2Trades]
    .reduce((sum, t) => {
      // Capital not yet returned for remaining fraction
      const returned = t.capital_returned || 0;
      return sum + Math.max(0, t.capital_allocated - returned);
    }, 0);

  res.json({
    ...account,
    capital_in_use: parseFloat(capitalInUse.toFixed(2)),
    total_equity: parseFloat((account.current_capital + capitalInUse).toFixed(2)),
    ...stats,
  });
});

// POST /api/account/setup — (re)configure the paper trading account
// Body: { initial_capital, alloc_pct, max_positions, min_score, leverage }
router.post('/setup', (req, res) => {
  const {
    initial_capital = 1000,
    alloc_pct = 2,
    max_positions = 5,
    min_score = 70,
    leverage = 10,
  } = req.body;

  if (initial_capital <= 0) return res.status(400).json({ error: 'initial_capital must be > 0' });
  if (alloc_pct <= 0 || alloc_pct > 100) return res.status(400).json({ error: 'alloc_pct must be 1–100' });
  if (max_positions < 1) return res.status(400).json({ error: 'max_positions must be >= 1' });

  const account = setupAccount({ initial_capital, alloc_pct, max_positions, min_score, leverage });
  res.json(account);
});

export default router;
