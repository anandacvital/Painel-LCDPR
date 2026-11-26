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
| `src/ui/` | abas e componentes |
| `src/report/` | PDF |
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
- Cores só via tokens CSS. Vermelho = alerta/negativo; verde = agro/receitas;
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

### Pontos que o Manual NÃO define (premissas adotadas — validar com arquivo real)
- **QTD_LIN do 9999**: assumimos que conta todas as linhas, inclusive o próprio 9999 (padrão SPED).
- **TIPO_LANC 3** (adiantamento recebido em ano anterior): o Manual não diz se movimenta o saldo.
  O painel calcula o saldo com a entrada; se o arquivo não a considerar, aponta ALERTA específico
  (não erro) na linha. Confirmar com o sistema gerador (Domínio/Protheus).
- Exemplos do Manual mostram espaços antes de valores no Q200; o painel aceita com alerta.

### Critérios de risco (do painel, não da Receita; nunca são "erro")
- Sem documento (NUM_DOC vazio), histórico genérico (lista em `validacoes.ts`), lançamento em
  fim de semana/feriado nacional (`domain/datas.ts`, sem feriados estaduais/municipais),
  valor atípico (Tukey sobre log do valor, Q3 + 2×IQR, mínimo 20 lançamentos do tipo),
  concentração (> 50% das receitas ou despesas em um participante), duplicidade
  (mesma data, valor e documento).

## 8. Consolidação de produtores (decisão pendente — Fase 2)
Condôminos (0045) podem ter arquivos com a operação inteira ou só a parcela.
O painel deve avisar o risco de duplicidade e deixar o usuário escolher o critério.
Documentar aqui a regra adotada.

## 9. Decisões registradas
- 25/11/2026: valores em centavos inteiros; CSP sem conexão de rede no build;
  verificação de sigilo no CI; ECharts adiado para a Fase 3.
- 25/11/2026: arquivo real enviado pela usuária usado só para conferir estrutura
  e apagado da máquina de trabalho; fixtures serão 100% sintéticas.
- 26/11/2026: Fase 1 — persistência desligada por padrão; cor âmbar para o semáforo amarelo;
  premissas de QTD_LIN e TIPO_LANC 3 registradas na seção 7.
- 26/11/2026: repositório público + GitHub Pages gratuito (sem orçamento para plano pago).
  Consequência: qualquer arquivo versionado fica público na hora; a verificação de
  sigilo e o .gitignore são a barreira e não podem ser afrouxados.
