# PROGRESS.md — andamento do Painel LCDPR

_Última atualização: 25/11/2026_

## Feito
### Fase 0 — Fundação (branch `fase-0-fundacao`)
- `.gitignore` com bloqueio de dados reais (primeiro commit).
- Vite + TypeScript (strict) + Vitest; build com política de segurança (CSP) que bloqueia envio de dados.
- Estrutura de pastas `src/parser`, `src/domain`, `src/ui`, `src/report`, `src/workers`, `tests/fixtures`.
- Módulos iniciais com testes: dinheiro em centavos (`dinheiro.ts`) e detecção de encoding (`encoding.ts`). 11 testes passando.
- Tela inicial com a identidade Grupo Paraná e área para arrastar os TXT (ainda sem leitura).
- Verificação automática de sigilo (`npm run sigilo`).
- CI (sigilo, tipos, testes, build) e deploy no GitHub Pages a partir da `main`.
- CLAUDE.md e PROGRESS.md.

## Em andamento
- PR da Fase 0 aguardando revisão.

## Pendências da usuária
- 26/11/2026: decidido tornar o repositório **público** e publicar no GitHub Pages gratuito
  (sem custo). Histórico do git auditado antes: nenhum dado real.
- Passos manuais (só a dona do repositório pode fazer):
  1. Settings → General → Danger Zone → Change visibility → Public.
  2. Settings → Pages → Source: "GitHub Actions".
  3. Fazer o merge do PR #1; o deploy roda sozinho.

## Próximos passos (Fase 1 — Parser e validação, branch `fase-1-parser`)
1. Conferir cada campo no Manual do LCDPR e montar a tabela de definição de registros.
2. Gerador de fixtures sintéticas (CPF/CNPJ fictícios com dígito válido).
3. Parser orientado à tabela, rodando em Web Worker.
4. Validações (estrutura, integridade, conciliação Q100×Q200, riscos) com testes.
5. Aba "Saúde do Arquivo" e exportação CSV.
