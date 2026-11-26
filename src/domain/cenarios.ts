/**
 * CENÁRIOS DO SIMULADOR: guardar várias hipóteses ("antecipar 200 mil de
 * insumos", "adiar a venda do milho") e comparar lado a lado.
 *
 * Para cada cenário o painel mostra, contra a situação atual (sem mudanças):
 * - a melhor opção de apuração, a base e o imposto estimado;
 * - a ECONOMIA, separada em:
 *     · definitiva: vem de despesa a mais (o dinheiro saiu de verdade);
 *     · adiada: vem de receita empurrada para janeiro. O imposto não some,
 *       vai para o ano seguinte (regime de caixa, Lei nº 8.023/1990, art. 4º);
 * - o efeito no CAIXA: antecipar despesa e adiar receita reduzem o saldo do
 *   Livro Caixa em 31/12; a receita adiada entra em janeiro. A economia de
 *   imposto só aparece no caixa na declaração do ano seguinte.
 *
 * Funções puras (sem tela nem armazenamento), para testar.
 */
import type { Centavos } from './dinheiro';
import { simular, type EntradaIrpf, type ResultadoIrpf } from './irpf';

export interface Cenario {
  id: string;
  nome: string;
  /** Produtor e ano a que o cenário pertence (cada CPF tem os seus). */
  cpf: string;
  ano: number;
  anteciparDespesas: Centavos;
  postergarReceitas: Centavos;
}

export interface LinhaComparacao {
  /** null = situação atual, sem mudanças. */
  id: string | null;
  nome: string;
  anteciparDespesas: Centavos;
  postergarReceitas: Centavos;
  receitaBruta: Centavos;
  despesas: Centavos;
  opcao: 'real' | 'presumido' | 'empate';
  base: Centavos;
  imposto: Centavos;
  /** Imposto a menos que a situação atual (negativo = paga mais). */
  economia: Centavos;
  /** Parte da economia que vem de receita adiada: o imposto vai para o ano seguinte. */
  economiaAdiada: Centavos;
  /** Parte da economia que não volta no ano seguinte. */
  economiaDefinitiva: Centavos;
  /** Saldo do Livro Caixa da atividade em 31/12 depois do cenário (null se desconhecido). */
  caixa31Dez: Centavos | null;
  /** Receita adiada que entra no caixa em janeiro. */
  entradaJaneiro: Centavos;
}

const melhor = (r: ResultadoIrpf): { opcao: LinhaComparacao['opcao']; base: Centavos; imposto: Centavos } =>
  r.maisVantajosa === 'presumido'
    ? { opcao: 'presumido', base: r.presumido.base, imposto: r.presumido.impostoEstimado }
    : { opcao: r.maisVantajosa, base: r.real.base, imposto: r.real.impostoEstimado };

/**
 * @param entrada situação atual do produtor no ano (a mesma do simulador)
 * @param cenarios cenários DESTE produtor e ano
 * @param caixaBase saldo do Livro Caixa em 31/12 na situação atual (null se não houver)
 */
export function compararCenarios(entrada: EntradaIrpf, cenarios: readonly Cenario[], caixaBase: Centavos | null): LinhaComparacao[] {
  const atual = melhor(simular(entrada, {}).antes);
  const linha = (id: string | null, nome: string, antecipar: Centavos, postergar: Centavos): LinhaComparacao => {
    const s = simular(entrada, { anteciparDespesas: antecipar, postergarReceitas: postergar });
    const m = melhor(s.depois);
    const economia = atual.imposto - m.imposto;
    // Quanto da economia vem SÓ de adiar receita (o resto é definitivo).
    const soAdiar = postergar > 0 ? atual.imposto - melhor(simular(entrada, { postergarReceitas: postergar }).depois).imposto : 0;
    const economiaAdiada = Math.max(0, Math.min(economia, soAdiar));
    return {
      id,
      nome,
      anteciparDespesas: antecipar,
      postergarReceitas: postergar,
      receitaBruta: s.depois.receitaBruta,
      despesas: s.depois.despesas,
      opcao: m.opcao,
      base: m.base,
      imposto: m.imposto,
      economia,
      economiaAdiada,
      economiaDefinitiva: economia - economiaAdiada,
      caixa31Dez: caixaBase === null ? null : caixaBase - antecipar - Math.min(postergar, entrada.receitaBruta),
      entradaJaneiro: Math.min(postergar, entrada.receitaBruta),
    };
  };
  return [linha(null, 'Situação atual', 0, 0), ...cenarios.map((c) => linha(c.id, c.nome, c.anteciparDespesas, c.postergarReceitas))];
}

/** Cenário com a maior economia DEFINITIVA (o "melhor" não pode ser só adiar imposto). */
export function melhorCenario(linhas: readonly LinhaComparacao[]): string | null {
  const candidatos = linhas.filter((l) => l.id !== null && l.economiaDefinitiva > 0);
  if (candidatos.length === 0) return null;
  return candidatos.reduce((a, b) => (b.economiaDefinitiva > a.economiaDefinitiva ? b : a)).id;
}

/** Próximo nome livre: "Cenário 1", "Cenário 2"... */
export function proximoNome(existentes: readonly Cenario[]): string {
  let n = existentes.length + 1;
  while (existentes.some((c) => c.nome === `Cenário ${n}`)) n++;
  return `Cenário ${n}`;
}

/** Identificador simples e único o bastante para cenários de uma pessoa. */
export function novoId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
