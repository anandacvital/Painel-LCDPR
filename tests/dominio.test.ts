/**
 * Testes dos cálculos (agregações, consolidação, IRPF, projeção e simulação).
 * Valores pequenos e "redondos" para que a conta possa ser conferida de cabeça.
 */
import { describe, expect, it } from 'vitest';
import { mesesNegativos, porImovel, porMes, principaisParticipantes, totalizar } from '../src/domain/agregacoes';
import { consolidar, diagnosticarVinculo } from '../src/domain/consolidacao';
import { calcularIrpf, impostoProgressivo, mesesRealizados, pontoEquilibrio, projetarAno, simular, tabelaDoAno } from '../src/domain/irpf';
import { criarData } from '../src/domain/datas';
import type { ArquivoLcdpr, Lancamento } from '../src/parser/modelo';
import { analisarTexto } from '../src/parser/analisar';
import { gerarLcdpr } from './fixtures/gerador';

const R = (reais: number) => Math.round(reais * 100); // reais → centavos

function lanc(p: Partial<Lancamento> & { mes?: number; dia?: number }): Lancamento {
  const { mes = 1, dia = 10, ...resto } = p;
  return {
    linha: 1, data: criarData(2025, mes, dia), codImovel: '001', codConta: '001', numDoc: 'NF1', tipoDoc: '1',
    historico: 'x', idPartic: '11222333000181', tipoLanc: '1', entrada: 0, saida: 0, saldo: 0, ...resto,
  };
}

function arquivo(cpf: string, lancamentos: Lancamento[], extra: Partial<ArquivoLcdpr> = {}): ArquivoLcdpr {
  return {
    nomeArquivo: `${cpf}.txt`, codificacao: 'utf-8', totalLinhas: 0, anoBase: 2025, formaApuracao: '1', cadastro: null,
    abertura: { linha: 1, codVersao: '0013', cpf, nome: `Produtor ${cpf}`, indSitIniPer: '0', sitEspecial: '0', dtSitEsp: null, dtIni: criarData(2025, 1, 1), dtFin: criarData(2025, 12, 31) },
    imoveis: [], terceiros: [], contas: [], lancamentos, resumos: [], encerramento: null, ...extra,
  };
}

describe('agregações', () => {
  it('receita = tipos 1 e 3; despesa = tipo 2; devoluções e estornos reduzem', () => {
    const t = totalizar([
      lanc({ tipoLanc: '1', entrada: R(1000) }),
      lanc({ tipoLanc: '3', entrada: R(500) }),
      lanc({ tipoLanc: '1', saida: R(100) }), // devolução de venda
      lanc({ tipoLanc: '2', saida: R(600) }),
      lanc({ tipoLanc: '2', entrada: R(50) }), // estorno de despesa
    ]);
    expect(t.receitas).toBe(R(1400));
    expect(t.despesas).toBe(R(550));
    expect(t.resultado).toBe(R(850));
    expect(t.receitasTipo3).toBe(R(500));
    expect(t.margem).toBeCloseTo(850 / 1400);
  });

  it('por mês: 12 meses, acumulado e meses negativos', () => {
    const a = arquivo('1', [
      lanc({ mes: 1, tipoLanc: '2', saida: R(300) }),
      lanc({ mes: 3, tipoLanc: '1', entrada: R(1000) }),
    ]);
    const m = porMes(a);
    expect(m).toHaveLength(12);
    expect(m[0]!.acumulado).toBe(R(-300));
    expect(m[2]!.acumulado).toBe(R(700));
    expect(m[11]!.acumulado).toBe(R(700));
    expect(mesesNegativos(m).map((x) => x.mes)).toEqual(['2025-01']);
  });

  it('por imóvel e principais participantes', () => {
    const a = arquivo('1', [
      lanc({ codImovel: '001', tipoLanc: '1', entrada: R(100), idPartic: 'A' }),
      lanc({ codImovel: '002', tipoLanc: '1', entrada: R(900), idPartic: 'B' }),
      lanc({ codImovel: '002', tipoLanc: '2', saida: R(50), idPartic: 'C' }),
    ]);
    expect(porImovel(a).map((g) => [g.chave, g.resultado])).toEqual([['002', R(850)], ['001', R(100)]]);
    const p = principaisParticipantes(a);
    expect(p.clientes.map((c) => c.chave)).toEqual(['B', 'A']);
    expect(p.fornecedores.map((c) => c.chave)).toEqual(['C']);
  });

  it('bate com o saldo final do arquivo sintético', () => {
    const r = analisarTexto(gerarLcdpr({ semente: 3 }).texto, 'x.txt');
    const t = totalizar(r.arquivo.lancamentos);
    expect(t.resultado).toBe(r.arquivo.lancamentos.at(-1)!.saldo);
  });
});

