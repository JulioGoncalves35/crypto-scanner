# Leader Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the third council component — a Claude Code subagent (Sonnet 4.6) that orchestrates news-hunter and pattern-validator to gate paper trade entries and review active trades, producing reflections that persist as memory.

**Architecture:** Backend stops auto-opening trades; new endpoints (`/api/scan/preview`, `/api/trades/open`, `/api/trades/:id/tighten-stop`, `/api/reflections`) expose the operations the Leader needs. Leader is a `.claude/agents/leader.md` prompt that calls those endpoints via `Bash` + curl, invokes sub-agents via the `Task` tool, and writes a markdown report.

**Tech Stack:** Node.js 22.5+, Express, node:sqlite, Vitest. Frontend untouched. No new npm dependencies.

**Testing convention:** This project tests pure logic with Vitest but validates DB/route integration manually (see `tests/scanner-filters.test.js` header comment). Plan follows that convention: pure helpers get unit tests; routes and DB changes get curl-based smoke tests in the task.

**Spec:** [docs/superpowers/specs/2026-04-29-leader-agent-design.md](../../superpowers/specs/2026-04-29-leader-agent-design.md)

---

## File Structure

**Create:**
- `backend/stop-validator.js` — Pure helper exporting `isStopTighter(direction, current_stop, new_stop)`.
- `backend/routes/reflections.js` — Express router for reflection endpoints.
- `tests/stop-validator.test.js` — Pure unit tests for `isStopTighter`.
- `.claude/agents/leader.md` — The Leader prompt (frontmatter + instructions).

**Modify:**
- `backend/db.js` — Add `trade_reflections` table, `candidates_json` column on `scan_log`, helpers (`insertReflection`, `getRecentReflections`).
- `backend/scanner.js` — `runScan()` accumulates candidates, stops calling `openPosition`, writes `candidates_json` to `scan_log`.
- `backend/routes/scan.js` — Add `POST /api/scan/preview`. Modify `POST /api/scan/manual` to also not open trades (alignment).
- `backend/routes/trades.js` — Add `POST /api/trades/open` and `POST /api/trades/:id/tighten-stop`.
- `backend/server.js` — Register `reflectionsRouter`.

**Untouched:**
- `painel-core.js`, `painel.html` — frontend stays as is.
- `backend/paper-trader.js` — `openPosition` and `closeManualAt` reused unchanged.
- `backend/price-checker.js` — no Leader dependency on it.

---

## Task Order Rationale

Tasks 1–4 build the pure data plane (DB + helpers). Tasks 5–8 add the routes the Leader needs. Tasks 9–10 are config and the Leader prompt itself. Each task ships code that the next task assumes exists.

---

## Task 1: Add `trade_reflections` table and helpers to db.js

**Files:**
- Modify: `backend/db.js` (schema + new exports)

**Why:** Leader writes reflections after each closed trade and reads recent ones as context. DB is the source of truth.

- [ ] **Step 1: Add table to schema in `initSchema()`**

In `backend/db.js`, find the `db.exec(\`...\`)` block inside `initSchema()` (lines 26–71). Add the new table to the SQL:

```javascript
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      ... (unchanged) ...
    );

    CREATE TABLE IF NOT EXISTS paper_account (
      ... (unchanged) ...
    );

    CREATE TABLE IF NOT EXISTS scan_log (
      ... (unchanged) ...
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

  // ... existing migrations ...
}
```

Keep all existing migrations and the seed account row block intact below.

- [ ] **Step 2: Add helpers as new exports at the bottom of db.js**

Append after the `getStats()` function (after line 226):

```javascript
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
```

(The Leader derives its reflection cursor client-side from `GET /api/reflections?limit=20` — no separate `MAX(created_at)` helper is needed on the server.)

- [ ] **Step 3: Verify the server still starts**

