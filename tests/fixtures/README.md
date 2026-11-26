# tests/fixtures — SOMENTE arquivos sintéticos

Esta é a única pasta onde arquivos `.txt` podem ser versionados.

Regras:
- Todo arquivo aqui é **gerado artificialmente**: nomes, CPFs, CNPJs, imóveis,
  contas e valores fictícios (CPF/CNPJ válidos apenas no formato e dígito).
- **Nunca** copie ou "anonimize" um arquivo LCDPR real para cá.

## LCDPR de exemplo (para testar o painel)

`exemplo-lcdpr-2024.txt` e `exemplo-lcdpr-2025.txt` simulam o mesmo produtor
fictício em dois anos, com calendário agrícola realista de MS:

| Imóvel | Atividade | Participação |
|---|---|---|
| 001 Fazenda Exemplo Boa Vista | soja (venda fev–abr) e milho safrinha (jul–ago) | 100% |
| 002 Sítio Exemplo Água Limpa | pecuária (venda mar, jun, out, nov) | 100% |
| 003 Fazenda Exemplo Santa Cruz | soja em condomínio (só a parcela de 60%) | 60% (0045 com condômino de 40%) |

- 132 lançamentos por ano, só em dias úteis, todos com documento.
- 2 contas, 7 compradores, 14 fornecedores e 4 empregados (todos fictícios).
- Resultado positivo nos dois anos: 2024 com margem de ~13% (resultado real
  tende a compensar no IRPF) e 2025 com ~30% (opção pelos 20% tende a compensar).
- O caixa fica negativo só em janeiro (custeio antes da colheita).
- Passam no Validador sem erros nem alertas (`tests/exemplo.test.ts`).

Gerados por `gerador-exemplo.ts` com os parâmetros de `scripts/exemplos.ts`
(`npm run fixtures`).
