/**
 * AGREGAÇÕES: transforma a lista de lançamentos (Q100) em totais.
 *
 * Regras contábeis adotadas (regime de caixa, Lei nº 8.023/1990, art. 4º:
 * resultado = receitas recebidas − despesas pagas no ano):
 *
 * - RECEITA BRUTA = VL_ENTRADA dos lançamentos tipo 1 (receita da atividade
 *   rural) e tipo 3 (receita de produto entregue no ano, com adiantamento
 *   recebido em ano anterior: Perguntas e Respostas LCDPR, pergunta 31, manda
 *   reconhecer no ano em que a receita é reconhecível). Uma SAÍDA lançada como
 *   tipo 1/3 (devolução de venda) REDUZ a receita.
 * - DESPESAS = VL_SAIDA dos lançamentos tipo 2 (custeio e investimento). Uma
 *   ENTRADA lançada como tipo 2 (estorno, reembolso) REDUZ a despesa.
 * - RESULTADO = receita bruta − despesas.
 *
 * Tudo em centavos inteiros (ver dinheiro.ts).
 */
import type { Centavos } from './dinheiro';
import type { ArquivoLcdpr, Lancamento } from '../parser/modelo';

/** Valor com sinal que o lançamento soma à RECEITA (0 se for despesa). */
export function valorReceita(l: Lancamento): Centavos {
  return l.tipoLanc === '1' || l.tipoLanc === '3' ? l.entrada - l.saida : 0;
}

/** Valor com sinal que o lançamento soma à DESPESA (0 se for receita). */
export function valorDespesa(l: Lancamento): Centavos {
  return l.tipoLanc === '2' ? l.saida - l.entrada : 0;
}

export interface Totais {
  receitas: Centavos;
  despesas: Centavos;
  resultado: Centavos;
  /** Margem = resultado / receitas, em fração (0,25 = 25%). null se não houver receita. */
  margem: number | null;
  /** Parte da receita que veio de lançamentos tipo 3 (adiantamentos de anos anteriores). */
  receitasTipo3: Centavos;
  quantidade: number;
}

export function totalizar(lancamentos: readonly Lancamento[]): Totais {
  let receitas = 0;
  let despesas = 0;
  let receitasTipo3 = 0;
  for (const l of lancamentos) {
    const r = valorReceita(l);
    receitas += r;
    despesas += valorDespesa(l);
    if (l.tipoLanc === '3') receitasTipo3 += r;
  }
  const resultado = receitas - despesas;
  return {
    receitas,
    despesas,
    resultado,
    margem: receitas > 0 ? resultado / receitas : null,
    receitasTipo3,
    quantidade: lancamentos.length,
  };
}

export interface TotalMensal extends Totais {
  /** "AAAA-MM" */
  mes: string;
  /** Resultado acumulado do ano até o fim do mês. */
  acumulado: Centavos;
  /** Saldo de caixa informado no último lançamento do mês (null se o mês não teve lançamento). */
  saldoInformado: Centavos | null;
}

/** Os 12 meses do ano-base, inclusive os sem movimento (para gráficos sem "buracos"). */
export function porMes(arquivo: ArquivoLcdpr): TotalMensal[] {
  const ano = arquivo.anoBase ?? arquivo.lancamentos[0]?.data.ano;
  if (!ano) return [];
  const grupos = new Map<string, Lancamento[]>();
  for (const l of arquivo.lancamentos) {
    const chave = l.data.iso.slice(0, 7);
    const g = grupos.get(chave);
    if (g) g.push(l);
    else grupos.set(chave, [l]);
  }
  let acumulado = 0;
  const meses: TotalMensal[] = [];
  for (let m = 1; m <= 12; m++) {
    const chave = `${ano}-${String(m).padStart(2, '0')}`;
    const lista = grupos.get(chave) ?? [];
    const t = totalizar(lista);
    acumulado += t.resultado;
    meses.push({ ...t, mes: chave, acumulado, saldoInformado: lista.at(-1)?.saldo ?? null });
  }
  return meses;
}

export interface TotalPorChave extends Totais {
  chave: string;
}

/** Agrupa e totaliza por qualquer critério (imóvel, conta, participante...), maior movimento primeiro. */
export function agruparPor(lancamentos: readonly Lancamento[], chaveDe: (l: Lancamento) => string): TotalPorChave[] {
  const grupos = new Map<string, Lancamento[]>();
  for (const l of lancamentos) {
    const k = chaveDe(l);
    const g = grupos.get(k);
    if (g) g.push(l);
    else grupos.set(k, [l]);
  }
  return [...grupos.entries()]
    .map(([chave, lista]) => ({ chave, ...totalizar(lista) }))
    .sort((a, b) => b.receitas + b.despesas - (a.receitas + a.despesas));
}

export const porImovel = (a: ArquivoLcdpr): TotalPorChave[] => agruparPor(a.lancamentos, (l) => l.codImovel);
export const porConta = (a: ArquivoLcdpr): TotalPorChave[] => agruparPor(a.lancamentos, (l) => l.codConta);
export const porTipoDocumento = (a: ArquivoLcdpr): TotalPorChave[] => agruparPor(a.lancamentos, (l) => l.tipoDoc);

/** Maiores clientes (quem gerou receita) e fornecedores (quem recebeu despesa). */
export function principaisParticipantes(a: ArquivoLcdpr, limite = 10): { clientes: TotalPorChave[]; fornecedores: TotalPorChave[] } {
  const grupos = agruparPor(a.lancamentos, (l) => l.idPartic);
  return {
    clientes: grupos.filter((g) => g.receitas > 0).sort((x, y) => y.receitas - x.receitas).slice(0, limite),
    fornecedores: grupos.filter((g) => g.despesas > 0).sort((x, y) => y.despesas - x.despesas).slice(0, limite),
  };
}

/** Meses em que as despesas superaram as receitas (para os títulos-conclusão dos gráficos). */
export function mesesNegativos(meses: readonly TotalMensal[]): TotalMensal[] {
  return meses.filter((m) => m.quantidade > 0 && m.resultado < 0);
}
