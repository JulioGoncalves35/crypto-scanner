# Arquitetura dos Agentes — LangGraph

> Esta é a arquitetura concreta da camada multi-agente que vai sobre o scanner. Implementação em Python com LangGraph.

## Princípios da arquitetura

1. **Agentes ENRIQUECEM, não validam** — o scanner já decide se há setup técnico. Os agentes adicionam contexto que o scanner não consegue calcular.
2. **Determinístico onde possível** — fluxos óbvios (ex.: "se ATR > X, posição menor") não precisam de LLM. Salva custo e latência.
3. **Stateful e auditável** — todo trade decidido tem trail completo: qual agente disse o quê, com qual contexto, com qual nível de confidence.
4. **Veto fácil, aprovação difícil** — qualquer agente pode vetar um trade. Aprovação requer concordância de múltiplos.
5. **Custo controlado** — Sonnet 4.6 só onde precisa, Haiku 4.5 para tarefas simples, lógica determinística onde possível.

## Visão geral do fluxo

```
                    [Scanner detecta setup]
                              │
                              ▼
                    ┌─────────────────┐
                    │ Orchestrator    │  ← LangGraph state machine
                    │ (entry point)   │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Context      │    │ Risk         │    │ Macro Veto   │
│ Agent        │    │ Manager      │    │ Agent        │
│              │    │ Agent        │    │              │
│ - Funding    │    │ - Sizing     │    │ - FOMC dates │
│ - On-chain   │    │ - Stop-loss  │    │ - CPI        │
│ - Sentiment  │    │ - Correlation│    │ - News flow  │
│              │    │              │    │ - Vol regime │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       └─────────┬─────────┴───────────────────┘
                 ▼
        ┌─────────────────┐
        │ Devil's         │  ← LLM agent: tenta achar contra-argumentos
        │ Advocate        │
        └────────┬────────┘
                 ▼
        ┌─────────────────┐
        │ Final Decision  │  ← Consolida e gera ordem (ou veto)
        │ Node            │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Order Execution │  ← Bybit API, com validation layer
        └────────┬────────┘
                 ▼
        ┌─────────────────┐
        │ Audit Logger    │  ← Postgres: full trail
        └─────────────────┘
```

## Estado compartilhado (TradingState)

Todo agente lê e escreve para um state dict tipado:

```python
from typing import TypedDict, List, Optional, Literal
from datetime import datetime
from decimal import Decimal

class ScannerSignal(TypedDict):
    """Output do scanner base."""
    timestamp: datetime
    symbol: str  # ex: "BTCUSDT"
    direction: Literal["long", "short"]
    entry_price: Decimal
    stop_suggested: Decimal
    target_suggested: Decimal
    indicators: dict  # RSI, MACD, EMA, BB, ATR, VP, S/R values
    setup_type: str  # ex: "rsi_oversold_bb_lower", "macd_bullish_cross"
    confidence_raw: float  # 0-1, confidence do scanner

class ContextEnrichment(TypedDict):
    funding_rate_current: float
    funding_rate_8h_avg: float
    funding_extreme: bool  # True se está em territory de overcrowded
    open_interest_change_24h: float
    sentiment_score: float  # -1 a 1
    sentiment_sources: List[str]
    news_relevant: List[dict]
    onchain_signals: dict  # exchange flows, whale moves, etc.

class RiskAssessment(TypedDict):
    position_size_usd: Decimal
    position_size_pct_equity: float
    leverage: float
    stop_loss_price: Decimal
    take_profit_price: Decimal
    risk_reward_ratio: float
    max_loss_usd: Decimal
    correlation_with_existing: float  # com posições atuais
    portfolio_heat: float  # exposição total atual

class MacroVeto(TypedDict):
    veto: bool
    reasons: List[str]
    upcoming_events: List[dict]
    volatility_regime: Literal["low", "normal", "high", "extreme"]

class DevilAdvocateAnalysis(TypedDict):
    counter_arguments: List[str]
    bear_case: str  # ou bull_case se for short
    historical_failure_modes: List[str]
    confidence_in_failure: float  # 0-1

class FinalDecision(TypedDict):
    execute: bool
    reasoning: str
    consolidated_confidence: float
    order_params: Optional[dict]
    rejected_reasons: Optional[List[str]]

class TradingState(TypedDict):
    """State global passado entre agentes."""
    # Input
    signal: ScannerSignal
    
    # Filled by agents
    context: Optional[ContextEnrichment]
    risk: Optional[RiskAssessment]
    macro: Optional[MacroVeto]
    devils_advocate: Optional[DevilAdvocateAnalysis]
    decision: Optional[FinalDecision]
    
    # Metadata
    request_id: str
    started_at: datetime
    agent_durations: dict  # tempo de cada agente
    agent_costs: dict  # custo USD de cada agente
    errors: List[dict]
```

