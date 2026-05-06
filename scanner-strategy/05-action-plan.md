# Action Plan — 90 Dias

> Cronograma concreto de execução. Use este documento para controle semanal. Cada semana tem objetivos, deliverables e definition of done.

## Filosofia do plano

- **Validação antes de SaaS.** Os primeiros 90 dias são para provar que o sistema funciona. Vender só faz sentido com track record.
- **Critérios objetivos de progresso.** Cada fase tem gate. Se não passa, repensa antes de continuar.
- **Build small, learn fast.** MVP em cada camada, não engenharia perfeita logo de cara.
- **Não comprometer trabalho atual.** Pós-produção continua sendo a fonte de renda durante toda a fase.

## Visão geral das 4 fases

| Fase | Semanas | Foco | Gate |
|------|---------|------|------|
| 1 | 1-3 | Backtest rigoroso do scanner atual | Scanner tem edge mensurável? |
| 2 | 4-6 | Implementação dos agentes | Sistema completo end-to-end roda? |
| 3 | 7-10 | Paper trading + iteração | Métricas atingem critérios go/no-go? |
| 4 | 11-13 | Decisão e plano de continuação | Produto, pivote, ou desistência |

---

## FASE 1: Backtest Rigoroso (Semanas 1-3)

### Objetivo
Provar (ou desprovar) que o scanner atual tem edge real, sem agentes, com metodologia rigorosa.

### Por que primeiro
Se o scanner base não tem edge, agentes não vão consertar. Adicionar inteligência sobre ruído amplifica ruído. Melhor descobrir agora.

### Semana 1: Setup e dados

**Objetivos:**
- Ambiente de backtest configurado
- Dados históricos baixados e validados
- Estrutura de código pronta

**Tarefas:**
- [ ] Criar repositório `scanner-backtest` separado do scanner atual
- [ ] Setup Python 3.12, poetry/uv, dependencies (vectorbt, pandas, numpy, ccxt)
- [ ] Implementar `data/fetcher.py` que baixa OHLCV de Bybit via API
- [ ] Implementar `data/cache.py` que salva em parquet local (não bater API toda vez)
- [ ] Implementar `data/validator.py` que checa: gaps, outliers, dados inconsistentes
- [ ] Baixar 3 anos de dados (2023-2026) para top 20 pares por liquidez na Bybit perpétuos
- [ ] Validar dados (sem gaps significativos, volumes coerentes)

**Deliverable:** notebook/script que baixa, valida e cacheia dados de qualquer par/timeframe.

**Definition of Done:** consigo carregar 3 anos de OHLCV de qualquer par em < 2 segundos do cache local.

---

### Semana 2: Cost model e strategy implementation

**Objetivos:**
- Modelo de custo realista implementado
- Scanner atual portado para função compatível com VectorBT
- Primeira passada de backtest naive (sem walk-forward)

**Tarefas:**
- [ ] Implementar `costs/fees.py` com taxas Bybit reais
- [ ] Implementar `costs/slippage.py` com modelo proporcional à volatilidade
- [ ] Implementar `costs/funding.py` com histórico real de funding rates
- [ ] Portar lógica do scanner atual para função `strategy(data, params) -> signals`
- [ ] Rodar backtest naive em 2024-2025 BTC para sanity check
- [ ] Validar: signals do backtest batem com signals do scanner em produção?

**Deliverable:** strategy function + cost model.

**Definition of Done:** consigo rodar `backtest(strategy, data, costs)` e gerar curva de equity em segundos.

⚠️ **Atenção:** se nessa primeira passada naive os resultados parecem fantásticos (Sharpe > 3, drawdown < 5%), provavelmente tem look-ahead bias. Investigue.

---

### Semana 3: Walk-forward + análise

**Objetivos:**
- Walk-forward engine implementado
- Backtest completo com todas as métricas
- Decisão sobre o gate da Fase 1

**Tarefas:**
- [ ] Implementar walk-forward engine (`walkforward/engine.py`) conforme spec
- [ ] Janelas: train 180d, val 60d, step 60d
- [ ] Otimização de parâmetros (apenas em train, validação só em val)
- [ ] Computar TODAS as métricas do `02-backtest-spec.md`
- [ ] Implementar benchmarks: Buy-Hold BTC, DCA, Delta-Neutral
- [ ] Rodar walk-forward completo em todos os pares
- [ ] Gerar report HTML/PDF com gráficos e tabelas

**Deliverable:** report completo do scanner base.

**🚦 GATE 1 (final da Semana 3):**

