# Research Base — Findings que sustentam as decisões

> Toda decisão de arquitetura nesse projeto está ancorada em dados ou estudos. Este documento é a base científica. Quando alguém (você, eu ou o Claude Code) questionar uma decisão, volte aqui.

## 1. A realidade do trader retail

### Estatísticas longitudinais
- **PiP World (novembro 2025):** estudo de 27 anos com 8 milhões de traders e 295 milhões de trades. Taxa de falha de retail traders: **74-89%**, persistente através de plataformas, regulamentações, ciclos de mercado e níveis de educação. As razões para perder não mudaram em três décadas.
- **NFTEvening (agosto 2025, n=1005):** **84% dos traders retail de cripto perderam dinheiro no primeiro ano**. **58% perderam quase todo o capital inicial**. **66% que negociam com frequência têm perdas maiores**. **85% dos novos traders falham em usar stop-loss/take-profit consistentemente**.
- **SEBI/Índia (relatório oficial 2024):** 93% dos traders retail de F&O perderam dinheiro em 3 anos (FY2022-FY2024). Perda média ~$2.400 por trader. **97% dos lucros institucionais vieram de trading algorítmico**.
- **Estudos acadêmicos clássicos (Barber, Lee, Liu, Odean):** traders consistentemente lucrativos representam **1-3% do total**. Compartilham um caminho comum: anos de prática deliberada, journaling rigoroso, gestão de risco disciplinada, posições pequenas no início.

### Implicações para o projeto
- O default estatístico do retail trading é perder dinheiro. Qualquer estratégia precisa **bater esse default por uma margem substancial** para ser considerada válida.
- A diferença entre os 1-3% lucrativos e o resto **não é a qualidade do entry signal** — é gestão de risco e disciplina psicológica.
- Trading frequente correlaciona com perdas maiores. Setups raros e de alta qualidade são preferíveis a muitos sinais marginais.

## 2. Quem realmente ganha dinheiro com cripto

### Os profitable
- **Market makers institucionais** (Wintermute, Jump Trading, Cumberland) — lucram do bid-ask spread, não de direção. Operam em microsegundos com colocação física.
- **HFT firms** com infraestrutura especializada e latência sub-milissegundo.
- **Latency arbitrage bots** — exemplo documentado: bot transformou $313 em $414K em um mês explorando o lag de preço entre Polymarket e Binance/Coinbase. O edge é puramente velocidade, não previsão.
- **Cross-exchange arbitrage** — estudo de 2025 identificou 240.000+ trades de arbitragem cross-chain bem-sucedidos em um ano, volume de $868M.
- **Holders de longo prazo (5+ anos)** com DCA disciplinado.
- **Estratégias delta-neutras** (cash-and-carry, funding rate arbitrage) — Pionex e OKX automatizam isso com APYs de 4-21% em USDT.

### O que isso significa
Existem dois jogos distintos em cripto:
1. **Jogo direcional** — apostar se o preço sobe ou desce. Onde 84-97% perdem.
2. **Jogo estrutural** — capturar spreads, taxas, ineficiências. Onde quase todo o lucro institucional acontece.

O scanner atual está jogando o jogo 1. Vale a pena considerar elementos do jogo 2 (ex.: filtros baseados em funding rates).

## 3. Eficácia real dos indicadores técnicos

### O que dizem os papers
- **Sensors Journal (2023, peer-reviewed):** estratégia RSI 50-100 modificada em 10 cryptos de 2018-2022 gerou 773.65% de retorno vs 275.22% de buy-and-hold. Drawdown de -41.40% vs -65.75%. Resultado válido, mas dependente de regime.
- **Comparative study RSI vs MACD (2020-2022):** RSI mais preciso que MACD em sinais. RSI melhor em consolidação; MACD melhor em tendências. **Ambos falham em flash crashes e pump-and-dumps**.
- **Gate.io backtest (2026):** RSI+MACD combinados = ~77% win rate. Atenção: fonte com conflito de interesse.

