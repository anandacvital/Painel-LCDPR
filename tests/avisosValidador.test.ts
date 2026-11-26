/**
 * Avisos novos do Validador (Fase 7): receita que pode não ser rural,
 * duplicidade pelo participante, valor redondo alto e despesa sem documento.
 * Só arquivos sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { analisarTexto } from '../src/parser/analisar';
import { receitaNaoRural } from '../src/parser/validacoes';
import { gerarLcdpr, montarTexto } from './fixtures/gerador';

const base = () => gerarLcdpr({ semente: 7, lancamentosPorMes: 10 });
const ocorrencias = (linhas: string[]) => analisarTexto(montarTexto(linhas), 'teste.txt').ocorrencias;
const daRegra = (linhas: string[], regra: string) => ocorrencias(linhas).filter((o) => o.regra === regra);

/** Índices das linhas Q100 de um tipo de lançamento ('1' receita, '2' despesa). */
const q100DoTipo = (linhas: string[], tipo: string) =>
  linhas.map((l, i) => [l.split('|'), i] as const).filter(([p]) => p[0] === 'Q100' && p[8] === tipo).map(([, i]) => i);

function trocarCampo(linhas: string[], i: number, pos: number, valor: string): void {
  const p = linhas[i]!.split('|');
  p[pos] = valor;
  linhas[i] = p.join('|');
}

describe('receitaNaoRural (palavras do histórico)', () => {
  it.each([
    ['Recebimento arrendamento pastagem', 'RECEITA-ARRENDAMENTO'],
    ['Aluguel do galpão', 'RECEITA-ARRENDAMENTO'],
    ['Locação de trator', 'RECEITA-ARRENDAMENTO'],
    ['Venda de parte da Fazenda Boa Vista', 'RECEITA-TERRA-NUA'],
    ['Alienação de terras - gleba 3', 'RECEITA-TERRA-NUA'],
    ['Venda da caminhonete', 'RECEITA-IMOBILIZADO'],
    ['Venda de trator usado', 'RECEITA-IMOBILIZADO'],
  ])('"%s" → %s', (hist, regra) => {
    expect(receitaNaoRural(hist)?.regra).toBe(regra);
  });

  it.each([
    'Venda de soja - Fazenda Boa Vista',
    'Venda de milho transportado por caminhão',
    'Venda de bezerros',
    'Partilha de parceria agrícola (contrato de arrendamento convertido)',
  ])('"%s" não é apontado', (hist) => {
    expect(receitaNaoRural(hist)).toBeNull();
  });
});

describe('avisos no arquivo', () => {
  it('o arquivo limpo não tem nenhum dos avisos novos', () => {
    const oc = ocorrencias(base().linhas);
    for (const regra of ['RECEITA-ARRENDAMENTO', 'RECEITA-TERRA-NUA', 'RECEITA-IMOBILIZADO', 'DUPLICIDADE-PARTICIPANTE']) {
      expect(oc.filter((o) => o.regra === regra)).toEqual([]);
    }
  });

  it('receita de arrendamento vira ALERTA na linha, com a base legal', () => {
    const { linhas } = base();
    const i = q100DoTipo(linhas, '1')[0]!;
    trocarCampo(linhas, i, 6, 'Arrendamento recebido - pastagem');
    const oc = daRegra(linhas, 'RECEITA-ARRENDAMENTO');
    expect(oc).toHaveLength(1);
    expect(oc[0]).toMatchObject({ linha: i + 1, severidade: 'alerta', campo: 'HIST' });
    expect(oc[0]!.comoCorrigir).toContain('Lei nº 8.023/1990');
    expect(oc[0]!.comoCorrigir).toContain('RIR/2018');
  });

  it('o mesmo histórico numa DESPESA não é apontado (só receita)', () => {
    const { linhas } = base();
    const i = q100DoTipo(linhas, '2')[0]!;
    trocarCampo(linhas, i, 6, 'Arrendamento pago - pastagem');
    expect(daRegra(linhas, 'RECEITA-ARRENDAMENTO')).toEqual([]);
  });

  it('venda de imobilizado e de terra', () => {
    const { linhas } = base();
    const [a, b] = q100DoTipo(linhas, '1');
    trocarCampo(linhas, a!, 6, 'Venda do trator MF 4292');
    trocarCampo(linhas, b!, 6, 'Venda de area de 20 hectares');
    expect(daRegra(linhas, 'RECEITA-IMOBILIZADO')[0]?.linha).toBe(a! + 1);
    expect(daRegra(linhas, 'RECEITA-TERRA-NUA')[0]?.linha).toBe(b! + 1);
  });

  it('duplicidade pelo participante: mesma data, valor e participante, documento diferente', () => {
    const { linhas } = base();
    const i = q100DoTipo(linhas, '2')[3]!;
    const copia = linhas[i]!.split('|');
    copia[4] = `${copia[4]}-B`;
    linhas.splice(i + 1, 0, copia.join('|'));
    const dup = daRegra(linhas, 'DUPLICIDADE-PARTICIPANTE');
    expect(dup).toHaveLength(1);
    expect(dup[0]!.linha).toBe(i + 2);
    expect(dup[0]!.problema).toContain(`linha ${i + 1}`);
    // A regra antiga (mesmo documento) não dispara: os documentos são diferentes.
    expect(daRegra(linhas, 'DUPLICIDADE')).toEqual([]);
  });

  it('valor redondo alto é informação; valor quebrado ou pequeno não', () => {
    const { linhas } = base();
    const [i, j] = q100DoTipo(linhas, '2');
    trocarCampo(linhas, i!, 10, '1500000'); // R$ 15.000,00
    trocarCampo(linhas, j!, 10, '500000'); // R$ 5.000,00: abaixo do mínimo
    const oc = daRegra(linhas, 'VALOR-REDONDO');
    expect(oc.map((o) => o.linha)).toEqual([i! + 1]);
    expect(oc[0]!.severidade).toBe('info');
  });

  it('despesa sem documento cita a comprovação da IN SRF nº 83/2001', () => {
    const { linhas } = base();
    const i = q100DoTipo(linhas, '2')[0]!;
    trocarCampo(linhas, i, 4, '');
    const oc = daRegra(linhas, 'SEM-DOCUMENTO');
    expect(oc[0]?.problema).toMatch(/^Despesa/);
    expect(oc[0]?.comoCorrigir).toContain('art');
    expect(oc[0]?.comoCorrigir).toContain('IN SRF nº 83/2001');
  });

  it('participante com CPF/CNPJ de dígito inválido continua apontado', () => {
    const { linhas } = base();
    const i = linhas.findIndex((l) => l.startsWith('0050|'));
    const p = linhas[i]!.split('|');
    const doc = p[2]!;
    p[2] = doc.slice(0, -1) + String((Number(doc.at(-1)) + 1) % 10);
    linhas[i] = p.join('|');
    expect(ocorrencias(linhas).some((o) => o.linha === i + 1 && o.severidade === 'erro')).toBe(true);
  });
});