describe('consolidação de condôminos', () => {
  // Imóvel em condomínio: A tem 30%, B tem 70%.
  const imovelA = { linha: 1, codigo: '001', pais: 'BR', moeda: 'BRL', cadItr: '11111111', caepf: '', inscricaoEstadual: '', nome: 'X', uf: 'MS', codMun: '1', cep: '1', tipoExploracao: '2', participacao: 3000 };
  const imovelB = { ...imovelA, participacao: 7000 };
  const venda = { tipoLanc: '1', numDoc: 'NF10', idPartic: '99' } as const;

  it('diagnostica PARCELA quando os valores seguem os percentuais', () => {
    const a = arquivo('A', [lanc({ ...venda, entrada: R(300) })], { imoveis: [imovelA] });
    const b = arquivo('B', [lanc({ ...venda, entrada: R(700) })], { imoveis: [imovelB] });
    expect(diagnosticarVinculo(a, b)?.diagnostico).toBe('parcela');
    const c = consolidar([a, b], 2025, 'somar');
    expect(c.totais.receitas).toBe(R(1000));
    expect(c.avisos).toEqual([]);
  });

  it('diagnostica OPERAÇÃO INTEIRA e avisa duplicidade; critério proporcional corrige', () => {
    const a = arquivo('A', [lanc({ ...venda, entrada: R(1000) })], { imoveis: [imovelA] });
    const b = arquivo('B', [lanc({ ...venda, entrada: R(1000) })], { imoveis: [imovelB] });
    expect(diagnosticarVinculo(a, b)?.diagnostico).toBe('operacao-inteira');
    const somado = consolidar([a, b], 2025, 'somar');
    expect(somado.totais.receitas).toBe(R(2000));
    expect(somado.avisos.join()).toContain('DUPLICIDADE');
    expect(consolidar([a, b], 2025, 'proporcional').totais.receitas).toBe(R(1000));
    expect(consolidar([a, b], 2025, 'sem-duplicar').totais.receitas).toBe(R(1000));
  });

  it('50% / 50% com valores iguais fica indeterminado', () => {
    const meio = { ...imovelA, participacao: 5000 };
    const a = arquivo('A', [lanc({ ...venda, entrada: R(500) })], { imoveis: [meio] });
    const b = arquivo('B', [lanc({ ...venda, entrada: R(500) })], { imoveis: [meio] });
    expect(diagnosticarVinculo(a, b)?.diagnostico).toBe('indeterminado');
  });

  it('produtores sem vínculo são somados sem aviso', () => {
    const a = arquivo('A', [lanc({ entrada: R(10) })], { imoveis: [{ ...imovelA, cadItr: '1' }] });
    const b = arquivo('B', [lanc({ entrada: R(20) })], { imoveis: [{ ...imovelB, cadItr: '2' }] });
    const c = consolidar([a, b], 2025);
    expect(c.vinculos).toEqual([]);
    expect(c.totais.receitas).toBe(R(30));
  });
});

