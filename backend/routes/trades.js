import { Router } from 'express';
import { getTrades, getActiveTrades, getTrade, getStats } from '../db.js';
import { closeManualAt } from '../paper-trader.js';

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

export default router;