Avalie contra critérios MUST PASS:
- [ ] Sharpe ≥ 1.5 agregado?
- [ ] Max Drawdown ≤ 25%?
- [ ] Profit Factor ≥ 1.8?
- [ ] Bate Buy-Hold BTC em Sharpe?
- [ ] Bate delta-neutral em retorno absoluto E Sharpe?
- [ ] 70% das validation windows com performance positiva?
- [ ] Out-of-sample não mais que 30% pior que in-sample?

**Resultado:**
- ✅ **Todos passam:** avança para Fase 2
- ⚠️ **Alguns falham:** repensa o scanner. Valor adicionar agentes nesse caso é baixo. Considera:
  - Refinar filtros de setup do scanner
  - Reduzir frequência (menos trades, mais qualidade)
  - Pivotar para estratégia delta-neutra
- ❌ **Vários falham:** scanner não tem edge. Avaliar pivote para SaaS de outro tipo (ferramentas, educação) ou outro caminho profissional

---

## FASE 2: Implementação dos Agentes (Semanas 4-6)

### Objetivo
Construir a camada multi-agente sobre o scanner. Sistema end-to-end funcionando com mock data primeiro, depois data real.

### Pré-requisito
Ter passado o Gate 1.

### Semana 4: Setup LangGraph e Context Agent

**Objetivos:**
- Stack do agentes configurada
- Context Agent funcional com data sources reais
- Audit trail básico em Postgres

**Tarefas:**
- [ ] Setup LangGraph, LangSmith (free tier), Postgres
- [ ] Implementar `TradingState` schemas (TypedDict)
- [ ] Implementar `audit_log_node` (escreve no Postgres)
- [ ] Implementar Context Agent:
  - [ ] Tool: fetch funding rate da Bybit
  - [ ] Tool: fetch open interest changes
  - [ ] Tool: fetch news (CryptoPanic API)
  - [ ] Tool: fetch sentiment (LunarCrush ou Santiment trial)
  - [ ] Tool: fetch on-chain (Glassnode trial ou CryptoQuant)
  - [ ] LLM synthesis com Haiku 4.5
- [ ] Tests unitários do Context Agent

**Deliverable:** Context Agent rodando isoladamente, com data real.

**Definition of Done:** dado um signal de scanner, retorna ContextEnrichment populado em < 10 segundos, custo < $0.01.

---

### Semana 5: Risk Manager + Macro Veto

**Objetivos:**
- Risk Manager Agent funcional
- Macro Veto Agent funcional

**Tarefas:**
- [ ] Implementar Risk Manager Agent:
  - [ ] Cálculos determinísticos (sizing, stop, R:R)
  - [ ] Integration com estado do portfólio (mock por enquanto)
  - [ ] Calculation de correlation com posições existentes
  - [ ] LLM sanity check com Sonnet 4.6
- [ ] Implementar Macro Veto Agent:
  - [ ] Tool: fetch economic calendar (TradingEconomics API ou ForexFactory scraping)
  - [ ] Tool: fetch crypto-specific events (CoinMarketCal API)
  - [ ] Tool: fetch DVOL/IV
  - [ ] LLM news analysis com Haiku 4.5
- [ ] Tests unitários para ambos

**Deliverable:** 3 agentes prontos.

**Definition of Done:** cada agente roda em < 15s, custos dentro do esperado.

---

### Semana 6: Devil's Advocate + Final Decision + Graph

**Objetivos:**
- Sistema completo end-to-end funcionando
- Audit trail completo
- Observability ativa

**Tarefas:**
- [ ] Implementar Devil's Advocate Agent:
  - [ ] Query histórico de setups similares (do Postgres)
  - [ ] LLM bear case analysis com Sonnet 4.6
- [ ] Implementar Final Decision Node:
  - [ ] Lógica determinística (vetos, cutoffs)
  - [ ] LLM consolidation para casos limite
- [ ] Implementar `execute_order_node` (em paper trading mode primeiro)
- [ ] Construir o LangGraph completo conforme `03-agents-architecture.md`
- [ ] Setup LangSmith tracing
- [ ] Implementar dashboard básico (Streamlit ou similar) para visualizar audit trail
- [ ] End-to-end test: scanner gera signal → graph processa → audit log

**Deliverable:** sistema multi-agente completo, ainda em paper trading.

**🚦 GATE 2 (final da Semana 6):**

- [ ] Graph processa signal completo em < 60 segundos?
- [ ] Custo médio por decisão < $0.10?
- [ ] Audit trail tem todos os campos preenchidos?
- [ ] Tracing no LangSmith funciona?
- [ ] Sistema é estável (não crasha, lida com errors graciosamente)?

**Resultado:**
- ✅ **Tudo OK:** avança para Fase 3
- ⚠️ **Latência ou custo alto:** otimiza antes de avançar (paralelize agents, cache contexto, reduz prompts)
- ❌ **Sistema instável:** debug profundo. Não avance com sistema frágil