### Limitações reais
- **Os indicadores são públicos.** Todo trader e todo bot têm acesso. Não geram alpha por si só.
- **Sensibilidade a regime.** RSI funciona em range, MACD em trend, nenhum em choppy markets.
- **Falsa confiança em backtest.** Resultados em janelas favoráveis não generalizam. Por isso é crítico walk-forward + out-of-sample.
- **Custos comem o edge.** Em estratégias frequentes, taxas + slippage + funding podem transformar Sharpe positivo em negativo.

### Implicação
Os indicadores são úteis como **filtros de setup**, não como decisão final. O agregado de múltiplos indicadores + contexto externo + risk management é onde pode haver edge.

## 4. LLMs em trading — o que funciona e o que não funciona

### Limitações duras
- **Latência:** inferência LLM = 500ms a 3 segundos por chamada. Multi-agente com debate = 10-60 segundos por decisão. **Inadequado para HFT, day trading rápido ou scalping.**
- **Hallucination:** OpenAI's o3 e o4-mini hallucinam **30-50%** em certos benchmarks. Em contexto financeiro: inventar análises, confundir números, fabricar padrões técnicos. Sem camada de verificação, vira perda monetária direta.
- **Conformity bias:** em sistemas multi-agente, agentes tendem a concordar entre si ao invés de discordar. Devil's advocate ajuda mas não elimina.
- **Sycophancy:** modelos treinados com RLHF tendem a dizer o que parece que o usuário quer ouvir, não o que é correto. Em multi-agente, isso amplifica.
- **Error compounding:** em pipelines sequenciais de agentes, erros se propagam silenciosamente. Não crasham — viram drift de raciocínio.
- **Models que excelem em benchmarks estáticos performam pior em trading real** (LiveTradeBench, Yu et al. 2025; AI-Trader, Fan et al. 2025).
- **Extended thinking não ajuda em trading** — paper TraderBench 2026: "+26 em retrieval, zero em trading".

### Onde LLMs agregam valor real
- **Sentiment analysis** de news e social media. Paper "Adaptive Multi-Agent Bitcoin Trading" (arxiv 2510.08068, out/2025): sentiment agent transformou mercado lateral de pequena perda em ganho de 100%+.
- **Análise de narrativas e contexto macro.**
- **Risk management decisions** baseadas em múltiplos fatores.
- **Position sizing adaptativo.**
- **Análise fundamentalista de tokens novos.**
- **Filtragem de eventos** (FOMC, CPI, listings, hacks, regulação).
- Paper "FS-Reasoning Agent" (arxiv 2410.12464): improvements de **7% BTC, 2% ETH, 10% SOL** com fact-subjectivity reasoning.
- Paper "Explainable zero-shot trading" (ScienceDirect, nov 2025): 23.30% total return com Reddit-based sentiment integrado.

### Conclusão
LLMs **não predizem direção melhor que indicadores técnicos**. Eles agregam valor em **camadas de contexto e decisão** que requerem síntese de múltiplas fontes textuais e numéricas — algo que código tradicional não faz bem.

## 5. Multi-agent systems — quando funcionam

### Padrões que funcionam
- **Orchestrator + specialized sub-agents** com responsabilidades claras e não-sobrepostas.
- **Devil's advocate** explícito para combater conformity bias.
- **State machine determinístico** (LangGraph) ao invés de "conversa livre" (AutoGen GroupChat).
- **Persistência de estado** entre execuções para audit e recovery.
- **Validation layer** entre output do LLM e ação real (ex.: ordem na exchange).
- **Custo controlado** — LangGraph permite roteamento sem chamada LLM; CrewAI faz LLM call em cada delegação.

### Padrões que falham
- **AutoGen GroupChat com muitos rounds** — 4 agentes × 5 rounds = 20+ chamadas, $0.04+ por decisão, 10-60s de latência.
- **CrewAI sem state persistence** — bot crasha às 3am, perde contexto.
- **Sem observability** — quando um agente faz uma decisão errada no step 7 de 10, você não sabe por quê.
- **Prompts mal-restringidos** — agentes spawnam sub-agentes infinitamente, gerando custo runaway.

