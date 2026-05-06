# SaaS Roadmap — Do Scanner ao Produto

> Esse documento é o caminho para transformar seu scanner num produto vendável. **Pré-requisito absoluto:** ter passado nos critérios go/no-go do backtest e ter pelo menos 90 dias de paper trading com track record sólido.

## Premissa fundamental

Você não pode vender o que não funciona. O mercado de "bots de cripto" é saturado de produtos que prometem retornos e entregam mediocridade — Cryptohopper, 3Commas, Pionex, Bitsgap, e dezenas de outros. Para ter qualquer chance de capturar mercado, você precisa de **um diferencial verificável**.

O diferencial mais credível é um **track record auditável e público**. Tudo o resto (UI bonita, features avançadas, marketing) é secundário sem isso.

## Análise de concorrência

### Players estabelecidos

| Player | Pricing | Diferencial | Limitação |
|--------|---------|-------------|-----------|
| Cryptohopper | $19-99/mês | Marketplace de estratégias, copy trading | Estratégias pré-feitas costumam decair, sem track record real verificável |
| 3Commas | $14-99/mês | DCA bots, GRID bots | Sem inteligência adaptativa, depende do user |
| Pionex | Free (taxas embutidas) | Bots integrados ao exchange | Estratégias simples, sem customização real |
| Bitsgap | $24-149/mês | Arbitragem multi-exchange | Margens de arbitragem comprimidas em 2025-26 |
| TradingView Alerts | $15-60/mês | Não é bot, mas dispara alerts | Não executa, só notifica |
| ArbitrageScanner | $99-499/mês | Foco em arbitragem CEX/DEX | Niche, requer entendimento técnico |
| Tickeron | $90-650/mês | AI signals, "robo-traders" | Performance histórica não auditada publicamente |

### Onde está o gap

O que ninguém faz bem:
1. **Track record público auditável e verificável on-chain** — quase nenhum produto mostra performance real, todos mostram backtests
2. **Análise de contexto (não só TA)** — funding rates, on-chain, sentiment integrados
3. **Risk management adaptativo de verdade** — não só "set stop-loss em X%"
4. **Transparência sobre limitações** — todos prometem retornos
5. **Foco em swing/position trading** — quase todos são para day-trading

Seu produto pode posicionar-se em **um ou dois desses gaps**. Não tente cobrir todos.

## Posicionamento sugerido

### Opção A: "Signal Service Premium com Track Record"

**Tagline:** "Signals de swing trade com rastro completo. Você vê cada decisão, cada trade, cada erro."

**Para quem:** trader retail intermediário (não iniciante, não profissional). Pessoa que já trada mas perde dinheiro com decisões emocionais. Tem $5K-$100K em capital de trade.

**O que entrega:**
- Signals de swing trade em pares líquidos (top 20 perpétuos Bybit)
- Cada signal vem com: setup técnico + análise de contexto + risk parameters sugeridos
- **Track record público, verificável, atualizado em tempo real**
- Dashboard mostrando todas as decisões (executed e rejected) com reasoning

**Pricing:**
- Free tier: signals com 6h de delay
- Standard: $49/mês — signals em real-time, dashboard básico
- Pro: $149/mês — signals + risk parameters customizados + Discord premium
- Elite: $399/mês — Pro + co-pilot mode (chat com agente sobre suas posições)

**Por que funciona:**
- Modelo de assinatura recorrente (MRR previsível)
- Não toca capital do user (regulatório mais simples)
- Track record é o moat
- Escalável (mesmo signal serve N users)

**Riscos:**
- Performance ruim em qualquer mês mata cancelamento
- Requer comunidade ativa pra retenção (Discord, conteúdo)

### Opção B: "Risk Management Layer for Existing Bots"

**Tagline:** "Você já tem um bot. Conecta o nosso risk manager e para de explodir conta."

**Para quem:** quem já usa Cryptohopper, 3Commas, ou tem bot custom. Quer adicionar uma camada de gestão de risco inteligente sem migrar tudo.