## Os 5 agentes (em ordem de execução)

### 1. Context Agent — Enriquecimento Externo

**Objetivo:** trazer informações que o scanner matemático não calcula.

**Modelo:** Claude Haiku 4.5 (tarefa de síntese, não decisão crítica)

**Inputs:**
- ScannerSignal
- Funding rate atual e histórico (Bybit API)
- Open interest changes (Bybit API)
- News headlines últimas 6h (CryptoPanic API ou similar)
- Sentiment de Twitter/Reddit (Santiment, LunarCrush, ou scraping próprio)
- On-chain signals (Glassnode, CryptoQuant — exchange flows, whale moves)

**Output:** ContextEnrichment

**Lógica:**
- Coleta dados via tools (não LLM)
- LLM apenas sintetiza: "qual a narrativa atual desse ativo?"
- Identifica red flags (funding extremo, news negativa, whale dump)

**Custo estimado:** ~$0.005 por chamada

**Pseudo-código:**

```python
def context_agent(state: TradingState) -> TradingState:
    signal = state["signal"]
    
    # Coleta determinística (não LLM)
    funding = fetch_funding_history(signal["symbol"])
    oi_change = fetch_oi_change(signal["symbol"])
    news = fetch_recent_news(signal["symbol"], hours=6)
    sentiment = fetch_sentiment(signal["symbol"])
    onchain = fetch_onchain_signals(signal["symbol"])
    
    # LLM apenas para síntese
    synthesis_prompt = f"""
    You are a crypto market analyst. Given the following data for {signal['symbol']}:
    - Funding: {funding}
    - OI change 24h: {oi_change}
    - Recent news: {news}
    - Sentiment: {sentiment}
    - On-chain: {onchain}
    
    Provide:
    1. Current narrative (1 sentence)
    2. Red flags for a {signal['direction']} entry (list)
    3. Tailwinds for the entry (list)
    4. Sentiment score -1 to 1
    
    Be concise. Output JSON.
    """
    
    synthesis = haiku.invoke(synthesis_prompt)
    
    state["context"] = {
        "funding_rate_current": funding["current"],
        "funding_rate_8h_avg": funding["avg_8h"],
        "funding_extreme": abs(funding["current"]) > 0.001,  # 0.1% threshold
        "open_interest_change_24h": oi_change,
        "sentiment_score": synthesis["sentiment_score"],
        "sentiment_sources": [...],
        "news_relevant": [n for n in news if n["relevance"] > 0.5],
        "onchain_signals": onchain,
    }
    return state
```

### 2. Risk Manager Agent — Sizing e Stop-Loss

**Objetivo:** decidir o tamanho da posição e os stops baseado em volatilidade, correlação e estado do portfólio.

**Modelo:** Claude Sonnet 4.6 (decisão importante, vale o custo)

**Inputs:**
- ScannerSignal
- ContextEnrichment (funding extremo afeta sizing)
- Estado atual do portfólio (posições abertas, drawdown atual, equity)
- Configuração de risk do usuário (max risk per trade, max heat, etc.)

**Output:** RiskAssessment

**Lógica principal (parcialmente determinística):**

