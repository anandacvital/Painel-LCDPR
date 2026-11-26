/**
 * Parâmetros dos arquivos "LCDPR de exemplo" (fictícios), usados pelo script
 * gerar-fixtures.ts e pelo teste tests/exemplo.test.ts.
 *
 * - Produtor 1 (PRODUTOR EXEMPLO FICTICIO): grãos e pecuária, 60% da Santa Cruz.
 *   2024 e 2025 completos e uma PRÉVIA de 2026 até outubro (ano em andamento).
 * - Produtor 2 (CONDOMINO EXEMPLO FICTICIO): pecuária de corte e os 40% da Santa Cruz.
 */
import { gerarExemplo, type OpcoesExemplo } from '../tests/fixtures/gerador-exemplo.ts';
import { gerarExemploCondomino } from '../tests/fixtures/gerador-exemplo-condomino.ts';

export interface Exemplo {
  arquivo: string;
  ano: number;
  gerar: () => string;
  /** O que o teste espera do arquivo. */
  esperado: { resultado: 'positivo' | 'negativo'; previa?: boolean };
}

// 2024: preços mais baixos e insumos caros (margem apertada).
const P1_2024: OpcoesExemplo = { ano: 2024, fatorReceita: 0.85, fatorDespesa: 1.12, semente: 2024 };
// 2025: safra boa (margem perto de 30%).
const P1_2025: OpcoesExemplo = { ano: 2025, fatorReceita: 1, fatorDespesa: 1, semente: 2025 };
// 2026 (prévia até outubro): preço um pouco melhor e insumos mais caros.
const P1_2026: OpcoesExemplo = { ano: 2026, fatorReceita: 1.04, fatorDespesa: 1.08, semente: 2026, ateMes: 10 };

export const EXEMPLOS: readonly Exemplo[] = [
  { arquivo: 'exemplo-lcdpr-2024.txt', ano: 2024, gerar: () => gerarExemplo(P1_2024).texto, esperado: { resultado: 'positivo' } },
  { arquivo: 'exemplo-lcdpr-2025.txt', ano: 2025, gerar: () => gerarExemplo(P1_2025).texto, esperado: { resultado: 'positivo' } },
  { arquivo: 'exemplo-lcdpr-2026-previa-ate-outubro.txt', ano: 2026, gerar: () => gerarExemplo(P1_2026).texto, esperado: { resultado: 'positivo', previa: true } },
  // Produtor 2 em 2024: arroba em baixa e reposição cara → PREJUÍZO (para ver a compensação no IRPF).
  {
    arquivo: 'exemplo-condomino-lcdpr-2024.txt', ano: 2024,
    gerar: () => gerarExemploCondomino({ ano: 2024, fatorReceita: 0.82, fatorDespesa: 1.1, semente: 2024 }, P1_2024).texto,
    esperado: { resultado: 'negativo' },
  },
  // Produtor 2 em 2025: arroba em alta → resultado positivo, margem menor que a do produtor 1.
  {
    arquivo: 'exemplo-condomino-lcdpr-2025.txt', ano: 2025,
    gerar: () => gerarExemploCondomino({ ano: 2025, fatorReceita: 1.05, fatorDespesa: 1, semente: 2025 }, P1_2025).texto,
    esperado: { resultado: 'positivo' },
  },
];
