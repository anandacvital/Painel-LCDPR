/**
 * Painel interativo: período (ano civil, safra, livre), filtro cruzado,
 * natureza das despesas, indicadores de gestão, alertas e Livro Caixa de um mês.
 * Usa os LCDPR de exemplo (100% fictícios) de tests/fixtures.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes } from '../src/parser/analisar';
import { mensal, totalizar, type TotalMensal } from '../src/domain/agregacoes';
import { capitalDeGiro, concentracaoCompradores, gerarAlertas, aplicarFiltro, type LancamentoGestao } from '../src/domain/gestao';
import { chaveHistorico, classificarDespesas, naturezaPorHistorico } from '../src/domain/naturezas';
import { mesesEntre, periodoAnterior, periodoSafra, rotuloPeriodo, rotulosEixo, somarMeses } from '../src/domain/periodo';
import { montarVisao, saldoInicialMes } from '../src/ui/painel/contexto';
import { dadosAlertas } from '../src/ui/painel/gestao';
import { htmlRazao } from '../src/report/razoes';
import type { Lancamento } from '../src/parser/modelo';

const ler = (arquivo: string) => analisarBytes(readFileSync(new URL(`./fixtures/${arquivo}`, import.meta.url)), arquivo);
const analises = [
  ler('exemplo-lcdpr-2024.txt'),
  ler('exemplo-lcdpr-2025.txt'),
  ler('exemplo-lcdpr-2026-previa-ate-outubro.txt'),
  ler('exemplo-condomino-lcdpr-2024.txt'),
  ler('exemplo-condomino-lcdpr-2025.txt'),
];
const cpf1 = analises[0]!.arquivo.abertura!.cpf;

describe('período', () => {
  it('soma meses atravessando o ano e lista o intervalo', () => {
    expect(somarMeses('2024-11', 3)).toBe('2025-02');
    expect(somarMeses('2025-01', -1)).toBe('2024-12');
    expect(mesesEntre('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
  });

  it('safra de julho vai de jul a jun do ano seguinte', () => {
    const s = periodoSafra(2024, 7);
    expect([s.inicio, s.fim]).toEqual(['2024-07', '2025-06']);
    expect(rotuloPeriodo(s)).toBe('Safra 2024/25 (jul/24 a jun/25)');
    expect(periodoAnterior(s)).toMatchObject({ inicio: '2023-07', fim: '2024-06' });
    expect(rotulosEixo(mesesEntre(s.inicio, s.fim))[0]).toBe('jul/24');
    expect(rotulosEixo(mesesEntre('2025-01', '2025-12'))[0]).toBe('jan');
  });
});

describe('Visão por safra e período livre', () => {
  it('safra 2024/25 junta os dois arquivos e soma exatamente os lançamentos de jul/24 a jun/25', () => {
    const v = montarVisao(analises, cpf1, 2025, { criterio: 'somar', periodo: periodoSafra(2024, 7) })!;
    const esperado = [...analises[0]!.arquivo.lancamentos, ...analises[1]!.arquivo.lancamentos]
      .filter((l) => l.data.iso >= '2024-07-01' && l.data.iso <= '2025-06-30');
    expect(v.meses).toHaveLength(12);
    expect(v.meses[0]!.mes).toBe('2024-07');
    expect(v.totais.receitas).toBe(totalizar(esperado).receitas);
    expect(v.totais.despesas).toBe(totalizar(esperado).despesas);
    expect(v.irpf).toBeNull(); // IRPF só no ano civil
    expect(v.anterior).toBeNull(); // não há arquivo de 2023
  });

  it('safra 2025/26 compara com a safra 2024/25', () => {
    const v = montarVisao(analises, cpf1, 2026, { criterio: 'somar', periodo: periodoSafra(2025, 7) })!;
    expect(v.anterior).not.toBeNull();
    expect(v.meses).toHaveLength(12);
  });

  it('safra que passa do último mês carregado é cortada e avisa', () => {
    const v = montarVisao(analises, cpf1, 2027, { criterio: 'somar', periodo: periodoSafra(2026, 7) })!;
    expect(v.meses.at(-1)!.mes).toBe('2026-10');
    expect(v.avisosPeriodo.join(' ')).toMatch(/cortado/);
  });

  it('período livre usa os meses escolhidos', () => {
    const v = montarVisao(analises, cpf1, 2025, { criterio: 'somar', periodo: { tipo: 'livre', inicio: '2024-11', fim: '2025-02' } })!;
    expect(v.meses.map((m) => m.mes)).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
    expect(v.lancamentos.every((l) => l.data.iso >= '2024-11-01' && l.data.iso <= '2025-02-28')).toBe(true);
  });

  it('ano civil sem filtro continua igual ao de antes (IRPF e anterior)', () => {
    const v = montarVisao(analises, cpf1, 2025, 'somar')!;
    expect(v.totais).toEqual(totalizar(analises[1]!.arquivo.lancamentos));
    expect(v.irpf).not.toBeNull();
    expect(v.anterior?.totais).toEqual(totalizar(analises[0]!.arquivo.lancamentos));
  });
});

describe('filtro cruzado', () => {
  const v = montarVisao(analises, cpf1, 2025, { criterio: 'somar', filtro: { mes: '2025-03' } })!;

  it('filtra os totais pelo mês, mas o gráfico de meses continua com os 12 meses', () => {
    expect(v.lancamentos.every((l) => l.data.iso.startsWith('2025-03'))).toBe(true);
    expect(v.meses).toHaveLength(12);
    expect(v.totais.receitas).toBe(v.meses[2]!.receitas);
    // O anterior é o mesmo mês um ano antes.
    expect(v.anterior!.lancamentos.every((l) => l.data.iso.startsWith('2024-03'))).toBe(true);
  });

  it('combina dimensões e ignora a dimensão pedida', () => {
    const lista = v.base;
    const partic = lista.find((l) => l.tipoLanc === '2')!.idPartic;
    const f = { mes: '2025-03', participante: partic };
    expect(aplicarFiltro(lista, f).every((l) => l.idPartic === partic && l.data.iso.startsWith('2025-03'))).toBe(true);
    expect(aplicarFiltro(lista, f, 'participante').some((l) => l.idPartic !== partic)).toBe(true);
  });

  it('o IRPF da Visão não muda com o filtro (é do ano todo)', () => {
    const semFiltro = montarVisao(analises, cpf1, 2025, 'somar')!;
    expect(v.irpf?.atual.imposto).toBe(semFiltro.irpf?.atual.imposto);
  });
});

describe('natureza das despesas', () => {
  it('classifica pelo histórico, na ordem certa', () => {
    expect(naturezaPorHistorico('Oleo diesel para tratores e colheitadeira')).toBe('combustivel-energia');
    expect(naturezaPorHistorico('Manutencao de tratores e plantadeira')).toBe('manutencao-servicos');
    expect(naturezaPorHistorico('Reforma de pastagem - calcario, sementes de capim e servico')).toBe('investimento');
    expect(naturezaPorHistorico('Compra de fertilizantes NPK e calcario')).toBe('insumos');
    expect(naturezaPorHistorico('Compra de bezerros para recria')).toBe('animais');
    expect(naturezaPorHistorico('Frete de gado para o frigorifico')).toBe('manutencao-servicos');
    expect(naturezaPorHistorico('Pagamento diverso')).toBeNull();
  });

  const base = (o: Partial<Lancamento>): Lancamento => ({
    linha: 1, data: { ano: 2025, mes: 1, dia: 2, iso: '2025-01-02' }, codImovel: '001', codConta: '001', numDoc: '1',
    tipoDoc: '1', historico: '', idPartic: '11111111111', tipoLanc: '2', entrada: 0, saida: 100, saldo: 0, ...o,
  });

  it('folha de pagamento é mão de obra; sem regra usa o participante; ajuste da pessoa vence', () => {
    const lista = [
      base({ historico: 'Pagamento ref. 03/2025', tipoDoc: '5' }),
      base({ historico: 'Oleo diesel', idPartic: '22' }),
      base({ historico: 'Pagamento NF 123', idPartic: '22' }),
      base({ historico: 'Venda', tipoLanc: '1', entrada: 100, saida: 0 }),
    ];
    const c = classificarDespesas(lista);
    expect(c[0]).toEqual({ natureza: 'mao-de-obra', origem: 'documento' });
    expect(c[2]).toEqual({ natureza: 'combustivel-energia', origem: 'participante' });
    expect(c[3]).toBeNull();
    const ajustado = classificarDespesas(lista, { [chaveHistorico('Pagamento NF 999')]: 'investimento' });
    expect(ajustado[2]).toEqual({ natureza: 'investimento', origem: 'ajuste' });
  });

  it('nos exemplos, quase tudo é identificado', () => {
    const v = montarVisao(analises, cpf1, 2025, 'somar')!;
    const despesas = v.base.filter((l) => l.tipoLanc === '2');
    const outras = despesas.filter((l) => l.natureza === 'outras');
    expect(outras.length / despesas.length).toBeLessThan(0.1);
  });
});

describe('indicadores de gestão', () => {
  const mes = (chave: string, acumulado: number): TotalMensal => ({ ...totalizar([]), mes: chave, acumulado, saldoInformado: null });

  it('capital de giro: pior ponto, meses negativos e recuperação', () => {
    const cg = capitalDeGiro([mes('2024-07', -100), mes('2024-08', -300), mes('2024-09', -50), mes('2024-10', 20)]);
    expect(cg).toEqual({ necessidade: 300, mesPior: '2024-08', mesesNegativos: ['2024-07', '2024-08', '2024-09'], recuperacao: '2024-10' });
    expect(capitalDeGiro([mes('2025-01', 10)]).necessidade).toBe(0);
  });

  it('concentração de compradores com HHI', () => {
    const l = (id: string, v: number): Lancamento => ({
      linha: 1, data: { ano: 2025, mes: 1, dia: 1, iso: '2025-01-01' }, codImovel: '001', codConta: '001', numDoc: '1',
      tipoDoc: '1', historico: 'Venda', idPartic: id, tipoLanc: '1', entrada: v, saida: 0, saldo: 0,
    });
    const c = concentracaoCompradores([l('A', 600), l('B', 300), l('C', 100)]);
    expect(c.maior).toMatchObject({ id: 'A', parte: 0.6 });
    expect(c.hhi).toBe(3600 + 900 + 100);
    expect(c.nivel).toBe('alta');
  });

  it('alertas: a prévia de 2026 sugere o planejamento e as ações apontam para filtro ou aba', () => {
    const v = montarVisao(analises, cpf1, 2026, 'somar')!;
    const alertas = gerarAlertas(dadosAlertas(v));
    expect(alertas.some((a) => a.id === 'planejamento' && a.acao?.tipo === 'aba')).toBe(true);
    // Ordem: risco antes de atenção, atenção antes de oportunidade.
    const ordem = { risco: 0, atencao: 1, oportunidade: 2, info: 3 };
    expect(alertas.map((a) => ordem[a.nivel])).toEqual([...alertas.map((a) => ordem[a.nivel])].sort());
  });

  it('alerta de capital de giro quando o caixa acumulado fica negativo', () => {
    const meses = mensal([], 2025).map((m, i) => ({ ...m, acumulado: i < 3 ? -1000 * (i + 1) : 500 }));
    const alertas = gerarAlertas({
      meses, totais: totalizar([]), anterior: null, vs: 'ano anterior', lancamentos: [] as LancamentoGestao[],
      naturezas: [], imoveis: [], anoCivil: null, formatarDoc: (x) => x,
    });
    expect(alertas[0]).toMatchObject({ id: 'capital-giro', nivel: 'risco' });
    expect(alertas[0]!.titulo).toMatch(/30,00/);
  });
});

describe('Livro Caixa de um mês', () => {
  const v = montarVisao(analises, cpf1, 2025, 'somar')!;

  it('saldo inicial do mês é o saldo do arquivo após o último lançamento anterior', () => {
    const lanc = analises[1]!.arquivo.lancamentos;
    const ultimoAntes = lanc.filter((l) => l.data.iso < '2025-04-01').at(-1)!;
    expect(saldoInicialMes(v, cpf1, '2025-04')).toBe(ultimoAntes.saldo);
    expect(saldoInicialMes(v, cpf1, '2025-01')).toBe(0);
  });

  it('o relatório do mês traz só aquele mês e o quadro de saldos', () => {
    const html = htmlRazao(v, 'livro', { mes: '2025-04' });
    expect(html).toContain('Livro Caixa de abril/2025');
    expect(html).toContain('Saldo inicial em 01/04/2025');
    expect(html).toContain('Saldo final em 30/04/2025');
    expect(html).not.toContain('Lançamentos de maio');
  });

  it('o cabeçalho dos relatórios lista o nome de cada produtor', () => {
    const todos = montarVisao(analises, 'todos', 2025, 'somar')!;
    const html = htmlRazao(todos, 'livro');
    for (const a of todos.arquivos) expect(html).toContain(a.abertura!.nome);
  });
});