---

## FASE 3: Paper Trading + Iteração (Semanas 7-10)

### Objetivo
Rodar o sistema completo em paper trading e validar que as métricas atingem os critérios go/no-go.

### Pré-requisito
Ter passado os Gates 1 e 2.

### Semana 7-8: Paper trading inicial + iteração

**Objetivos:**
- Sistema rodando 24/7 em paper trading
- Coleta de dados real comportamento
- Identificação de bugs e edge cases

**Tarefas:**
- [ ] Deploy do sistema em servidor (Railway, Hetzner, ou VPS)
- [ ] Setup monitoring (Sentry, Grafana)
- [ ] Conectar ao scanner em produção (recebe signals em tempo real)
- [ ] Sistema processa todos os signals → audit log
- [ ] Daily review: o que o sistema decidiu vs o que o mercado fez
- [ ] Identificar e corrigir bugs
- [ ] Iterar prompts dos agentes baseado em outputs reais
- [ ] Pelo menos 2 ciclos de melhoria nos prompts

**Deliverable:** sistema operando 24/7 em paper, com dashboard de performance.

**Métricas a observar (informativas, não decisivas ainda):**
- Quantos signals por dia o scanner gera?
- Quantos passam por todos os agentes?
- Quantos viram trade (executed = True)?
- Latência média end-to-end
- Custo diário de LLM

---

### Semana 9-10: Análise rigorosa + decisão

**Objetivos:**
- Acumular pelo menos 4 semanas de dados
- Análise estatística completa
- Decisão go/no-go final

**Tarefas:**
- [ ] Computar todas as métricas do `02-backtest-spec.md` em dados live
- [ ] Comparar com benchmarks (BTC HODL, delta-neutral) na mesma janela
- [ ] Análise por agente: quais vetos foram corretos? Quais erros foram custosos?
- [ ] Análise por regime: como o sistema performa em bull vs sideways vs bear?
- [ ] Análise de devil's advocate: as preocupações dele se materializaram?

**🚦 GATE 3 (final da Semana 10):**

Avalie contra critérios MUST PASS no live (não backtest):

- [ ] Sharpe ≥ 1.5 ajustado pelo período curto?
- [ ] Max Drawdown ≤ 25% durante o período?
- [ ] Profit Factor ≥ 1.8?
- [ ] Bate Buy-Hold BTC no período?
- [ ] Bate delta-neutral no período?
- [ ] Trades suficientes para significância (mínimo 50)?

**⚠️ Atenção:** 4 semanas é janela curta. Resultados são informativos, não definitivos.

**Resultado:**
- ✅ **Métricas sólidas:** Fase 4 = preparação para SaaS
- ⚠️ **Métricas medianas:** estende paper trading mais 4-8 semanas antes de qualquer monetização
- ❌ **Métricas ruins:** repensa. Pode ser:
  - Bug no sistema (debug)
  - Regime de mercado desfavorável (espera mais tempo)
  - Sistema fundamentalmente sem edge (pivote)

---

## FASE 4: Decisão e Caminho à Frente (Semanas 11-13)

### Cenário A: Sistema funciona — preparação SaaS

**Pré-requisito:** Gates 1, 2 e 3 passados.

#### Semana 11: Validação adicional + setup legal

**Tarefas:**
- [ ] Continua paper trading (cumulativo será o seu track record vendável)
- [ ] Setup empresa (LTDA brasileira ou começa pesquisa de offshore)
- [ ] Stripe Atlas se for offshore, ou conta PJ para Stripe BR
- [ ] Domínio + branding básico
- [ ] Templates legais (Terms of Service, Privacy Policy) — Termly ou GetTerms
- [ ] LinkedIn/Twitter buildup (postar análises do sistema)

#### Semana 12: MVP do produto

**Tarefas:**
- [ ] Landing page simples (Webflow, Framer, ou Next.js)
- [ ] Página de track record público (auto-atualizada)
- [ ] Backend de signals para users (já existe via audit DB, só expor)
- [ ] Setup Discord server (privado por enquanto)
- [ ] Sistema de waitlist com email capture
- [ ] Integração com Telegram para signal delivery (bot básico)

#### Semana 13: Beta privado

**Tarefas:**
- [ ] Convidar 10-20 pessoas próximas para beta gratuito
- [ ] Coletar feedback intensivo (calls de 30 min com cada)
- [ ] Iterar UX baseado em feedback
- [ ] Decidir pricing final
- [ ] Preparar para soft launch (primeiros payments) na semana 14+

**Deliverable Fase 4 cenário A:** beta privado rodando, 10-20 usuários, primeiro feedback validado.

