# `/leader-suggest` — Design Spec

> Status: Draft (2026-05-14). Follows [`2026-04-29-leader-agent-design.md`](./2026-04-29-leader-agent-design.md).
> ADR #14 in that spec explicitly deferred this command until "30 days of trades + reflections collected."
> With ~2 weeks of Leader operation (since 2026-04-29), the corpus is approaching usable size.
> This spec is intentionally free of fabricated reflection data — see `[USER REVIEW]` markers throughout.

---

## 1. Purpose

`/leader-suggest` is the **retrospective counterpart** to `/leader-review`.

Where `/leader-review` is real-time — approve candidates, review active trades, write fresh reflections —
`/leader-suggest` is analytical: it reads the full body of `trade_reflections` accumulated by the Leader
over time, surfaces **recurring lesson patterns**, and proposes concrete guardrail updates to improve
setup-evaluation discipline.

The insight motivating this command: the Leader's per-trade reflection loop (`lesson_tag` + 2–3
sentences) is designed for deduplication and freshness, not for pattern aggregation. A lesson
tagged `counter-trend-15m` in 8 separate reflections across 5 different coins is a *structural*
discipline failure — not visible in any single review cycle, but clear when you step back.

`/leader-suggest` steps back. It does not evaluate any active trade. It does not open, close, or
modify positions. Its sole output is a markdown report identifying the top recurring patterns across
the reflection corpus and proposing actionable discipline rules the user may choose to encode into
the Leader prompt or into CLAUDE.md guardrails.

---

## 2. Trigger

**Manual invocation only.** The user runs it on demand:

```
# In a Claude Code session:
Task(subagent_type: "leader-suggest")

# Or by name:
"roda o leader-suggest"
"/leader-suggest"
```

**Recommended cadence:** weekly, or after every 15–20 new reflections. Running it daily produces
noise (the pattern signal requires a minimum corpus — see §6). Running it less than once per month
means patterns persist undiscovered.

**Optional parameter:** `--window=N` — limits the reflection fetch to the N most recent rows
(default: all available, capped at 200 by the existing API). Useful when the user wants to
compare pattern distributions across time windows (e.g., "only last 30 reflections vs all-time").

**Does not require:** backend scan running, active trades, or sub-agent calls. The agent reads
existing data from `trade_reflections` and `trades` — both tables persist independently of whether
the scanner cron is active.

---

## 3. Inputs

The suggest agent reads **four data sources**, all via the local backend:

| Source | Endpoint | Purpose |
|--------|----------|---------|
| All reflections | `GET /api/reflections?limit=200` | Primary corpus; raw text + lesson_tag + trade_id + created_at |
| Tag-aggregated summary | `GET /api/reflections/by-tag` | Pre-bucketed counts + outcome distribution per tag (new endpoint — see §7) |
| Account stats | `GET /api/account` | Overall WR, P&L — calibration context for interpreting loss rates |
| Closed trades | `GET /api/trades?status=closed&limit=100` | Cross-reference trade outcomes to reflection trade_ids |

The agent does **not** call Bybit. It does **not** invoke `pattern-validator` or `news-hunter`.
It does **not** call `POST /api/scan/preview`. It does **not** modify any trade or reflection.

The `by-tag` endpoint (§7.2) is the load-bearing addition: it performs the SQL aggregation
server-side (JOIN + GROUP BY + outcome bucketing), so the agent receives structured data rather
than having to parse 200 raw JSON rows inside the prompt.

> [USER REVIEW] **Verify backend is reachable:** `GET /api/health` before starting. If offline,
> the agent must abort and tell the user rather than reporting empty patterns.

---

## 4. Algorithm Sketch

The suggest agent runs five sequential phases. Phases A–D are deterministic (counting and
bucketing); Phase E requires LLM judgment (deriving the discipline rule from sampled text).

### Phase A — Tag Frequency Bucketing

```
reflections  ← GET /api/reflections?limit=200
by_tag       ← GET /api/reflections/by-tag   (pre-aggregated by server)
```

The `by-tag` response gives, per tag: `count`, `wins`, `losses`, `neutral`,
`example_texts` (first 200 chars of up to 3 reflections, `|||`-delimited).

Reflections with `lesson_tag = null` are grouped under the synthetic key `[untagged]`.