```python
def risk_manager_agent(state: TradingState) -> TradingState:
    signal = state["signal"]
    context = state["context"]
    portfolio = get_current_portfolio()
    config = get_user_risk_config()
    
    # Cálculos determinísticos primeiro
    atr = signal["indicators"]["atr"]
    stop_distance = max(
        atr * 1.5,  # mínimo: 1.5x ATR
        abs(signal["entry_price"] - signal["stop_suggested"])
    )
    
    # Position sizing: risk-based
    max_loss_per_trade = portfolio["equity"] * config["risk_per_trade"]  # ex: 1%
    position_size_usd = max_loss_per_trade / (stop_distance / signal["entry_price"])
    
    # Ajustes
    # 1. Reduz se funding extremo (alta probabilidade de squeeze)
    if context["funding_extreme"]:
        position_size_usd *= 0.5
    
    # 2. Reduz se correlation alta com posições existentes
    correlation = calculate_correlation_with_portfolio(signal["symbol"], portfolio)
    if correlation > 0.7:
        position_size_usd *= (1 - correlation)
    
    # 3. Reduz se drawdown atual alto
    current_dd = portfolio["current_drawdown"]
    if current_dd > 0.10:  # drawdown > 10%
        position_size_usd *= 0.5
    
    # 4. Cap por portfolio heat total
    current_heat = portfolio["total_risk_exposure"]
    available_heat = config["max_portfolio_heat"] - current_heat
    if max_loss_per_trade > available_heat:
        position_size_usd *= (available_heat / max_loss_per_trade)
    
    # LLM para sanity check e edge cases
    sanity_prompt = f"""
    You are a senior risk manager. Review this proposed trade:
    Signal: {signal}
    Context: {context}
    Calculated position size: ${position_size_usd}
    Current portfolio: {portfolio_summary}
    
    Are there any risk factors NOT captured by the deterministic logic?
    Specifically check:
    - Correlated risks not in correlation matrix
    - Tail risks based on recent news
    - Liquidity conditions
    - Time-of-day risks (low liquidity periods)
    
    Output: adjusted_size_multiplier (0-1), reasoning, additional_warnings
    """
    
    llm_review = sonnet.invoke(sanity_prompt)
    final_size = position_size_usd * llm_review["adjusted_size_multiplier"]
    
    state["risk"] = {
        "position_size_usd": final_size,
        "position_size_pct_equity": final_size / portfolio["equity"],
        "leverage": calculate_leverage(final_size, portfolio["margin"]),
        "stop_loss_price": signal["entry_price"] - stop_distance if signal["direction"] == "long" else signal["entry_price"] + stop_distance,
        "take_profit_price": calculate_tp(signal, stop_distance),
        "risk_reward_ratio": calculate_rr(signal, stop_distance),
        "max_loss_usd": final_size * (stop_distance / signal["entry_price"]),
        "correlation_with_existing": correlation,
        "portfolio_heat": current_heat + (final_size * stop_distance / signal["entry_price"]),
    }
    return state
```

**Custo estimado:** ~$0.015 por chamada

### 3. Macro Veto Agent — Filtro de Eventos

**Objetivo:** vetar trades durante eventos de alta incerteza ou volatilidade extrema.

**Modelo:** Claude Haiku 4.5 (lógica relativamente simples)

**Inputs:**
- Calendário econômico (FOMC, CPI, NFP, ECB)
- Calendário de cripto (token unlocks, halvings, hard forks)
- Volatility regime atual (VIX para tradfi, DVOL para BTC)
- News flow das últimas horas

**Output:** MacroVeto

**Lógica:**

