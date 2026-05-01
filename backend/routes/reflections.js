import { Router } from 'express';
import { insertReflection, getRecentReflections } from '../db.js';

const router = Router();

// POST /api/reflections — Leader writes a reflection after trade closure
router.post('/', (req, res) => {
  const { trade_id, reflection_text, lesson_tag } = req.body ?? {};
  if (!trade_id || typeof trade_id !== 'string') {
    return res.status(400).json({ error: 'missing or invalid trade_id' });
  }
  if (!reflection_text || typeof reflection_text !== 'string') {
    return res.status(400).json({ error: 'missing or invalid reflection_text' });
  }
  try {
    const id = insertReflection({ trade_id, reflection_text, lesson_tag });
    console.log(`[reflections] saved trade=${trade_id} tag=${lesson_tag ?? '-'}`);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reflections?limit=20
router.get('/', (req, res) => {
  const raw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(raw) && raw > 0 && raw <= 200 ? raw : 20;
  res.json(getRecentReflections(limit));
});

export default router;
