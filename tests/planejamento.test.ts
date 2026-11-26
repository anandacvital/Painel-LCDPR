/**
 * Planejamento IRPF por produtor, com os LCDPR de exemplo (fictícios):
 * - Produtor 1: 2024 e 2025 completos e prévia de 2026 até outubro.
 * - Produtor 2 (condômino): 2024 com prejuízo, 2025 com lucro.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes } from '../src/parser/analisar';
import { totalizar } from '../src/domain/agregacoes';
import { lerReais, reaisParaCampo } from '../src/domain/dinheiro';
import { encadearPrejuizo, mesesFechados, planejarProdutor, textoEquilibrio } from '../src/domain/planejamento';
import { montarVisao } from '../src/ui/painel/contexto';
import { htmlPlanejamento } from '../src/report/planejamento';

const ler = (arquivo: string) => analisarBytes(readFileSync(new URL(`./fixtures/${arquivo}`, import.meta.url)), arquivo);
const p1 = ['exemplo-lcdpr-2024.txt', 'exemplo-lcdpr-2025.txt', 'exemplo-lcdpr-2026-previa-ate-outubro.txt'].map(ler);
const p2 = ['exemplo-condomino-lcdpr-2024.txt', 'exemplo-condomino-lcdpr-2025.txt'].map(ler);
const R = (reais: number) => Math.round(reais * 100);

describe('valores digitados', () => {
  it('lê reais no formato brasileiro', () => {
    expect(lerReais('50.000')).toBe(R(50_000));
    expect(lerReais('R$ 1.234,56')).toBe(R(1234.56));
    expect(lerReais('80000,5')).toBe(R(80_000.5));
    expect(lerReais('')).toBe(0);
    expect(lerReais('abc')).toBeNull();
    expect(lerReais('1,2,3')).toBeNull();
    expect(reaisParaCampo(R(50_000))).toBe('50.000,00');
  });
});

describe('prejuízo encadeado (Lei 8.023, art. 14)', () => {
  it('gera, compensa e aponta anos faltando', () => {
    const c = encadearPrejuizo([{ ano: 2022, resultado: R(-100) }, { ano: 2024, resultado: R(30) }], R(10), 2025);
    expect(c.linhas.map((l) => l.saldoFinal)).toEqual([R(110), R(80)]);
    expect(c.saldoNoInicio).toBe(R(80));
    expect(c.lacunas).toEqual([2023]);
  });
});

describe('plano do produtor', () => {
  it('condômino: prejuízo de 2024 é compensado em 2025 e os 20% fariam perder o saldo', () => {
    const plano = planejarProdutor(p2.map((r) => r.arquivo), 2025)!;
    const prej2024 = -totalizar(p2[0]!.arquivo.lancamentos).resultado;
    expect(prej2024).toBeGreaterThan(0);
    expect(plano.prejuizo.saldoNoInicio).toBe(prej2024);
    expect(plano.irpf.real.prejuizoCompensado).toBe(Math.min(prej2024, plano.irpf.resultado));
    expect(plano.irpf.presumido.prejuizoPerdido).toBe(prej2024);
    expect(plano.projecao).toBeNull();
    expect(plano.obrigatoriedade.obrigado).toBe(false);
  });

  it('prévia de 2026: projeta até dezembro pelo perfil de 2025', () => {
    const plano = planejarProdutor(p1.map((r) => r.arquivo), 2026)!;
    expect(plano.previa?.fim).toBe('2026-10-31');
    expect(mesesFechados(plano.previa!)).toBe(10);
    expect(plano.projecao?.metodo).toBe('sazonal-ano-anterior');
    expect(plano.usaProjecao).toBe(true);
    expect(plano.entrada.receitaBruta).toBeGreaterThan(plano.realizado.receitas);
    const soRealizado = planejarProdutor(p1.map((r) => r.arquivo), 2026, { usarProjecao: false })!;
    expect(soRealizado.entrada.receitaBruta).toBe(soRealizado.realizado.receitas);
  });

  it('margem alta: 20% é melhor e antecipar despesa abaixo do ponto de equilíbrio não muda o imposto', () => {
    const base = planejarProdutor(p1.map((r) => r.arquivo), 2025)!;
    expect(base.irpf.maisVantajosa).toBe('presumido');
    expect(base.equilibrio).toBeGreaterThan(0);
    expect(textoEquilibrio(base)).toContain('NÃO reduz');
    const pouco = planejarProdutor(p1.map((r) => r.arquivo), 2025, { anteciparDespesas: Math.floor(base.equilibrio / 2) })!;
    expect(pouco.simulacao.variacaoImposto).toBe(0);
    // Postergar receita reduz a base dos 20% (e o imposto do ano).
    const postergar = planejarProdutor(p1.map((r) => r.arquivo), 2025, { postergarReceitas: R(100_000) })!;
    expect(postergar.simulacao.variacaoImposto).toBe(R(100_000 * 0.2 * 0.275));
  });

  it('ano sem arquivo do produtor: sem plano', () => {
    expect(planejarProdutor(p2.map((r) => r.arquivo), 2026)).toBeNull();
  });
});

describe('relatório de planejamento', () => {
  it('traz os dois produtores, a melhor opção, os cuidados e o rodapé de sigilo', () => {
    const analises = [...p1, ...p2];
    const v = montarVisao(analises, 'todos', 2025, 'somar')!;
    const planos = [p1, p2].map((lista) => planejarProdutor(lista.map((r) => r.arquivo), 2025)!);
    const html = htmlPlanejamento(v, planos, { cpfSimulacao: planos[0]!.cpf, anteciparDespesas: R(50_000), postergarReceitas: 0, usarProjecao: true });
    expect(html).toContain('PRODUTOR EXEMPLO FICTICIO');
    expect(html).toContain('CONDOMINO EXEMPLO FICTICIO');
    expect(html).toContain('Melhor opção');
    expect(html).toContain('art. 16, parágrafo único');
    expect(html).toContain('Simulação');
    expect(html).toContain('nenhum dado foi enviado');
  });
});
