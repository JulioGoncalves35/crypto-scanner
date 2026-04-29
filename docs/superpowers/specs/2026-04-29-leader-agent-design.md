# Leader Agent — Design Spec

> Status: Approved design (2026-04-29). Implementation plan to be written next.
> Foco do agente: gestão de risco e automação inteligente de estratégias para um mercado altamente volátil que exige decisões rápidas baseadas em dados reais.

---

## 1. Contexto & motivação

O backend do crypto-scanner roda em cron a cada 15min e auto-abre trades quando um setup passa `min_score` + filtro macro BTC + risk cap. Resultado acumulado: 138 trades, WR 3.6%, P&L -$39.39 sobre $1000 inicial. Os filtros determinísticos não são suficientes — falta uma camada de julgamento que combine análise técnica fina, contexto de notícias/macro e memória de erros passados.

Já existem dois sub-agentes Claude Code (Haiku 4.5) em `.claude/agents/`: **news-hunter** (contexto macro com verificação estrita de fontes) e **pattern-validator** (auditoria técnica + score recalibration). Eles foram validados manualmente em dois trades reais (AVAX 15m, AAVE 4h) e cada um produziu findings concretos que o scanner sozinho não pegou.

O **Leader** é o terceiro componente do council: ele orquestra os sub-agentes, decide o que entra na conta, revisa trades ativos, e gera reflexões que persistem como memória subjetiva acumulada. Esta primeira fase é **estudo manual** — Leader roda como Claude Code subagent invocado pelo usuário.

---

## 2. Decisões arquiteturais (ADRs resumidas)

| # | Decisão | Alternativa rejeitada | Razão |
|---|---|---|---|
| 1 | Claude Code subagent manual | Agent SDK autônomo no backend | Estudo primeiro; promover pra autônomo só depois de validar valor |
| 2 | Gatekeeper (backend não auto-abre mais) | Revisor (overlay informativo) | WR só melhora se Leader é a porta de entrada, não comentarista |
| 3 | Fresh-scan on-demand | Queue com TTL ou re-validação | Zero risco de setup zumbi; setup é sempre do agora |
| 4 | Pattern-validator → News-hunter (sequencial) | Paralelo sempre | Pattern é mais barato (Read/Grep); roda primeiro como portão |
| 5 | Veto só do pattern-validator | Veto duro de qualquer um | News-hunter informa contexto, raramente deve sozinho vetar |
| 6 | Devil's Advocate adiado | Adicionar 3º sub-agente agora | Complexidade sem ganho claro nesta fase |
| 7 | Fluxo único `/leader-review` | Comandos separados (review/scan) | Mais simples; estudo manual não precisa de granularidade |
| 8 | Ações: HOLD / EXIT / TIGHTEN | Incluir WIDEN | WIDEN fere disciplina (afrouxa stop pra "torcer trade") |
| 9 | Recomendação only (sem execução automática) | Executar fechamento direto | Estudo precisa do humano confirmando decisões |
| 10 | TFs 15m / 1h / 4h / 1D | Incluir 5m / 30m | Janela curta + paper trading 10x = stop hunt |
| 11 | max_positions = 5 | Manter 10 | Foco em qualidade; menos ruído operacional |
| 12 | Alocação fixa 2% | Sizing variável por confiança | Estudo: isolar qualidade do gate, não confundir com sizing |
| 13 | Reflexão pós-trade persistida | Stateless | Memory loop é onde está o valor de longo prazo |
| 14 | Comando separado `/leader-suggest` | Sugestões inline em `/leader-review` | Manter review enxuto, focado em decisão |
| 15 | Modelo Sonnet 4.6 pro Leader | Haiku ou Opus | Síntese requer raciocínio (deep_think no padrão TradingAgents); Sonnet equilibra |

---

## 3. Arquitetura

### 3.1 Componentes

| Componente | Estado | Papel |
|---|---|---|
| `.claude/agents/leader.md` | **NOVO** | Prompt do Leader (Sonnet 4.6). Orquestra sub-agentes, decide. |
| `.claude/agents/news-hunter.md` | Existe | Contexto macro/notícias com verificação. Voz, não voto. |
| `.claude/agents/pattern-validator.md` | Existe | Auditoria técnica + score recalibration. **Único com poder de veto.** |
| `backend/scanner.js` | **MODIFICAR** | Cron continua escaneando, deixa de chamar `openPosition`. |
| `backend/routes/scan.js` | **MODIFICAR** | Novo `POST /api/scan/preview` retorna candidatos sem abrir trade. |
| `backend/routes/trades.js` | **MODIFICAR** | Novo `POST /api/trades/open` (Leader-driven open) e `POST /api/trades/:id/tighten-stop`. |
| `backend/routes/reflections.js` | **NOVO** | `POST /api/reflections` (grava) e `GET /api/reflections?limit=N` (lê memória). |
| `backend/db.js` | **MODIFICAR** | Nova tabela `trade_reflections`; helpers `insertReflection`, `getRecentReflections`. |
| `backend/paper-trader.js` | Sem mudança | `openPosition` e `closeManualAt` permanecem; só passam a ser chamadas via API REST. |

