/**
 * Gera os arquivos LCDPR SINTÉTICOS de exemplo em tests/fixtures/.
 * Rode com: npm run fixtures
 *
 * - lcdpr-sintetico-2025.txt: arquivo íntegro (semáforo verde).
 * - lcdpr-sintetico-com-problemas-2025.txt: o mesmo arquivo com problemas
 *   injetados de propósito, para ver a aba Saúde do Arquivo funcionando.
 *
 * - exemplo-*.txt: "LCDPR de exemplo" com calendário agrícola realista, para
 *   testar o painel (dois produtores condôminos e uma prévia de 2026; ver scripts/exemplos.ts).
 *
 * Todos os dados são fictícios. Nunca use este script com arquivo real.
 */
import { writeFileSync } from 'node:fs';
import { gerarLcdpr, montarTexto } from '../tests/fixtures/gerador.ts';
import { EXEMPLOS } from './exemplos.ts';

const pasta = new URL('../tests/fixtures/', import.meta.url);

const limpo = gerarLcdpr({ semente: 2025, lancamentosPorMes: 25 });
writeFileSync(new URL('lcdpr-sintetico-2025.txt', pasta), limpo.texto, 'latin1');

const linhas = [...limpo.linhas];
const q100 = linhas.flatMap((l, i) => (l.startsWith('Q100|') ? [i] : []));
const trocar = (i: number, pos: number, valor: string): void => {
  const p = linhas[i]!.split('|');
  p[pos] = valor;
  linhas[i] = p.join('|');
};
trocar(q100[3]!, 4, ''); // sem documento
trocar(q100[5]!, 6, 'Diversos'); // histórico genérico
trocar(q100[8]!, 7, '11222333000180'); // CNPJ com DV inválido
trocar(q100[12]!, 2, '009'); // imóvel não cadastrado
trocar(q100[40]!, 11, '1'); // saldo divergente
trocar(linhas.findIndex((l) => l.startsWith('Q200|')) + 2, 3, '1'); // Q200 de março divergente
trocar(linhas.length - 1, 6, '9'); // QTD_LIN errado
writeFileSync(new URL('lcdpr-sintetico-com-problemas-2025.txt', pasta), montarTexto(linhas), 'latin1');

console.log('Fixtures sintéticas geradas em tests/fixtures/.');

// "LCDPR de exemplo" (calendário agrícola realista), para testar o painel.
for (const ex of EXEMPLOS) {
  writeFileSync(new URL(ex.arquivo, pasta), ex.gerar(), 'latin1');
}