describe('IRPF', () => {
  it('margem alta: 20% da receita bruta é mais vantajoso', () => {
    const r = calcularIrpf({ receitaBruta: R(1_000_000), despesas: R(500_000) });
    expect(r.real.base).toBe(R(500_000));
    expect(r.presumido.base).toBe(R(200_000));
    expect(r.maisVantajosa).toBe('presumido');
    // Tabela anual 2026: 200.000 × 27,5% − 10.904,66
    expect(r.presumido.impostoEstimado).toBe(R(44_095.34));
    expect(r.economiaNoAno).toBe(R(82_500));
  });

  it('margem baixa: resultado real é mais vantajoso', () => {
    const r = calcularIrpf({ receitaBruta: R(1_000_000), despesas: R(900_000) });
    expect(r.maisVantajosa).toBe('real');
    expect(r.real.impostoEstimado).toBe(R(16_595.34));
  });

  it('compensa prejuízo anterior sem limite de 30% e informa a perda na opção 20%', () => {
    const r = calcularIrpf({ receitaBruta: R(1_000_000), despesas: R(500_000), prejuizoAnterior: R(450_000) });
    expect(r.real.prejuizoCompensado).toBe(R(450_000));
    expect(r.real.base).toBe(R(50_000));
    expect(r.maisVantajosa).toBe('real');
    expect(r.presumido.prejuizoPerdido).toBe(R(450_000));
  });

  it('resultado negativo: sem imposto, prejuízo acumulado e 20% não cabível', () => {
    const r = calcularIrpf({ receitaBruta: R(100), despesas: R(300), prejuizoAnterior: R(50) });
    expect(r.real.base).toBe(0);
    expect(r.real.prejuizoRemanescente).toBe(R(250));
    expect(r.presumido.cabivel).toBe(false);
    expect(r.maisVantajosa).toBe('real');
  });

  it('tabela progressiva anual de cada ano-calendário (Receita Federal)', () => {
    expect(impostoProgressivo(R(30_000), 2024)).toBe(R(227.76)); // 30.000 × 7,5% − 2.022,24
    expect(impostoProgressivo(R(28_000), 2025)).toBe(0); // faixa isenta de 2025
    expect(impostoProgressivo(R(70_000), 2025)).toBe(R(8_396.22)); // 70.000 × 27,5% − 10.853,78
    expect(impostoProgressivo(R(500_000), 2026)).toBe(R(126_595.34));
    expect(tabelaDoAno(2023)).toMatchObject({ anoTabela: 2024, exata: false });
    expect(tabelaDoAno(2030)).toMatchObject({ anoTabela: 2026, exata: false });
  });

  it('redução anual da Lei 15.270/2025 só a partir de 2026', () => {
    // 50.000 em 2026: 50.000 × 22,5% − 8.105,85 = 3.144,15; redução de até 2.694,15 → 450,00
    expect(impostoProgressivo(R(50_000), 2026)).toBe(R(450));
    // 70.000 em 2026: 8.345,34 − (8.429,73 − 0,095575 × 70.000 = 1.739,48) = 6.605,86
    expect(impostoProgressivo(R(70_000), 2026)).toBe(R(6_605.86));
    // acima de 88.200 não há redução
    expect(impostoProgressivo(R(100_000), 2026)).toBe(R(16_595.34));
  });

  it('ponto de equilíbrio: despesa a mais que faz o real empatar com os 20%', () => {
    expect(pontoEquilibrio({ receitaBruta: R(1_000_000), despesas: R(500_000) })).toBe(R(300_000));
    expect(pontoEquilibrio({ receitaBruta: R(1_000_000), despesas: R(500_000), prejuizoAnterior: R(100_000) })).toBe(R(200_000));
    expect(pontoEquilibrio({ receitaBruta: R(1_000_000), despesas: R(900_000) })).toBe(0);
  });

  it('insights citam a base legal', () => {
    const r = calcularIrpf({ receitaBruta: R(1000), despesas: R(100), prejuizoAnterior: R(10) });
    expect(r.insights.join(' ')).toContain('Lei nº 8.023/1990');
  });
});

describe('projeção e simulação', () => {
  const meses = (rec: number[], desp: number[]) =>
    rec.map((r, i) => ({ mes: `2025-${String(i + 1).padStart(2, '0')}`, receitas: R(r), despesas: R(desp[i] ?? 0), resultado: R(r - (desp[i] ?? 0)), margem: null, receitasTipo3: 0, quantidade: 1, acumulado: 0, saldoInformado: null }));

  it('média mensal sem ano anterior', () => {
    const atual = meses([100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0], [50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const p = projetarAno(atual, 3);
    expect(p.metodo).toBe('media-mensal');
    expect(p.receitaBruta).toBe(R(1200));
    expect(p.despesas).toBe(R(600));
  });

  it('sazonal com ano anterior', () => {
    const anterior = meses([0, 0, 500, 500, 0, 0, 0, 0, 1000, 0, 0, 0], [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    const atual = meses([0, 0, 600, 600, 0, 0, 0, 0, 0, 0, 0, 0], [100, 100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0]);
    const p = projetarAno(atual, 4, anterior);
    expect(p.metodo).toBe('sazonal-ano-anterior');
    // receitas: 1200 realizadas + 1000 × 1,2 = 2400; despesas: 400 + 800 × 1,0 = 1200
    expect(p.receitaBruta).toBe(R(2400));
    expect(p.despesas).toBe(R(1200));
  });

  it('meses realizados: ano passado = 12; ano corrente = meses fechados', () => {
    const a = arquivo('1', []);
    expect(mesesRealizados(a, new Date(2026, 5, 15))).toBe(12);
    expect(mesesRealizados({ ...a, anoBase: 2026 }, new Date(2026, 5, 15))).toBe(5);
  });

  it('simulação mostra a economia e os cuidados', () => {
    const s = simular({ receitaBruta: R(1_000_000), despesas: R(850_000) }, { anteciparDespesas: R(50_000) });
    // antes: real 150 mil; depois: real 100 mil; os dois na faixa de 27,5% → economia 13.750
    expect(s.variacaoImposto).toBe(R(13_750));
    expect(s.cuidados.join(' ')).toContain('31/12');
  });
});
