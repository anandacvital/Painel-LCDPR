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
- Cores só via tokens CSS. Vermelho = alerta/negativo; verde = agro/receitas.
- Fontes: DM Sans (texto), DM Mono com `tabular-nums` (números).

## 6. Comandos
| Comando | O que faz |
|---|---|
| `npm install` | instala dependências (primeira vez) |
| `npm run dev` | abre o painel em http://localhost:5173 |
| `npm test` | roda os testes |
| `npm run typecheck` | checa tipos |
| `npm run sigilo` | confere que nenhum dado real está versionado |
| `npm run verificar` | tudo acima + build (mesmo que o CI) |
| `npm run build` | gera o site em `dist/` |

## 7. Leiaute LCDPR — observações (CONFIRMAR NO MANUAL antes de codificar)
Fonte oficial: Manual de Orientação do LCDPR (RFB) e IN RFB nº 1.848/2018.
Observado na estrutura de um arquivo real (sem dados copiados), em 25/11/2026:
- Linha começa direto pelo código do registro (sem `|` inicial); quebra CRLF; ASCII.
- Quantidade de campos por linha ao separar por `|`: 0000=10, 0010=2, 0030=10,
  0040=17, 0045=6, 0050=7, Q100=13 (último vazio: linha termina com `|`), Q200=6, 9999=7.
- Q100: data DDMMAAAA, código do imóvel e da conta com 3 dígitos, participante
  com 11 (CPF) ou 14 (CNPJ) dígitos, tipo de lançamento 1/2/3, natureza do saldo P/N.
- Q200: mês MMAAAA e natureza do saldo P/N.
- 0040 com UF; 0045 com tipo de terceiro (1/2 observados) e CPF/CNPJ.
- Valores com 2 decimais implícitos, podem vir com zeros à esquerda.
Tudo acima é observação empírica: a Fase 1 deve conferir nome, ordem, tamanho e
obrigatoriedade de cada campo no Manual vigente e citar a versão.

## 8. Consolidação de produtores (decisão pendente — Fase 2)
Condôminos (0045) podem ter arquivos com a operação inteira ou só a parcela.
O painel deve avisar o risco de duplicidade e deixar o usuário escolher o critério.
Documentar aqui a regra adotada.

## 9. Decisões registradas
- 25/11/2026: valores em centavos inteiros; CSP sem conexão de rede no build;
  verificação de sigilo no CI; ECharts adiado para a Fase 3.
- 25/11/2026: arquivo real enviado pela usuária usado só para conferir estrutura
  e apagado da máquina de trabalho; fixtures serão 100% sintéticas.