```python
def macro_veto_agent(state: TradingState) -> TradingState:
    signal = state["signal"]
    now = datetime.utcnow()
    
    veto_reasons = []
    upcoming_events = []
    
    # Veto determinístico: eventos próximos
    macro_events = fetch_economic_calendar(now, hours_ahead=24)
    for event in macro_events:
        if event["importance"] == "high":
            if (event["timestamp"] - now).total_seconds() < 4 * 3600:  # 4h
                veto_reasons.append(f"High-impact event {event['name']} in {event['hours_until']}h")
            upcoming_events.append(event)
    
    # Veto por crypto-specific events
    crypto_events = fetch_crypto_calendar(signal["symbol"], now, hours_ahead=24)
    for event in crypto_events:
        if event["type"] in ["token_unlock_large", "hardfork", "regulatory_announcement"]:
            if (event["timestamp"] - now).total_seconds() < 6 * 3600:
                veto_reasons.append(f"Crypto event: {event['description']}")
    
    # Volatility regime check
    btc_dvol = fetch_dvol("BTC")
    vol_regime = classify_vol_regime(btc_dvol)
    if vol_regime == "extreme":
        veto_reasons.append(f"Extreme volatility regime (DVOL={btc_dvol})")
    
    # LLM para análise de news qualitativa
    recent_news = fetch_market_wide_news(hours=2)
    news_analysis_prompt = f"""
    Review these market-moving news from the last 2 hours:
    {recent_news}
    
    Question: should we pause trading for {signal['symbol']} in the next few hours?
    Consider: regulatory news, exchange issues, major hacks, unusual whale movements.
    
    Output: should_pause (bool), reasoning, severity (low/medium/high)
    """
    
    news_analysis = haiku.invoke(news_analysis_prompt)
    if news_analysis["should_pause"] and news_analysis["severity"] in ["medium", "high"]:
        veto_reasons.append(f"News-based veto: {news_analysis['reasoning']}")
    
    state["macro"] = {
        "veto": len(veto_reasons) > 0,
        "reasons": veto_reasons,
        "upcoming_events": upcoming_events,
        "volatility_regime": vol_regime,
    }
    return state
```

**Custo estimado:** ~$0.005 por chamada

### 4. Devil's Advocate Agent — Anti-Conformity

**Objetivo:** ativamente buscar razões para NÃO fazer o trade. Combate conformity bias e validação cruzada.

**Modelo:** Claude Sonnet 4.6 (raciocínio crítico complexo)

**Inputs:**
- Todo o state (signal + context + risk + macro)

**Output:** DevilAdvocateAnalysis

**Lógica:**

```python
def devils_advocate_agent(state: TradingState) -> TradingState:
    signal = state["signal"]
    context = state["context"]
    
    # Buscar histórico de setups similares que falharam
    similar_failed = query_failed_setups(
        symbol=signal["symbol"],
        setup_type=signal["setup_type"],
        market_regime=state["macro"]["volatility_regime"]
    )
    
    bear_prompt = f"""
    You are a contrarian analyst whose ONLY job is to find reasons this trade will FAIL.
    Do not be balanced. Argue against the trade.
    
    Trade proposed: {signal['direction']} {signal['symbol']} at {signal['entry_price']}
    Setup: {signal['setup_type']}
    Indicators: {signal['indicators']}
    Context: {context}
    
    Historical similar setups that failed:
    {similar_failed}
    
    Provide:
    1. Top 3 specific reasons this trade likely fails (not generic)
    2. The bear case (or bull case if signal is short) — what's the realistic worst path?
    3. Historical analogs of similar setups failing
    4. Confidence (0-1) that this trade FAILS
    
    Be specific. Use the data provided. Don't invent.
    """
    
    analysis = sonnet.invoke(bear_prompt)
    
    state["devils_advocate"] = {
        "counter_arguments": analysis["counter_arguments"],
        "bear_case": analysis["bear_case"],
        "historical_failure_modes": analysis["failure_modes"],
        "confidence_in_failure": analysis["failure_confidence"],
    }
    return state
```

**Custo estimado:** ~$0.020 por chamada (mais tokens de input)

### 5. Final Decision Node — Consolidação

**Objetivo:** combinar todos os outputs e decidir execute/no-execute.

**Modelo:** Lógica determinística + Claude Sonnet 4.6 para casos limite

**Lógica:**

