# Backtest Rigoroso — Especificação Completa

> Antes de gastar tempo construindo agentes sofisticados, é essencial saber se o **scanner base** tem algum sinal real. Backtest mal-feito é pior que não fazer — gera falsa confiança e leva a perdas reais.

## Por que backtest "normal" não serve

A maioria dos backtests que você vê em tutoriais ou em sites de bots cometem ao menos um destes erros:

1. **Look-ahead bias** — usar dados futuros para decidir trades passados (ex.: usar fechamento do dia para decidir entrada no mesmo dia)
2. **Survivorship bias** — testar só em pares que ainda existem hoje, ignorando os que foram delistados
3. **Overfitting** — otimizar parâmetros até o backtest ficar bonito; performance some em dados novos
4. **Cherry-picking de janelas** — escolher o período onde a estratégia funcionou
5. **Ignorar custos reais** — taxas, slippage, funding rates, spread bid-ask
6. **Sem out-of-sample** — testar na mesma janela usada para otimizar
7. **Sem walk-forward** — assumir que parâmetros otimizados em 2022 valem em 2025

Cada um desses erros sozinho pode transformar um sistema perdedor em "lucrativo" no backtest. **Combinados, criam fantasias.**

## Metodologia walk-forward com out-of-sample

### Estrutura geral

Dividir o histórico de dados em janelas:

```
|--- Train (otimização) ---|--- Validation ---|
                           |--- Train ---|--- Validation ---|
                                         |--- Train ---|--- Validation ---|
```

- **Train window:** período onde os parâmetros do scanner são otimizados (ex.: 6 meses)
- **Validation window:** período onde a estratégia opera sem reotimização (ex.: 2 meses)
- A janela move forward; cada validation é "out-of-sample" para o train anterior
- Performance reportada é o **agregado de todas as validation windows**

Isso simula o que acontece em produção: você otimiza com dados passados e opera no futuro.

### Janelas recomendadas para crypto (Bybit perpétuos)

- **Dataset total:** mínimo 3 anos (cobre múltiplos regimes: bull 2021, bear 2022, recovery 2023, bull 2024-2025)
- **Train window:** 180 dias (6 meses)
- **Validation window:** 60 dias (2 meses)
- **Step size:** 60 dias (rola 2 meses por vez)
- **Total de validation windows:** ~12-15 janelas em 3 anos
- **Métricas finais:** agregadas em todas as validation windows + reportadas separadamente para identificar regimes problemáticos

## Custos realistas — não negociáveis

### Taxas Bybit (perpetual futures, USDT-margined)
- **Taker fee:** 0.055% (0.00055)
- **Maker fee:** 0.02% (0.0002) — apenas se ordem fica no livro
- **Considerar realista:** assume taker em 70% das entradas (porque entries em momentum costumam ser market orders)

### Slippage estimado
- **Pares líquidos (BTC, ETH, SOL):** 0.02-0.05%
- **Pares mid-cap (top 30):** 0.05-0.15%
- **Pares small-cap:** 0.15-0.5%+
- **Em alta volatilidade:** dobra. Em flash crash: pode ser 1%+

**Recomendação:** modelar slippage como percentual + componente proporcional ao tamanho da ordem vs liquidez.

### Funding rates
Em perpétuos, a cada 8 horas existe um funding rate pago/recebido. Em períodos de overcrowded long, longs pagam ~0.01-0.1% a cada 8h. Em estratégia que segura por 5 dias = 15 cobranças = pode ser 1.5%+ de custo.

**Não ignore.** Modelo de custo deve incluir funding payment baseado no histórico real de funding por par.

### Spread bid-ask
Para ordens market, você paga o spread implícito. Em pares líquidos é negligível, em mid-caps pode ser significativo. Modelar como mid-price ± half-spread.

### Custo total realista típico
Para uma estratégia swing em BTC/ETH com hold médio de 3 dias:
- Entry: 0.055% (taker) + 0.03% (slippage) = 0.085%
- Funding: 9 cobranças × 0.01% = 0.09%
- Exit: 0.085%
- **Round-trip total: ~0.26%**

Sua estratégia precisa ter edge maior que isso por trade, **na média**, para ser lucrativa.

## Métricas obrigatórias

