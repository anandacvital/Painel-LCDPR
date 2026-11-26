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

### Fase 5 (antecipada) — Relatórios para impressão (branch `fase-5-impressao`)
- Botão "Imprimir / salvar PDF" no Validador e "Imprimir relatório executivo" no Painel.
- Impressão pelo próprio navegador (A4 retrato, `src/report/impressao.ts` + `styles/impressao.css`):
  nada sai do computador, PDF com texto selecionável e gráficos vetoriais.
- Validador: cabeçalho (produtor, CPF, ano-base, arquivo, emissão), conclusão, contagens,
  identificação, resumo por regra e TODAS as ocorrências com linha, campo e como corrigir.
- Executivo: indicadores com variação, aviso de estimativa do IRPF, avisos de consolidação,
  destaques, gráfico mensal, tabela mês a mês, imóveis (gráfico e tabela), 5 maiores clientes e fornecedores.
- 90 testes passando.

### Relatórios detalhados (branch `fase-5-razoes`)
- Menu "Imprimir relatórios" no Painel: Relatório executivo, Livro Caixa completo (por data, saldo linha a
  linha, totais mensais), Razão por imóvel (subtotais), Razão por conta bancária (saldo calculado por conta,
  para conciliar com o extrato) e Razão por participante (total e %). Em A4 paisagem (`report/razoes.ts`).
- Detalhamento: botão "Imprimir (filtro atual)" com os filtros descritos no cabeçalho.

### LCDPR de exemplo: segundo produtor e prévia de 2026 (mesma branch)
- Produtor 2 (CONDOMINO EXEMPLO FICTICIO): pecuária de corte + 40% da Santa Cruz espelhando os lançamentos
  do produtor 1 (mesma data, documento e participante, valor 40/60). 2024 com prejuízo, 2025 com lucro.
  O painel diagnostica "parcela" (somar é o correto).
- Prévia de 2026 do produtor 1 até 31/10/2026 (`ateMes` no gerador).
- Validador: arquivo que termina antes de 31/12 sem situação especial gera o alerta `PREVIA` (não transmitir).
- Painel: ano marcado "(prévia)", aviso na Visão Executiva e no relatório executivo, variações contra o
  MESMO PERÍODO do ano anterior, meses param no último mês do arquivo. Em "todos os produtores", o ano
  anterior só considera os produtores que têm arquivo no ano atual.
- Parâmetros em `scripts/exemplos.ts`; `npm run fixtures` regera tudo. 110 testes passando.

### Fase 4 — Planejamento IRPF (branch `fase-4-irpf`)
- Aba "Planejamento IRPF" no Painel, um cartão por produtor (CPF): real x 20% lado a lado com selo da
  melhor opção e alerta de perda do prejuízo; projeção até dezembro na prévia (com opção de usar só o
  realizado); prejuízo encadeado pelos anos carregados (+ saldo anterior digitado); simulador "e se"
  com ponto de equilíbrio; checklist de cuidados com base legal; relatório para impressão.
- Imposto pela tabela progressiva ANUAL de 2024, 2025 e 2026 (páginas "Tributação de 20XX" da Receita)
  + redução anual da Lei 15.270/2025 a partir de 2026. Vale também para a Visão Executiva, que agora
  soma o imposto de cada produtor (cada CPF tributa a sua parte).
- Limite do LCDPR conferido: R$ 4,8 mi (IN SRF 83/2001, art. 23-A, redação da IN RFB 1.903/2019).
- Cálculos em `domain/planejamento.ts` e `domain/irpf.ts`; tela em `ui/painel/planejamento.ts`;
  relatório em `report/planejamento.ts`. 120 testes.

### Cenários do simulador (branch `fase-4-cenarios`)
- Salvar cenários com nome (por produtor e ano), renomear, apagar e "usar no simulador".
- Comparação lado a lado: melhor opção, base, imposto, economia (definitiva x só adiada para o ano
  seguinte), saldo do Livro Caixa em 31/12 e entrada em janeiro; destaque do cenário com maior
  economia DEFINITIVA; alerta de caixa negativo. Também no relatório de planejamento impresso.
- Guardados no IndexedDB (loja `cenarios`, banco versão 2) SÓ com "Manter as análises" ligado;
  "Apagar dados" apaga junto. Cálculos em `domain/cenarios.ts`. 126 testes.

## Em andamento
- PR dos cenários.

## Pendências / dúvidas para a Ananda
- Cópia do TXT real ainda na biblioteca de arquivos do projeto (aguardando "pode apagar").
- Lei nº 9.250/1995, art. 18: texto não conferido (fonte indisponível).

## Próximos passos
- Ouvir a Ananda sobre a aba de Planejamento IRPF.
- Cadastrar a tabela progressiva de cada novo ano em `TABELAS_ANUAIS` (`domain/irpf.ts`).
- Tributação mínima de altas rendas (Lei 15.270/2025) não é calculada: só alertada.
