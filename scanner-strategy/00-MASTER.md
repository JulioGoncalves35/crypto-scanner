# MASTER — Estratégia do Crypto Scanner Multi-Agente

> **Documento principal.** Lê este primeiro. Os outros .md detalham cada área.

## Contexto e decisão estratégica

O objetivo final é transformar o scanner num produto SaaS vendável para traders. Para isso, o scanner precisa **funcionar de verdade primeiro** — sem track record de performance, não há produto. A sequência correta é:

1. **Validar** o scanner com backtest rigoroso e paper trading (90 dias)
2. **Refinar** com camada multi-agente focada em risk management e contexto externo
3. **Provar** com track record público e auditável (3-6 meses)
4. **Empacotar** como SaaS com posicionamento e pricing claros
5. **Vender** com base no track record validado

**O que NÃO fazer:** tentar vender um scanner que ainda não tem performance comprovada. Existem dezenas de produtos assim no mercado (Cryptohopper, 3Commas, etc.) e o diferencial só aparece com dados.

## Realidade dos dados (resumo)

- **74-89%** dos traders retail perdem dinheiro consistentemente (estudo de 27 anos, 8M traders, 295M trades)
- **84%** dos traders retail de cripto perdem no primeiro ano (pesquisa agosto/2025, n=1005)
- **97%** dos lucros institucionais vêm de trading algorítmico (dados SEBI/Índia)
- Apenas **1-3%** dos traders retail são consistentemente lucrativos
- A diferença entre profitable/unprofitable não é entry signal — é **risk management**

Detalhes em [`01-research-base.md`](01-research-base.md).

## Posicionamento da estratégia

### O scanner atual
Backend Node.js/FastAPI conectado à API Bybit, calculando RSI, MACD, EMA, Bollinger Bands, ATR, Volume Profile e suporte/resistência. Dashboard HTML (`painel.html`) com agrupamento de sinais.

### O problema fundamental
Esses indicadores estão disponíveis para todos. Não geram alpha sozinhos. O edge precisa vir de outro lugar.

### A reformulação correta
O scanner identifica **setups técnicos**. A camada multi-agente NÃO valida sinais (isso é redundante e pior em latência) — ela faz três coisas que o scanner matemático não consegue:

1. **Enriquecimento de contexto** — funding rates, fluxo on-chain, sentiment, eventos macro
2. **Gestão de risco adaptativa** — position sizing, stop-loss baseado em volatilidade e correlação, veto durante eventos de alta volatilidade
3. **Filtragem de regime** — distinguir mercado em trending vs ranging vs choppy e ajustar quais sinais aceitar

Detalhes em [`03-agents-architecture.md`](03-agents-architecture.md).

## Decisões técnicas-chave

| Decisão | Escolha | Razão |
|---------|---------|-------|
| Framework de agentes | **LangGraph** (não CrewAI) | Persistência de estado nativa, observability via LangSmith, controle determinístico, usado em produção por BlackRock e JPMorgan |
| Horizonte temporal | **Swing trading (3-14 dias)** | LLMs têm latência de 500ms-3s por chamada; multi-agente roda em 10-60s. Inadequado para intraday em perpétuos voláteis |
| Função dos agentes | **Risk + contexto, não validação** | Validação redundante adiciona ruído e conformity bias. Risk management é onde está a alavanca real |
| Modelo LLM | **Claude Sonnet 4.6 + Haiku 4.5** | Sonnet para decisões críticas, Haiku para enriquecimento rápido. Custos controlados |
| Persistência | **PostgreSQL + Redis** | Postgres para histórico de decisões e audit trail, Redis para state cache de baixa latência |

## Métricas de sucesso (Go/No-Go)

Após 90 dias de paper trading com o sistema completo, o scanner só avança para capital real se:

- **Sharpe Ratio ≥ 1.5** (idealmente > 2.0)
- **Max Drawdown ≤ 25%**
- **Profit Factor ≥ 1.8**
- **Win Rate ≥ 45%** (pode ser baixo se R:R for alto)
- **Resultado bate buy-and-hold BTC ajustado por risco**
- **Resultado bate estratégia delta-neutra simples** (funding rate arbitrage como benchmark)

Se não bater esses critérios, **pivotar** para um dos caminhos alternativos discutidos no SaaS roadmap ou para estratégia delta-neutra.

Detalhes em [`02-backtest-spec.md`](02-backtest-spec.md) e [`05-action-plan.md`](05-action-plan.md).

## Estrutura dos documentos

| Arquivo | Conteúdo | Quando ler |
|---------|----------|------------|
| `00-MASTER.md` | Este arquivo. Visão geral e decisões | Primeiro, e sempre que precisar reorientar |
| `01-research-base.md` | Findings da pesquisa, papers, estatísticas | Quando questionar uma decisão |
| `02-backtest-spec.md` | Spec completo do backtest rigoroso | Antes de validar performance |
| `03-agents-architecture.md` | Arquitetura LangGraph dos agentes | Ao implementar a camada de IA |
| `04-saas-roadmap.md` | Plano para transformar em produto | Após validação técnica |
| `05-action-plan.md` | Cronograma de 90 dias | Para execução semana a semana |

## Princípios não-negociáveis

1. **Sem cherry-picking.** Backtest em janelas múltiplas, walk-forward, out-of-sample. Não selecionar o resultado bom.
2. **Custos realistas.** Sempre incluir taxas Bybit (0.055% taker, 0.02% maker), slippage estimado (0.05-0.1%), funding rates pagos.
3. **Critérios de saída claros.** Se as métricas não baterem em 90 dias, pivotar. Sunk cost é armadilha.
4. **Audit trail completo.** Todo trade decidido pelos agentes precisa ser rastreável: qual agente decidiu o quê, com qual contexto, com qual confidence.
5. **Paper trading antes de capital real.** Sempre. Mínimo 60 dias.
6. **Capital pequeno no início.** Ao migrar para real, começar com 5-10% do capital tolerável de perda. Escalar gradualmente baseado em performance.
7. **Não rodar à toa.** Se o sistema não tem sinal de qualidade, não opera. Underexposure é melhor que overtrading.

## Como usar este conjunto no Claude Code

Coloca esses .md numa pasta `/scanner-strategy/` na raiz do projeto. No Claude Code:

```
@scanner-strategy/00-MASTER.md
```

Para tarefas específicas, referenciar o arquivo relevante:

- "Implementa o backtest conforme `@scanner-strategy/02-backtest-spec.md`"
- "Cria a arquitetura LangGraph descrita em `@scanner-strategy/03-agents-architecture.md`"
- "Estamos na semana 3 do `@scanner-strategy/05-action-plan.md`, executa as próximas tarefas"
