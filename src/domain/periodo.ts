/**
 * PERÍODO DE ANÁLISE DO PAINEL: ano civil, safra ou período livre.
 *
 * Por que existe: o LCDPR e o IRPF são por ANO CIVIL (jan a dez), mas o produtor
 * pensa em SAFRA (ex.: soja plantada em setembro e colhida em março). Ver a safra
 * inteira mostra quanto dinheiro ela exigiu antes da colheita e quanto deixou.
 *
 * Meses sempre no formato "AAAA-MM", que ordena certo como texto.
 */

export type TipoPeriodo = 'ano' | 'safra' | 'livre';

export interface Periodo {
  tipo: TipoPeriodo;
  /** Primeiro mês, "AAAA-MM". */
  inicio: string;
  /** Último mês, "AAAA-MM" (inclusive). */
  fim: string;
}

/** Limite do período livre: dois anos já cobrem a comparação de duas safras. */
export const MAXIMO_MESES_LIVRE = 24;

const CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const chaveMes = (ano: number, mes: number): string => `${ano}-${String(mes).padStart(2, '0')}`;

/** Soma (ou subtrai) meses de um "AAAA-MM". */
export function somarMeses(chave: string, n: number): string {
  const total = Number(chave.slice(0, 4)) * 12 + Number(chave.slice(5, 7)) - 1 + n;
  return chaveMes(Math.floor(total / 12), (total % 12) + 1);
}

/** Lista de meses do início ao fim (inclusive). Vazia se o fim vier antes do início. */
export function mesesEntre(inicio: string, fim: string): string[] {
  const meses: string[] = [];
  for (let m = inicio; m <= fim && meses.length < 600; m = somarMeses(m, 1)) meses.push(m);
  return meses;
}

export const periodoAno = (ano: number): Periodo => ({ tipo: 'ano', inicio: chaveMes(ano, 1), fim: chaveMes(ano, 12) });

/** Safra que começa no mês `mesInicio` do ano `anoInicio` e dura 12 meses (ex.: jul/2024 a jun/2025). */
export const periodoSafra = (anoInicio: number, mesInicio: number): Periodo => {
  const inicio = chaveMes(anoInicio, mesInicio);
  return { tipo: 'safra', inicio, fim: somarMeses(inicio, 11) };
};

/** "2024-07" → "jul/24". */
export const mesCurtoAno = (chave: string): string => `${CURTOS[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;

/** Nome da safra: "2024/25" (ou "2024" se começar em janeiro, igual ao ano civil). */
export function nomeSafra(p: Periodo): string {
  const a = p.inicio.slice(0, 4);
  const b = p.fim.slice(0, 4);
  return a === b ? a : `${a}/${b.slice(2)}`;
}

/** Texto do período para títulos e relatórios. */
export function rotuloPeriodo(p: Periodo): string {
  if (p.tipo === 'ano') return `Ano civil ${p.inicio.slice(0, 4)}`;
  const faixa = `${mesCurtoAno(p.inicio)} a ${mesCurtoAno(p.fim)}`;
  return p.tipo === 'safra' ? `Safra ${nomeSafra(p)} (${faixa})` : `Período de ${faixa}`;
}

/** O mesmo período 12 meses antes (para comparar safra com safra, período com período). */
export const periodoAnterior = (p: Periodo): Periodo => ({ tipo: p.tipo, inicio: somarMeses(p.inicio, -12), fim: somarMeses(p.fim, -12) });

/** Anos civis que o período toca (cada ano é um arquivo LCDPR). */
export function anosDoPeriodo(p: Periodo): number[] {
  const anos: number[] = [];
  for (let a = Number(p.inicio.slice(0, 4)); a <= Number(p.fim.slice(0, 4)); a++) anos.push(a);
  return anos;
}

/** Rótulos curtos do eixo: "jan" se o período cabe num ano só; senão "jul/24". */
export function rotulosEixo(meses: readonly string[]): string[] {
  const umAno = meses.length > 0 && meses[0]!.slice(0, 4) === meses.at(-1)!.slice(0, 4);
  return meses.map((m) => (umAno ? CURTOS[Number(m.slice(5, 7)) - 1]! : mesCurtoAno(m)));
}

/**
 * Palavras que mudam com o tipo de período, para os títulos-conclusão
 * ("terminou o ano em…", "terminou a safra em…").
 */
export interface TermosPeriodo {
  o: string;
  do: string;
  no: string;
  todo: string;
}

export const TERMOS_PERIODO: Record<TipoPeriodo, TermosPeriodo> = {
  ano: { o: 'o ano', do: 'do ano', no: 'no ano', todo: 'o ano todo' },
  safra: { o: 'a safra', do: 'da safra', no: 'na safra', todo: 'a safra toda' },
  livre: { o: 'o período', do: 'do período', no: 'no período', todo: 'o período todo' },
};

/** "ao ano anterior" / "à safra anterior" (concordância do texto de comparação). */
export const frenteA = (vs: string): string => (vs.startsWith('safra') ? `à ${vs}` : `ao ${vs}`);
