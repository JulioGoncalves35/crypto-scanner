# Leader Full Autonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modificar `leader.md` para que o Leader execute EXIT e TIGHTEN diretamente via curl, e emita justificativas estruturadas em cada decisão da Phase 2.

**Architecture:** Single-file edit — `.claude/agents/leader.md`. Quatro zonas de mudança: (1) frontmatter description, (2) lógica de execução da Phase 2, (3) formato do relatório da Phase 2, (4) remoção de dois guardrails proibitivos.

**Tech Stack:** Markdown (agent prompt file). Nenhuma dependência de código.

---

## Files

- Modify: `.claude/agents/leader.md` (todas as tarefas)

---

### Task 1: Atualizar frontmatter `description`

**Files:**
- Modify: `.claude/agents/leader.md` — linha 3

- [ ] **Step 1: Localizar e substituir a description no frontmatter**

Encontrar a linha:
```
description: Council leader — orchestrates news-hunter and pattern-validator, decides which scanner candidates open as paper trades, reviews active trades (HOLD/EXIT/TIGHTEN), and produces post-trade reflections that accumulate as subjective memory. Recommendation-only — never executes trades directly.
```

Substituir por:
```
description: Council leader — orchestrates news-hunter and pattern-validator, decides which scanner candidates open as paper trades, executes trade actions autonomously (open/close/tighten-stop), reviews active trades, and produces post-trade reflections that accumulate as subjective memory.
```

- [ ] **Step 2: Verificar que o frontmatter continua válido**

Ler as primeiras 10 linhas do arquivo e confirmar que `---`, `name`, `description`, `model` e `tools` estão presentes e bem formados.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/leader.md
git commit -m "feat(leader): update description to reflect full autonomous operation"
```

---

### Task 2: Tornar EXIT autônomo na Phase 2

**Files:**
- Modify: `.claude/agents/leader.md` — seção Phase 2, passo 5 (decisão EXIT)

- [ ] **Step 1: Localizar o bloco de decisão EXIT na Phase 2**

Encontrar o trecho (dentro da seção `### Phase 2 — Revisão de ativos`, passo 5):
```
   - **EXIT** if pattern-validator REJECT OR news-hunter strongly contrary verified bias.
```

O texto ao redor descreve que TIGHTEN propõe um novo stop e HOLD não faz nada. Nenhum desses passos diz "execute o curl" — eles apenas listam a decisão.

- [ ] **Step 2: Substituir o passo 5 completo por versão autônoma**

Encontrar:
```
5. Decide:
   - **EXIT** if pattern-validator REJECT OR news-hunter strongly contrary verified bias.
   - **TIGHTEN** if trade is in profit (status m1 or m2) AND pattern-validator is VALID — propose a new stop closer to entry by some sane margin (typically `current_price ± 1×ATR_TF`).
   - **HOLD** otherwise.
```

Substituir por:
```
5. Decide e execute:
   - **EXIT** if pattern-validator REJECT OR news-hunter strongly contrary verified bias:
     ```bash
     curl -s -X POST http://localhost:3001/api/trades/{id}/close
     ```
     Capture the response. Report HTTP status and result in the justification block.
   - **TIGHTEN** if trade is in profit (status m1 or m2) AND pattern-validator is VALID — compute new stop as `current_price ± 1×ATR_TF` (favor entry direction), verify it is tighter than `current_stop` using direction-aware logic (BUY: new > current; SELL: new < current):
     ```bash
     curl -s -X POST http://localhost:3001/api/trades/{id}/tighten-stop \
       -H "Content-Type: application/json" \
       -d '{"new_stop": <computed_price>}'
     ```
     Capture the response. A 400 response means the stop is not tighter — do NOT retry with a looser value; log as "TIGHTEN rejected (stop not tighter)" and treat as HOLD.
   - **HOLD** otherwise — no API call.
```

- [ ] **Step 3: Verificar que nenhuma outra referência a "propose a new stop" ficou no arquivo**

```bash
grep -n "propose a new stop" ".claude/agents/leader.md"
```

Esperado: nenhuma linha retornada.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/leader.md
git commit -m "feat(leader): execute EXIT and TIGHTEN autonomously in Phase 2"
```

---

### Task 3: Adicionar blocos de justificativa estruturados no formato do relatório

**Files:**
- Modify: `.claude/agents/leader.md` — seção `## Output format — final markdown report`, subseção `## 🔍 Trades ativos`

- [ ] **Step 1: Localizar o bloco atual de trades ativos no output format**

Encontrar:
```
## 🔍 Trades ativos ({active_count}/5)
- {coin} {dir} {tf} → **HOLD** — <razão de 1 linha>
- {coin} {dir} {tf} → **EXIT** — <razão> · ação: `curl -s -X POST http://localhost:3001/api/trades/{id}/close`
- {coin} {dir} {tf} → **TIGHTEN** to {price} — <razão> · ação: `curl -s -X POST http://localhost:3001/api/trades/{id}/tighten-stop -H "Content-Type: application/json" -d '{"new_stop":{price}}'`
```

- [ ] **Step 2: Substituir pelo formato com blocos de justificativa**

Substituir por:
```
## 🔍 Trades ativos ({active_count}/5)

