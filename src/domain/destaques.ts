/**
 * DESTAQUES AUTOMÁTICOS E TÍTULOS-CONCLUSÃO
 *
 * Regra de design do projeto: todo gráfico tem um título que diz a CONCLUSÃO
 * ("Despesas superaram receitas em 3 meses"), não só o tema ("Receitas x Despesas").
 * As frases ficam aqui, separadas da tela, para serem testadas.
 */
import { mesesNegativos, type TotalMensal, type TotalPorChave, type Totais } from './agregacoes';
import { formatarReais, type Centavos } from './dinheiro';
import { frenteA, TERMOS_PERIODO, type TermosPeriodo } from './periodo';

const ANO = TERMOS_PERIODO.ano;

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2025-03" → "março". */
export const nomeMes = (chave: string): string => NOMES_MES[Number(chave.slice(5, 7)) - 1] ?? chave;

const pct = (fracao: number): string => `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** Variação percentual entre dois valores (null quando não há base de comparação). */
export function variacao(atual: Centavos, anterior: Centavos | null | undefined): number | null {
  if (anterior === null || anterior === undefined || anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}

export function tituloReceitasDespesas(meses: readonly TotalMensal[], t: TermosPeriodo = ANO): string {
  const negativos = mesesNegativos(meses);
  if (meses.every((m) => m.quantidade === 0)) return `Sem lançamentos ${t.no}`;
  if (negativos.length === 0) return 'Receitas superaram as despesas em todos os meses com movimento';
  if (negativos.length === 1) return `Despesas superaram as receitas apenas em ${nomeMes(negativos[0]!.mes)}`;
  return `Despesas superaram as receitas em ${negativos.length} meses`;
}

export function tituloFluxoCaixa(meses: readonly TotalMensal[], t: TermosPeriodo = ANO): string {
  const comMov = meses.filter((m) => m.quantidade > 0);
  if (comMov.length === 0) return `Sem movimento de caixa ${t.no}`;
  const pior = [...comMov].sort((a, b) => a.acumulado - b.acumulado)[0]!;
  const ultimo = comMov.at(-1)!;
  if (pior.acumulado < 0) {
    return `O caixa acumulado ficou negativo, com o pior ponto em ${nomeMes(pior.mes)} (${formatarReais(pior.acumulado)}); terminou ${t.o} em ${formatarReais(ultimo.acumulado)}`;
  }
  return `O caixa acumulado ficou positivo ${t.todo} e terminou em ${formatarReais(ultimo.acumulado)}`;
}

export function tituloSazonalidade(meses: readonly TotalMensal[], t: TermosPeriodo = ANO): string {
  const total = meses.reduce((s, m) => s + Math.max(0, m.receitas), 0);
  if (total <= 0) return `Sem receitas ${t.no}`;
  // Só meses que tiveram receita: com receita em 1 ou 2 meses, a frase diz isso (e não "3 meses").
  const ordenados = meses.filter((m) => m.receitas > 0).sort((a, b) => b.receitas - a.receitas);
  const top3 = ordenados.slice(0, 3);
  const parte = top3.reduce((s, m) => s + m.receitas, 0) / total;
  const nomes = top3.map((m) => nomeMes(m.mes));
  if (top3.length === 1) return `Toda a receita ${t.do} entrou em ${nomes[0]}`;
  const quando = top3.length === 2 ? `2 meses: ${nomes.join(' e ')}` : `3 meses: ${nomes.join(', ')}`;
  return `${pct(parte)} da receita ${t.do} entrou em ${quando}`;
}

export function tituloConcentracao(grupos: readonly TotalPorChave[], campo: 'receitas' | 'despesas', rotulo: string): string {
  const total = grupos.reduce((s, g) => s + Math.max(0, g[campo]), 0);
  const maior = grupos[0];
  if (!maior || total <= 0) return `Sem ${rotulo} no período`;
  return `O maior ${rotulo === 'receitas' ? 'cliente' : 'fornecedor'} concentra ${pct(maior[campo] / total)} das ${rotulo}`;
}

export function tituloImoveis(grupos: readonly (TotalPorChave & { nome?: string })[]): string {
  const comMov = grupos.filter((g) => g.quantidade > 0);
  if (comMov.length === 0) return 'Sem lançamentos por imóvel';
  const melhor = [...comMov].sort((a, b) => b.resultado - a.resultado)[0]!;
  const negativos = comMov.filter((g) => g.resultado < 0);
  const nome = melhor.nome ?? `imóvel ${melhor.chave}`;
  if (negativos.length > 0) {
    return `${nome} gera o maior resultado; ${negativos.length} ${negativos.length === 1 ? 'imóvel tem' : 'imóveis têm'} resultado negativo`;
  }
  return `${nome} gera o maior resultado (${formatarReais(melhor.resultado)})`;
}

/**
 * Três destaques da Visão Executiva, escolhidos por relevância:
 * 1. resultado e margem (com variação frente ao ano anterior, se houver);
 * 2. o mês mais forte e o mais fraco;
 * 3. o risco ou oportunidade mais relevante (caixa negativo, receita concentrada, tipo 3).
 */
export function destaquesExecutivos(totais: Totais, meses: readonly TotalMensal[], anterior?: Totais | null, vs = 'ano anterior'): string[] {
  const d: string[] = [];

  const v = variacao(totais.resultado, anterior?.resultado);
  const margem = totais.margem !== null ? `, margem de ${pct(totais.margem)}` : '';
  if (v !== null) {
    d.push(`Resultado de ${formatarReais(totais.resultado)}${margem}: ${v >= 0 ? 'alta' : 'queda'} de ${pct(Math.abs(v))} frente ${frenteA(vs)}.`);
  } else {
    d.push(`Resultado de ${formatarReais(totais.resultado)}${margem}.`);
  }

  const comMov = meses.filter((m) => m.quantidade > 0);
  if (comMov.length > 0) {
    const ord = [...comMov].sort((a, b) => b.resultado - a.resultado);
    const melhor = ord[0]!;
    const pior = ord.at(-1)!;
    d.push(`Melhor mês: ${nomeMes(melhor.mes)} (${formatarReais(melhor.resultado)}). Pior mês: ${nomeMes(pior.mes)} (${formatarReais(pior.resultado)}).`);
  }

  const negativos = mesesNegativos(meses);
  const caixaNegativo = comMov.filter((m) => m.acumulado < 0);
  if (caixaNegativo.length > 0) {
    d.push(`O caixa acumulado ficou negativo em ${caixaNegativo.length} ${caixaNegativo.length === 1 ? 'mês' : 'meses'}: avalie capital de giro ou crédito de custeio para esse período.`);
  } else if (totais.receitasTipo3 > 0) {
    d.push(`${formatarReais(totais.receitasTipo3)} da receita vem de produtos entregues neste ano com adiantamento recebido em ano anterior (tipo 3): o dinheiro já entrou antes, mas a receita é deste ano.`);
  } else if (negativos.length > 0) {
    d.push(`Despesas superaram receitas em ${negativos.length} ${negativos.length === 1 ? 'mês' : 'meses'}, mas o caixa acumulado se manteve positivo.`);
  } else {
    d.push('Nenhum mês com despesa maior que a receita.');
  }
  return d;
}