### 3.2 Modelo do Leader

- **Modelo:** Sonnet 4.6 (`model: sonnet` no frontmatter).
- **Tools:** `Task` (invocar sub-agentes), `Bash` (curl pros endpoints locais), `Read` / `Grep` / `Glob` (inspecionar `painel-core.js` ou DB schema quando necessário).
- **Cap de output:** ~1500 palavras no relatório final. Densidade > volume.

### 3.3 Modos de operação

- `/leader-review` — fluxo único, 3 fases: reflete sobre fechados → revisa ativos → decide candidatos novos.
- `/leader-suggest` — relatório de melhorias pro scanner. Esta spec foca em `/leader-review`; `/leader-suggest` será desenhado em spec separada após primeiros 30 dias de coleta.

---

## 4. Fluxo de dados — `/leader-review`

```
Usuário invoca Leader em sessão Claude Code
  │
  ▼
Leader inicia. Lê estado:
  ├── GET /api/trades/active                       (ativos atuais)
  ├── GET /api/trades?status=closed&since={lastReflectionAt}
  │                                                (fechados desde última reflexão)
  ├── GET /api/account                             (capital, alloc_pct, max_positions)
  └── GET /api/reflections?limit=20                (memória subjetiva acumulada)

  │
  ▼
─── FASE 1 — REFLEXÃO ───
Para cada trade fechado novo (status ∈ {m3, stop, stopped_at_entry, expired, manual}):
  • Leader gera 2–3 frases interpretando: o que decidiu, por quê, o que aconteceu, lição.
  • POST /api/reflections {trade_id, reflection_text, lesson_tag}

  │
  ▼
─── FASE 2 — REVISÃO DE ATIVOS ───
Para cada trade ativo (até 5):
  1. Lê analysis_json do trade (já tem indicadores, padrões, MTF context).
  2. Fetch candles atualizados do TF do trade (usa Bash + curl pra Bybit, ou endpoint backend se exposto).
  3. Invoca pattern-validator com setup atualizado + candles recentes.
  4. Se pattern-validator retornar SUSPECT ou REJECT, OU se preço já se moveu ≥50% da distância pro stop → invoca news-hunter pra contexto recente.
  5. Decide: HOLD | EXIT | TIGHTEN.
  6. Devolve recomendação textual com sugestão de comando curl pra executar (não executa).

  │
  ▼
─── FASE 3 — NOVOS CANDIDATOS ───
1. POST /api/scan/preview                         (scan fresh, sem abrir trade)
2. Filtra candidatos: tf ∈ {15m, 1h, 4h, 1D}, ignora 5m e 30m.
3. Filtra: countActivePositions() < 5.
4. Ordena por score desc.
5. Para cada candidato (até preencher slots disponíveis):
     a. Invoca pattern-validator com setup completo.
     b. Se verdict=REJECT ou [SCORE RECALIBRATION] delta < -15 → log + skip.
     c. Senão → invoca news-hunter.
     d. Aprova se: pattern ∈ {VALID, SUSPECT} AND news bias não fortemente contrário à direção.
     e. Aprovado → POST /api/trades/open {setup}.
     f. Após preencher (5 - countActivePositions()) slots, restantes vão pra "watchlist" no relatório.

  │
  ▼
Leader entrega RELATÓRIO MARKDOWN final.
```

---

## 5. Prompt do Leader (`.claude/agents/leader.md`)

### 5.1 Frontmatter

```yaml
---
name: leader
description: Council leader — orchestrates news-hunter and pattern-validator,
  decides which scanner candidates open as paper trades, reviews active trades
  (HOLD/EXIT/TIGHTEN), and produces post-trade reflections that accumulate as
  subjective memory. Recommendation-only — never executes trades directly.
model: sonnet
tools: Task, Read, Bash, Grep, Glob
---
```

### 5.2 Seções obrigatórias

1. **Identidade & job único.** Síntese, decisão, recomendação. Nunca executa fechamento. Nunca abre/fecha trade direto na DB. Nunca chama Bybit. Tudo via endpoints locais do backend (`http://localhost:3001`).

