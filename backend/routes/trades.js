import { Router } from 'express';
import { getTrades, getActiveTrades, getTrade, getStats, updateTrade } from '../db.js';
import { closeManualAt, openPosition } from '../paper-trader.js';
import { isStopTighter } from '../stop-validator.js';

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

// GET /api/trades/:id/journal — returns a journal-ready entry for localStorage
router.get('/:id/journal', (req, res) => {
  const trade = getTrade(req.params.id);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });

  const fp = p => {
    if (p == null) return '0';
    if (p >= 1000) return p.toFixed(0);
    if (p >= 1)    return p.toFixed(3);
    return p.toFixed(5);
  };

  const analysis = trade.analysis_json ? JSON.parse(trade.analysis_json) : null;

  // Build signals array — full reason objects if available, fallback to text-only
  let signals;
  if (analysis?.reasons?.length) {
    signals = analysis.reasons.map(r => ({
      text:  r.text  || '',
      type:  r.type  || 'neutral',
      isMTF: !!r.isMTF,
      isPat: !!(r.isPattern || r.isPat),
      isDiv: !!(r.isDivergence || r.isDiv),
    }));
  } else if (trade.signals) {
    try {
      const raw = JSON.parse(trade.signals);
      signals = raw.map(r => typeof r === 'string'
        ? { text: r, type: 'neutral', isMTF: false, isPat: false, isDiv: false }
        : { text: r.text || '', type: r.type || 'neutral', isMTF: !!r.isMTF, isPat: !!(r.isPattern || r.isPat), isDiv: !!(r.isDivergence || r.isDiv) }
      );
    } catch (_) { signals = []; }
  } else {
    signals = [];
  }

  const sign = trade.direction === 'buy' ? '+' : '-';

  res.json({
    id:        `bk-${trade.id}`,
    savedAt:   trade.found_at,
    coin:      trade.coin.replace(/USDT$/i, ''),
    dir:       trade.direction,
    timeframe: trade.timeframe,
    leverage:  trade.leverage,
    entry:     fp(trade.entry),
    stop:      fp(trade.stop),
    stopPct:   analysis?.stop_pct_str || `-${trade.stop_pct?.toFixed(2) ?? '?'}%`,
    stopAdj:   analysis?.stop_adjusted || false,
    liqPrice:  analysis?.liq_price ? fp(analysis.liq_price) : '—',
    m1p:       fp(trade.m1), m1cap: sign + (analysis?.m1_cap?.netPct ?? '0'),
    m2p:       fp(trade.m2), m2cap: sign + (analysis?.m2_cap?.netPct ?? '0'),
    m3p:       fp(trade.m3), m3cap: sign + (analysis?.m3_cap?.netPct ?? '0'),
    score:     trade.score,
    signals,
    notes:     '',
    result:    ['active', 'm1', 'm2'].includes(trade.status) ? 'active' : trade.status,
    source:    'backend',
  });
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

// POST /api/trades/:id/close — close a position manually at current market price
router.post('/:id/close', async (req, res) => {
  const trade = getTrade(req.params.id);
  if (!trade) return res.status(404).json({ error: 'Trade não encontrado' });
  if (!['active', 'm1', 'm2'].includes(trade.status))
    return res.status(400).json({ error: 'Trade já encerrado' });

  let price;
  try {
    const tickerUrl = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${encodeURIComponent(trade.coin)}`;
    const resp = await fetch(tickerUrl);
    const json = await resp.json();
    price = parseFloat(json?.result?.list?.[0]?.lastPrice);
  } catch (_) {}

  if (!price || isNaN(price))
    return res.status(502).json({ error: 'Falha ao obter preço atual da Bybit' });

  const result = closeManualAt(trade, price);
  if (!result) return res.status(400).json({ error: 'Nada a fechar' });

  res.json({ ok: true, price, pnl: result.pnl });
});

// POST /api/trades/open — Leader-driven trade opening from an approved setup
router.post('/open', async (req, res) => {
  const setup = req.body;
  if (!setup || typeof setup !== 'object') {
    return res.status(400).json({ error: 'missing setup body' });
  }
  const required = ['coin', 'dir', 'timeframe', 'score', 'entry', 'stop', 'm1', 'm2', 'm3'];
  for (const f of required) {
    if (setup[f] === undefined || setup[f] === null) {
      return res.status(400).json({ error: `missing setup.${f}` });
    }
  }
  try {
    const trade = await openPosition(setup);
    if (!trade) {
      return res.status(409).json({
        error: 'trade not opened — check max_positions, capital, or risk cap',
      });
    }
    console.log(`[leader-api] trade opened via Leader: ${trade.id}`);
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trades/:id/tighten-stop — move stop closer to entry (never away)
router.post('/:id/tighten-stop', (req, res) => {
  const { id } = req.params;
  const { new_stop } = req.body ?? {};

  if (!Number.isFinite(new_stop)) {
    return res.status(400).json({ error: 'new_stop must be a finite number' });
  }

  const trade = getTrade(id);
  if (!trade) return res.status(404).json({ error: 'trade not found' });

  const inactiveStatuses = ['stop', 'stopped_at_entry', 'expired', 'manual', 'm3'];
  if (inactiveStatuses.includes(trade.status)) {
    return res.status(409).json({ error: 'trade not active' });
  }

  if (!isStopTighter(trade.direction, trade.current_stop, new_stop)) {
    return res.status(400).json({ error: 'stop can only be tightened, not widened' });
  }

  updateTrade(id, { current_stop: new_stop });
  console.log(`[tighten-stop] trade=${id} ${trade.current_stop} → ${new_stop}`);
  res.json({ id, new_stop });
});

export default router;
