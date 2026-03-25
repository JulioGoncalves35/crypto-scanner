import { Router } from 'express';
import { runScan } from '../scanner.js';

const router = Router();

let scanRunning = false;

// POST /api/scan/manual — trigger an immediate scan
router.post('/manual', async (_req, res) => {
  if (scanRunning) {
    return res.status(409).json({ error: 'Scan already running' });
  }

  scanRunning = true;
  try {
    const result = await runScan();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    scanRunning = false;
  }
});

// GET /api/scan/status
router.get('/status', (_req, res) => {
  res.json({ running: scanRunning });
});

export default router;