### Por isso a escolha de LangGraph
- 46.1M downloads mensais no PyPI (vs 5M do CrewAI).
- Usado em produção por **BlackRock e JPMorgan** para sistemas financeiros.
- Persistência de estado nativa via checkpointers.
- Observability gold standard via LangSmith.
- Roteamento determinístico sem chamada LLM (corta custo).
- Human-in-the-loop nativo (importante para approvals em decisões críticas).

## 6. Custo realista de operar agentes

### Cálculo de exemplo
Sistema com 4 agentes, decisão por trade:
- Orchestrator (1 chamada Sonnet 4.6): ~$0.015
- 3 specialized agents (Haiku 4.5): ~$0.003 cada = $0.009
- Final consolidation (Sonnet): ~$0.015
- **Total por decisão: ~$0.04**

Com 50 setups identificados por dia:
- 50 × $0.04 = $2/dia = **$60/mês em custos de LLM**

Para SaaS com 100 usuários cada um avaliando ~50 setups/dia:
- $200/dia = $6.000/mês em custos de LLM

Esse custo precisa ser embutido no pricing do SaaS. Detalhes em [`04-saas-roadmap.md`](04-saas-roadmap.md).

## 7. Frameworks de agentes — comparação 2026

| Framework | Latência | Custo | Persistência | Observability | Production-ready |
|-----------|----------|-------|--------------|---------------|------------------|
| LangGraph | Baixa-média | Baixo | Nativa | LangSmith (top) | **Sim** |
| CrewAI | Média | Médio | Manual | Limitada | Para prototipagem |
| AutoGen | Alta | Alto | Manual | Custom | Em manutenção (não usar) |
| OpenAI Agents SDK | Baixa | Médio | Mínima | Mínima | Lock-in OpenAI |
| Mastra | Baixa | Baixo | Nativa | Boa | Sim (TypeScript) |

**Recomendação para este projeto: LangGraph.** Padrão "prototipar em CrewAI, produzir em LangGraph" também é válido.

## 8. Referências principais (papers e fontes)

### Papers acadêmicos relevantes
- "An Adaptive Multi Agent Bitcoin Trading System" — arxiv 2510.08068 (out/2025)
- "Exploring LLM Cryptocurrency Trading Through Fact-Subjectivity Aware Reasoning" — arxiv 2410.12464
- "Explainable zero-shot trading using multi-agent LLM architecture" — ScienceDirect (nov 2025)
- "TraderBench: How Robust Are AI Agents in Adversarial Capital Markets?" — arxiv 2603.00285
- "AI-Trader: Benchmarking Autonomous Agents in Real-Time Financial Markets" — arxiv 2512.10971
- "Effectiveness of the Relative Strength Index Signals in Timing the Cryptocurrency Market" — PMC/NIH (Sensors Journal 2023)
- "From Hypotheses to Factors: Constrained LLM Agents in Cryptocurrency Markets" — arxiv 2604.26747

### Estudos e relatórios
- PiP World 27-year retail trading study (nov/2025)
- NFTEvening Crypto Trader Survey (ago/2025)
- SEBI India F&O Trading Report (set/2024)
- BIS Algorithmic Trading Statistics (2022)

### Recursos técnicos
- LangGraph docs: https://langchain-ai.github.io/langgraph/
- LangSmith: https://smith.langchain.com/
- Bybit API docs: https://bybit-exchange.github.io/docs/v5/intro
- Backtrader (Python backtesting): https://www.backtrader.com/
- VectorBT (high-performance backtesting): https://vectorbt.dev/

## 9. Recap das decisões com sua justificativa

| Decisão | Justificativa baseada em research |
|---------|-----------------------------------|
| LangGraph sobre CrewAI | Persistência nativa + observability + custo. Sources: papers de produção 2026 |
| Swing trading sobre intraday | Latência LLM (500ms-3s) inviabiliza decisões rápidas |
| Agentes para risk + contexto, não validação | Conformity bias + redundância pioram, não melhoram |
| Walk-forward + custos realistas | 90% dos sistemas que parecem bons em backtest naive falham em real |
| Critérios de saída em 90 dias | Sunk cost fallacy é a armadilha mais comum |
| Sonnet 4.6 + Haiku 4.5 mix | Otimização custo/qualidade |
| Postgres + Redis | Audit trail (Postgres) + low-latency state (Redis) |
