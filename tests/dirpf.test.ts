/**
 * Ficha Atividade Rural da DIRPF, com os LCDPR de exemplo (fictícios):
 * - Produtor 1: 2024 e 2025 completos e prévia de 2026 até outubro.
 * - Produtor 2 (condômino): 2024 com prejuízo, 2025 com lucro.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes, analisarTexto } from '../src/parser/analisar';
import { totalizar } from '../src/domain/agregacoes';
import { formatarReais } from '../src/domain/dinheiro';
import { montarFicha } from '../src/domain/dirpf';
import { htmlRelatorioDirpf } from '../src/report/dirpf';
import { gerarLcdpr, montarTexto } from './fixtures/gerador';

const ler = (arquivo: string) => analisarBytes(readFileSync(new URL(`./fixtures/${arquivo}`, import.meta.url)), arquivo).arquivo;
const p1 = ['exemplo-lcdpr-2024.txt', 'exemplo-lcdpr-2025.txt', 'exemplo-lcdpr-2026-previa-ate-outubro.txt'].map(ler);
const p2 = ['exemplo-condomino-lcdpr-2024.txt', 'exemplo-condomino-lcdpr-2025.txt'].map(ler);
const R = (reais: number) => Math.round(reais * 100);

describe('montarFicha', () => {
  const f = montarFicha(p1, 2025)!;
  const doAno = p1[1]!;

  it('identifica o produtor, o ano-calendário e o exercício', () => {
    expect(f.cpf).toBe(doAno.abertura!.cpf);
    expect(f.anoCalendario).toBe(2025);
    expect(f.exercicio).toBe(2026);
    expect(f.previa).toBeNull();
  });

  it('12 meses que somam os totais do Livro Caixa (regime de caixa)', () => {
    const t = totalizar(doAno.lancamentos);
    expect(f.meses).toHaveLength(12);
    expect(f.meses.reduce((s, m) => s + m.receitaBruta, 0)).toBe(t.receitas);
    expect(f.meses.reduce((s, m) => s + m.despesas, 0)).toBe(t.despesas);
    expect(f.receitaBruta).toBe(t.receitas);
    expect(f.resultado).toBe(t.receitas - t.despesas);
  });

  it('imóveis do 0040 com condição de exploração da DIRPF', () => {
    expect(f.imoveis).toHaveLength(doAno.imoveis.length);
    for (const i of f.imoveis) expect(['Proprietário', 'Condômino', 'Arrendatário', 'Parceiro', 'Comodatário', 'Outros']).toContain(i.condicao);
  });

  it('prévia: avisa para não usar na declaração', () => {
    const previa = montarFicha(p1, 2026)!;
    expect(previa.previa).not.toBeNull();
    expect(previa.avisos[0]).toContain('prévia');
  });

  it('não existe ficha de ano sem arquivo', () => {
    expect(montarFicha(p1, 2023)).toBeNull();
  });
});

describe('prejuízo na ficha (Lei 8.023, arts. 14 e 16)', () => {
  it('condômino: prejuízo de 2024 é compensado em 2025 pelo resultado real', () => {
    const r24 = totalizar(p2[0]!.lancamentos).resultado;
    expect(r24).toBeLessThan(0);
    const f = montarFicha(p2, 2025)!;
    expect(f.prejuizoAnterior).toBe(-r24);
    expect(f.real.prejuizoCompensado).toBe(Math.min(-r24, Math.max(0, f.resultado)));
    expect(f.real.resultadoTributavel).toBe(Math.max(0, f.resultado) - f.real.prejuizoCompensado);
    expect(f.real.prejuizoACompensar).toBe(f.prejuizoAnterior - f.real.prejuizoCompensado);
  });

  it('opção pelos 20%: base é 20% da receita e o prejuízo a compensar vira zero', () => {
    const f = montarFicha(p2, 2025, R(1_000_000))!;
    expect(f.vinteporcento.cabivel).toBe(f.resultado > 0);
    expect(f.vinteporcento.resultadoTributavel).toBe(Math.round(f.receitaBruta * 0.2));
    expect(f.vinteporcento.prejuizoACompensar).toBe(0);
    expect(f.vinteporcento.prejuizoPerdido).toBe(f.prejuizoAnterior);
  });

  it('resultado negativo: tributável zero, prejuízo do ano soma ao saldo', () => {
    const f = montarFicha(p2, 2024, R(500))!;
    expect(f.resultado).toBeLessThan(0);
    expect(f.real.resultadoTributavel).toBe(0);
    expect(f.real.prejuizoACompensar).toBe(R(500) - f.resultado);
    expect(f.vinteporcento.cabivel).toBe(false);
    expect(f.opcaoSugerida).toBe('real');
  });
});

describe('receita para conferir', () => {
  it('lista receita com histórico de arrendamento e avisa', () => {
    const { linhas } = gerarLcdpr({ semente: 7, lancamentosPorMes: 10 });
    const i = linhas.findIndex((l) => l.startsWith('Q100|') && l.split('|')[8] === '1');
    const p = linhas[i]!.split('|');
    p[6] = 'Arrendamento recebido';
    linhas[i] = p.join('|');
    const a = analisarTexto(montarTexto(linhas), 't.txt').arquivo;
    const f = montarFicha([a], 2025)!;
    expect(f.receitasParaConferir).toHaveLength(1);
    expect(f.receitasParaConferir[0]!.linha).toBe(i + 1);
    expect(f.avisos.some((x) => x.includes('arrendamento'))).toBe(true);
  });
});

describe('relatório impresso', () => {
  it('um produtor por página, com os totais e o texto escapado', () => {
    const fichas = [montarFicha(p1, 2025)!, montarFicha(p2, 2025)!];
    const html = htmlRelatorioDirpf(fichas);
    expect(html.match(/rel-nova-pagina/g)).toHaveLength(1);
    expect(html).toContain('Ficha Atividade Rural');
    expect(html).toContain('Exercício');
    for (const f of fichas) {
      expect(html).toContain(formatarReais(f.receitaBruta));
      expect(html).toContain(formatarReais(f.despesas));
    }
    expect(html).toContain('Lei nº 8.023/1990, art. 14');
    expect(html).not.toMatch(/<script/i);
  });
});
