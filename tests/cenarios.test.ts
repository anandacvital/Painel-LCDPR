/**
 * Cenários do simulador: economia definitiva x adiada e efeito no caixa.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes } from '../src/parser/analisar';
import { compararCenarios, melhorCenario, proximoNome, type Cenario } from '../src/domain/cenarios';
import { planejarProdutor } from '../src/domain/planejamento';
import { montarVisao } from '../src/ui/painel/contexto';
import { htmlPlanejamento } from '../src/report/planejamento';

const R = (reais: number) => Math.round(reais * 100);
const cen = (id: string, antecipar: number, postergar: number): Cenario => ({
  id, nome: `C ${id}`, cpf: '1', ano: 2025, anteciparDespesas: R(antecipar), postergarReceitas: R(postergar),
});

describe('comparação de cenários', () => {
  // Margem baixa: o resultado real é a melhor opção (base 100 mil, faixa de 27,5%).
  const entrada = { receitaBruta: R(1_000_000), despesas: R(900_000), ano: 2025 };

  it('antecipar despesa gera economia definitiva e consome caixa', () => {
    const [atual, a] = compararCenarios(entrada, [cen('a', 20_000, 0)], R(300_000));
    expect(atual!.id).toBeNull();
    expect(a!.economia).toBe(R(5_500)); // 20 mil × 27,5%
    expect(a!.economiaDefinitiva).toBe(R(5_500));
    expect(a!.economiaAdiada).toBe(0);
    expect(a!.caixa31Dez).toBe(R(280_000));
    expect(a!.entradaJaneiro).toBe(0);
  });

  it('postergar receita é economia só adiada e o dinheiro entra em janeiro', () => {
    const [, b] = compararCenarios(entrada, [cen('b', 0, 20_000)], R(300_000));
    expect(b!.economia).toBe(R(5_500));
    expect(b!.economiaAdiada).toBe(R(5_500));
    expect(b!.economiaDefinitiva).toBe(0);
    expect(b!.caixa31Dez).toBe(R(280_000));
    expect(b!.entradaJaneiro).toBe(R(20_000));
  });

  it('o "melhor" cenário é o de maior economia definitiva, não o que só adia imposto', () => {
    const linhas = compararCenarios(entrada, [cen('a', 10_000, 0), cen('b', 0, 50_000)], null);
    expect(melhorCenario(linhas)).toBe('a');
    expect(linhas[1]!.caixa31Dez).toBeNull();
  });

  it('com 20% como melhor opção, antecipar despesa não economiza', () => {
    const [, a] = compararCenarios({ receitaBruta: R(1_000_000), despesas: R(500_000), ano: 2025 }, [cen('a', 50_000, 0)], 0);
    expect(a!.opcao).toBe('presumido');
    expect(a!.economia).toBe(0);
    expect(melhorCenario([a!])).toBeNull();
  });

  it('nomes automáticos não se repetem', () => {
    expect(proximoNome([])).toBe('Cenário 1');
    expect(proximoNome([{ ...cen('x', 0, 0), nome: 'Cenário 2' }])).toBe('Cenário 3');
  });
});

describe('cenários no relatório de planejamento', () => {
  it('imprime a tabela de cenários do produtor', () => {
    const r = analisarBytes(readFileSync(new URL('./fixtures/exemplo-lcdpr-2025.txt', import.meta.url)), 'x.txt');
    const plano = planejarProdutor([r.arquivo], 2025)!;
    expect(plano.caixaFimAno?.valor).toBe(r.arquivo.lancamentos.at(-1)!.saldo);
    const v = montarVisao([r], 'todos', 2025, 'somar')!;
    const c: Cenario = { id: 'z', nome: 'Adiar milho', cpf: plano.cpf, ano: 2025, anteciparDespesas: 0, postergarReceitas: R(100_000) };
    const html = htmlPlanejamento(v, [plano], { cpfSimulacao: plano.cpf, anteciparDespesas: 0, postergarReceitas: 0, usarProjecao: true, cenarios: [c] });
    expect(html).toContain('Cenários comparados');
    expect(html).toContain('Adiar milho');
  });
});