2. **Princípios de operação (4 ancoradas):**
   - **Disciplina sobre desejo:** nunca afrouxa stop, nunca racionaliza setup ruim. Scanner já filtrou; sub-agentes auditaram; aprovações ruins serão registradas na próxima reflexão.
   - **Pattern-validator tem veto. News-hunter tem voz, não voto.**
   - **Frescor não-negociável:** setup com mais de 1 vela do TF sem reanálise = sem ação.
   - **Capital fixo:** 2% por trade sempre. Não negocia sizing.

3. **Fluxo de execução em 3 fases** (espelha §4 desta spec).

4. **Como invocar sub-agentes — exemplo:**
   ```
   Task(subagent_type: "pattern-validator", prompt: """
     Audit this setup:
     {setup_json}

     Recent candles (last 50, TF=15m):
     {candles_array}

     Return your standard report.
   """)
   ```

5. **Regra de agregação (formal):**
   ```
   APPROVE if:
     pattern_validator.verdict ∈ {VALID, SUSPECT}
     AND news_hunter.bias not strongly contrary to direction
         (i.e. not BEARISH for LONG, not BULLISH for SHORT)
     AND pattern_validator [SCORE RECALIBRATION] delta >= -15

   REJECT otherwise. Always log the disqualifying agent + reason.
   ```

6. **Reflexão pós-trade — formato fixo:**
   ```
   {coin} {direction} {tf} | {result} | {pnl}
   - O que decidi: <aprovei / rejeitei / esperei>
   - Por quê (na hora): <justificativa breve da decisão original>
   - O que aconteceu: <o setup respeitou ou não a tese>
   - Lição: <1 frase prática pra próxima decisão similar>
   ```
   Salva via `POST /api/reflections` com `lesson_tag` curto (ex: `counter-trend-15m`, `news-blindspot`) pra dedup futuro.

