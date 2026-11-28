# CLAUDE.md — memória do projeto Painel LCDPR (Grupo Paraná)

Leia este arquivo e o `PROGRESS.md` no início de toda sessão. Atualize-o sempre
que uma decisão mudar.

## 1. Objetivo
Painel web para analisar o TXT do LCDPR (Livro Caixa Digital do Produtor Rural):
saúde do arquivo, visão executiva, fluxo de caixa, imóveis, comparativos e
planejamento de IRPF da atividade rural. Usuária: Ananda (contadora, não
desenvolvedora): explicar decisões em linguagem simples e comentar o código.

## 2. Regras de sessão (obrigatórias)
1. Ao iniciar: ler CLAUDE.md e PROGRESS.md, rodar `git status` e
   `git log --oneline -10`, e resumir em 3 linhas (onde paramos, próximo passo,
   pendências sem commit).
2. Commit e push ao fim de cada etapa. Mensagens em português: `tipo: descrição`
   (feat, fix, refactor, docs, test, style, chore).
3. Uma branch por fase (`fase-N-nome`) e um Pull Request ao fim da fase.
4. Antes de pausas ou quando a usuária disser "vamos parar": atualizar
   PROGRESS.md, commit e push.

## 3. Sigilo de dados (inegociável)
- NUNCA versionar TXT/PDF reais, CPF, CNPJ, nomes de produtores, imóveis ou valores reais.
- `.gitignore` bloqueia `*.txt`, `*.pdf`, `*.csv`, `*.xls(x)`, `dados/`, `.env`;
  exceção só para `tests/fixtures/`.
- `npm run sigilo` (também no CI) falha se algum desses arquivos for versionado fora de fixtures.
- Fixtures são **geradas do zero** (nunca anonimizar arquivo real: datas e valores reidentificam).
- O build de produção injeta CSP com `connect-src 'none'`: o navegador bloqueia
  qualquer envio de dados pela página. Não afrouxar sem aprovação da usuária.
- Conferir o diff antes de cada commit.