Reportar todas. Cherry-picking de métricas é tão ruim quanto cherry-picking de janelas.

### Performance
- **Total return** (% e em USD)
- **CAGR** (compound annual growth rate)
- **Sharpe Ratio** — retorno/volatilidade. Target: ≥ 1.5, idealmente > 2.0
- **Sortino Ratio** — penaliza apenas downside volatility. Target: > 2.0
- **Calmar Ratio** — CAGR / Max Drawdown. Target: > 0.5

### Risco
- **Max Drawdown (MDD)** — pior queda peak-to-trough. Target: ≤ 25%, ideal < 20%
- **Drawdown duration** — quantos dias para recuperar do MDD
- **Volatility annualized**
- **VaR 95%** — perda máxima esperada em 5% dos dias

### Trade quality
- **Win Rate** — % de trades vencedores. Pode ser baixo (40-50%) se R:R for alto
- **Profit Factor** — soma dos ganhos / soma das perdas. Target: ≥ 1.8
- **Average Win / Average Loss** — R:R real
- **Expectancy** — (Win% × AvgWin) − (Loss% × AvgLoss). Tem que ser positivo
- **Largest losing trade** — outlier máximo
- **Consecutive losses** — máximo de losses em sequência (afeta psicologia)

### Estabilidade
- **Performance por regime** — separar bull, bear, sideways e reportar cada um
- **Performance por par** — não escondendo médias com 1 par lucrativo carregando 10 perdedores
- **Performance por mês** — Sharpe mensal. Quantos meses negativos?
- **Out-of-sample vs In-sample gap** — se OOS é muito pior que IS, é overfitting

### Comparação com benchmarks
- **vs Buy-and-Hold BTC** — está adicionando valor sobre simplesmente segurar BTC?
- **vs Buy-and-Hold ETH**
- **vs DCA estratégia** (compra fixa mensal)
- **vs Estratégia delta-neutra** — funding rate arb como benchmark de baixo risco

Se sua estratégia não bate Buy-and-Hold BTC ajustado pelo risco, **buy-and-hold é melhor**.

## Implementação prática

### Stack recomendada

**Opção 1: VectorBT (recomendada para velocidade)**
- High-performance, vectorized backtesting em Python
- Walk-forward nativo
- Suporta múltiplos pares simultaneamente
- Integra com Numba para velocidade
- https://vectorbt.dev/

**Opção 2: Backtrader (mais flexível, mais lento)**
- Mais maduro, comunidade maior
- Event-driven, mais próximo da realidade
- Bom para estratégias com lógica complexa
- https://www.backtrader.com/

**Opção 3: Custom em pandas/numpy**
- Total controle
- Mais código, mais bugs potenciais
- Recomendado apenas se as opções acima não cobrem o caso

### Estrutura de código sugerida

```python
# /backtest/
#   ├── data/
#   │   ├── fetcher.py          # Baixa dados históricos da Bybit
#   │   ├── cache.py            # Cache local em parquet
#   │   └── validator.py        # Valida integridade dos dados
#   ├── costs/
#   │   ├── fees.py             # Modelagem de taxas Bybit
#   │   ├── slippage.py         # Modelo de slippage
#   │   └── funding.py          # Funding rate calculator
#   ├── strategies/
#   │   ├── scanner_base.py     # Strategy do scanner atual
#   │   └── scanner_with_agents.py  # Strategy com camada de agentes
#   ├── walkforward/
#   │   ├── engine.py           # Walk-forward engine
#   │   └── windows.py          # Window management
#   ├── metrics/
#   │   ├── performance.py      # Sharpe, Sortino, etc.
#   │   ├── risk.py             # MDD, VaR, etc.
#   │   └── reports.py          # Geração de reports
#   ├── benchmarks/
#   │   ├── buyhold.py
#   │   └── delta_neutral.py
#   └── main.py                 # Entry point
```

### Esqueleto de código (Python + VectorBT)