7. **Output final — relatório markdown estruturado:**
   ```
   # Leader Review — {timestamp}

   ## 🧠 Reflexões registradas ({N})
   ...

   ## 🔍 Trades ativos ({N})
   - {coin} {dir} {tf} → **HOLD** — <razão 1 linha>
   - {coin} {dir} {tf} → **EXIT** — <razão> · ação: `curl -X POST http://localhost:3001/api/trades/{id}/close`
   - {coin} {dir} {tf} → **TIGHTEN** — sugerir mover stop para {price} · ação: `curl -X POST http://localhost:3001/api/trades/{id}/tighten-stop -d '{"new_stop":{price}}'`

   ## ✅ Aprovados ({N}/5 slots)
   - {coin} {dir} {tf} score={N} · pattern={verdict} · news={bias} → ABERTO

   ## ❌ Rejeitados ({N})
   - {coin} {dir} {tf} score={N} → motivo (qual sub-agente, qual regra)

   ## 👀 Watchlist (acima de 5 slots disponíveis)
   - {coin} {dir} {tf} score={N} → próximo a entrar se slot abrir

   ## 💡 Sugestões para próximo /leader-suggest
   *(opcional, 1–2 bullets se algo se destacou hoje)*
   ```

8. **Guardrails — o que o Leader NÃO pode fazer:**
   - Não fechar trade sem o usuário confirmar (só recomenda).
   - Não aprovar TFs ∈ {5m, 30m}.
   - Não aprovar se já há 5 trades ativos.
   - Não aprovar se `MAX_STOP_RISK_MULTIPLIER` (50%) excedido (re-checa antes de chamar `/api/trades/open`).
   - Não inventar candidatos: só decide sobre o que veio do `/api/scan/preview`.
   - Não chamar Bybit direto (sempre via backend ou via `painel-core.js` se necessário pra recomputar pattern).

---

## 6. Mudanças no backend

### 6.1 `backend/scanner.js`

Linhas 193–204 hoje chamam `openPosition`. Refatorar para acumular candidatos em array e retornar:

```javascript
// runScan() return shape:
{
  candidates: Array<setup>,    // candidates that passed score + macro filter
  duration_ms: number,
  errors: string[]
}
```

`scan_log` ganha campo `candidates_json` (texto serializado da lista).

### 6.2 `backend/routes/scan.js`

```javascript
// POST /api/scan/preview — runs scan and returns candidates without opening trades
router.post('/preview', async (req, res) => {
  if (isScanRunning()) return res.status(409).json({ error: 'scan already running' });
  setScanRunning(true);
  try {
    const result = await runScan();
    res.json({ candidates: result.candidates, duration_ms: result.duration_ms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    setScanRunning(false);
  }
});
```

`/api/scan/manual` (existente) muda comportamento para alinhar: chama o mesmo `runScan` mas não abre trade. Quem abre trade passa a ser exclusivamente `/api/trades/open`.

### 6.3 `backend/routes/trades.js`

```javascript
// POST /api/trades/open — Leader-driven trade opening
router.post('/open', async (req, res) => {
  const setup = req.body;
  const trade = await openPosition(setup);
  if (!trade) return res.status(409).json({ error: 'blocked (limits or risk cap)' });
  res.json(trade);
});

// POST /api/trades/:id/tighten-stop — move stop closer (never away)
router.post('/:id/tighten-stop', async (req, res) => {
  const { id } = req.params;
  const { new_stop } = req.body;
  const trade = getTradeById(id);
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  if (['stop', 'stopped_at_entry', 'expired', 'manual', 'm3'].includes(trade.status)) {
    return res.status(409).json({ error: 'trade not active' });
  }

  const isBuy = trade.direction === 'buy';
  const tighter = isBuy ? new_stop > trade.current_stop : new_stop < trade.current_stop;
  if (!tighter) return res.status(400).json({ error: 'stop can only be tightened, not widened' });

  updateTrade(id, { current_stop: new_stop });
  res.json({ id, new_stop });
});
```

Validação dura no servidor: mesmo que o Leader hallucinr um WIDEN, o backend rejeita.

### 6.4 `backend/db.js`

Schema:

```sql
CREATE TABLE IF NOT EXISTS trade_reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id TEXT NOT NULL,
  reflection_text TEXT NOT NULL,
  lesson_tag TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (trade_id) REFERENCES trades(id)
);

CREATE INDEX IF NOT EXISTS idx_reflections_created ON trade_reflections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflections_trade  ON trade_reflections(trade_id);
```

Migration silenciosa no startup do server (mesmo padrão do `min_score=70→85`).

Helpers exportados:
- `insertReflection({ trade_id, reflection_text, lesson_tag })` → retorna `id`.
- `getRecentReflections(limit = 20)` → array ordenado por `created_at DESC`.
- `getTradeById(id)` → row do trade (pode já existir; senão criar).

### 6.5 `backend/routes/reflections.js` (novo)

```javascript
// POST /api/reflections — Leader writes reflections
router.post('/', (req, res) => {
  const { trade_id, reflection_text, lesson_tag } = req.body;
  if (!trade_id || !reflection_text) return res.status(400).json({ error: 'missing fields' });
  const id = insertReflection({ trade_id, reflection_text, lesson_tag });
  res.json({ id });
});

// GET /api/reflections?limit=20
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(getRecentReflections(limit));
});
```

### 6.6 Account config (chamada one-shot)

Após o deploy:

```bash
curl -X POST http://localhost:3001/api/account/setup \
  -H "Content-Type: application/json" \
  -d '{"initial_capital":1000,"alloc_pct":2,"max_positions":5,"min_score":85,"leverage":10}'
