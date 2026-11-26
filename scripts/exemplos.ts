/**
 * Parâmetros dos arquivos "LCDPR de exemplo" (fictícios), usados pelo script
 * gerar-fixtures.ts e pelo teste tests/exemplo.test.ts.
 */
import type { OpcoesExemplo } from '../tests/fixtures/gerador-exemplo.ts';

export const EXEMPLOS: readonly { arquivo: string; opcoes: OpcoesExemplo }[] = [
  // 2024: preços mais baixos e insumos caros (margem apertada).
  { arquivo: 'exemplo-lcdpr-2024.txt', opcoes: { ano: 2024, fatorReceita: 0.85, fatorDespesa: 1.12, semente: 2024 } },
  // 2025: safra boa (margem perto de 30%).
  { arquivo: 'exemplo-lcdpr-2025.txt', opcoes: { ano: 2025, fatorReceita: 1, fatorDespesa: 1, semente: 2025 } },
];
