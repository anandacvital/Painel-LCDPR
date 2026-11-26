import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes } from '../src/parser/analisar';
import { filtrarLancamentos, normalizar, ordenarLancamentos } from '../src/domain/filtros';

const r = analisarBytes(readFileSync(new URL('./fixtures/exemplo-lcdpr-2025.txt', import.meta.url)), 'exemplo-2025.txt');
const cpf = r.arquivo.abertura!.cpf;
const lancs = r.arquivo.lancamentos.map((l) => ({ ...l, cpf }));

describe('filtros do Detalhamento', () => {
  it('sem filtro devolve tudo', () => {
    expect(filtrarLancamentos(lancs, {})).toHaveLength(lancs.length);
  });

  it('filtra por mês, imóvel e tipo de lançamento ao mesmo tempo', () => {
    const res = filtrarLancamentos(lancs, { mes: '2025-03', imovel: `${cpf}|001`, tipoLanc: '1' });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((l) => l.data.mes === 3 && l.codImovel === '001' && l.tipoLanc === '1')).toBe(true);
  });

  it('busca ignora acentos e maiúsculas no histórico', () => {
    expect(normalizar('Óleo DIESEL')).toBe('oleo diesel');
    const res = filtrarLancamentos(lancs, { busca: 'ÓLEO diesel' });
    expect(res.length).toBe(12);
  });

  it('busca pelo número do documento e pelo CPF/CNPJ do participante', () => {
    const alvo = lancs[10]!;
    expect(filtrarLancamentos(lancs, { busca: alvo.numDoc }).map((l) => l.linha)).toContain(alvo.linha);
    const formatado = alvo.idPartic.slice(0, 5);
    expect(filtrarLancamentos(lancs, { busca: formatado }).every((l) => l.idPartic.includes(formatado) || `${l.historico} ${l.numDoc}`.includes(formatado))).toBe(true);
  });

  it('ordena por valor com sinal (maior saída primeiro em ordem crescente)', () => {
    const ord = ordenarLancamentos(lancs, 'valor', true);
    const v = ord.map((l) => l.entrada - l.saida);
    expect(v).toEqual([...v].sort((a, b) => a - b));
    expect(ordenarLancamentos(lancs, 'data', false)[0]!.data.iso >= ordenarLancamentos(lancs, 'data', true)[0]!.data.iso).toBe(true);
  });
});
