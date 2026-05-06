# Scanner Strategy — Documentação Completa

Sistema de validação e produtização do crypto scanner com camada multi-agente.

## Como usar este conjunto de documentos

Esses .md são feitos para serem usados como contexto persistente para você e para o Claude Code. Cada documento tem um propósito específico.

### Ordem de leitura recomendada (primeira vez)

1. **[`00-MASTER.md`](00-MASTER.md)** — Visão geral, decisões estratégicas, índice. Lê primeiro.
2. **[`01-research-base.md`](01-research-base.md)** — Base científica. Lê para entender por que as decisões são essas.
3. **[`05-action-plan.md`](05-action-plan.md)** — Cronograma de execução. O "o que fazer".
4. **[`02-backtest-spec.md`](02-backtest-spec.md)** — Detalhes técnicos do backtest. Lê quando for implementar Fase 1.
5. **[`03-agents-architecture.md`](03-agents-architecture.md)** — Arquitetura técnica dos agentes. Lê quando for implementar Fase 2.
6. **[`04-saas-roadmap.md`](04-saas-roadmap.md)** — Plano de produto. Lê quando for implementar Fase 4.

### Uso no Claude Code

Coloca a pasta `scanner-strategy/` na raiz do projeto. Referencia via:

```
@scanner-strategy/00-MASTER.md
```

Para tarefas específicas:

```
"Estamos na semana 2 do plano de ação. Implementa o cost model conforme @scanner-strategy/02-backtest-spec.md"

"Cria o Context Agent descrito em @scanner-strategy/03-agents-architecture.md, seguindo as decisões de @scanner-strategy/00-MASTER.md"

"Revisa minha implementação contra os princípios em @scanner-strategy/01-research-base.md"
```

## Estrutura

```
scanner-strategy/
├── README.md              ← este arquivo
├── 00-MASTER.md          ← visão geral e decisões
├── 01-research-base.md   ← findings de pesquisa
├── 02-backtest-spec.md   ← spec do backtest rigoroso
├── 03-agents-architecture.md  ← arquitetura LangGraph
├── 04-saas-roadmap.md    ← plano de produto
└── 05-action-plan.md     ← cronograma 90 dias
```

## TL;DR

**Objetivo:** transformar o crypto scanner num produto SaaS vendável.

**Caminho:**
1. Validar que o scanner tem edge (backtest rigoroso 3 semanas)
2. Adicionar camada multi-agente focada em risk + contexto + macro veto (3 semanas)
3. Paper trading 4-8 semanas para validar live
4. Se métricas baterem: lança como SaaS de signals com track record público

**Decisões-chave:**
- LangGraph (não CrewAI) para produção
- Swing trading (não intraday) — latência LLM
- Agentes enriquecem, não validam sinais
- Track record público é o moat
- Gates objetivos em cada fase, com critérios para pivotar se necessário

**Princípio:** vender só funciona com produto que funciona. Validação primeiro, sempre.

## Gates de decisão (resumo)

```
Gate 1 (semana 3): Scanner base tem edge mensurável?
  ✅ Avança | ❌ Refina ou pivote

Gate 2 (semana 6): Sistema multi-agente roda end-to-end estável?
  ✅ Avança | ❌ Otimiza antes de avançar

Gate 3 (semana 10): Paper trading bate critérios go/no-go?
  ✅ Lança SaaS | ⚠️ Estende paper | ❌ Pivote
```

## Atualizações deste documento

Esses .md devem ser **atualizados** conforme aprendizados acumulam. Não são pedra. Especificamente:

- Após cada Gate, adicionar uma seção "Lessons learned" no documento relevante
- Se descobrir que um indicador funciona melhor que outro, atualiza `01-research-base.md`
- Se decidir mudar pricing depois de feedback, atualiza `04-saas-roadmap.md`
- Action plan (`05-action-plan.md`) tem schedule fixo, mas tarefas podem ajustar baseado em realidade

Versionamento simples: comente mudanças importantes no topo do documento alterado.