Para cada trade, use o bloco correspondente:

**HOLD:**
- {coin} {dir} {tf} → **HOLD**
  - Pattern-validator: {verdict}
  - Razão: {1-2 linhas — o que precisaria mudar para virar EXIT ou TIGHTEN}

**EXIT:**
- {coin} {dir} {tf} → **EXIT** executado (id={id})
  - Evidência técnica: {pattern-validator verdict + sinal principal que motivou}
  - Macro: {news-hunter bias se invocado; "não invocado" caso contrário}
  - Razão da decisão: {critério concreto que disparou EXIT e não HOLD}
  - Resposta da API: {HTTP status} — {resumo do corpo}

**TIGHTEN:**
- {coin} {dir} {tf} → **TIGHTEN** para {new_stop} executado (id={id})
  - Novo stop: {new_stop} (antes: {old_stop})
  - Razão do nível: {por que esse preço específico — ex: 1×ATR_TF abaixo do preço atual, nível de estrutura}
  - Condição: trade em status {status}, pattern-validator {verdict}
  - Resposta da API: {HTTP status} — {resumo do corpo}
```

- [ ] **Step 3: Verificar que "ação: `curl" não aparece mais no output format**

```bash
grep -n "ação:.*curl" ".claude/agents/leader.md"
```

Esperado: nenhuma linha retornada.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/leader.md
git commit -m "feat(leader): structured justification blocks in Phase 2 report"
```

---

### Task 4: Remover guardrails proibitivos de EXIT e TIGHTEN

**Files:**
- Modify: `.claude/agents/leader.md` — seção `## Hard guardrails — what you MUST NOT do`

- [ ] **Step 1: Localizar e remover as duas linhas proibitivas**

Encontrar e remover a linha:
```
- Do NOT execute `POST /api/trades/:id/close` directly. Output the curl command for the user to run.
```

Encontrar e remover a linha:
```
- Do NOT execute `POST /api/trades/:id/tighten-stop` directly. Output the curl command.
```

- [ ] **Step 2: Verificar que os demais guardrails estão intactos**

Ler a seção `## Hard guardrails` completa e confirmar que as seguintes proibições ainda existem:
- `Do NOT approve any candidate with timeframe ∈ {5m, 30m}`
- `Do NOT call POST /api/trades/open if slots_available <= 0`
- `Do NOT call POST /api/trades/open without BOTH sub-agents`
- `Do NOT pass coin with a USDT suffix`
- `Do NOT invent candidates outside the array returned by /api/scan/preview`
- `Do NOT call Bybit's REST API for anything except read-only kline data`
- `Do NOT exceed ~1500 words in the final report`

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/leader.md
git commit -m "feat(leader): remove output-only guardrails for close and tighten-stop"
```

---

### Task 5: Verificação final

**Files:**
- Read: `.claude/agents/leader.md`

- [ ] **Step 1: Verificar cobertura dos três critérios de sucesso**

Ler o arquivo completo e confirmar:

1. **Autonomia EXIT:** a Phase 2 contém `curl -s -X POST http://localhost:3001/api/trades/{id}/close` como chamada direta (não como output para o usuário).
2. **Autonomia TIGHTEN:** a Phase 2 contém `curl -s -X POST http://localhost:3001/api/trades/{id}/tighten-stop` como chamada direta com body `{"new_stop": <computed_price>}`.
3. **Justificativas estruturadas:** o output format da Phase 2 contém blocos com `Evidência técnica`, `Macro`, `Razão da decisão`, e `Resposta da API` para EXIT; `Novo stop`, `Razão do nível`, `Condição`, e `Resposta da API` para TIGHTEN; `Pattern-validator` e `Razão` para HOLD.

- [ ] **Step 2: Confirmar que Phase 1 e Phase 3 não foram alteradas**

```bash
grep -n "Phase 1\|Phase 3\|Reflexão\|Novos candidatos" ".claude/agents/leader.md"
```

Confirmar que as seções aparecem normalmente.

- [ ] **Step 3: Confirmar que o backend não precisa de mudanças**

Os endpoints `POST /api/trades/:id/close` e `POST /api/trades/:id/tighten-stop` já existem no backend. Verificar:

```bash
grep -rn "router.post.*close\|router.post.*tighten" backend/routes/trades.js
```

Esperado: ambas as rotas aparecem.

- [ ] **Step 4: Commit final se houver qualquer ajuste residual**

```bash
git add .claude/agents/leader.md
git commit -m "chore(leader): final review — no changes needed"
```

(Pular se nenhum ajuste foi necessário.)