```

`current_capital` não é tocado (`setupAccount` em `db.js` já preserva).

### 6.7 Fora-do-escopo desta feature

- Mudar `TIMEFRAMES_BY_MODE.both` em `painel-core.js` pra excluir 5m/30m. Afeta o frontend manual também. Leader já filtra internamente no prompt; mudança ampla fica pra spec separada.

---

## 7. Testes (Vitest)

| Suite (novo arquivo) | Cobertura |
|---|---|
| `tests/scanner-no-open.test.js` | `runScan()` retorna `{candidates}` sem chamar `openPosition`. `scan_log.candidates_json` é serializado. `paper_account.current_capital` não muda após scan. |
| `tests/routes-scan-preview.test.js` | `POST /api/scan/preview` 200 com array. Concorrência: dois preview simultâneos → segundo retorna 409. `setScanRunning(false)` no `finally` mesmo em erro. |
| `tests/routes-trades-open.test.js` | Setup válido → trade inserido + capital debitado. `max_positions` cheia → 409. Risk cap excedido → 409. |
| `tests/routes-trades-tighten.test.js` | BUY: new_stop > current_stop → 200. BUY: new_stop < current_stop → 400. SELL espelha. Trade inativo → 409. ID inexistente → 404. |
| `tests/db-reflections.test.js` | `insertReflection` grava + retorna ID. `getRecentReflections(limit)` ordena DESC. FK constraint: trade_id inexistente → erro. |

Suite atual = 342 → meta = ~365–370 passando após implementação.

Não-testável automaticamente: qualidade da decisão do Leader (é prompt LLM). Vai pela validação manual abaixo.

---

## 8. Observabilidade

**Backend:**
- `console.log('[leader-api] /api/scan/preview returned N candidates')`.
- `console.log('[leader-api] trade opened via Leader: {id}')` distingue Leader-driven do cron-driven (que deixa de existir).
- `console.log('[reflections] saved {trade_id}: {lesson_tag}')`.

**Relatório do Leader:**
- Sempre exibe contadores: trades ativos, slots ocupados/disponíveis, candidatos avaliados, sub-agent calls feitos. Dá pra rastrear custo cognitivo de cada invocação.

**Last-reflection cursor:**
- Leader, no início, lê `MAX(created_at)` em `trade_reflections`. Trades com `result_at > esse_timestamp` são os pendentes de reflexão. Sem isso, pode duplicar.

---

## 9. Critérios de "pronto" (acceptance)

Implementação considerada pronta quando todos os 6 são verificáveis:

1. Cron do scanner roda, escreve em `scan_log` com candidatos, **não abre trade**.
2. `POST /api/scan/preview` retorna candidatos. `POST /api/trades/open` abre trade quando setup válido.
3. `POST /api/trades/:id/tighten-stop` aceita stop mais apertado, rejeita mais frouxo, com testes.
4. Tabela `trade_reflections` criada via migration silenciosa no startup do server.
5. `.claude/agents/leader.md` existe, invocável via `Task(subagent_type: "leader")`. Modelo Sonnet 4.6. Ferramentas: Task, Read, Bash, Grep, Glob.
6. Suite Vitest passa (no mínimo 365 testes).

---

## 10. Validação manual (estudo, fora-do-software)

Plano de avaliação após deploy:

- **Baseline (1 semana):** rodar Leader 1–2x/dia. Comparar WR de trades aprovados vs taxa de aprovação. Avaliação contrafactual: candidatos rejeitados ficam em `scan_log`, dá pra ler candles seguintes e estimar se teriam dado lucro.
- **Sanidade:** Leader aprova 100% → virou no-op (investigar veto do pattern-validator). Aprova 0% → paranoico (afrouxar regra de agregação).
- **Reflexão útil:** após 30 trades fechados, ler reflexões em sequência. Se forem genéricas ("trade perdeu por volatilidade"), prompt precisa apertar. Se forem específicas e padrões repetem, memory loop está funcionando.

---

## 11. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Leader inventa setup que não veio do scan | Prompt enfatiza "só decide sobre o que veio do `/api/scan/preview`"; backend não tem endpoint pra abrir trade arbitrário sem setup completo. |
| Sub-agentes consomem muitos tokens | Sequential gate (pattern primeiro); Haiku nos sub-agentes; cap de palavras nos prompts existentes. |
| Reflexão duplicada inflando contexto | `lesson_tag` permite dedup; Leader prompted para não-duplicar. |
| Race condition `/api/trades/open` (slot abriu mas fechou entre preview e open) | Erro 409 retornado; Leader prompted pra reportar como "rejeitado por race", próxima invocação reavalia. |
| Usuário esquece de invocar Leader e perde oportunidades | Esperado em modo manual. Se virar problema, é o sinal pra promover Leader pra autônomo (Agent SDK no backend). |
| Setup aprovado mas preço já moveu até a chamada de `/api/trades/open` | Frescor é responsabilidade do Leader; ele invoca preview, decide rapidamente, abre. Se demora muito (>30s), prompt instrui a re-rodar preview antes do open. |

---

## 12. Pendências fora desta spec

- Devil's Advocate sub-agent — adiar até pós-validação do Leader.
- `/leader-suggest` — desenhar em spec separada após 30 dias de trades + reflexões coletadas.
- Promoção pra Leader autônomo (Agent SDK no backend, cron 24/7) — só depois que o estudo manual mostrar valor.
- Opcional: mudar `TIMEFRAMES_BY_MODE.both` em `painel-core.js` pra excluir 5m/30m no scanner inteiro.

---

## 13. Referências

- `docs/agent-council-next-steps.md` — log da exploração inicial do council.
- `.claude/agents/news-hunter.md`, `.claude/agents/pattern-validator.md` — sub-agentes existentes.
- Memória: `reference_tradingagents_repo.md` (padrão deep_think vs quick_think; memory loop pós-trade).
- `CLAUDE.md` — convenções do projeto, especialmente filtros existentes (`min_score`, macro BTC, `MAX_STOP_RISK_MULTIPLIER`).