---

### Cenário B: Sistema funciona parcialmente — extensão

**Pré-requisito:** Gates 1 e 2 passados, Gate 3 marginal.

#### Tarefas (Semanas 11-13):
- [ ] Continua paper trading por mais 60-90 dias
- [ ] Em paralelo, refinamentos:
  - [ ] Adiciona mais data sources ao Context Agent
  - [ ] Refina prompts dos agentes
  - [ ] Experimenta com mais pares ou pares diferentes
  - [ ] Analisa: existe um subset de setups que performa muito bem? Foca neles
- [ ] Reaplica Gate 3 ao final do período estendido

---

### Cenário C: Sistema não funciona — pivote

**Pré-requisito:** Gate 1 ou 3 falham repetidamente.

#### Opções a explorar (Semanas 11-13):

**C.1: Pivote para delta-neutra**
- Estratégia mais consistente, menor edge mas mais robusta
- Aproveita parte do código (data, costs, exchange integration)
- Aproveita agentes para selection de pares e gestão de risco
- Menos sexy mas mais lucrativo a longo prazo
- Detalhes em `00-MASTER.md` (caminho 2)

**C.2: Pivote para SaaS de ferramentas (não signals)**
- Vende a infraestrutura de análise multi-agente como serviço
- B2B para outros traders/bots
- Modelo "Risk Management as a Service" do `04-saas-roadmap.md` opção B
- Menos dependente de você ter performance própria

**C.3: Pivote para conteúdo/educação**
- Você acumulou expertise em AI agents para finance
- Course, livro, consultoria
- Use seu LinkedIn (já em construção) como base
- Reaproveita post-produção skills para conteúdo audiovisual

**C.4: Aceitar como hobby project, focar em outros caminhos**
- Continua trabalhando como Finishing Editor (London applications)
- Crypto trading vira hobby de fim de semana
- Aprendizado em AI agents → leverage em outros projetos (não em trading)

#### Tarefas se decidir pivotar:
- [ ] Documentar tudo aprendido (lessons learned para você)
- [ ] Avaliar qual pivote tem mais ROI dados seus skills + tempo disponível
- [ ] Não jogar fora código — pode ser reutilizado
- [ ] Comunicação interna: "isso era um experimento, esse foi o aprendizado"

---

## Tracking semanal

Recomendado: criar planilha (ou Notion page) com:

| Semana | Fase | Objetivo | Status | Bloqueios | Aprendizados |
|--------|------|----------|--------|-----------|--------------|
| 1 | 1 | Setup + dados | | | |
| 2 | 1 | Cost model + strategy | | | |
| ... | | | | | |

**Daily standup com você mesmo (10 min):**
- O que vou fazer hoje?
- O que conclui ontem?
- Algum bloqueio?

**Weekly review (30 min):**
- Atingi os objetivos da semana?
- O que foi mais difícil que o esperado?
- O que mudei de opinião sobre?

## Tempo estimado

- **Setup técnico:** ~10-15h/semana
- **Tempo total das 13 semanas:** ~150-200h de foco profundo
- **Compatível com pós-produção full-time** se você dedica 2h por noite + 5h no fim de semana

Se cronograma não for viável (workload alto), **estende em vez de cortar**. 90 dias virar 120 dias é OK. Pular Gates não é OK.

## Erros a não cometer

1. **Pular o backtest.** Toda a Fase 1 é tentadora de pular ("já sei que funciona"). É exatamente o passo que mata projetos.
2. **Otimizar prematuramente.** Não passa 2 semanas em prompt engineering antes do sistema rodar end-to-end.
3. **Ignorar sinais ruins.** Se o sistema mostra problemas em paper trading, não jogue dinheiro real. "Ele vai melhorar" é gambling.
4. **Adicionar features para evitar admitir que não funciona.** "Vou adicionar mais um agente" pode ser fuga.
5. **Lançar SaaS sem track record.** Mata reputação. Espera os 90 dias.
6. **Sacrificar sua principal renda.** Pós-produção paga as contas. Não comprometa até MRR > custo de vida.

## Resumo executivo do plano

```
Semana 1-3:   BACKTEST RIGOROSO → Gate 1: scanner tem edge?
Semana 4-6:   AGENTES EM LANGGRAPH → Gate 2: sistema completo OK?
Semana 7-10:  PAPER TRADING + ITERAÇÃO → Gate 3: métricas live OK?
Semana 11-13: DECISÃO (3 cenários) → SaaS / Pivote / Outro caminho
```

**Premissa fundamental:** sucesso em qualquer cenário, porque cada Gate fornece informação. Não passar um Gate não é fracasso — é evitar perda maior à frente.