### Phase B — Outcome Correlation

Each tag bucket already carries win/loss/neutral counts from the JOIN in `by-tag`.
The agent computes:

```
loss_rate[tag]    = losses / count
outcome_span[tag] = set of unique (coin, tf) pairs across the tag's reflections
```

`outcome_span` requires the full reflection list (Phase A), not just the aggregated row —
the agent cross-references `reflection.trade_id → trade.coin + trade.timeframe` using the
closed-trades response.

### Phase C — Salience Scoring

Not all frequent tags are equally actionable. The salience score combines frequency with
loss correlation:

```
salience[tag] = count × (1 + loss_rate[tag])
```

**Exclusion rule:** tags with `count < 2` are excluded. A single reflection is anecdote, not
pattern. (Exception: if the entire corpus is fewer than 5 reflections, lower the threshold to
`count >= 1` and emit a thin-corpus warning.)

### Phase D — Top-3 Selection and Structural Assessment

Sort all eligible tags by `salience DESC`. Take the top 3.

For each top-3 tag, classify it as **structural** or **coin-specific**:

| Classification | Condition | Signal strength |
|----------------|-----------|-----------------|
| **Structural** | Tag spans ≥ 3 distinct coins AND ≥ 2 distinct timeframes | High — warrants a guardrail update |
| **Coin-specific** | > 50% of occurrences in the same (coin, tf) pair | Medium — may be a single bad coin, not a general failure |
| **TF-cluster** | Spans multiple coins but only 1 timeframe | Medium-high — TF-specific rule may help |

**Dup vs salient rule:**

A `lesson_tag` already suppresses near-duplicates at write time (Leader skips reflection if
it would write the same tag for the same coin within the last 5 reflections). Surviving
duplicates that remain in the corpus are therefore **genuinely recurring**, not artifacts.

However, a cluster of same-tag reflections appearing within 48h on the same coin during a
single volatile event should be counted as 1 occurrence for salience scoring (they share
a root cause, not independent pattern instances). The agent checks `created_at` timestamps
and `coin` fields to detect these clusters.

### Phase E — Discipline Rule Derivation

For each top-3 tag, the agent reads the 2–3 sample reflection texts and synthesizes a
one-sentence actionable guardrail:

```
Pattern: counter-trend-15m (8 occurrences · 75% loss rate · structural: 5 coins × 3 TFs)
Samples: [reflection excerpts]
→ Proposed rule: "Reject any 15m setup where regimeScore sign opposes the 4h EMA200 trend."
```

The rule is a **proposal only** — it appears in the report for the user to review, not
automatically encoded anywhere. See §6 for why this step requires human review.

---

## 5. Output Format

```markdown
# Leader Suggest Report — {ISO date}

## Corpus
- Reflections read: {N} (window: all / last {N})
- Unique lesson_tags: {M} · Untagged: {K}
- Corpus span: {oldest_created_at} → {newest_created_at}
- Account context: WR={X}% · P&L={$Y} over {Z} closed trades

---

## Top-3 Recurring Patterns

### 1. `{lesson_tag}` — {count} reflections · {loss_rate}% loss rate

**Classification:** Structural / Coin-specific / TF-cluster
**Span:** {N} distinct coins × {M} distinct timeframes

**Sample reflections:**
> "{excerpt from reflection_text 1}"

> "{excerpt from reflection_text 2}"

**Proposed discipline rule:**
> {one-sentence actionable guardrail — e.g. encode in Leader guardrails or CLAUDE.md}

**Confidence:** HIGH / MEDIUM / LOW

*Confidence rationale: {1 sentence — e.g. "8 occurrences across 5 coins, 75% loss rate, spans multiple weeks"}*

---

### 2. `{lesson_tag}` — {count} reflections · {loss_rate}% loss rate

[same format as #1]

---

### 3. `{lesson_tag}` — {count} reflections · {loss_rate}% loss rate

[same format as #1]

---

## ⚠ Thin-corpus warning
*(emit only if total reflections < 15)*
Pattern detection is unreliable with fewer than 15 reflections. Current corpus: {N}.
Re-run `/leader-suggest` after {15 − N} more Leader review cycles.

---

## 🏷 Full Tag Table

| tag | count | wins | losses | neutral | loss_rate | classification |
|-----|------:|-----:|-------:|--------:|----------:|----------------|
| ... |   ... |  ... |    ... |     ... |      ...% | ...            |

---

## 💡 Suggested Next Actions

- {1–3 bullets — e.g.:}
  - "Encode counter-trend-15m rule into `.claude/agents/leader.md` guardrails section."
  - "Review low-confluence-approve reflections — all 4 are AVAX; may be coin-specific."
  - "Corpus is healthy. No structural patterns yet — continue collecting."
```

