import { describe, expect, it } from 'vitest';
import { mensal, totalizar } from '../src/domain/agregacoes';
import { criarData } from '../src/domain/datas';
import { destaquesExecutivos, nomeMes, tituloFluxoCaixa, tituloReceitasDespesas, tituloSazonalidade, variacao } from '../src/domain/destaques';
import type { Lancamento } from '../src/parser/modelo';

const R = (reais: number) => Math.round(reais * 100);
const lanc = (mes: number, tipoLanc: string, valor: number): Lancamento => ({
  linha: 1, data: criarData(2025, mes, 5), codImovel: '001', codConta: '001', numDoc: '1', tipoDoc: '1', historico: 'x',
  idPartic: '1', tipoLanc, entrada: tipoLanc === '2' ? 0 : R(valor), saida: tipoLanc === '2' ? R(valor) : 0, saldo: 0,
});

describe('títulos-conclusão', () => {
  const lancs = [lanc(1, '2', 500), lanc(3, '1', 1000), lanc(4, '2', 100), lanc(5, '1', 50), lanc(5, '2', 80)];
  const meses = mensal(lancs, 2025);

  it('nome do mês', () => expect(nomeMes('2025-03')).toBe('março'));

  it('conta meses com despesa maior', () => {
    expect(tituloReceitasDespesas(meses)).toBe('Despesas superaram as receitas em 3 meses');
  });

  it('fluxo de caixa aponta o pior ponto', () => {
    expect(tituloFluxoCaixa(meses)).toContain('negativo, com o pior ponto em janeiro');
  });

  it('sazonalidade: conta só os meses que tiveram receita', () => {
    // A receita deste exemplo entrou só em março e maio: antes o título dizia "3 meses".
    expect(tituloSazonalidade(meses)).toBe('100% da receita do ano entrou em 2 meses: março e maio');
    const umMes = meses.map((m) => (m.mes === '2025-03' ? m : { ...m, receitas: 0 }));
    expect(tituloSazonalidade(umMes)).toBe('Toda a receita do ano entrou em março');
  });

  it('destaques executivos com variação', () => {
    const d = destaquesExecutivos(totalizar(lancs), meses, { ...totalizar(lancs), resultado: R(740) });
    expect(d).toHaveLength(3);
    expect(d[0]).toContain('queda de 50%');
    expect(d[1]).toContain('Melhor mês: março');
    expect(d[2]).toContain('caixa acumulado ficou negativo em 1 mês');
  });

  it('variação sem base', () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(150, 100)).toBe(0.5);
  });
});