```python
def final_decision_node(state: TradingState) -> TradingState:
    rejected_reasons = []
    
    # Veto check (qualquer veto bloqueia)
    if state["macro"]["veto"]:
        rejected_reasons.extend([f"Macro veto: {r}" for r in state["macro"]["reasons"]])
    
    if state["risk"]["position_size_pct_equity"] < 0.001:  # < 0.1% da equity
        rejected_reasons.append("Position size too small after risk adjustments")
    
    if state["risk"]["risk_reward_ratio"] < 1.5:
        rejected_reasons.append(f"R:R below minimum (1.5): {state['risk']['risk_reward_ratio']}")
    
    if state["devils_advocate"]["confidence_in_failure"] > 0.7:
        rejected_reasons.append(f"Devil's advocate high failure confidence: {state['devils_advocate']['confidence_in_failure']}")
    
    # Se já tem rejection clara
    if rejected_reasons:
        state["decision"] = {
            "execute": False,
            "reasoning": "Multiple rejection criteria met",
            "consolidated_confidence": 0,
            "order_params": None,
            "rejected_reasons": rejected_reasons,
        }
        return state
    
    # Caso limite: confidence moderada do scanner + devil's advocate moderado
    # Aqui usa LLM para decidir
    if 0.4 < state["devils_advocate"]["confidence_in_failure"] < 0.7:
        consolidation_prompt = f"""
        Final decision needed. Context:
        - Scanner signal: {state['signal']}
        - Context: {state['context']}
        - Risk assessment: {state['risk']}
        - Devil's advocate: {state['devils_advocate']}
        
        The signal has merit but devil's advocate has moderate concerns.
        Should we execute? Be decisive. Output: execute (bool), confidence (0-1), reasoning.
        """
        
        decision = sonnet.invoke(consolidation_prompt)
        
        state["decision"] = {
            "execute": decision["execute"],
            "reasoning": decision["reasoning"],
            "consolidated_confidence": decision["confidence"],
            "order_params": build_order_params(state) if decision["execute"] else None,
            "rejected_reasons": None if decision["execute"] else [decision["reasoning"]],
        }
    else:
        # Confidence alta — execute
        state["decision"] = {
            "execute": True,
            "reasoning": "All checks passed, devil's advocate low concern",
            "consolidated_confidence": 1 - state["devils_advocate"]["confidence_in_failure"],
            "order_params": build_order_params(state),
            "rejected_reasons": None,
        }
    
    return state
```

**Custo estimado:** ~$0.015 por chamada (não sempre, só em casos limite)

## LangGraph implementation

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver

def build_trading_graph(checkpointer):
    graph = StateGraph(TradingState)
    
    # Nodes
    graph.add_node("context", context_agent)
    graph.add_node("risk", risk_manager_agent)
    graph.add_node("macro", macro_veto_agent)
    graph.add_node("devils_advocate", devils_advocate_agent)
    graph.add_node("final_decision", final_decision_node)
    graph.add_node("execute_order", execute_order_node)
    graph.add_node("audit_log", audit_log_node)
    
    # Entry point
    graph.set_entry_point("context")
    
    # Sequential com paralelismo lógico
    # Context → Risk e Macro em paralelo → Devil's Advocate → Final Decision
    graph.add_edge("context", "risk")
    graph.add_edge("context", "macro")
    
    # Devil's advocate espera ambos
    graph.add_edge("risk", "devils_advocate")
    graph.add_edge("macro", "devils_advocate")
    
    graph.add_edge("devils_advocate", "final_decision")
    
    # Conditional: se decisão é executar, vai para order; sempre vai para audit
    def should_execute(state):
        return "execute_order" if state["decision"]["execute"] else "audit_log"
    
    graph.add_conditional_edges("final_decision", should_execute)
    graph.add_edge("execute_order", "audit_log")
    graph.add_edge("audit_log", END)
    
    return graph.compile(checkpointer=checkpointer)


# Setup
checkpointer = PostgresSaver.from_conn_string("postgresql://...")
graph = build_trading_graph(checkpointer)

# Execução
async def process_signal(scanner_signal: ScannerSignal):
    initial_state = TradingState(
        signal=scanner_signal,
        request_id=str(uuid.uuid4()),
        started_at=datetime.utcnow(),
        agent_durations={},
        agent_costs={},
        errors=[],
    )
    
    config = {"configurable": {"thread_id": initial_state["request_id"]}}
    final_state = await graph.ainvoke(initial_state, config)
    
    return final_state