Run:
```bash
cd backend && node -e "import('./db.js').then(m => { m.getDb(); console.log('OK'); process.exit(0); })"
```
Expected output: `OK` (table created silently if it didn't exist).

- [ ] **Step 4: Verify table exists with sqlite CLI (or smoke test)**

```bash
node -e "import('./backend/db.js').then(m => { const db=m.getDb(); const rows=db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all(); console.log(rows.map(r=>r.name)); })"
```
Expected output includes: `trade_reflections` in the list.

- [ ] **Step 5: Commit**

```bash
git add backend/db.js
git commit -m "$(cat <<'EOF'
feat(db): add trade_reflections table and helpers

Adds the persistence layer for Leader-generated post-trade reflections.
Includes insertReflection, getRecentReflections, getMaxReflectionTimestamp.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `candidates_json` column to `scan_log`

**Files:**
- Modify: `backend/db.js` (add ALTER migration)

**Why:** When `runScan` stops auto-opening trades (Task 5), we still want a record of every candidate the cron found, for contrafactual analysis. New column needed.

- [ ] **Step 1: Add ALTER migration in `initSchema()`**

In `backend/db.js`, after the existing migration `try { db.exec('ALTER TABLE trades ADD COLUMN analysis_json TEXT'); } catch (_) {}` (line 74), add a parallel migration for scan_log:

```javascript
// Migration: add candidates_json column to scan_log if not present
try { db.exec('ALTER TABLE scan_log ADD COLUMN candidates_json TEXT'); } catch (_) {}
```

The existing `CREATE TABLE IF NOT EXISTS scan_log (...)` block doesn't include `candidates_json` — that's fine for fresh DBs, the ALTER handles existing DBs. For consistency, also add the column to the CREATE block:

```javascript
CREATE TABLE IF NOT EXISTS scan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at TEXT NOT NULL,
  duration_ms INTEGER,
  opportunities INTEGER NOT NULL DEFAULT 0,
  skipped_active INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  candidates_json TEXT
);
```

- [ ] **Step 2: Modify `insertScanLog` to accept and store `candidates_json`**

Replace the existing `insertScanLog` (lines 199–204):

```javascript
export function insertScanLog({ ran_at, duration_ms, opportunities, skipped_active, errors, candidates_json }) {
  getDb().prepare(`
    INSERT INTO scan_log (ran_at, duration_ms, opportunities, skipped_active, errors, candidates_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ran_at, duration_ms, opportunities, skipped_active, errors ?? null, candidates_json ?? null);
}
```

- [ ] **Step 3: Smoke test — column exists**

```bash
node -e "import('./backend/db.js').then(m => { const db=m.getDb(); const cols=db.prepare(\"PRAGMA table_info(scan_log)\").all(); console.log(cols.map(c=>c.name)); })"
```
Expected output includes `candidates_json` in the array.

- [ ] **Step 4: Commit**

```bash
git add backend/db.js
git commit -m "$(cat <<'EOF'
feat(db): add candidates_json column to scan_log

Enables Leader-driven workflow where cron-based scans log candidates
without auto-opening trades. Column allows post-hoc analysis of what
the scanner saw vs what the Leader approved.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add reflections route + register in server

**Files:**
- Create: `backend/routes/reflections.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create `backend/routes/reflections.js`**

```javascript
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
```

- [ ] **Step 2: Register router in `backend/server.js`**

In `backend/server.js`, add the import alongside other route imports (after line 26):

```javascript
import reflectionsRouter from './routes/reflections.js';
```

In the routes block (after line 52, where `scanRouter` is registered):

```javascript
app.use('/api/scan',         scanRouter);
app.use('/api/reflections',  reflectionsRouter);
```

Also update the JSDoc endpoint list at the top of `server.js` (lines 7–17):

```javascript
/**
 * Endpoints:
 *   GET  /api/health
 *   GET  /api/account
 *   POST /api/account/setup
 *   GET  /api/trades
 *   GET  /api/trades/active
 *   GET  /api/trades/:id
 *   GET  /api/trades/meta/stats
 *   POST /api/trades/:id/close
 *   POST /api/scan/manual
 *   GET  /api/scan/status
 *   POST /api/reflections
 *   GET  /api/reflections
 */
```

- [ ] **Step 3: Smoke test — start server, POST + GET**

In one terminal:
```bash
npm run server
```
(Wait for `Crypto Scanner Backend running at http://localhost:3001`.)

In another terminal — first insert a real trade so the FK validates. Use any active trade ID from `GET /api/trades/active`. If none active, insert with a known-existing trade ID via DB inspection. For a quick smoke without an active trade, temporarily comment the FOREIGN KEY in db.js — but actually preferred path: use an existing trade's ID:

```bash
TRADE_ID=$(curl -s http://localhost:3001/api/trades?limit=1 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)[0].id))")
echo "using trade_id=$TRADE_ID"

curl -s -X POST http://localhost:3001/api/reflections \
  -H "Content-Type: application/json" \
  -d "{\"trade_id\":\"$TRADE_ID\",\"reflection_text\":\"smoke test reflection\",\"lesson_tag\":\"smoke\"}"
```
Expected: `{"id":<integer>}`.

```bash
curl -s "http://localhost:3001/api/reflections?limit=5"
```
Expected: array containing the reflection just inserted, with `created_at`, `trade_id`, `reflection_text`, `lesson_tag`.

Validation errors:
```bash
curl -s -X POST http://localhost:3001/api/reflections \
  -H "Content-Type: application/json" -d '{}'
```
Expected: `{"error":"missing or invalid trade_id"}`.

- [ ] **Step 4: Stop server. Clean up smoke-test reflection**

```bash
node -e "import('./backend/db.js').then(m => { m.getDb().prepare(\"DELETE FROM trade_reflections WHERE lesson_tag='smoke'\").run(); console.log('cleaned'); })"
```

- [ ] **Step 5: Commit**

```bash
git add backend/routes/reflections.js backend/server.js
git commit -m "$(cat <<'EOF'
feat(api): add /api/reflections endpoints

POST /api/reflections — Leader writes post-trade reflection.
GET  /api/reflections?limit=N — Leader reads recent reflections.

Validates trade_id and reflection_text presence; rejects on missing
required fields with 400.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Pure stop-validator helper + tests

**Files:**
- Create: `backend/stop-validator.js`
- Create: `tests/stop-validator.test.js`

**Why:** Tighten-stop endpoint must reject any request that loosens the stop. The "is this stop tighter?" check is pure logic and worth proper TDD coverage — same convention as `tests/scanner-filters.test.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/stop-validator.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { isStopTighter } from '../backend/stop-validator.js';

describe('isStopTighter — BUY direction', () => {
  // For BUY, stop is below entry. Tighter = closer to entry = HIGHER price.

  it('returns true when new_stop is higher than current_stop', () => {
    expect(isStopTighter('buy', 100, 102)).toBe(true);
  });

  it('returns false when new_stop is lower than current_stop', () => {
    expect(isStopTighter('buy', 100, 98)).toBe(false);
  });

  it('returns false when new_stop equals current_stop', () => {
    expect(isStopTighter('buy', 100, 100)).toBe(false);
  });
});

describe('isStopTighter — SELL direction', () => {
  // For SELL, stop is above entry. Tighter = closer to entry = LOWER price.

  it('returns true when new_stop is lower than current_stop', () => {
    expect(isStopTighter('sell', 100, 98)).toBe(true);
  });

  it('returns false when new_stop is higher than current_stop', () => {
    expect(isStopTighter('sell', 100, 102)).toBe(false);
  });

  it('returns false when new_stop equals current_stop', () => {
    expect(isStopTighter('sell', 100, 100)).toBe(false);
  });
});

describe('isStopTighter — invalid input', () => {
  it('returns false for unknown direction', () => {
    expect(isStopTighter('hold', 100, 102)).toBe(false);
  });

  it('returns false when new_stop is not finite', () => {
    expect(isStopTighter('buy', 100, NaN)).toBe(false);
    expect(isStopTighter('buy', 100, Infinity)).toBe(false);
  });

  it('returns false when current_stop is not finite', () => {
    expect(isStopTighter('buy', NaN, 100)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests — they should fail with "module not found"**

```bash
npx vitest run tests/stop-validator.test.js
```
Expected: FAIL with `Failed to resolve import "../backend/stop-validator.js"`.

- [ ] **Step 3: Create the helper at `backend/stop-validator.js`**

```javascript
/**
 * Pure validation: is `new_stop` tighter (closer to entry) than `current_stop`?
 *
 * For BUY: stop is below entry, so tighter means HIGHER (new > current).
 * For SELL: stop is above entry, so tighter means LOWER (new < current).
 *
 * Returns false for invalid input (unknown direction, NaN/Infinity values).
 * Equality returns false — no movement is not a tightening.
 */
export function isStopTighter(direction, current_stop, new_stop) {
  if (!Number.isFinite(current_stop) || !Number.isFinite(new_stop)) return false;
  if (direction === 'buy')  return new_stop > current_stop;
  if (direction === 'sell') return new_stop < current_stop;
  return false;
}
```

- [ ] **Step 4: Run the tests — should pass**

```bash
npx vitest run tests/stop-validator.test.js
```
Expected: 9 tests passing.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
npx vitest run
```
Expected: 351 passing (342 existing + 9 new).

- [ ] **Step 6: Commit**

```bash
git add backend/stop-validator.js tests/stop-validator.test.js
git commit -m "$(cat <<'EOF'
feat(backend): add pure isStopTighter helper

Validates that a proposed stop adjustment moves the stop closer to entry.
For BUY: tighter means higher price. For SELL: tighter means lower price.
Equality returns false; invalid input returns false.

Will be used by POST /api/trades/:id/tighten-stop (next task).

Tests: 9 unit tests covering both directions and edge cases.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Tighten-stop route on trades.js

**Files:**
- Modify: `backend/routes/trades.js`

- [ ] **Step 1: Add the route**

In `backend/routes/trades.js`, add the import alongside existing imports at the top:

```javascript
import { isStopTighter } from '../stop-validator.js';
import { updateTrade } from '../db.js';
```

(Note: `getTrade` is already imported.)

Then, before the `export default router;` line at the end, add:

```javascript
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
```

- [ ] **Step 2: Smoke test — start server**

```bash
npm run server
```

- [ ] **Step 3: Smoke test — exercise the endpoint**

In another terminal, get an active trade and test all four error paths plus the success path:

```bash
# 1. Trade not found
curl -s -X POST http://localhost:3001/api/trades/nope/tighten-stop \
  -H "Content-Type: application/json" -d '{"new_stop":100}'
# Expected: {"error":"trade not found"}

# 2. Missing/invalid new_stop
curl -s -X POST http://localhost:3001/api/trades/anything/tighten-stop \
  -H "Content-Type: application/json" -d '{}'
# Expected: {"error":"new_stop must be a finite number"}

# 3. Get an active trade ID and direction
ACTIVE=$(curl -s http://localhost:3001/api/trades/active)
echo "$ACTIVE" | head -c 500
# Note the id, direction, current_stop of one row.

# Replace TRADE_ID, DIR, CUR_STOP, LOOSE_STOP, TIGHT_STOP below with actual values from above.
# For BUY (dir=buy, current_stop=100): TIGHT=102, LOOSE=98
# For SELL (dir=sell, current_stop=100): TIGHT=98, LOOSE=102

# 4. Loose direction is rejected
curl -s -X POST http://localhost:3001/api/trades/<TRADE_ID>/tighten-stop \
  -H "Content-Type: application/json" -d '{"new_stop":<LOOSE_STOP>}'
# Expected: {"error":"stop can only be tightened, not widened"}

# 5. Tight direction succeeds
curl -s -X POST http://localhost:3001/api/trades/<TRADE_ID>/tighten-stop \
  -H "Content-Type: application/json" -d '{"new_stop":<TIGHT_STOP>}'
# Expected: {"id":"<TRADE_ID>","new_stop":<TIGHT_STOP>}

# 6. Verify persistence
curl -s http://localhost:3001/api/trades/<TRADE_ID> | grep current_stop
# Expected: current_stop matches TIGHT_STOP
```

If no active trades exist, skip 4–6 and document that those paths require an active trade for a follow-up smoke test.

- [ ] **Step 4: Stop server, commit**

```bash
git add backend/routes/trades.js
git commit -m "$(cat <<'EOF'
feat(api): add POST /api/trades/:id/tighten-stop

Allows the Leader to recommend (and execute via curl) a tightening of
the stop on an active trade. Server validates direction-aware tightness
via isStopTighter — loose adjustments are rejected with 400.

Inactive trades (stop / m3 / expired / manual / stopped_at_entry) → 409.
Unknown trade ID → 404.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Refactor `runScan()` to return candidates without opening

**Files:**
- Modify: `backend/scanner.js`

**Why:** Core architectural change — backend stops auto-opening. Cron continues running and logs candidates for audit, but trade opening moves to the new `/api/trades/open` endpoint (Task 8).

- [ ] **Step 1: Modify `runScan()` to accumulate candidates**

In `backend/scanner.js`, replace the inner approval loop (lines 179–204) with one that pushes to a candidates array instead of calling `openPosition`:

```javascript
    // Apply MTF scoring (confluence bonus + conflict penalty)
    const dedupedSetups = applyMTFScoring(hardResults, softResults);

    for (const setup of dedupedSetups) {
      // Re-check score after MTF adjustments
      if (setup.score < parseInt(min_score)) continue;

      // Macro trend filter: skip trades that go counter to BTC's 4h EMA200 trend
      if (macroTrend === 'bear' && setup.dir === 'buy') {
        console.log(`[scanner] SKIP ${symbol} LONG — macro BTC bearish (price < EMA200 4h)`);
        continue;
      }
      if (macroTrend === 'bull' && setup.dir === 'sell') {
        console.log(`[scanner] SKIP ${symbol} SHORT — macro BTC bullish (price > EMA200 4h)`);
        continue;
      }

      // Push as candidate; only one per coin per scan (best by MTF order).
      candidates.push(setup);
      break;
    }
  }
```

At the top of the function, near the existing `let opportunities = 0;` line, declare the array and remove `opportunities`:

```javascript
  const candidates = [];
  let skippedActive = 0;
  const errors = [];
```

- [ ] **Step 2: Update `insertScanLog` call and return value**

Replace the existing log/return at the bottom of `runScan()`:

```javascript
  const duration_ms = Date.now() - startTime;

  insertScanLog({
    ran_at: new Date().toISOString(),
    duration_ms,
    opportunities: candidates.length,
    skipped_active: skippedActive,
    errors: errors.length > 0 ? JSON.stringify(errors) : null,
    candidates_json: candidates.length > 0 ? JSON.stringify(candidates) : null,
  });

  console.log(`[scanner] scan complete — ${candidates.length} candidates, ${skippedActive} skipped, ${duration_ms}ms`);
  return { candidates, skipped_active: skippedActive, duration_ms, errors };
}
```

(`opportunities` field stays as a counter of candidates produced — semantically still "opportunities found", just no longer "opportunities opened".)

- [ ] **Step 3: Remove the now-unused import of `openPosition`**

At the top of `backend/scanner.js`, remove this line:

```javascript
import { openPosition } from './paper-trader.js';
```

- [ ] **Step 4: Smoke test — manual scan does not open trades**

```bash
npm run server
```

In another terminal:
```bash
# Note current capital before
curl -s http://localhost:3001/api/account | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('before',JSON.parse(s).current_capital))"

# Note active trade count before
curl -s http://localhost:3001/api/trades/active | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('active before',JSON.parse(s).length))"

# Trigger manual scan (which uses runScan)
curl -s -X POST http://localhost:3001/api/scan/manual
# Expected: { "ok": true, "candidates": [...], "skipped_active": N, "duration_ms": M }
# NOT expected: candidates being opened as trades.

# Verify capital unchanged
curl -s http://localhost:3001/api/account | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('after',JSON.parse(s).current_capital))"

# Verify active trade count unchanged
curl -s http://localhost:3001/api/trades/active | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('active after',JSON.parse(s).length))"
```

Expected: `before == after` for both capital and active count. Scan ran, returned candidates, opened no trade.

Also verify `scan_log` got the candidates_json:
```bash
node -e "import('./backend/db.js').then(m => { const row=m.getDb().prepare('SELECT id, opportunities, candidates_json FROM scan_log ORDER BY id DESC LIMIT 1').get(); console.log(row.opportunities, 'cands_len:', row.candidates_json ? JSON.parse(row.candidates_json).length : 0); })"
```
Expected: opportunities count matches the parsed candidates array length.

- [ ] **Step 5: Stop server. Run unit tests to confirm no regressions**

```bash
npx vitest run
```
Expected: 351 still passing.

- [ ] **Step 6: Commit**

```bash
git add backend/scanner.js
git commit -m "$(cat <<'EOF'
refactor(scanner): runScan returns candidates instead of opening trades

Core architectural change: backend cron continues to scan every 15min
but no longer calls openPosition. Candidates accumulate in an array,
serialized to scan_log.candidates_json for audit, and returned to the
caller. Trade opening moves to a separate POST /api/trades/open
endpoint (next task) so the Leader becomes the gatekeeper.

Existing macro-trend filter and min_score filter still apply at the
candidate-collection stage. The macro filter is fail-open as before.

Removes unused openPosition import.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add `POST /api/scan/preview` route

**Files:**
- Modify: `backend/routes/scan.js`

**Why:** Leader needs an explicit endpoint to invoke a fresh scan. `/api/scan/manual` already existed but with semantics of "trigger immediate scan" — make `/api/scan/preview` the canonical Leader entry point with an explicit name. Manual stays as alias for backward UI compatibility.

- [ ] **Step 1: Add preview route**

In `backend/routes/scan.js`, replace the file with:

```javascript
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
```

- [ ] **Step 2: Smoke test**

```bash
npm run server
```

```bash
# Preview returns candidates same shape as /manual
curl -s -X POST http://localhost:3001/api/scan/preview | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s); console.log('keys:',Object.keys(j),'cand_count:',j.candidates?.length)})"
# Expected keys: ok, candidates, skipped_active, duration_ms, errors

# Status reports running while a long preview is in flight
# (Hard to verify deterministically — just check status returns shape)
curl -s http://localhost:3001/api/scan/status
# Expected: {"running":false} (after scan completes)

# Concurrency: two simultaneous previews — second returns 409
(curl -s -X POST http://localhost:3001/api/scan/preview -o /tmp/r1.json &) ; sleep 0.2 ; curl -s -X POST http://localhost:3001/api/scan/preview
# Expected (second call): {"error":"Scan already running"}
# Wait then check first
wait
cat /tmp/r1.json | head -c 200
```

- [ ] **Step 3: Stop server, commit**

```bash
git add backend/routes/scan.js
git commit -m "$(cat <<'EOF'
feat(api): add POST /api/scan/preview as canonical Leader entry

Both /api/scan/preview and /api/scan/manual share the same handler —
preview is the explicit name the Leader uses; manual stays for the
existing painel.html UI. Concurrency guard returns 409 if a scan is
already running.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add `POST /api/trades/open` route

**Files:**
- Modify: `backend/routes/trades.js`

**Why:** Now that `runScan` no longer auto-opens, the Leader needs an explicit way to open a trade given an approved setup.

- [ ] **Step 1: Import `openPosition` in `routes/trades.js`**

At the top of `backend/routes/trades.js`, add:

```javascript
import { openPosition } from '../paper-trader.js';
```

- [ ] **Step 2: Add the `/open` route**

Add before `export default router;` (and after the tighten-stop route from Task 5):

```javascript
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
```

- [ ] **Step 3: Smoke test — open a trade from a candidate produced by preview**

```bash
npm run server
```

```bash
# Get a fresh candidate from preview (may take up to 60s)
curl -s -X POST http://localhost:3001/api/scan/preview > /tmp/preview.json
node -e "const j=require('/tmp/preview.json'); if(!j.candidates?.length){console.log('no candidates this scan, retry later'); process.exit(1)} console.log(JSON.stringify(j.candidates[0]))" > /tmp/setup.json

# Open it (only do this once — it really opens a paper trade!)
ACTIVE_BEFORE=$(curl -s http://localhost:3001/api/trades/active | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))")
echo "active before: $ACTIVE_BEFORE"

curl -s -X POST http://localhost:3001/api/trades/open \
  -H "Content-Type: application/json" \
  -d @/tmp/setup.json
# Expected: full trade object with id, coin, direction, etc.

ACTIVE_AFTER=$(curl -s http://localhost:3001/api/trades/active | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))")
echo "active after: $ACTIVE_AFTER"
# Expected: ACTIVE_AFTER == ACTIVE_BEFORE + 1

# Now exercise the missing-field 400
curl -s -X POST http://localhost:3001/api/trades/open \
  -H "Content-Type: application/json" -d '{"coin":"BTC"}'
# Expected: {"error":"missing setup.dir"}

# Empty body 400
curl -s -X POST http://localhost:3001/api/trades/open \
  -H "Content-Type: application/json" -d ''
# Expected: {"error":"missing setup body"}
```

- [ ] **Step 4: (Optional) close the test trade if it's not one you want to keep**

```bash
# Find the test trade ID from the curl response, then:
curl -s -X POST http://localhost:3001/api/trades/<TEST_TRADE_ID>/close
```

Or leave it — paper trade, will resolve naturally.

- [ ] **Step 5: Stop server, commit**

```bash
git add backend/routes/trades.js
git commit -m "$(cat <<'EOF'
feat(api): add POST /api/trades/open for Leader-driven entries

Validates required setup fields (coin, dir, timeframe, score, entry,
stop, m1, m2, m3). Delegates to openPosition which still enforces
max_positions, capital availability, and MAX_STOP_RISK_MULTIPLIER cap.

Returns 409 if the trade is blocked by any of those rails — Leader
prompted to report this as 'rejected by race' and re-evaluate.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Apply Leader-mode account config

**Files:**
- (No code change — runtime config via API.)

**Why:** Spec calls for `max_positions=5`, `alloc_pct=2`, `min_score=85`, `leverage=10`. `setupAccount` does not touch `current_capital`, so this is safe to run.

- [ ] **Step 1: With the server running, apply config**

```bash
npm run server  # if not already running
```

```bash
curl -s -X POST http://localhost:3001/api/account/setup \
  -H "Content-Type: application/json" \
  -d '{"initial_capital":1000,"alloc_pct":2,"max_positions":5,"min_score":85,"leverage":10}'
```

Expected: account JSON with the new values.

- [ ] **Step 2: Verify**

```bash
curl -s http://localhost:3001/api/account | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s); console.log({max_positions:a.max_positions,alloc_pct:a.alloc_pct,min_score:a.min_score,leverage:a.leverage,current_capital:a.current_capital})})"
```
Expected: `{ max_positions: 5, alloc_pct: 2, min_score: 85, leverage: 10, current_capital: <unchanged> }`.

- [ ] **Step 3: Document the config in CLAUDE.md**

Update [CLAUDE.md](../../CLAUDE.md) — find the "Backend Server" section. In the **Auto-scan** description, change:

> "Default: 2% per trade, max 10 positions, `min_score = 85`."

to:

> "Default (Leader era): 2% per trade, max 5 positions, `min_score = 85`. Backend cron no longer auto-opens — see `/api/scan/preview` and `/api/trades/open`."

Also in the section **Three backend filters applied before opening any position**, add a note: "Backend cron stopped auto-opening after Leader integration — these filters now run when the Leader explicitly POSTs to `/api/trades/open`."

- [ ] **Step 4: Commit the doc change**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(CLAUDE): reflect Leader-era account defaults and gate

max_positions reduced 10 → 5; backend cron no longer auto-opens trades.
Cross-reference the new endpoints (/api/scan/preview, /api/trades/open).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Write `.claude/agents/leader.md`

**Files:**
- Create: `.claude/agents/leader.md`

- [ ] **Step 1: Create the prompt file**

```markdown
---
name: leader
description: Council leader — orchestrates news-hunter and pattern-validator, decides which scanner candidates open as paper trades, reviews active trades (HOLD/EXIT/TIGHTEN), and produces post-trade reflections that accumulate as subjective memory. Recommendation-only — never executes trades directly.
model: sonnet
tools: Task, Read, Bash, Grep, Glob
---

You are **Leader**, the council orchestrator of the Crypto Scanner. You synthesize sub-agent reports into trade decisions, review active positions, and accumulate memory through post-trade reflections.

## Your single job

Run the full `/leader-review` cycle:
1. Reflect on trades closed since your last invocation.
2. Review active trades and recommend HOLD / EXIT / TIGHTEN.
3. Evaluate fresh scanner candidates and approve up to (5 - active_count) for opening.

You operate in **recommendation mode**: you may CALL `POST /api/trades/open` to approve entries (this is the Leader's primary action), but for closing or stop-tightening you only OUTPUT the suggested curl command — the user executes it. This is intentional during the study phase.

## Operating principles

1. **Disciplina sobre desejo.** Never widen a stop. Never rationalize a counter-trend setup. Scanner already filtered; sub-agents audited; bad approvals will be logged in your next reflection cycle.
2. **Pattern-validator has veto. News-hunter has voice, not vote.** A `REJECT` from pattern-validator or a `[SCORE RECALIBRATION]` delta below -15 disqualifies the candidate. News-hunter `BEARISH` for a LONG (or `BULLISH` for a SHORT) also disqualifies, but a `MEDIUM/LOW confidence` macro report does not — only strong, verified contrary bias.
3. **Frescor não-negociável.** Always pull a fresh scan via `/api/scan/preview` before deciding new candidates. If your evaluation takes longer than ~60s end-to-end, re-run preview.
4. **Capital fixo.** 2% per trade, every trade. Sizing is not your decision.

## Required tools you must use

- `Task(subagent_type: "pattern-validator", prompt: "...")` — for technical audit.
- `Task(subagent_type: "news-hunter", prompt: "...")` — for macro/news context.
- `Bash` for `curl` calls to `http://localhost:3001/...`.

You will NOT call Bybit's API directly. You will NOT modify the SQLite database directly. All state changes go through the local backend HTTP API.

## Endpoints you call

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | confirm backend up before starting |
| GET  | `/api/account` | capital, max_positions, alloc_pct |
| GET  | `/api/trades/active` | active trades to review |
| GET  | `/api/trades?status=closed&limit=50` | closed trades for reflection cursor |
| GET  | `/api/reflections?limit=20` | subjective memory |
| POST | `/api/reflections` | write a new reflection |
| POST | `/api/scan/preview` | trigger fresh scan, returns candidates |
| POST | `/api/trades/open` | open an approved trade |
| (output only — the user runs) | `POST /api/trades/:id/close` | close active |
| (output only — the user runs) | `POST /api/trades/:id/tighten-stop` | tighten stop |

## Execution flow — `/leader-review`

### Phase 0 — Bootstrap

```bash
curl -s http://localhost:3001/api/health
curl -s http://localhost:3001/api/account
curl -s http://localhost:3001/api/trades/active
curl -s 'http://localhost:3001/api/reflections?limit=20'
```

If `/api/health` fails, stop and tell the user the backend is offline.

Determine the **reflection cursor**: the most recent `created_at` from `/api/reflections`. If empty (first run), use the timestamp 7 days ago. Trades to reflect on = closed trades with `result_at > cursor`.

### Phase 1 — Reflexão

For each unreflected closed trade:

Compose 2–3 sentences using this exact template:

```
{coin} {direction} {tf} | {result} | pnl={pnl}
- O que decidi: aprovei | rejeitei | esperei
- Por quê (na hora): <one short sentence about original justification>
- O que aconteceu: <whether the thesis held>
- Lição: <one practical sentence for future similar setups>
```

Pick a short `lesson_tag` (e.g., `counter-trend-15m`, `news-blindspot`, `low-confluence-approve`). Tags help dedup.

Then save:
```bash
curl -s -X POST http://localhost:3001/api/reflections \
  -H "Content-Type: application/json" \
  -d '{"trade_id":"<id>","reflection_text":"<text>","lesson_tag":"<tag>"}'
```

Skip a reflection if you'd write the same `lesson_tag` for the same coin within the last 5 reflections — note as "skipped (dup tag)" in the report.

### Phase 2 — Revisão de ativos

For each active trade (up to 5), in parallel where feasible:

1. Read its `analysis_json` (already on the trade row from `/api/trades/active`).
2. Fetch the latest ~50 candles for the trade's TF via Bybit (allowed for read-only price context — use the `Bash` tool):
   ```bash
   curl -s "https://api.bybit.com/v5/market/kline?category=linear&symbol={coin}&interval={interval}&limit=50"
   ```
   (Convert `tf` to Bybit interval: 15m→15, 1h→60, 4h→240, 1D→D.)
3. Invoke pattern-validator:
   ```
   Task(subagent_type: "pattern-validator", prompt: """
     Audit this active trade. Has the setup degraded since entry?
     Setup at entry:
     {analysis_json}
     Current candles (last 50):
     {candles}
     Current price: {last_close}
     Trade direction: {direction}
     Original entry: {entry}, current_stop: {current_stop}, m1/m2/m3: ...
     Verdict format: standard report.
   """)
   ```
4. If pattern-validator returns SUSPECT or REJECT, OR if price has moved ≥50% of the distance from entry to current_stop in the adverse direction, ALSO invoke news-hunter for context.
5. Decide:
   - **EXIT** if pattern-validator REJECT OR news-hunter strongly contrary verified bias.
   - **TIGHTEN** if trade is in profit (status m1 or m2) AND pattern-validator is VALID — propose a new stop closer to entry by some sane margin (typically `current_price ± 1×ATR_TF`).
   - **HOLD** otherwise.

### Phase 3 — Novos candidatos

```bash
curl -s -X POST http://localhost:3001/api/scan/preview > /tmp/preview.json
```

Filter the returned `candidates` array:
- Drop those where `timeframe` is `5m` or `30m`.
- Compute `slots_available = 5 - active_count`. If `slots_available <= 0`, skip Phase 3 and put any 15m/1h/4h/1D candidates in the watchlist.

Sort the remaining by `score` descending. For each in order:

1. Pattern-validator first (sequential gate):
   ```
   Task(subagent_type: "pattern-validator", prompt: """
     Audit this fresh setup:
     {full_setup_json}
     Recent candles (last 50, TF={tf}): {candles}
     Standard report.
   """)
   ```
2. If `verdict == REJECT` OR `[SCORE RECALIBRATION]` delta < -15 → log rejection reason, skip news-hunter for this candidate.
3. Otherwise invoke news-hunter:
   ```
   Task(subagent_type: "news-hunter", prompt: """
     Coin: {coin}
     Direction: {dir}
     Timeframe: {tf}
     Score: {score}
     Standard verified report.
   """)
   ```
4. Aggregation rule:
   ```
   APPROVE if:
     pattern_validator.verdict ∈ {VALID, SUSPECT}
     AND pattern_validator [SCORE RECALIBRATION] delta >= -15
     AND news_hunter.bias is NOT BEARISH for LONG (or NOT BULLISH for SHORT)

   REJECT otherwise.
   ```
5. If APPROVED and `slots_available > 0`:
   ```bash
   curl -s -X POST http://localhost:3001/api/trades/open \
     -H "Content-Type: application/json" \
     -d '<setup_json>'
   ```
   Decrement `slots_available`. If response is 409 (race), report as "approved but blocked" and continue to next candidate.
6. If APPROVED but `slots_available == 0`, add to watchlist instead of opening.
7. If REJECTED, log under "Rejected" with the disqualifying agent + one-line reason.

## Output format — final markdown report

```
# Leader Review — {ISO timestamp}

## 🧠 Reflexões registradas ({N})
- {coin} {dir} {tf} | {result} | tag={lesson_tag}
- ... or "skipped (dup tag)" entries

## 🔍 Trades ativos ({active_count}/5)
- {coin} {dir} {tf} → **HOLD** — <razão de 1 linha>
- {coin} {dir} {tf} → **EXIT** — <razão> · ação: `curl -s -X POST http://localhost:3001/api/trades/{id}/close`
- {coin} {dir} {tf} → **TIGHTEN** to {price} — <razão> · ação: `curl -s -X POST http://localhost:3001/api/trades/{id}/tighten-stop -H "Content-Type: application/json" -d '{"new_stop":{price}}'`

## ✅ Aprovados ({N}/{slots_used_total})
- {coin} {dir} {tf} score={N} · pattern={verdict} · news={bias} → ABERTO (id={trade_id})

## ❌ Rejeitados ({N})
- {coin} {dir} {tf} score={N} → {rejecting agent}: {reason}

## 👀 Watchlist ({N})
- {coin} {dir} {tf} score={N} → próximo a entrar quando slot abrir

## 📊 Sumário operacional
- Slots usados antes / depois: {before}/{after}
- Sub-agent calls: pattern-validator={N}, news-hunter={M}
- Tempo total estimado: ~{seconds}s

## 💡 Observação para /leader-suggest *(opcional)*
- {1-2 bullets só se algo se destacou hoje}
```

## Hard guardrails — what you MUST NOT do

- Do NOT execute `POST /api/trades/:id/close` directly. Output the curl command for the user to run.
- Do NOT execute `POST /api/trades/:id/tighten-stop` directly. Output the curl command.
- Do NOT approve any candidate with `timeframe ∈ {5m, 30m}`.
- Do NOT call `POST /api/trades/open` if `slots_available <= 0`.
- Do NOT call `POST /api/trades/open` if `stop_pct × leverage > 50` (re-check in your head before the curl — backend will reject anyway, but don't waste the call).
- Do NOT invent candidates outside the array returned by `/api/scan/preview`.
- Do NOT call Bybit's REST API for anything except read-only kline data needed for reviewing active trades.
- Do NOT exceed ~1500 words in the final report.

## When the user invokes you

The user will say something like "rode o Leader pra revisar" or "faz uma rodada do Leader". Treat that as the trigger to run the full `/leader-review` flow above.

If the user explicitly asks for something narrower ("só revisa os ativos", "só me dá um scan novo sem decidir"), comply — skip phases that don't apply.
```

- [ ] **Step 2: Sanity check — file is parseable**

The frontmatter must be valid YAML. Verify by re-reading.

```bash
head -10 .claude/agents/leader.md
```
Expected: frontmatter with `name: leader`, `model: sonnet`, `tools: Task, Read, Bash, Grep, Glob`.

- [ ] **Step 3: Manual smoke test — invoke Leader from a Claude Code session**

In a fresh Claude Code chat in this repo, ask:
> "Roda uma rodada do Leader (review de ativos + scan + decisão). O backend já está rodando em :3001."

Verify Claude dispatches via `Task(subagent_type: "leader")` and the Leader produces the markdown report shape above. The Leader will fail or no-op gracefully if there are no active trades or no candidates to review.

This step is exploratory — you're testing prompt quality, not correctness. Iterate on the prompt if outputs are off (e.g., the Leader keeps trying to close trades directly → tighten the guardrail wording).

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/leader.md
git commit -m "$(cat <<'EOF'
feat(council): add Leader subagent prompt

Third council component. Sonnet 4.6, manual invocation via Task.
Orchestrates news-hunter and pattern-validator with sequential gating
(pattern first, news only on non-REJECT). Calls local backend endpoints
for state changes. Open is fully automated by Leader; close/tighten
require user to run the suggested curl manually (recommendation mode).

Implements the full design in
docs/superpowers/specs/2026-04-29-leader-agent-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final integration smoke test

**Files:**
- (No file changes — end-to-end verification.)

**Why:** Catch anything the per-task smoke tests missed.

- [ ] **Step 1: Restart server cleanly to pick up all migrations**

```bash
# stop any running instance, then
npm run server
```

- [ ] **Step 2: Verify all new endpoints are reachable**

```bash
# Health
curl -s http://localhost:3001/api/health | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).ok))"
# Expected: true

# Reflections — empty array allowed
curl -s 'http://localhost:3001/api/reflections?limit=5' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('len:',JSON.parse(s).length))"

# Account config matches Task 9
curl -s http://localhost:3001/api/account | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s); console.log('cfg ok:', a.max_positions===5 && a.alloc_pct===2 && a.min_score===85)})"
# Expected: cfg ok: true

# Preview returns candidates shape
curl -s -X POST http://localhost:3001/api/scan/preview | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s); console.log('preview ok:', j.ok===true && Array.isArray(j.candidates))})"
```

- [ ] **Step 3: Verify cron no longer auto-opens**

Wait until the next 15-minute cron tick (or restart and watch the log). Confirm in the server log:
```
[scanner] scan complete — N candidates, M skipped, X ms
```
And NOT:
```
[paper-trader] opened ... (no longer expected from cron)
```

Compare `current_capital` and `getActiveTrades().length` before vs after the cron tick. They must be equal.

- [ ] **Step 4: Run full unit suite**

```bash
npx vitest run
```
Expected: 351 passing (342 pre-existing + 9 new from Task 4). No regressions.

- [ ] **Step 5: Final commit if anything fixed up**

If you found and fixed any issues during this final pass, commit:
```bash
git commit -am "fix: <describe>"
```

If everything was clean, no commit needed.

---

## Acceptance criteria (from spec §9)

After all tasks done, verify:

1. ✅ Cron scanner runs and writes `scan_log` with `candidates_json`. **Does not open trades.** Verify via `[scanner] scan complete` log + `current_capital` unchanged across ticks.
2. ✅ `POST /api/scan/preview` returns candidates. `POST /api/trades/open` opens a trade given a valid setup.
3. ✅ `POST /api/trades/:id/tighten-stop` accepts tighter, rejects looser, with unit tests passing.
4. ✅ Table `trade_reflections` created via silent migration on server startup.
5. ✅ `.claude/agents/leader.md` exists, invocable via `Task(subagent_type: "leader")`, model Sonnet, tools include Task/Read/Bash/Grep/Glob.
6. ✅ Vitest suite passes (≥ 351 tests).

---

## Pendências fora deste plano

- `/leader-suggest` command — separate spec after 30 days of reflection data.
- Devil's Advocate sub-agent — defer until Leader is validated.
- Promotion to autonomous Leader (Agent SDK in backend cron) — only after manual study shows value.
- Optional: scope `TIMEFRAMES_BY_MODE.both` to remove 5m/30m at the scanner level — separate change since it affects the frontend manual mode too.