```python
import vectorbt as vbt
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# 1. CARREGAR DADOS
def load_bybit_data(symbol: str, start: str, end: str, interval: str = "1h") -> pd.DataFrame:
    """
    Carrega OHLCV da Bybit com timestamps UTC.
    Recomendado salvar em parquet local após primeira load.
    """
    # Implementação via API Bybit ou ccxt
    pass

# 2. MODELO DE CUSTO REALISTA
class RealisticCostModel:
    def __init__(self, taker_fee=0.00055, maker_fee=0.0002, 
                 base_slippage=0.0003, funding_history=None):
        self.taker_fee = taker_fee
        self.maker_fee = maker_fee
        self.base_slippage = base_slippage
        self.funding_history = funding_history
    
    def entry_cost(self, price, size, is_maker=False, volatility=None):
        fee = self.maker_fee if is_maker else self.taker_fee
        slip = self.base_slippage * (1 + (volatility or 0) * 5)
        return price * size * (fee + slip)
    
    def funding_cost(self, position_size, hold_periods, symbol, side):
        # Soma todos os funding payments no período de hold
        funding_payments = self.funding_history[symbol].iloc[-hold_periods:]
        sign = 1 if side == 'long' else -1
        return position_size * (sign * funding_payments).sum()

# 3. WALK-FORWARD ENGINE
def walk_forward_backtest(
    data: pd.DataFrame,
    strategy_fn,
    train_window: int = 180,  # dias
    val_window: int = 60,
    step: int = 60,
    cost_model: RealisticCostModel = None
):
    """
    Executa walk-forward com out-of-sample validation.
    Retorna lista de resultados por janela + agregado.
    """
    results = []
    start_idx = 0
    while start_idx + train_window + val_window <= len(data):
        train_data = data.iloc[start_idx:start_idx + train_window]
        val_data = data.iloc[start_idx + train_window:start_idx + train_window + val_window]
        
        # Otimiza parâmetros no train
        params = strategy_fn.optimize(train_data)
        
        # Aplica no validation (out-of-sample)
        val_result = strategy_fn.run(val_data, params, cost_model)
        results.append({
            'train_period': (train_data.index[0], train_data.index[-1]),
            'val_period': (val_data.index[0], val_data.index[-1]),
            'params': params,
            'metrics': compute_metrics(val_result)
        })
        
        start_idx += step
    
    return aggregate_results(results)

# 4. MÉTRICAS COMPLETAS
def compute_metrics(returns: pd.Series, trades: pd.DataFrame) -> dict:
    return {
        # Performance
        'total_return': (1 + returns).prod() - 1,
        'cagr': calculate_cagr(returns),
        'sharpe': calculate_sharpe(returns),
        'sortino': calculate_sortino(returns),
        'calmar': calculate_calmar(returns),
        
        # Risk
        'max_drawdown': calculate_mdd(returns),
        'mdd_duration_days': calculate_mdd_duration(returns),
        'volatility_annual': returns.std() * np.sqrt(365 * 24),  # se hourly
        'var_95': returns.quantile(0.05),
        
        # Trade quality
        'num_trades': len(trades),
        'win_rate': (trades['pnl'] > 0).mean(),
        'profit_factor': trades[trades['pnl'] > 0]['pnl'].sum() / 
                        abs(trades[trades['pnl'] < 0]['pnl'].sum()),
        'avg_win': trades[trades['pnl'] > 0]['pnl'].mean(),
        'avg_loss': trades[trades['pnl'] < 0]['pnl'].mean(),
        'largest_loss': trades['pnl'].min(),
        'max_consecutive_losses': max_consecutive_losses(trades),
        
        # Stability
        'monthly_sharpe': returns.resample('M').apply(calculate_sharpe).mean(),
        'negative_months_pct': (returns.resample('M').sum() < 0).mean(),
    }

# 5. COMPARAÇÃO COM BENCHMARKS
def compare_with_benchmarks(strategy_returns, data):
    benchmarks = {
        'buy_hold_btc': calculate_buyhold_returns(data, 'BTCUSDT'),
        'buy_hold_eth': calculate_buyhold_returns(data, 'ETHUSDT'),
        'dca_monthly': calculate_dca_returns(data),
        'delta_neutral': calculate_delta_neutral_returns(data),
    }
    
    comparison = {}
    for name, bench_returns in benchmarks.items():
        comparison[name] = {
            'strategy_return': strategy_returns.sum(),
            'benchmark_return': bench_returns.sum(),
            'alpha': (strategy_returns - bench_returns).sum(),
            'information_ratio': calculate_information_ratio(strategy_returns, bench_returns),
        }
    return comparison
```