```

## Custo total por decisão

Cenário típico (todos os agentes rodam, decisão consolidada com LLM):
- Context: $0.005
- Risk: $0.015
- Macro: $0.005
- Devil's Advocate: $0.020
- Final Decision LLM: $0.015 (em ~30% dos casos)
- **Média ponderada: ~$0.05 por decisão**

Cenário com veto early (macro veta):
- Context: $0.005 (paralelo)
- Macro: $0.005 (veta, para outros agentes)
- **Total: $0.005-0.010**

Otimização possível com early termination em vetos macro (reduz custo médio em ~20%).

## Persistência e audit trail

### Postgres schema (essencial)

```sql
CREATE TABLE trading_decisions (
    request_id UUID PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    
    -- Scanner signal
    signal_data JSONB NOT NULL,
    
    -- Agent outputs
    context_data JSONB,
    risk_data JSONB,
    macro_data JSONB,
    devils_advocate_data JSONB,
    
    -- Final decision
    executed BOOLEAN NOT NULL,
    decision_reasoning TEXT,
    consolidated_confidence FLOAT,
    
    -- If executed
    order_id TEXT,
    entry_price NUMERIC,
    stop_loss NUMERIC,
    take_profit NUMERIC,
    position_size_usd NUMERIC,
    
    -- Outcome (preenchido depois)
    exit_price NUMERIC,
    exit_reason TEXT,
    pnl_usd NUMERIC,
    pnl_pct NUMERIC,
    closed_at TIMESTAMP,
    
    -- Performance metadata
    total_duration_ms INT,
    total_cost_usd NUMERIC,
    
    -- Versioning
    scanner_version TEXT,
    agent_versions JSONB
);

CREATE INDEX idx_symbol_timestamp ON trading_decisions(symbol, timestamp DESC);
CREATE INDEX idx_executed_pnl ON trading_decisions(executed, pnl_pct);
```

Esse schema permite:
- Análise post-mortem de cada decisão
- Identificar quais setups ou regimes performam melhor
- Treinar versões futuras do sistema com data própria
- Servir como base do **track record auditável** para o SaaS

## Observability

Setup mínimo recomendado:

1. **LangSmith** — tracing nativo do LangGraph. Configurar com:
```python
import os
os.environ["LANGSMITH_API_KEY"] = "..."
os.environ["LANGSMITH_PROJECT"] = "crypto-scanner-agents"
os.environ["LANGSMITH_TRACING"] = "true"
```

2. **Sentry** — error tracking, especialmente em production
3. **Grafana + Prometheus** — métricas de latência, custo, taxa de execução
4. **Logs estruturados (JSON)** com correlation_id = request_id

## Testes

### Unit tests
- Cada agente independentemente, com mocks dos data sources
- Risk manager: matriz de testes com diferentes drawdowns, correlations, vol regimes
- Macro veto: testes com eventos próximos vs distantes, vol normal vs extrema

### Integration tests
- Graph end-to-end com fake LLM responses
- Verifica que veto macro early-terminates corretamente
- Verifica audit trail completo

### Backtest com agentes
Versão modificada do backtest spec ([`02-backtest-spec.md`](02-backtest-spec.md)) que substitui as decisões binárias do scanner pelos outputs do graph completo. Atenção: rodar em walk-forward é caro (cada decisão = $0.05). Rodar em sample reduzido + extrapolar.

## Configuração inicial recomendada

```python
# config/risk.yaml
risk_per_trade: 0.01  # 1% da equity por trade
max_portfolio_heat: 0.05  # 5% de exposição total
min_risk_reward: 1.5
max_correlated_exposure: 0.6
funding_extreme_threshold: 0.001  # 0.1%
```

```python
# config/agents.yaml
models:
  context: claude-haiku-4-5-20251001
  risk: claude-opus-4-7  # decisão crítica, vale Opus
  macro: claude-haiku-4-5-20251001
  devils_advocate: claude-opus-4-7
  final_consolidation: claude-opus-4-7

timeouts:
  context: 30
  risk: 30
  macro: 20
  devils_advocate: 45
  final: 20

retries:
  default: 2
  on_rate_limit: 3
```

## Próximos passos de implementação

1. Setup ambiente: Python 3.12, LangGraph, Postgres, Redis
2. Implementar TradingState e schemas
3. Implementar agentes um por um, com testes unitários
4. Implementar graph e checkpointer
5. Mock data sources, validar fluxo end-to-end
6. Conectar data sources reais (Bybit API, news, sentiment)
7. Rodar primeiros testes em paper trading mode
8. Iterar baseado em audit trail

Cronograma detalhado em [`05-action-plan.md`](05-action-plan.md).
