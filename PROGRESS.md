# PROGRESS.md — andamento do Painel LCDPR

_Última atualização: 26/11/2026_

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

## Em andamento
- PR da Fase 1 aguardando revisão e validação com arquivo real (no computador da Ananda).

## Pendências / dúvidas para a Ananda
- Confirmar com arquivo real: QTD_LIN inclui o 9999? Lançamentos TIPO_LANC 3 movimentam o saldo?
  (O painel aponta como alerta se o arquivo tratar diferente.)
- Cópia do TXT real ainda na biblioteca de arquivos do projeto (aguardando "pode apagar").

## Próximos passos (Fase 2 — Domínio, branch `fase-2-dominio`)
1. Agregações mensais, por natureza, por imóvel e por participante.
2. Consolidação de produtores com regra para condôminos (0045) e escolha do critério.
3. Regras de IRPF: resultado real x 20% da receita bruta, prejuízo a compensar.
4. Testes dos cálculos.