## 4. Arquitetura (decidida pela usuária — não mudar sem consultar)
- 100% estático no navegador; TXT lido localmente e nunca enviado.
- Vite + TypeScript (strict) + Apache ECharts (entra na Fase 3). Sem framework de UI.
- Parsing em Web Worker. Persistência opcional em IndexedDB com botão "Limpar dados deste computador".
- Publicação: GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`, só a partir da `main`).
- Testes: Vitest em `tests/**/*.test.ts`.
- Fluxo: arquivo → `workers/cliente.ts` → `workers/parser.worker.ts` → `parser/analisar.ts`
  (`parser.ts` lê e confere campos pela tabela; `validacoes.ts` cruza registros) → `ui/app.ts`.
- Persistência (`ui/armazenamento.ts`): DESLIGADA por padrão; só salva o resultado da análise
  (nunca o TXT) se a pessoa marcar "Manter as análises neste computador". O botão
  "Apagar dados deste computador" apaga o IndexedDB inteiro e a preferência.
- Mesmo produtor (CPF) + mesmo ano-base enviado de novo substitui a análise anterior (com aviso).

### Pastas
| Pasta | Conteúdo |
|---|---|
| `src/parser/` | leitura do TXT, encoding, tabela de registros, validações |
| `src/domain/` | cálculos e regras (sem dependência de tela) |
| `src/ui/` | `app.ts` (módulos Validador e Painel), `saudeArquivo.ts`, `painel/` (abas do Painel), `graficos/` (ECharts) |
| `src/report/` | CSV e relatórios para impressão/PDF (`impressao.ts`) |
| `src/workers/` | Web Worker do parser |
| `src/styles/` | `tokens.css` (paleta e fontes) e `base.css` |
| `tests/` | testes; `tests/fixtures/` só sintéticos |
| `scripts/` | utilitários (verificação de sigilo) |

## 5. Convenções
- **Dinheiro sempre em centavos inteiros** (`src/domain/dinheiro.ts`). Nunca usar
  decimal para somar. Formatar só na exibição (`formatarReais`).
- Encoding: tentar UTF-8; se surgir "�", reler como ISO-8859-1 (`src/parser/encoding.ts`).
- Ano-base vem do registro 0000 (data inicial), nunca do nome do arquivo.
- Nomes de funções e variáveis em português, comentários explicando o "porquê".
- Cores só via tokens CSS. Vermelho = alerta/negativo/despesas; verde = agro/receitas;
  âmbar `--gp-atencao` só para o nível amarelo do semáforo (fora da paleta institucional).
- Todo texto vindo do TXT passa por `esc()` (`ui/html.ts`) antes de ir para a tela.
- CSV: separador `;`, BOM UTF-8 e proteção contra fórmula (`report/csv.ts`).
- Fontes: DM Sans (texto), DM Mono com `tabular-nums` (números).

## 6. Comandos
| Comando | O que faz |
|---|---|
| `npm install` | instala dependências (primeira vez) |
| `npm run dev` | abre o painel em http://localhost:5173/Painel-LCDPR/ |
| `npm test` | roda os testes |
| `npm run typecheck` | checa tipos |
| `npm run sigilo` | confere que nenhum dado real está versionado |
| `npm run verificar` | tudo acima + build (mesmo que o CI) |
| `npm run build` | gera o site em `dist/` |
| `npm run fixtures` | regera os TXT sintéticos de exemplo em `tests/fixtures/` |

## 7. Leiaute LCDPR (confirmado no Manual em 26/11/2026)
Fonte: Manual de Preenchimento do LCDPR, leiaute 1.3 (ADE COPES nº 1/2020; IN RFB nº 1.848/2018),
https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/lcdpr-livro-caixa-digital-do-produtor-rural/manual-de-preenchimento-do-lcdpr-1-3
- Tabela completa de campos em `src/parser/leiaute.ts` (fonte única: mudou o leiaute, muda só ali).
- Linha começa pelo código do registro (sem `|` inicial) e o último campo não tem `|` depois. CRLF.
  O leitor tolera `|` no início/fim com alerta.
- Ordem: 0000, 0010, 0030, 0040/0045, 0050, Q100, Q200, 9999.
- Códigos especiais no Q100: imóvel `000` = despesa comum de condomínio/parceria; conta `000` = espécie;
  conta `999` = valor que não passou por conta.
- 0045 obrigatório quando 0040.PARTICIPACAO < 100% ou TIPO_EXPLORACAO ≠ 1.
- Saldo: começa em zero no ano; cada Q100 traz o saldo após o lançamento; Q200 traz saldo acumulado.

### Pontos que o Manual NÃO define (resolvidos pelo Perguntas e Respostas do LCDPR)
- **QTD_LIN do 9999**: conta todas as linhas, inclusive o próprio 9999 (exemplo da pergunta 12).
- **TIPO_LANC 3**: lançado no ano em que a receita é reconhecida (entrega), com a data do
  adiantamento no histórico (pergunta 31). O painel soma a entrada ao saldo; se o arquivo não
  somar, aponta ALERTA específico (não erro) na linha.
- Exemplos do Manual mostram espaços antes de valores no Q200; o painel aceita com alerta.

### Critérios de risco (do painel, não da Receita; nunca são "erro")
- Sem documento (NUM_DOC vazio), histórico genérico (lista em `validacoes.ts`), lançamento em
  fim de semana/feriado nacional (`domain/datas.ts`, sem feriados estaduais/municipais),
  valor atípico (Tukey sobre log do valor, Q3 + 2×IQR, mínimo 20 lançamentos do tipo),
  concentração (> 50% das receitas ou despesas em um participante), duplicidade
  (mesma data, valor e documento).

## 8. Consolidação de produtores (`src/domain/consolidacao.ts`)
Regra da Receita: cada condômino/parceiro escritura SÓ A SUA PARCELA (Perguntas e Respostas
LCDPR, perguntas 47 e 52; Lei nº 8.023/1990, art. 13). Por isso o critério padrão é **somar**.
- Arquivos vinculados (mesmo ano): um produtor é terceiro (0045) no arquivo do outro, ou ambos
  cadastram o mesmo NIRF. Lançamentos espelhados: mesma data, documento, participante e tipo.
- Diagnóstico pelos percentuais do 0040: valores iguais com percentuais diferentes =
  operação inteira (risco de duplicidade); valores na proporção = parcela; 50/50 = indeterminado.
- Critérios que o usuário escolhe: `somar` (padrão), `proporcional` (aplica % do 0040 aos
  imóveis com participação < 100%), `sem-duplicar` (operação idêntica entre condôminos conta 1 vez).
- Sempre exibir os avisos de duplicidade/subestimação gerados pela consolidação.

## 8.1 Regras de cálculo e IRPF (`src/domain/agregacoes.ts`, `src/domain/irpf.ts`)
- Receita bruta = VL_ENTRADA dos tipos 1 e 3 (saída nesses tipos = devolução, reduz).
  Despesa = VL_SAIDA do tipo 2 (entrada no tipo 2 = estorno, reduz). Regime de caixa (Lei 8.023, art. 4º).
- Tipo 3 é receita do ano da entrega (P&R LCDPR, pergunta 31) e entra no saldo.
- QTD_LIN inclui o 9999 (exemplo da pergunta 12 do P&R LCDPR).
- Opção 20% da receita bruta só para resultado positivo (art. 5º); optar faz perder TODO o
  prejuízo anterior (art. 16, parágrafo único). Prejuízo de PF compensável sem limite de 30% (art. 14).
- Imposto = ESTIMATIVA pela tabela progressiva ANUAL do ano-calendário (`TABELAS_ANUAIS` em `irpf.ts`:
  2024, 2025 e 2026, conferidas nas páginas "Tributação de 20XX" da Receita em 26/11/2026) + redução anual
  da Lei 15.270/2025 (art. 11-A da Lei 9.250) a partir de 2026; só o resultado rural, sem outros rendimentos.
  Sempre exibir `AVISO_ESTIMATIVA`. Ano novo = cadastrar a tabela (senão usa a mais próxima, com aviso).
- IRPF é por CPF (art. 13): o painel nunca calcula imposto sobre a soma consolidada dos produtores.
- Obrigatoriedade do LCDPR: receita bruta > R$ 4.800.000,00 (IN SRF 83/2001, art. 23-A, redação da
  IN RFB 1.903/2019; conferido em 26/11/2026). Prazo = prazo da DIRPF.
- Prejuízo no Planejamento: encadeado pelos anos carregados supondo apuração pelo resultado real.
- Lei nº 9.250/1995, art. 18 (citado no briefing) NÃO foi conferido no texto oficial: validar antes de citar.
- Projeção: sazonal pelo ano anterior quando houver; senão média mensal. Simulação sempre
  mostra os cuidados (pagamento até 31/12, substância econômica).

## 8.2 Painel interativo (`domain/periodo.ts`, `domain/gestao.ts`, `domain/naturezas.ts`)
- Período: ano civil (padrão), safra (12 meses a partir do mês escolhido; padrão julho; abre na safra
  completa mais recente) ou meses livres (até 24). Safra/livre juntam os arquivos dos anos que tocam;
  são cortados no último mês carregado, com aviso. IRPF e Planejamento IRPF são SEMPRE do ano civil.
- Filtro cruzado: mês, imóvel (`cpf|código`), participante e natureza. Cada gráfico ignora o filtro da
  própria dimensão e destaca o item escolhido; clicar de novo tira o filtro. Comparativo e Planejamento
  ignoram período e filtro (com nota na tela). Relatórios saem com o filtro e o citam no cabeçalho.
- Natureza das despesas é INFERIDA (ajuste da pessoa > folha de pagamento > palavras do histórico >
  natureza mais comum do participante). Visão gerencial: não muda resultado nem IRPF. Ajustes guardados
  no IndexedDB (loja `ajustes`, banco v3) só com "Manter" ligado.
- Capital de giro = pior ponto do caixa acumulado da atividade a partir de zero no início do período
  (sem saldo anterior nem financiamentos). Concentração de compradores pelo HHI (< 1.500 baixa; > 2.500 alta).
- Alertas: calculados sobre o período inteiro, sem o filtro; cada um com ação (filtrar ou abrir aba).
- Livro Caixa de um mês: saldo inicial = SLD_FIN do último Q100 anterior ao mês, no mesmo ano (zero em janeiro).
- Relatórios coloridos (verde receita, vermelho despesa) com `print-color-adjust: exact`; legíveis em P&B
  (entradas e saídas em colunas separadas, sinal "-" nos negativos). Com vários produtores: "unificado"
  (um relatório, produtor em cada linha, nomes no cabeçalho) ou "separado" (um por produtor, nova página).
- Área (ha) e produção (sacas) ficam para o futuro, integradas ao sistema Vértice (Ananda, 26/11/2026).

## 8.3 Ficha DIRPF e avisos de receita (`src/domain/dirpf.ts`, `src/report/dirpf.ts`, `parser/validacoes.ts`)
- Ficha Atividade Rural por CPF, só o REALIZADO (nunca projeção), com o mesmo prejuízo inicial do Planejamento.
  Condição de exploração do 0040 → DIRPF: 1 Proprietário (conferir), 2 Condômino, 3 Arrendatário, 4 Parceiro,
  5 Comodatário, 6 Outros. Área, rebanho, bens e dívidas não estão no LCDPR (avisado). Opção 20% zera o prejuízo.
- Receita que pode não ser rural (palavras do histórico, `receitaNaoRural`): arrendamento/aluguel (IN SRF 83/2001,
  art. 4º, V), venda de terra nua (art. 9º, § 2º: ganho de capital), venda de imobilizado (art. 5º, § 2º, III:
  rural só se usado exclusivamente na atividade). "PARCERIA" no histórico não aponta arrendamento. ALERTA, não erro.
- Duplicidade por participante (mesma data, valor e participante, documento diferente) = alerta;
  valor redondo alto (≥ R$ 10.000,00 e múltiplo de R$ 1.000,00) = info.
- RIR/2018: só a faixa "arts. 50 a 61" é citada; artigos específicos do RIR não foram conferidos no texto oficial.

## 9. Decisões registradas
- 25/11/2026: valores em centavos inteiros; CSP sem conexão de rede no build;
  verificação de sigilo no CI; ECharts adiado para a Fase 3.
- 25/11/2026: arquivo real enviado pela usuária usado só para conferir estrutura
  e apagado da máquina de trabalho; fixtures serão 100% sintéticas.
- 26/11/2026: Fase 1 — persistência desligada por padrão; cor âmbar para o semáforo amarelo;
  premissas de QTD_LIN e TIPO_LANC 3 registradas na seção 7.
- 26/11/2026: Ananda pediu DOIS MÓDULOS: Validador (pré-transmissão) e Painel do Livro Caixa
  (visual, arquivos já transmitidos). Nova ordem: Fase 2 cálculos → Fase 3 Painel visual com
  a separação Validador | Painel → Fase 4 Planejamento IRPF → Fase 5 PDF.
- 26/11/2026: repositório público + GitHub Pages gratuito (sem orçamento para plano pago).
  Consequência: qualquer arquivo versionado fica público na hora; a verificação de
  sigilo e o .gitignore são a barreira e não podem ser afrouxados.
- 26/11/2026: Fase 3 — Validador e Painel compartilham os arquivos carregados; o Painel usa uma única
  "Visão" (`ui/painel/contexto.ts`) para todas as abas. Margem compara em pontos percentuais.
  CSV mantém número negativo puro como número (não é fórmula). LCDPR de exemplo em `tests/fixtures/exemplo-lcdpr-*.txt`.
- 26/11/2026: a pedido da Ananda, despesas em vermelho e receitas em verde em todos os gráficos do Painel.
- 26/11/2026: Ananda pediu os relatórios impressos antes do IRPF (Fase 5 antecipada). Impressão/PDF pelo
  navegador (window.print + CSS A4), sem biblioteca de PDF: nada sai do computador. Fase 4 (IRPF) vem depois.
- 26/11/2026: razões e Livro Caixa impressos em A4 paisagem; o saldo da Razão por conta é CALCULADO pelo painel
  (o LCDPR só traz o saldo geral).
- 26/11/2026: arquivo que termina antes de 31/12 sem situação especial = PRÉVIA (alerta `PREVIA`, não transmitir).
  No Painel, a prévia compara com o mesmo período do ano anterior e os meses param no último mês do arquivo.
- 26/11/2026: cenários do simulador guardados no IndexedDB (loja `cenarios`, banco v2) só com "Manter" ligado.
  Economia separada em definitiva (despesa a mais) e adiada (receita empurrada para janeiro: o imposto volta
  no ano seguinte); o "melhor cenário" é o de maior economia DEFINITIVA.
- 26/11/2026: Painel interativo sem aba nova (pedido da Ananda): filtro cruzado, safra e período livre,
  indicadores de gestão, alertas no topo, relatórios coloridos, Livro Caixa de um mês e unificado/separado.
- 26/11/2026: Ananda aprovou a ficha Atividade Rural da DIRPF e os avisos de receita não rural e de lançamentos
  fora do padrão (Fase 7). A ficha fica na aba Planejamento e no menu de impressão, sem aba nova.
- 28/11/2026: Ananda relatou relatório executivo sem cor. No navegador de teste (Chromium) ele sai colorido mesmo
  sem "Gráficos de plano de fundo"; causa provável: aba aberta com versão anterior ao PR #12, impressora/diálogo em
  preto e branco ou PDF de exemplo antigo. Reforço: `print-color-adjust: exact` em todos os elementos do relatório,
  dica de impressão no menu e VERSÃO do site (data do build + commit, `__VERSAO__` em vite.config.ts) no rodapé
  da página e dos relatórios.
- 28/11/2026: tooltip do Comparativo mostrava centavos no padrão americano ("1,407,944,656"): o `tooltip` próprio
  do gráfico substituía o comum e perdia o formatador. `opcoesFinais` (ui/graficos/echarts.ts) agora MESCLA
  tooltip, legend e textStyle com a base; todo gráfico (tela e relatórios) passa por ela.
- 28/11/2026: Ananda pediu um relatório com todas as abas menos o Detalhamento: "Relatório completo" no menu de
  impressão (`report/completo.ts`). As abas são desenhadas pelas MESMAS funções da tela dentro da área de impressão
  (botões/campos escondidos por `.painel-impresso`; blocos recolhidos saem abertos); Planejamento usa
  `corpoPlanejamento`. Período e filtro valem como na tela; Comparativo e Planejamento sempre ano civil sem filtro.