**Length cap:** ≤ 800 words in the report body (excluding the tag table). The table can be
longer. Unlike `/leader-review`, this report is meant to be read slowly — brevity is less
critical than completeness of the pattern evidence.

---

## 6. Open Questions

> [USER REVIEW] **Real tag distribution.** The spec cannot inspect `data/scanner.db` (gitignored).
> Before finalizing the algorithm, run:
> ```sql
> SELECT lesson_tag, COUNT(*) as n
> FROM trade_reflections
> WHERE lesson_tag IS NOT NULL
> GROUP BY lesson_tag
> ORDER BY n DESC;
> ```
> If the top tag has `n < 3`, the corpus is still thin and top-3 selection will surface
> low-signal noise. Consider waiting another week of Leader operation before invoking.

> [USER REVIEW] **Untagged proportion.** If a significant share of reflections have
> `lesson_tag = NULL`, the salience algorithm degrades because those reflections are
> ungroupable. Check:
> ```sql
> SELECT
>   COUNT(*) FILTER (WHERE lesson_tag IS NULL)     AS untagged,
>   COUNT(*) FILTER (WHERE lesson_tag IS NOT NULL) AS tagged,
>   COUNT(*)                                       AS total
> FROM trade_reflections;
> ```
> If untagged > 20% of total, update the Leader prompt to make `lesson_tag` mandatory
> (currently the field is optional in both the prompt and the API schema).

> [USER REVIEW] **Orphaned reflections (deleted trades).** If `resetAccount({mode:'full'})`
> was called after reflections were written, the referenced `trade_id` rows may no longer exist
> in `trades`. These reflections cannot be outcome-correlated and will appear as `neutral` in
> the salience scoring (silently inflating neutral counts). Check:
> ```sql
> SELECT COUNT(*) FROM trade_reflections tr
> LEFT JOIN trades t ON tr.trade_id = t.id
> WHERE t.id IS NULL;
> ```
> If orphan count is non-zero, decide whether to exclude or label them `[outcome unknown]`.

> [USER REVIEW] **False-positive lessons.** Some lesson_tags may be accurate per-trade but
> not generalizable — e.g., `news-blindspot` triggered by a one-off exchange hack that is
> statistically unlikely to repeat. The proposed discipline rules in §4 Phase E are LLM
> synthesis from sample text; they must be reviewed against the actual reflection excerpts
> before being encoded into the Leader prompt or CLAUDE.md. Do not apply any proposed rule
> automatically.

> [USER REVIEW] **Lesson_tag vocabulary.** The Leader prompt currently gives examples
> (`counter-trend-15m`, `news-blindspot`, `low-confluence-approve`) but does not enforce a
> controlled vocabulary. After reading the actual tags in the DB, consider whether to formalize
> a tag taxonomy (e.g., prefix categories: `setup/`, `macro/`, `timing/`) to improve
> groupability. This would require a one-time migration/normalization pass on existing rows and
> a prompt update.

> [USER REVIEW] **Minimum corpus for reliable pattern detection.** The spec proposes 15 as
> the minimum threshold, based on the reasoning that 3 tags × 5 occurrences each requires
> ~15 reflections. This is a rough heuristic — adjust based on observed tag diversity once
> the real distribution is known.

---

## 7. Implementation Outline

### 7.1 New Agent: `.claude/agents/leader-suggest.md`

```yaml
---
name: leader-suggest
description: Retrospective pattern-surfacing agent. Reads accumulated trade_reflections written
  by the Leader, buckets them by lesson_tag, correlates with trade outcomes, and surfaces the
  top-3 recurring discipline patterns as proposed guardrail updates. Does not evaluate active
  trades, does not invoke sub-agents, does not open or close positions.
model: sonnet
tools: Bash
---
```

**Prompt skeleton** (sections in order):