**O que entrega:**
- API que recebe signals de qualquer fonte
- Aplica camada de agentes (risk + macro veto + devil's advocate)
- Retorna: execute/no-execute + position sizing + stops adaptativos
- Integra com webhooks de TradingView, n8n, Make, Zapier
- Dashboard de portfolio risk em tempo real

**Pricing:**
- Pay-per-decision: $0.10 por análise (margem sobre custo LLM ~$0.05)
- Standard: $99/mês — 1500 análises incluídas
- Pro: $299/mês — 5000 análises + features avançadas
- Enterprise: customizado

**Por que funciona:**
- Resolve dor real (overbet, no stop-loss = principal causa de perdas)
- Funciona como add-on, não substitui ferramentas existentes
- B2B-friendly (vende para outras empresas com bots)
- Menos pressão de "tem que dar lucro" (você é defesa, não ataque)

**Riscos:**
- Vende-se mais difícil pro retail puro ("por que pagar pra reduzir minha posição?")
- Precisa demonstrar redução de drawdown, não retornos absolutos

### Opção C: "Multi-Agent Trading Co-Pilot"

**Tagline:** "Conversa com seu portfolio. Recebe segunda opinião antes de cada trade."

**Para quem:** trader retail engajado que quer manter controle, mas quer um "second brain" que processa contexto que ele não tem tempo de ler.

**O que entrega:**
- Chat interface (estilo Cursor/Claude Code para trading)
- User cola ideia de trade ou pergunta sobre posição
- Sistema de agentes responde com: análise técnica, contexto macro, risk assessment, contra-argumentos
- Não executa por conta própria — sugere
- Dashboard de portfolio com alertas inteligentes

**Pricing:**
- Free: 10 conversas/mês
- Plus: $29/mês — conversas ilimitadas, integrações básicas
- Pro: $79/mês — Plus + agentes customizáveis + alerts proativos
- Team: $199/mês — Pro + multi-user para grupos de trading

**Por que funciona:**
- Tendência clara (Cursor, Devin, etc. mostram demanda por co-pilots)
- User mantém controle (menor risco regulatório)
- Diferencial: contexto rico que LLM puro não tem
- Cresce com casos de uso (analyze portfolio, screen new tokens, etc.)

**Riscos:**
- Concorrência indireta com ChatGPT + plugins, Claude Projects
- Precisa investir em UX
- Conversões podem ser difíceis (Free → Plus)

### Recomendação

**Comece com Opção A.** É o mais alinhado com o que você já está construindo, requer menos pivote, e o track record que você está construindo no backtest/paper trading vira diretamente o material de marketing.

**Se A funcionar, evolui para C** (signals viram base de um co-pilot mais rico).

**Opção B é só interessante se** você descobrir que tem algumas empresas/grupos pequenos como customers ideais. É mais B2B, ciclo de venda mais longo, mas LTV potencialmente maior.

## MVP — o mínimo para validar

Não construa tudo. Construa o mínimo que prova o conceito para uma cohort pequena (10-50 users beta).

### Versão 0.1 — Beta privado (3-4 semanas após sistema validado)

**Stack:**
- Backend: o sistema já implementado (FastAPI + Python + LangGraph)
- Frontend: Next.js + Tailwind, deployed em Vercel
- DB: Postgres (Supabase ou Railway para começar)
- Auth: Clerk ou Supabase Auth
- Pagamento: Stripe
- Comunidade: Discord server

**Features mínimas:**
1. Landing page simples explicando o produto e mostrando track record
2. Signup com email + Stripe subscription
3. Dashboard com:
   - Lista de signals ativos (entry, stop, target, reasoning)
   - Histórico de signals (incluindo rejected)
   - Performance metrics atualizadas (ao vivo)
4. Notificações por Telegram/Discord/Email quando signal novo
5. Página pública de track record (sem login, transparência total)

**O que NÃO ter no MVP:**
- Multiple subscription tiers (só uma)
- Pagamentos em crypto
- Mobile app (web responsive serve)
- API pública
- Customizable strategies
- Multi-exchange (só Bybit no início)

**Custo de infra estimado:**
- LLM costs: ~$200-500/mês (depende de # signals)
- Vercel: $20/mês
- Supabase/Railway: $25-50/mês
- Stripe: 2.9% + $0.30 por transação
- **Total fixo:** ~$300-600/mês até ~50 users

### Versão 1.0 — Lançamento público (3-6 meses depois)

Adicione baseado em feedback:
- Tiers múltiplos
- Mais pares (top 50 Bybit)
- Integração com Binance, OKX
- Mobile responsive otimizado
- Affiliate program
- Conteúdo (blog, YouTube, Twitter presence)

## Track record como ativo

**Esse é o seu maior diferencial. Tratar como ouro.**

### Como construir

1. **Comece imediatamente.** No dia 1 de paper trading, registra tudo. Performance pública desde o começo (mesmo se ruim).
2. **Auditável de verdade.**
   - Cada signal e trade tem timestamp imutável
   - Hash da decisão publicado em blockchain (cheap em Solana ou L2) para timestamp criptográfico
   - Ou: usar serviço como OpenTimestamps
3. **Métricas honestas.**
   - Mostra trades vencedores E perdedores
   - Drawdown em destaque, não escondido
   - Sharpe, Sortino, Calmar visíveis
   - Comparação com Buy-and-Hold BTC ao lado
4. **Transparência sobre regimes.**
   - "Desde lançamento, Sharpe = 1.8, mas em [período X] foi de 0.6 devido a [razão Y]"
5. **Não esconde paper vs real.**
   - Período em paper trading marcado claramente
   - Quando virar real, deixa claro

### Como apresentar

Página pública (`/track-record` ou similar) com:
- **Equity curve** ao vivo (atualiza diariamente)
- **Métricas** em destaque
- **Tabela de todos os signals** (incluindo os ignorados, com reason)
- **Tabela de todos os trades** com PnL, duração, drawdown
- **Logs dos agentes** para signals selecionados (transparência da decisão)
- **Comparação** com benchmarks
- **API endpoint** público para download dos dados

Modelos a estudar: Numerai (track record cripto-verificável), Quantopian (antes de fechar), AlphaPicks (TipRanks).

## Pricing strategy detalhado

### Modelo recomendado: Tiered Subscription

**Free (Lead Gen)**
- Signals com delay de 6 horas
- Track record completo visível
- Discord básico
- 1-2 signals/dia
- Sem suporte

**Standard ($49/mês)**
- Signals em real-time
- Risk parameters básicos
- Discord premium
- Email + Telegram alerts
- Suporte por email
- Sem limite de signals
- Histórico completo

**Pro ($149/mês)**
- Tudo do Standard
- **Risk parameters customizados** (você define seu risk per trade, etc.)
- Agentes detalhados (vê o reasoning completo de cada decisão)
- Co-pilot mode (chat para perguntas sobre posições)
- Suporte prioritário
- Acesso a beta features

**Elite ($399/mês ou $3.999/ano)**
- Tudo do Pro
- 1:1 onboarding call
- Estratégia customizada (configurações pessoais dos agentes)
- Acesso direto a você (founder access)
- Cap em # de subscribers (gera escassez, ex.: 50 vagas)

### Por que esse pricing

- Free tier vira funil — pessoa testa, vê track record, converte
- Standard é o "starter realista" — alguém que ganha $49/mês de edge sobre Buy-Hold já justifica
- Pro tem features que diferenciam de competidores (risk customization)
- Elite vira marca premium e reduz churn (compromisso financeiro alto)

### Métricas a mirar

- **CAC (Customer Acquisition Cost):** mantido < $50 para Standard, < $200 para Pro
- **LTV (Lifetime Value):** target > 12 meses (LTV de Standard ~$588)
- **Churn:** target < 8%/mês (industry para SaaS de trading é alto, 10-15%)
- **MRR growth:** 15-25%/mês nos primeiros 6 meses

## Go-to-market

### Pre-launch (durante paper trading)

1. **Constrói audience pública**
   - Twitter/X: posta análises diárias usando o sistema (sem revelar metodologia exata)
   - Threads sobre os trades feitos pelo sistema (com explicação dos agentes)
   - LinkedIn: foco no aspecto técnico (multi-agent system, AI in finance)
   - **Brazilian Portuguese audience também:** mercado menos saturado

2. **Build in public**
   - Compartilha journey de construção
   - Posta resultados semanalmente (mesmo ruins)
   - Engaja com cripto-Twitter brasileiro e internacional

3. **Cria waitlist**
   - Landing page simples: "Track record público em construção. Receba notificação quando lançar."
   - Aim: 500-1000 emails antes de abrir signups

### Launch

1. **Hard launch no momento certo**
   - Espera 90 dias de track record sólido
   - Timing: ideal num momento neutro do mercado (não em pico de bull onde todo bot funciona)

2. **Limited slots no início**
   - Abre só 50 vagas para Standard
   - Cria urgência genuína (você não consegue lidar com 1000 users no día 1 mesmo)

3. **Founder-led sales**
   - Personally onboard os primeiros 20-30
   - Coleta feedback brutal
   - Itera rápido

### Post-launch

1. **Conteúdo é alavanca**
   - Blog técnico (SEO de longo prazo)
   - YouTube com análises (alcance maior)
   - Newsletter weekly com insights do sistema (lock-in)

2. **Referrals**
   - Pessoa que indica ganha 30% do primeiro mês
   - Indicado ganha 50% off primeiro mês

3. **Comunidade**
   - Discord ativo é parte do produto
   - User-generated content (traders compartilham resultados)
   - Você presente, mas não dependente da sua presença

## Aspectos legais (importante)

### Disclaimers obrigatórios
- "Não é aconselhamento financeiro" em todo lugar
- "Performance passada não garante futura"
- "Você opera por sua própria conta e risco"

### Estrutura legal

**Como brasileiro vendendo globalmente:**

Opção 1: **Pessoa Jurídica BR (LTDA ou MEI estendido)**
- Mais simples no início
- Permite emitir nota fiscal
- MEI tem limite de R$81K/ano — você passa rápido se der certo
- LTDA: R$5K-15K em custos de abertura, R$500-1500/mês em contador

Opção 2: **Empresa offshore (Wyoming LLC, Estônia e-Residency)**
- Útil se >50% dos customers são internacionais
- Wyoming LLC: ~$500 setup + $50/ano. Stripe Atlas facilita
- Estônia e-Residency: ~€100/setup, mais facilidade dentro EU
- Pesquisa fiscal brasileira: você ainda precisa declarar como PJ controlada

**Recomendação:** começa LTDA brasileira. Se passar de $50K/mês de receita, considera offshore.

### Regulação financeira

**No Brasil:**
- "Vender signals" não é regulado pela CVM (não é gestão de carteira)
- "Operar dinheiro de terceiros" é altamente regulado — não faça
- Educação financeira é livre

**Globalmente:**
- US: SEC pode considerar signals = investment advice. Cuidado com US customers até ter assessoria
- UE: MiFID II tem implicações se prestar advice
- Recomendação: nos primeiros 12 meses, foca em BR + cripto-friendly jurisdictions (UAE, Singapore)

### Termos de uso e privacy
- Use template ajustado para SaaS (Termly, GetTerms)
- Especifica claramente: você vende informação, não promete retornos
- LGPD compliance se tiver users brasileiros

## Riscos do modelo SaaS

### Risco 1: Performance cai
**Mitigação:** comunicação proativa, transparência. Quando há drawdown, comunica antes que o user descubra. Detalha por que.

### Risco 2: Concorrência grande entra
**Mitigação:** track record acumulado é difícil de replicar. Comunidade fechada é moat. Conteúdo educacional cria lock-in.

### Risco 3: Mudança de regulação
**Mitigação:** estrutura jurídica flexível, documentação rigorosa, willingness para mudar de jurisdiction se necessário.

### Risco 4: Burnout do founder (você)
**Mitigação:** automação máxima desde o dia 1. Comunidade que se autoatende parcialmente. Não comprometa pós-produção até MRR > $5K.

### Risco 5: User experience ruim mata churn
**Mitigação:** invista em UX desde MVP. Onboarding excellence. Suporte responsivo nos primeiros 6 meses.

## Roadmap de receita realista

### Cenário pessimista
- Mês 1-3: 5 paying users, $250 MRR
- Mês 4-6: 30 users, $1.500 MRR
- Mês 7-12: 100 users, $5.000 MRR
- Ano 2: 250 users, $12.500 MRR

### Cenário base
- Mês 1-3: 15 users, $750 MRR
- Mês 4-6: 70 users, $3.500 MRR
- Mês 7-12: 200 users, $10.000 MRR
- Ano 2: 500 users, $25.000 MRR

### Cenário otimista (track record excepcional + lucky timing)
- Mês 1-3: 50 users, $2.500 MRR
- Mês 4-6: 200 users, $10.000 MRR
- Mês 7-12: 500 users, $25.000 MRR
- Ano 2: 1500 users, $75.000 MRR

**Realidade:** a maioria dos SaaS de trading fica no pessimista ou base. Otimista requer que você seja excepcional em produto + marketing + timing.

## Quando matar o projeto

Estabeleça critérios de saída antes de começar:

- **6 meses depois do launch:** se MRR < $1.000 e crescimento < 15%/mês, reavalia
- **12 meses depois:** se MRR < $5.000, considera pivotar (ex.: vender o sistema, voltar para B2B)
- **18 meses:** se ainda não breakeven em terms de seu tempo (i.e., MRR > $10K considerando custos), considera pivotar para outro caminho

Sem critérios, você fica preso em projeto que não cresce mas você não desiste.

## Resumo das decisões

| Decisão | Recomendação |
|---------|--------------|
| Modelo | SaaS com signals + dashboard + community |
| Posicionamento | "Premium signals com track record auditável" |
| Pricing | Tiered: Free / $49 / $149 / $399 |
| MVP scope | Bybit only, top 20 pairs, web responsive |
| Stack | FastAPI + Next.js + Postgres + Stripe |
| Track record | Público desde dia 1, auditável criptograficamente |
| Marketing | Build-in-public + content + community |
| Estrutura legal | LTDA BR inicial, offshore se escalar |
| Critérios de sucesso | $5K MRR em 12 meses como mínimo viável |
| Critérios de saída | Definir antes, respeitar |

Cronograma específico em [`05-action-plan.md`](05-action-plan.md).
