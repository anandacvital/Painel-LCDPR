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
- Imposto = ESTIMATIVA a 27,5% sobre a base; sempre exibir `AVISO_ESTIMATIVA`.
- Lei nº 9.250/1995, art. 18 (citado no briefing) NÃO foi conferido no texto oficial: validar antes de citar.
- Projeção: sazonal pelo ano anterior quando houver; senão média mensal. Simulação sempre
  mostra os cuidados (pagamento até 31/12, substância econômica).

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