## Critérios go/no-go finais

Após walk-forward em 3 anos de dados, agregando todas as validation windows:

### MUST PASS (todos obrigatórios)
- [ ] Sharpe ≥ 1.5 agregado
- [ ] Max Drawdown ≤ 25%
- [ ] Profit Factor ≥ 1.8
- [ ] Bate Buy-and-Hold BTC em Sharpe ratio
- [ ] Bate estratégia delta-neutra em retorno absoluto E em Sharpe
- [ ] Performance positiva em pelo menos 70% das validation windows
- [ ] Out-of-sample não é mais que 30% pior que in-sample (gap de overfitting aceitável)

### SHOULD PASS (idealmente todos)
- [ ] Sortino ≥ 2.0
- [ ] Calmar ≥ 0.5
- [ ] Win Rate ≥ 45% OU R:R ≥ 2.0
- [ ] Max consecutive losses ≤ 8
- [ ] Performance positiva em bull, bear E sideways
- [ ] Largest losing trade ≤ 5% da equity
- [ ] Negative months ≤ 30%

### Se MUST PASS falhar:
**Não avançar para implementação de agentes ainda.** O scanner base não tem edge suficiente. Volte para refinar os indicadores ou os filtros de setup. Ou considere pivotar para estratégia delta-neutra (caminho 2 do master).

### Se MUST PASS bate, mas SHOULD PASS falha:
Avance com cautela. Implemente os agentes (camada de risk + contexto deveria melhorar especialmente Sortino, Calmar e drawdown).

### Se ambos bate:
Sistema sólido. Avance com confiança. Implemente os agentes para extrair mais alfa.

## Pitfalls comuns a evitar

### 1. "Mas em 2024 funcionou muito bem"
2024 foi um bull market. Quase tudo funcionou. Performance só vale se atravessa múltiplos regimes.

### 2. "Vou só ajustar esse parâmetro"
Cada ajuste post-hoc no parâmetro é overfitting. Walk-forward deve incluir a otimização do parâmetro como parte do processo.

### 3. "Slippage de 0.01% é suficiente"
Em pares líquidos sim. Em mid-caps em horário de baixa liquidez, slippage real pode ser 10x isso. Modele realista.

### 4. "Funding rate é pequeno"
Em estratégias com hold de dias, funding pode ser o maior custo. Não ignore.

### 5. "97 trades é amostra suficiente"
Não. Mínimo 200-300 trades para significância estatística. Se sua estratégia gera poucos trades, estenda o histórico ou aceite confidence baixa.

### 6. "Vou usar dados de 2017-2018 também"
Dados muito antigos podem não refletir o mercado atual (estrutura diferente, menos institucional, sem perpétuos maduros). Cuidado em incluir período pré-2020.

## Reporting do backtest

Gera um report HTML/PDF com:

1. **Sumário executivo** — métricas-chave em tabela
2. **Equity curve** — gráfico do cumulative return ao longo do tempo
3. **Drawdown chart** — quanto e por quanto tempo
4. **Distribuição de retornos por trade** — histograma
5. **Performance por par** — tabela
6. **Performance por regime** — bull/bear/sideways breakdown
7. **Walk-forward windows** — tabela com cada janela e suas métricas
8. **Comparação com benchmarks** — gráfico de equity de cada
9. **Custos breakdown** — quanto foi taxa, quanto foi slippage, quanto foi funding

Esse report é a base para decisão go/no-go E o material de marketing futuro do SaaS (track record auditável).

## Próximos passos

1. Setup do ambiente: instalar VectorBT, ccxt, pandas, numpy
2. Baixar dados históricos Bybit dos pares-alvo (BTC, ETH, SOL e top 10 perpétuos por liquidez)
3. Implementar cost model
4. Portar o scanner atual para função de strategy compatível com VectorBT
5. Implementar walk-forward engine
6. Rodar primeira passada e gerar report
7. Iterar baseado em achados (sem overfit)
8. Decidir go/no-go

Detalhes de cronograma em [`05-action-plan.md`](05-action-plan.md).