1. **Identity & single job.** "You are Leader-Suggest. Your job is retrospective analysis of
   the reflection corpus — no trade decisions."

2. **Phase A — Fetch data:**
   ```bash
   curl -s 'http://localhost:3001/api/health'
   curl -s 'http://localhost:3001/api/reflections?limit=200'
   curl -s 'http://localhost:3001/api/reflections/by-tag'
   curl -s 'http://localhost:3001/api/account'
   curl -s 'http://localhost:3001/api/trades?status=closed&limit=100'
   ```
   If `/api/health` fails → abort, report backend offline.

3. **Phase B–D — Salience algorithm** (prose description matching §4, compact).

4. **Phase E — Rule derivation** — read sample texts, synthesize one-sentence guardrail per
   top-3 tag. Mark confidence HIGH/MEDIUM/LOW based on count + structural span.

5. **Output** — exact markdown format from §5.

6. **Hard guardrails:**
   - Do NOT call `POST` on any endpoint.
   - Do NOT invoke pattern-validator or news-hunter.
   - Do NOT call Bybit.
   - Do NOT propose rules with count < 2.
   - Do NOT exceed 800 words in the body (tag table excluded).

### 7.2 New Backend Endpoint: `GET /api/reflections/by-tag`

**`backend/routes/reflections.js`** — add before `export default router`:

```javascript
// GET /api/reflections/by-tag — aggregated view for leader-suggest
router.get('/by-tag', (req, res) => {
  res.json(getReflectionsByTag());
});
```

**`backend/db.js`** — new exported function:

```javascript
export function getReflectionsByTag() {
  return getDb().prepare(`
    SELECT
      COALESCE(tr.lesson_tag, '[untagged]')                          AS lesson_tag,
      COUNT(*)                                                        AS count,
      SUM(CASE WHEN t.status IN ('m1','m2','m3')         THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN t.status IN ('stop','stopped_at_entry') THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN t.status NOT IN
        ('m1','m2','m3','stop','stopped_at_entry','active','m1','m2')
                                                           THEN 1 ELSE 0 END) AS neutral,
      GROUP_CONCAT(SUBSTR(tr.reflection_text, 1, 200), '|||')        AS example_texts
    FROM trade_reflections tr
    LEFT JOIN trades t ON tr.trade_id = t.id
    GROUP BY COALESCE(tr.lesson_tag, '[untagged]')
    ORDER BY count DESC
  `).all();
}
```

No schema migration required — this is a new read-only query over existing tables.

The route is already mounted in `server.js` under `/api/reflections`; the new
`/by-tag` path is additive and does not affect existing routes.

### 7.3 Tests (Vitest)

| Suite | Coverage |
|-------|----------|
| `tests/db-reflections-by-tag.test.js` | `getReflectionsByTag()` returns correct counts and win/loss/neutral buckets for known fixture data. Trade with deleted trade_id → outcome counted as neutral. Untagged reflections appear under `[untagged]`. Multiple reflections same tag → single bucket with correct aggregates. |
| `tests/routes-reflections-by-tag.test.js` | `GET /api/reflections/by-tag` → 200 with array. Empty DB → empty array. No auth required (read-only, same as existing GET /api/reflections). |

Existing test suite (`tests/db-reflections.test.js`) is not modified.

### 7.4 CLAUDE.md Update

Add to **REST API** table in CLAUDE.md:

```
| `GET /api/reflections/by-tag` | Aggregated reflection counts by lesson_tag (wins/losses/neutral) — for leader-suggest |
```

Add to **Agent Council** section under leader-suggest once the agent file is committed.

---

## Appendix — Relationship to Existing Council Pieces

```
/leader-review (daily)
  │ writes →  trade_reflections (lesson_tag, reflection_text, trade_id)
  │
  ▼
/leader-suggest (weekly)
  │ reads ←   trade_reflections (all rows)
  │ reads ←   trades (outcome join)
  │ reads ←   GET /api/reflections/by-tag (aggregated)
  │
  ▼
  User reviews proposed rules → encodes into leader.md guardrails or CLAUDE.md
  │
  └── improves future /leader-review decision quality (closed loop)
```

`/leader-suggest` is the feedback loop that turns the Leader's per-trade memory into
durable, encoded discipline. Without it, reflections accumulate but do not compound.
