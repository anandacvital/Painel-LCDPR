# PROGRESS.md — andamento do Painel LCDPR

_Última atualização: 26/11/2026 (Fase 2)_

## Feito
### Fase 0 — Fundação (PR #1, já na `main`)
- Vite + TypeScript + Vitest, CI, deploy no GitHub Pages (publicado e funcionando).
- Sigilo: `.gitignore`, `npm run sigilo` no CI, CSP sem conexão de rede.

### Fase 1 — Parser e validação (branch `fase-1-parser`)
- Leiaute 1.3 conferido no Manual oficial e transcrito em `src/parser/leiaute.ts`.
- Leitor orientado à tabela (`parser.ts`) e validações (`validacoes.ts`):
  estrutura, campos, integridade, conciliação Q100 x Q200 e saldos, riscos.
- Leitura em Web Worker (60 mil linhas em ~0,6 s no teste).
- Gerador de arquivos sintéticos e duas fixtures (íntegra e com problemas).
- Aba Saúde do Arquivo: conclusão no título, contadores, resumo por regra,
  tabela com filtros, busca, paginação e exportação CSV.
- Privacidade: aviso fixo, salvamento opcional (desligado por padrão) e botão
  "Apagar dados deste computador".
- 52 testes passando.

### Fase 2 — Cálculos (branch `fase-2-dominio`)
- Agregações: totais, por mês (12 meses, acumulado), por imóvel, conta, tipo de documento e participante.
- Consolidação de produtores com diagnóstico parcela x operação inteira e 3 critérios.
- IRPF: resultado real x 20% da receita bruta, prejuízo compensável, estimativa a 27,5%, insights com base legal.
- Projeção até dezembro (sazonal ou média) e simulação antecipar/postergar.
- 69 testes passando.

## Em andamento
- PR da Fase 2 aguardando revisão.

## Pendências / dúvidas para a Ananda
- Cópia do TXT real ainda na biblioteca de arquivos do projeto (aguardando "pode apagar").
- Lei nº 9.250/1995, art. 18: texto não conferido (fonte indisponível).

## Próximos passos (Fase 3 — Painel do Livro Caixa, branch `fase-3-painel`)
1. Separar a aplicação em dois módulos: Validador | Painel do Livro Caixa.
2. ECharts com a paleta Grupo Paraná; títulos que dizem a conclusão.
3. Abas: Visão Executiva, Fluxo de Caixa, Receitas & Despesas, Imóveis, Comparativo, Detalhamento.
4. Cabeçalho com seletor de produtor (consolidado/individual), ano e saúde do arquivo.
