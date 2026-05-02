# Design: Leader Full Autonomy + Structured Justifications

**Date:** 2026-05-02  
**Status:** Approved

## Context

The Leader agent currently opens trades autonomously via `POST /api/trades/open`, but for EXIT (close) and TIGHTEN (stop-tighten) it only outputs curl commands for the user to run manually. The user wants full autonomy: Leader executes all three action types directly, and each decision must include a structured justification block so the user can audit the reasoning post-hoc.

## Scope

Changes are confined to `.claude/agents/leader.md`. No backend changes required. No new files.

## Design

### 1. Frontmatter `description`

Remove "Recommendation-only — never executes trades directly." Replace with a description that reflects full autonomous operation.

### 2. Phase 2 — Active Trade Review: Execution

Both EXIT and TIGHTEN change from "output only" to direct execution:

- **EXIT:** call `POST /api/trades/:id/close` via `Bash`, capture HTTP response, report result.
- **TIGHTEN:** call `POST /api/trades/:id/tighten-stop` via `Bash` with `{"new_stop": <price>}`, capture response, report result.

Pattern mirrors existing Phase 3 open-trade flow: curl executed, response inspected, result surfaced in report.

### 3. Report Format — Structured Justification Block

Each active trade in the report gets a multi-line justification block instead of a single-line reason.

**EXIT block:**
```
- {coin} {dir} {tf} → **EXIT** executado (id={id})
  - Evidência técnica: {pattern-validator verdict + key signal}
  - Macro: {news-hunter bias, if invoked; "não invocado" otherwise}
  - Razão da decisão: {why EXIT, not HOLD — concrete criterion that triggered it}
  - Resposta da API: {HTTP status + response body summary}
```

**TIGHTEN block:**
```
- {coin} {dir} {tf} → **TIGHTEN** para {new_stop} executado (id={id})
  - Novo stop: {new_stop} (antes: {old_stop})
  - Razão do nível: {why this specific price — e.g., 1×ATR from current price, structure level}
  - Condição: trade em {status}, pattern-validator {verdict}
  - Resposta da API: {HTTP status + response body summary}
```

**HOLD block (shorter):**
```
- {coin} {dir} {tf} → **HOLD**
  - Pattern-validator: {verdict}
  - Razão: {1-2 lines — what would need to change to trigger EXIT or TIGHTEN}
```

### 4. Hard Guardrails — Removals

Remove the two lines that currently prohibit direct execution:
- "Do NOT execute `POST /api/trades/:id/close` directly."
- "Do NOT execute `POST /api/trades/:id/tighten-stop` directly."

All other guardrails remain unchanged.

### 5. No Changes To

- `run-leader.ps1` — no changes needed.
- Backend — no new endpoints or logic required.
- Phase 1 (reflections) — unchanged.
- Phase 3 (new candidates) — unchanged.
- All existing hard guardrails except the two removed above.

## Success Criteria

1. Leader executes EXIT and TIGHTEN without user intervention.
2. Every Phase 2 decision (HOLD, EXIT, TIGHTEN) includes a structured justification block with at minimum: technical evidence, macro context (or explicit "not invoked"), decision rationale, and API response.
3. No regressions in Phase 1 or Phase 3 behavior.
