import { Router } from 'express';
import { runScan } from '../scanner.js';

const router = Router();

let scanRunning = false;

async function _runOnce(res) {
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
}

// POST /api/scan/preview — Leader-driven fresh scan, returns candidates without opening
router.post('/preview', async (_req, res) => _runOnce(res));

// POST /api/scan/manual — same behavior, kept for backward compatibility with existing UI
router.post('/manual', async (_req, res) => _runOnce(res));

// GET /api/scan/status
router.get('/status', (_req, res) => {
  res.json({ running: scanRunning });
});

export default router;
