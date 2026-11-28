/**
 * Revisão geral (fase 12): um teste para cada bug corrigido ou regra nova.
 * Só arquivos sintéticos (gerador e LCDPR de exemplo fictícios).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes, analisarTexto } from '../src/parser/analisar';
import { totalizar } from '../src/domain/agregacoes';
import { cpfOuCnpjValido, ehCnpjAlfanumerico, formatarCpfCnpj, completarCpf } from '../src/domain/documentos';
import { calcularIrpf } from '../src/domain/irpf';
import { encadearPrejuizo, planejarProdutor } from '../src/domain/planejamento';
import { gerarAlertas, type EntradaAlertas, type LancamentoGestao } from '../src/domain/gestao';
import { montarVisao } from '../src/ui/painel/contexto';
import type { Ocorrencia } from '../src/parser/modelo';
import { gerarLcdpr, montarTexto } from './fixtures/gerador';

const R = (reais: number) => Math.round(reais * 100);
const base = () => gerarLcdpr({ semente: 7, lancamentosPorMes: 10 });
const analisar = (linhas: string[]) => analisarTexto(montarTexto(linhas), 'teste.txt');
const daRegra = (lista: Ocorrencia[], regra: string) => lista.filter((o) => o.regra === regra);
const idx = (linhas: string[], reg: string, n = 0) =>
  linhas.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith(`${reg}|`))[n]![1];
function trocarCampo(linhas: string[], i: number, pos: number, valor: string): void {
  const p = linhas[i]!.split('|');
  p[pos] = valor;
  linhas[i] = p.join('|');
}
const ler = (arquivo: string) => analisarBytes(readFileSync(new URL(`./fixtures/${arquivo}`, import.meta.url)), arquivo);

describe('leitura: linhas em branco no fim do arquivo', () => {
  it('um alerta só, e o QTD_LIN continua batendo', () => {
    const r = analisarTexto(`${base().texto}\r\n\r\n`, 'teste.txt');
    expect(daRegra(r.ocorrencias, 'LINHA-VAZIA-FINAL')).toHaveLength(1);
    expect(daRegra(r.ocorrencias, 'LINHA-VAZIA')).toHaveLength(0);
    expect(daRegra(r.ocorrencias, 'QTD-LINHAS')).toHaveLength(0);
  });
});

describe('leitura: hierarquia 0040 → 0045', () => {
  it('arquivo limpo não acusa', () => {
    expect(daRegra(analisar(base().linhas).ocorrencias, 'HIERARQUIA-0045')).toHaveLength(0);
  });
  it('0045 antes do 0040 do seu imóvel', () => {
    const l = base().linhas;
    const i45 = idx(l, '0045');
    const [linha45] = l.splice(i45, 1);
    l.splice(idx(l, '0040'), 0, linha45!); // antes de todos os 0040
    expect(daRegra(analisar(l).ocorrencias, 'HIERARQUIA-0045')).toHaveLength(1);
  });
});

describe('0000: situação especial e versão', () => {
  it('saída do País sem data é erro; data sem situação especial é alerta', () => {
    const l = base().linhas;
    trocarCampo(l, 0, 6, '3');
    trocarCampo(l, 0, 9, '30062025');
    const o = daRegra(analisar(l).ocorrencias, 'SIT-ESPECIAL');
    expect(o.map((x) => x.severidade)).toEqual(['erro']);
    const l2 = base().linhas;
    trocarCampo(l2, 0, 7, '15052025');
    expect(daRegra(analisar(l2).ocorrencias, 'SIT-ESPECIAL').map((x) => x.severidade)).toEqual(['alerta']);
  });
  it('versão diferente da 1.3 gera alerta', () => {
    const l = base().linhas;
    trocarCampo(l, 0, 2, '0012');
    expect(daRegra(analisar(l).ocorrencias, 'VERSAO-LEIAUTE')).toHaveLength(1);
  });
});

describe('0010: opção pelos 20% com prejuízo', () => {
  it('alerta quando FORMA_APUR = 2 e o resultado do ano é negativo', () => {
    const l = base().linhas;
    trocarCampo(l, idx(l, '0010'), 1, '2');
    const r = analisar(l);
    const resultado = totalizar(r.arquivo.lancamentos).resultado;
    expect(daRegra(r.ocorrencias, 'FORMA-APURACAO')).toHaveLength(resultado <= 0 ? 1 : 0);
    // Força prejuízo: uma despesa enorme no fim (com saldo e Q200 coerentes não importam aqui).
    const l2 = [...l];
    const q = l2.findIndex((x) => x.startsWith('Q100|'));
    trocarCampo(l2, q, 9, '0');
    trocarCampo(l2, q, 10, '99999999999');
    trocarCampo(l2, q, 8, '2');
    expect(daRegra(analisar(l2).ocorrencias, 'FORMA-APURACAO')).toHaveLength(1);
  });
});

describe('0040/0045: condomínio acima de 100%', () => {
  it('participação do produtor + condôminos > 100% gera alerta', () => {
    const l = base().linhas;
    expect(daRegra(analisar(l).ocorrencias, 'SOMA-PARTICIPACAO')).toHaveLength(0);
    trocarCampo(l, idx(l, '0045'), 5, '06000'); // 50% + 60%
    expect(daRegra(analisar(l).ocorrencias, 'SOMA-PARTICIPACAO')).toHaveLength(1);
  });
});

describe('CNPJ alfanumérico (IN RFB nº 2.229/2024)', () => {
  it('valida o DV pelo exemplo oficial da Receita (12.ABC.345/01DE-35)', () => {
    expect(ehCnpjAlfanumerico('12ABC34501DE35')).toBe(true);
    expect(ehCnpjAlfanumerico('12ABC34501DE36')).toBe(false);
    expect(ehCnpjAlfanumerico('11222333000181')).toBe(false); // só números: regra antiga
    expect(cpfOuCnpjValido('12ABC34501DE35')).toBe(true);
    expect(formatarCpfCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });
  it('no participante: alerta, sem erro, e o lançamento continua nos cálculos', () => {
    const l = base().linhas;
    const q = l.findIndex((x) => x.startsWith('Q100|'));
    trocarCampo(l, q, 7, '12ABC34501DE35');
    const r = analisar(l);
    expect(daRegra(r.ocorrencias, 'CNPJ-ALFANUMERICO')).toHaveLength(1);
    expect(daRegra(r.ocorrencias, 'CAMPO-NUMERICO')).toHaveLength(0);
    expect(daRegra(r.ocorrencias, 'CPF-DV')).toHaveLength(0);
    expect(r.arquivo.lancamentos).toHaveLength(120);
  });
  it('letras com DV inválido continuam sendo erro de campo', () => {
    const l = base().linhas;
    trocarCampo(l, l.findIndex((x) => x.startsWith('Q100|')), 7, '12ABC34501DE99');
    expect(daRegra(analisar(l).ocorrencias, 'CAMPO-NUMERICO')).toHaveLength(1);
  });
});

describe('IRPF: empate entre as opções', () => {
  it('mesmo imposto sem prejuízo: "empate", com texto correto', () => {
    // Receita 100 mil, despesa 75 mil: real 25 mil e 20% = 20 mil, ambos na faixa isenta.
    const r = calcularIrpf({ receitaBruta: R(100_000), despesas: R(75_000), ano: 2025 });
    expect(r.maisVantajosa).toBe('empate');
    expect(r.insights[0]).toContain('mesmo imposto estimado');
    expect(r.insights.join(' ')).not.toContain('gera base menor');
  });
  it('mesmo imposto COM prejuízo acumulado: o real vence (os 20% perderiam o saldo)', () => {
    const r = calcularIrpf({ receitaBruta: R(100_000), despesas: R(75_000), prejuizoAnterior: R(5_000), ano: 2025 });
    expect(r.maisVantajosa).toBe('real');
    expect(r.insights[0]).toContain('Prefira o resultado real');
  });
});

describe('prejuízo encadeado com a opção pelos 20% informada no arquivo', () => {
  it('ano com FORMA_APUR = 2 e lucro zera o saldo', () => {
    const c = encadearPrejuizo([
      { ano: 2023, resultado: R(-100) },
      { ano: 2024, resultado: R(30), opcao20: true },
      { ano: 2025, resultado: R(-10) },
    ], 0, 2026);
    expect(c.linhas.map((l) => l.saldoFinal)).toEqual([R(100), 0, R(10)]);
    expect(c.linhas[1]!.opcao20).toBe(true);
    expect(c.linhas[1]!.compensado).toBe(0);
  });
  it('planejarProdutor lê a opção do 0010 dos anos anteriores', () => {
    const a24 = ler('exemplo-condomino-lcdpr-2024.txt').arquivo; // 2024 com prejuízo
    const a25 = ler('exemplo-condomino-lcdpr-2025.txt').arquivo;
    const normal = planejarProdutor([a24, a25], 2025)!;
    expect(normal.prejuizo.saldoNoInicio).toBeGreaterThan(0);
    // 2024 teve prejuízo: a opção pelos 20% não cabe e o saldo é mantido.
    const com20 = planejarProdutor([{ ...a24, formaApuracao: '2' }, a25], 2025)!;
    expect(com20.prejuizo.saldoNoInicio).toBe(normal.prejuizo.saldoNoInicio);
  });
});

describe('alerta de obrigatoriedade do LCDPR é por CPF', () => {
  const cpfA = completarCpf('111444777');
  const cpfB = completarCpf('222555888');
  const venda = (cpf: string, valor: number, linha: number): LancamentoGestao => ({
    linha, data: { ano: 2025, mes: 3, dia: 10, iso: '2025-03-10' }, codImovel: '001', codConta: '001', numDoc: String(linha),
    tipoDoc: '1', historico: 'Venda de soja', idPartic: '11222333000181', tipoLanc: '1', entrada: valor, saida: 0, saldo: valor,
    cpf, natureza: null, origemNatureza: null,
  });
  const entrada = (lancs: LancamentoGestao[]): EntradaAlertas => ({
    meses: [], totais: totalizar(lancs), anterior: null, vs: 'ano anterior', lancamentos: lancs, naturezas: [], imoveis: [],
    anoCivil: { ano: 2025, previaAteMes: null }, formatarDoc: (x) => x, nomeProdutor: (c) => (c === cpfA ? 'PRODUTOR A' : 'PRODUTOR B'),
  });
  it('dois produtores de R$ 3 mi (soma R$ 6 mi): nenhum é obrigado, sem alerta', () => {
    const al = gerarAlertas(entrada([venda(cpfA, R(3_000_000), 1), venda(cpfB, R(3_000_000), 2)]));
    expect(al.find((a) => a.id === 'obrigatoriedade')).toBeUndefined();
  });
  it('produtor acima de R$ 4,8 mi: alerta de obrigatório, com o nome dele', () => {
    const al = gerarAlertas(entrada([venda(cpfA, R(5_000_000), 1), venda(cpfB, R(1_000_000), 2)]));
    const o = al.find((a) => a.id === 'obrigatoriedade')!;
    expect(o.titulo).toContain('obrigatório');
    expect(o.texto).toContain('PRODUTOR A');
  });
});

describe('visão do ano com um produtor em prévia e outro completo', () => {
  it('não corta os meses: o gráfico mensal soma o mesmo que os totais', () => {
    const p1 = ler('exemplo-lcdpr-2026-previa-ate-outubro.txt');
    // Condômino "2026" completo: o arquivo de 2025 com as datas trocadas para 2026 (só para o teste).
    const texto25 = readFileSync(new URL('./fixtures/exemplo-condomino-lcdpr-2025.txt', import.meta.url), 'latin1');
    const p2 = analisarTexto(texto25.replace(/\|(\d{2}|\d{4})2025(?=\||\r?\n)/g, '|$12026'), 'c2026.txt');
    expect(p2.arquivo.anoBase).toBe(2026);
    const v = montarVisao([p1, p2], 'todos', 2026, 'somar')!;
    expect(v.previa).toBeNull();
    expect(v.meses).toHaveLength(12);
    expect(v.meses.reduce((s, m) => s + m.receitas, 0)).toBe(v.totais.receitas);
    expect(v.avisosPeriodo.join(' ')).toContain('só a prévia de 2026');
  });
});
