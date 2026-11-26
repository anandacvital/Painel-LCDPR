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

### LCDPR de exemplo (PR #4, já na `main`)
- `tests/fixtures/exemplo-lcdpr-2024.txt` e `-2025.txt`: produtor fictício, 3 imóveis (um em condomínio 60/40),
  calendário agrícola de MS, resultado positivo (margem ~13% e ~30%), Validador sem erros nem alertas.

### Fase 3 — Painel do Livro Caixa (branch `fase-3-painel`)
- Dois módulos no cabeçalho: Validador (antes de transmitir) | Painel do Livro Caixa (arquivos transmitidos).
- Barra do Painel: produtor (todos ou um), ano-base, critério de consolidação (com avisos) e saúde dos arquivos.
- Abas: Visão Executiva (KPIs com variação vs. ano anterior, IRPF estimado, 3 destaques), Fluxo de Caixa
  (cascata, acumulado, sazonalidade), Receitas & Despesas (top 10, tipo de documento, contas, tabela mensal),
  Imóveis (resultado por imóvel e cartões), Comparativo (produtores e ano contra ano), Detalhamento
  (todos os Q100 com filtros, busca sem acento, ordenação, rolagem virtual e CSV).
- ECharts 6.1 (modular, SVG) com a paleta Grupo Paraná; todo título diz a conclusão (`domain/destaques.ts`).
- 87 testes passando.

## Em andamento
- PR da Fase 3.

## Pendências / dúvidas para a Ananda
- Cópia do TXT real ainda na biblioteca de arquivos do projeto (aguardando "pode apagar").
- Lei nº 9.250/1995, art. 18: texto não conferido (fonte indisponível).

## Próximos passos (Fase 4 — Planejamento IRPF, branch `fase-4-irpf`)
1. Aba Planejamento IRPF: resultado real x 20% da receita bruta, com prejuízo anterior informado pela usuária.
2. Projeção até dezembro (sazonal pelo ano anterior ou média) e simulação antecipar despesas/postergar receitas.
3. Insights com base legal e os cuidados (pagamento até 31/12, substância econômica).
